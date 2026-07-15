import type { MapMarkerSnapshot } from '@yct/contracts';
import { getMapRoadMarkerKind, orderMapRoadCoordinates } from './map-road-geometry';

export interface VisualRoadGraph {
  adjacency: Map<string, VisualRoadEdge[]>;
  nodes: VisualRoadNode[];
}

export interface VisualRouteResolution {
  coordinates: Array<[number, number]>;
  unresolvedSegmentCount: number;
}

interface VisualRoadNode {
  coordinate: [number, number];
  id: string;
  roadId: string;
}

interface VisualRoadEdge {
  distance: number;
  nodeId: string;
}

interface QueueEntry {
  distance: number;
  nodeId: string;
}

interface VisualRoadSegment {
  end: [number, number];
  endIsRoadTerminus: boolean;
  endNodeId: string;
  id: string;
  roadId: string;
  start: [number, number];
  startIsRoadTerminus: boolean;
  startNodeId: string;
}

interface VisualRoadConnectionCandidate {
  distance: number;
  leftCoordinate: [number, number];
  leftSegmentId: string;
  rightCoordinate: [number, number];
  rightSegmentId: string;
}

export function buildVisualRoadGraph(
  markers: MapMarkerSnapshot['markers'],
): VisualRoadGraph | undefined {
  const roads = markers.flatMap((marker) => {
    if (!isVisualRoadMarker(marker)) {
      return [];
    }
    if (marker.geometry.type === 'LineString') {
      return marker.geometry.coordinates.length >= 2
        ? [{ id: marker.id, coordinates: dedupeConsecutive(marker.geometry.coordinates) }]
        : [];
    }
    if (marker.geometry.type === 'MultiPoint') {
      return marker.geometry.coordinates.length >= 2
        ? [{ id: marker.id, coordinates: orderMapRoadCoordinates(marker.geometry.coordinates) }]
        : [];
    }
    return [];
  });
  const nodes: VisualRoadNode[] = [];
  const adjacency = new Map<string, VisualRoadEdge[]>();
  const nodesById = new Map<string, VisualRoadNode>();
  const baseSegments: VisualRoadSegment[] = [];

  for (const road of roads) {
    const roadNodes = road.coordinates.map((coordinate, index) => ({
      coordinate,
      id: `${road.id}:${index}`,
      roadId: road.id,
    }));
    for (const node of roadNodes) {
      nodes.push(node);
      nodesById.set(node.id, node);
      adjacency.set(node.id, []);
    }
    for (let index = 1; index < roadNodes.length; index += 1) {
      const previous = roadNodes[index - 1];
      const current = roadNodes[index];
      if (previous && current) {
        baseSegments.push({
          end: current.coordinate,
          endIsRoadTerminus: index === roadNodes.length - 1,
          endNodeId: current.id,
          id: `${previous.id}->${current.id}`,
          roadId: road.id,
          start: previous.coordinate,
          startIsRoadTerminus: index === 1,
          startNodeId: previous.id,
        });
      }
    }
  }

  if (nodes.length < 2 || nodes.length > 1200) {
    return undefined;
  }

  const segmentById = new Map(baseSegments.map((segment) => [segment.id, segment]));
  const segmentPointsById = new Map<
    string,
    Array<{ coordinate: [number, number]; nodeId: string; ratio: number }>
  >();
  const connectionKeys = new Set<string>();
  const segmentPointNodeIds = new Map<string, string>();
  const resolvedConnections: Array<{
    distance: number;
    leftNodeId: string;
    rightNodeId: string;
  }> = [];
  let virtualNodeIndex = 0;

  const ensureSegmentPointNode = (
    segment: VisualRoadSegment,
    coordinate: [number, number],
  ): { coordinate: [number, number]; nodeId: string; ratio: number } => {
    if (areCoordinatesClose(segment.start, coordinate)) {
      return { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 };
    }
    if (areCoordinatesClose(segment.end, coordinate)) {
      return { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 };
    }

    const key = `${segment.id}:${coordinate[0].toFixed(3)}:${coordinate[1].toFixed(3)}`;
    const existingNodeId = segmentPointNodeIds.get(key);
    if (existingNodeId) {
      return { coordinate, nodeId: existingNodeId, ratio: getSegmentRatio(segment, coordinate) };
    }
    const node: VisualRoadNode = {
      coordinate,
      id: `road-virtual:${virtualNodeIndex}`,
      roadId: segment.roadId,
    };
    virtualNodeIndex += 1;
    nodes.push(node);
    nodesById.set(node.id, node);
    adjacency.set(node.id, []);
    segmentPointNodeIds.set(key, node.id);
    return { coordinate, nodeId: node.id, ratio: getSegmentRatio(segment, coordinate) };
  };

  for (const candidate of collectConnectionCandidates(baseSegments, 100)) {
    const leftSegment = segmentById.get(candidate.leftSegmentId);
    const rightSegment = segmentById.get(candidate.rightSegmentId);
    if (!leftSegment || !rightSegment) {
      continue;
    }
    const leftPoint = ensureSegmentPointNode(leftSegment, candidate.leftCoordinate);
    const rightPoint = ensureSegmentPointNode(rightSegment, candidate.rightCoordinate);
    const leftPoints = segmentPointsById.get(leftSegment.id) ?? [];
    const rightPoints = segmentPointsById.get(rightSegment.id) ?? [];
    leftPoints.push(leftPoint);
    rightPoints.push(rightPoint);
    segmentPointsById.set(leftSegment.id, leftPoints);
    segmentPointsById.set(rightSegment.id, rightPoints);
    const connectionKey = `${leftPoint.nodeId}->${rightPoint.nodeId}`;
    if (!connectionKeys.has(connectionKey)) {
      connectionKeys.add(connectionKey);
      resolvedConnections.push({
        distance: candidate.distance,
        leftNodeId: leftPoint.nodeId,
        rightNodeId: rightPoint.nodeId,
      });
    }
  }

  for (const segment of baseSegments) {
    const points = [
      { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 },
      ...(segmentPointsById.get(segment.id) ?? []),
      { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 },
    ]
      .sort((left, right) => left.ratio - right.ratio)
      .filter((point, index, items) => items[index - 1]?.nodeId !== point.nodeId);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current || areCoordinatesClose(previous.coordinate, current.coordinate)) {
        continue;
      }
      const previousNode = nodesById.get(previous.nodeId);
      const currentNode = nodesById.get(current.nodeId);
      if (previousNode && currentNode) {
        connectNodes(adjacency, previousNode, currentNode);
      }
    }
  }

  for (const connection of resolvedConnections) {
    const leftNode = nodesById.get(connection.leftNodeId);
    const rightNode = nodesById.get(connection.rightNodeId);
    if (leftNode && rightNode) {
      connectNodes(adjacency, leftNode, rightNode, connection.distance);
    }
  }

  return { adjacency, nodes };
}

export function isVisualRoadMarker(
  marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId' | 'iconFileName' | 'label'>,
): boolean {
  return getMapRoadMarkerKind(marker) !== undefined;
}

export function resolveVisualRouteCoordinates(
  controlPoints: Array<[number, number]>,
  mode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
): Array<[number, number]> {
  return resolveVisualRoute(controlPoints, mode, graph).coordinates;
}

export function resolveVisualRoute(
  controlPoints: Array<[number, number]>,
  mode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
): VisualRouteResolution {
  if (controlPoints.length < 2 || mode === 'straight') {
    return { coordinates: dedupeConsecutive(controlPoints), unresolvedSegmentCount: 0 };
  }
  if (!graph) {
    return {
      coordinates: dedupeConsecutive(controlPoints),
      unresolvedSegmentCount: controlPoints.length - 1,
    };
  }

  const resolved: Array<[number, number]> = [];
  let unresolvedSegmentCount = 0;
  for (let index = 1; index < controlPoints.length; index += 1) {
    const start = controlPoints[index - 1];
    const end = controlPoints[index];
    if (!start || !end) {
      continue;
    }
    const segment = resolveRoadSegment(start, end, graph);
    if (!segment.resolved) {
      unresolvedSegmentCount += 1;
    }
    resolved.push(...(resolved.length > 0 ? segment.coordinates.slice(1) : segment.coordinates));
  }
  return { coordinates: dedupeConsecutive(resolved), unresolvedSegmentCount };
}

function resolveRoadSegment(
  start: [number, number],
  end: [number, number],
  graph: VisualRoadGraph,
): { coordinates: Array<[number, number]>; resolved: boolean } {
  const startNode = findNearestNode(start, graph.nodes);
  const endNode = findNearestNode(end, graph.nodes);
  if (!startNode || !endNode) {
    return { coordinates: [start, end], resolved: false };
  }
  const nodeIds = findShortestNodePath(startNode.id, endNode.id, graph);
  if (nodeIds.length === 0) {
    return { coordinates: [start, end], resolved: false };
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return {
    coordinates: dedupeConsecutive([
      start,
      ...nodeIds.flatMap((nodeId) => {
        const node = nodeById.get(nodeId);
        return node ? [node.coordinate] : [];
      }),
      end,
    ]),
    resolved: true,
  };
}

function findShortestNodePath(
  startNodeId: string,
  endNodeId: string,
  graph: VisualRoadGraph,
): string[] {
  if (startNodeId === endNodeId) {
    return [startNodeId];
  }
  const distances = new Map<string, number>([[startNodeId, 0]]);
  const previous = new Map<string, string>();
  const queue = new MinQueue();
  queue.push({ distance: 0, nodeId: startNodeId });

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current || current.distance !== distances.get(current.nodeId)) {
      continue;
    }
    if (current.nodeId === endNodeId) {
      break;
    }
    for (const edge of graph.adjacency.get(current.nodeId) ?? []) {
      const nextDistance = current.distance + edge.distance;
      if (nextDistance >= (distances.get(edge.nodeId) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      distances.set(edge.nodeId, nextDistance);
      previous.set(edge.nodeId, current.nodeId);
      queue.push({ distance: nextDistance, nodeId: edge.nodeId });
    }
  }

  if (!distances.has(endNodeId)) {
    return [];
  }
  const path = [endNodeId];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const parent = previous.get(cursor);
    if (!parent) {
      return [];
    }
    path.push(parent);
    cursor = parent;
  }
  return path.reverse();
}

class MinQueue {
  private readonly items: QueueEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: QueueEntry): void {
    this.items.push(entry);
    let index = this.items.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (!parent || parent.distance <= entry.distance) {
        break;
      }
      this.items[index] = parent;
      index = parentIndex;
    }
    this.items[index] = entry;
  }

  pop(): QueueEntry | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last || this.items.length === 0) {
      return first;
    }
    let index = 0;
    this.items[0] = last;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      const left = this.items[leftIndex];
      const right = this.items[rightIndex];
      if (!left) {
        break;
      }
      const childIndex = right && right.distance < left.distance ? rightIndex : leftIndex;
      const child = this.items[childIndex];
      if (!child || child.distance >= this.items[index]!.distance) {
        break;
      }
      [this.items[index], this.items[childIndex]] = [child, this.items[index]!];
      index = childIndex;
    }
    return first;
  }
}

function connectNodes(
  adjacency: Map<string, VisualRoadEdge[]>,
  left: VisualRoadNode,
  right: VisualRoadNode,
  distance = coordinateDistance(left.coordinate, right.coordinate),
): void {
  adjacency.get(left.id)?.push({ distance, nodeId: right.id });
  adjacency.get(right.id)?.push({ distance, nodeId: left.id });
}

function collectConnectionCandidates(
  segments: VisualRoadSegment[],
  threshold: number,
): VisualRoadConnectionCandidate[] {
  const candidates = new Map<string, VisualRoadConnectionCandidate>();
  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const left = segments[leftIndex];
      const right = segments[rightIndex];
      if (!left || !right || left.roadId === right.roadId) {
        continue;
      }
      for (const candidate of getSegmentConnectionCandidates(left, right, threshold)) {
        const key = [
          left.id,
          right.id,
          candidate.leftCoordinate[0].toFixed(2),
          candidate.leftCoordinate[1].toFixed(2),
          candidate.rightCoordinate[0].toFixed(2),
          candidate.rightCoordinate[1].toFixed(2),
        ].join(':');
        candidates.set(key, {
          ...candidate,
          leftSegmentId: left.id,
          rightSegmentId: right.id,
        });
      }
    }
  }
  return [...candidates.values()].sort((left, right) => left.distance - right.distance);
}

function getSegmentConnectionCandidates(
  left: VisualRoadSegment,
  right: VisualRoadSegment,
  threshold: number,
): Array<{
  distance: number;
  leftCoordinate: [number, number];
  rightCoordinate: [number, number];
}> {
  const intersection = getSegmentIntersection(left.start, left.end, right.start, right.end);
  if (intersection) {
    return [{ distance: 0, leftCoordinate: intersection, rightCoordinate: intersection }];
  }

  const pairs: Array<{
    leftCoordinate: [number, number];
    rightCoordinate: [number, number];
  }> = [];
  if (left.startIsRoadTerminus) {
    pairs.push({
      leftCoordinate: left.start,
      rightCoordinate: projectPointOntoSegment(right.start, right.end, left.start).coordinate,
    });
  }
  if (left.endIsRoadTerminus) {
    pairs.push({
      leftCoordinate: left.end,
      rightCoordinate: projectPointOntoSegment(right.start, right.end, left.end).coordinate,
    });
  }
  if (right.startIsRoadTerminus) {
    pairs.push({
      leftCoordinate: projectPointOntoSegment(left.start, left.end, right.start).coordinate,
      rightCoordinate: right.start,
    });
  }
  if (right.endIsRoadTerminus) {
    pairs.push({
      leftCoordinate: projectPointOntoSegment(left.start, left.end, right.end).coordinate,
      rightCoordinate: right.end,
    });
  }

  const deduped = new Map<
    string,
    { distance: number; leftCoordinate: [number, number]; rightCoordinate: [number, number] }
  >();
  for (const pair of pairs) {
    const candidate = {
      ...pair,
      distance: coordinateDistance(pair.leftCoordinate, pair.rightCoordinate),
    };
    if (candidate.distance > threshold) {
      continue;
    }
    const key = `${pair.leftCoordinate[0].toFixed(2)}:${pair.leftCoordinate[1].toFixed(2)}:${pair.rightCoordinate[0].toFixed(2)}:${pair.rightCoordinate[1].toFixed(2)}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }
  return [...deduped.values()];
}

function projectPointOntoSegment(
  start: [number, number],
  end: [number, number],
  point: [number, number],
): { coordinate: [number, number]; ratio: number } {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = lengthSquared
    ? Math.min(
        1,
        Math.max(
          0,
          ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) / lengthSquared,
        ),
      )
    : 0;
  return {
    coordinate: [start[0] + deltaX * ratio, start[1] + deltaZ * ratio],
    ratio,
  };
}

function getSegmentIntersection(
  leftStart: [number, number],
  leftEnd: [number, number],
  rightStart: [number, number],
  rightEnd: [number, number],
): [number, number] | undefined {
  const leftVector: [number, number] = [leftEnd[0] - leftStart[0], leftEnd[1] - leftStart[1]];
  const rightVector: [number, number] = [rightEnd[0] - rightStart[0], rightEnd[1] - rightStart[1]];
  const denominator = leftVector[0] * rightVector[1] - leftVector[1] * rightVector[0];
  if (Math.abs(denominator) < 0.000001) {
    return undefined;
  }
  const delta: [number, number] = [rightStart[0] - leftStart[0], rightStart[1] - leftStart[1]];
  const leftRatio = (delta[0] * rightVector[1] - delta[1] * rightVector[0]) / denominator;
  const rightRatio = (delta[0] * leftVector[1] - delta[1] * leftVector[0]) / denominator;
  if (leftRatio < 0 || leftRatio > 1 || rightRatio < 0 || rightRatio > 1) {
    return undefined;
  }
  return [leftStart[0] + leftVector[0] * leftRatio, leftStart[1] + leftVector[1] * leftRatio];
}

function getSegmentRatio(segment: VisualRoadSegment, coordinate: [number, number]): number {
  return projectPointOntoSegment(segment.start, segment.end, coordinate).ratio;
}

function areCoordinatesClose(
  left: [number, number],
  right: [number, number],
  tolerance = 0.01,
): boolean {
  return coordinateDistance(left, right) <= tolerance;
}

function findNearestNode(
  coordinate: [number, number],
  nodes: VisualRoadNode[],
): VisualRoadNode | undefined {
  let selected: VisualRoadNode | undefined;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const distance = squaredDistance(coordinate, node.coordinate);
    if (distance < selectedDistance) {
      selected = node;
      selectedDistance = distance;
    }
  }
  return selected;
}

function dedupeConsecutive(coordinates: Array<[number, number]>): Array<[number, number]> {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || coordinate[0] !== previous[0] || coordinate[1] !== previous[1];
  });
}

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.sqrt(squaredDistance(left, right));
}

function squaredDistance(left: [number, number], right: [number, number]): number {
  const deltaX = left[0] - right[0];
  const deltaZ = left[1] - right[1];
  return deltaX * deltaX + deltaZ * deltaZ;
}
