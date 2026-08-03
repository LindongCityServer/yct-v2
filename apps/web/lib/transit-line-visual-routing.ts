import type { MapMarkerSnapshot, MapNetworkDirection, MapTravelMode } from '@yct/contracts';
import {
  collectMapRoadConnectionProjections,
  getMapRoadMarkerKind,
  orderMapRoadCoordinates,
} from './map-road-geometry';

export interface VisualRoadGraph {
  adjacency: ReadonlyMap<string, readonly VisualRoadEdge[]>;
  defaultTravelMode: MapTravelMode;
  defaultY: number;
  nodes: readonly VisualRoadNode[];
  nodesById: ReadonlyMap<string, VisualRoadNode>;
  roadSegments: readonly VisualRoadSegment[];
  verticalTolerance: number;
}

export interface VisualRouteResolution {
  coordinates: Array<[number, number]>;
  unresolvedSegmentCount: number;
}

export interface VisualRoadNode {
  coordinate: [number, number];
  id: string;
  roadId: string;
  y: number;
}

export interface VisualRoadEdge {
  allowedModes: readonly MapTravelMode[];
  distance: number;
  to: string;
}

export interface VisualRoadSegment {
  allowedModes: readonly MapTravelMode[];
  direction: MapNetworkDirection;
  end: [number, number];
  endIsRoadTerminus: boolean;
  endNodeId: string;
  endY: number;
  id: string;
  roadId: string;
  start: [number, number];
  startIsRoadTerminus: boolean;
  startNodeId: string;
  startY: number;
}

export interface VisualRoadGraphOptions {
  defaultY?: number;
  defaultTravelMode?: MapTravelMode;
  verticalTolerance?: number;
  worldId?: string;
}

interface QueueEntry {
  distance: number;
  nodeId: string;
}

interface VisualRoadAccessCandidate {
  coordinate: [number, number];
  distanceToPoint: number;
  direction: MapNetworkDirection;
  endNodeId: string;
  roadId: string;
  segmentLength: number;
  segmentRatio: number;
  startDistance: number;
  startNodeId: string;
}

const allMapTravelModes: readonly MapTravelMode[] = ['walk', 'taxi', 'bus', 'coach'];

export function buildVisualRoadGraph(
  markers: MapMarkerSnapshot['markers'],
  junctionSnapTolerance = 30,
  options: VisualRoadGraphOptions = {},
): VisualRoadGraph | undefined {
  const defaultY = options.defaultY ?? 64;
  const verticalTolerance = Math.max(0, options.verticalTolerance ?? 0);
  const roads = markers.flatMap((marker) => {
    if (
      !isVisualRoadMarker(marker) ||
      (options.worldId && marker.spatial?.worldId && marker.spatial.worldId !== options.worldId)
    ) {
      return [];
    }
    const allowedModes = resolveVisualRoadAllowedModes(marker);
    if (allowedModes.length === 0) {
      return [];
    }
    const direction = marker.spatial?.direction ?? 'both';
    const fallbackY = marker.spatial?.defaultY ?? defaultY;
    const createRoad = (coordinates: Array<[number, number]>, shouldOrder: boolean) => {
      const orderedCoordinates = shouldOrder ? orderMapRoadCoordinates(coordinates) : coordinates;
      const points = dedupeRoadPoints(
        orderedCoordinates.map((coordinate, index) => ({
          coordinate,
          y: marker.spatial?.coordinateY?.[index] ?? fallbackY,
        })),
      );
      return points.length >= 2
        ? [
            {
              allowedModes,
              direction,
              id: marker.id,
              points,
              verticalConnector: marker.spatial?.verticalConnectorKind !== undefined,
            },
          ]
        : [];
    };
    if (marker.geometry.type === 'LineString') {
      return createRoad(marker.geometry.coordinates, false);
    }
    if (marker.geometry.type === 'MultiPoint') {
      return createRoad(marker.geometry.coordinates, marker.spatial?.coordinateY === undefined);
    }
    return [];
  });
  const nodes: VisualRoadNode[] = [];
  const adjacency = new Map<string, VisualRoadEdge[]>();
  const nodesById = new Map<string, VisualRoadNode>();
  const baseSegments: VisualRoadSegment[] = [];

  for (const road of roads) {
    const roadNodes = road.points.map((point, index) => ({
      coordinate: point.coordinate,
      id: `${road.id}:${index}`,
      roadId: road.id,
      y: point.y,
    }));
    for (const node of roadNodes) {
      nodes.push(node);
      nodesById.set(node.id, node);
      adjacency.set(node.id, []);
    }
    for (let index = 1; index < roadNodes.length; index += 1) {
      const previous = roadNodes[index - 1];
      const current = roadNodes[index];
      if (
        previous &&
        current &&
        (road.verticalConnector || Math.abs(previous.y - current.y) <= verticalTolerance)
      ) {
        baseSegments.push({
          allowedModes: road.allowedModes,
          direction: road.direction,
          end: current.coordinate,
          endIsRoadTerminus: index === roadNodes.length - 1,
          endNodeId: current.id,
          endY: current.y,
          id: `${previous.id}->${current.id}`,
          roadId: road.id,
          start: previous.coordinate,
          startIsRoadTerminus: index === 1,
          startNodeId: previous.id,
          startY: previous.y,
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
    allowedModes: readonly MapTravelMode[];
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
      y: interpolateSegmentY(segment, coordinate),
    };
    virtualNodeIndex += 1;
    nodes.push(node);
    nodesById.set(node.id, node);
    adjacency.set(node.id, []);
    segmentPointNodeIds.set(key, node.id);
    return { coordinate, nodeId: node.id, ratio: getSegmentRatio(segment, coordinate) };
  };

  for (const candidate of collectMapRoadConnectionProjections(
    baseSegments,
    junctionSnapTolerance,
  )) {
    const leftSegment = segmentById.get(candidate.leftSegmentId);
    const rightSegment = segmentById.get(candidate.rightSegmentId);
    if (!leftSegment || !rightSegment) {
      continue;
    }
    if (
      Math.abs(
        interpolateSegmentY(leftSegment, candidate.leftCoordinate) -
          interpolateSegmentY(rightSegment, candidate.rightCoordinate),
      ) > verticalTolerance
    ) {
      continue;
    }
    const allowedModes = intersectTravelModes(leftSegment.allowedModes, rightSegment.allowedModes);
    if (allowedModes.length === 0) {
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
        allowedModes,
        distance: candidate.distance,
        leftNodeId: leftPoint.nodeId,
        rightNodeId: rightPoint.nodeId,
      });
    }
  }

  const roadSegments: VisualRoadSegment[] = [];
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
      if (!previousNode || !currentNode) {
        continue;
      }
      roadSegments.push({
        allowedModes: segment.allowedModes,
        direction: segment.direction,
        end: current.coordinate,
        endIsRoadTerminus: segment.endIsRoadTerminus && current.ratio === 1,
        endNodeId: current.nodeId,
        endY: currentNode.y,
        id: `${segment.id}:${index - 1}`,
        roadId: segment.roadId,
        start: previous.coordinate,
        startIsRoadTerminus: segment.startIsRoadTerminus && previous.ratio === 0,
        startNodeId: previous.nodeId,
        startY: previousNode.y,
      });
      connectNodes(
        adjacency,
        previousNode,
        currentNode,
        undefined,
        segment.allowedModes,
        segment.direction,
      );
    }
  }

  for (const connection of resolvedConnections) {
    const leftNode = nodesById.get(connection.leftNodeId);
    const rightNode = nodesById.get(connection.rightNodeId);
    if (leftNode && rightNode) {
      connectNodes(adjacency, leftNode, rightNode, connection.distance, connection.allowedModes);
    }
  }

  return {
    adjacency,
    defaultTravelMode: options.defaultTravelMode ?? 'bus',
    defaultY,
    nodes,
    nodesById,
    roadSegments,
    verticalTolerance,
  };
}

export function isVisualRoadMarker(
  marker: Pick<
    MapMarkerSnapshot['markers'][number],
    'categoryId' | 'iconFileName' | 'label' | 'spatial'
  >,
): boolean {
  return (
    getMapRoadMarkerKind(marker) !== undefined ||
    marker.categoryId === 'pedestrian-path' ||
    marker.spatial?.networkKind !== undefined
  );
}

export function resolveVisualRouteCoordinates(
  controlPoints: Array<[number, number]>,
  mode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
  travelMode?: MapTravelMode,
): Array<[number, number]> {
  return resolveVisualRoute(controlPoints, mode, graph, travelMode).coordinates;
}

export function resolveVisualRoute(
  controlPoints: Array<[number, number]>,
  mode: 'road' | 'straight',
  graph: VisualRoadGraph | undefined,
  travelMode?: MapTravelMode,
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

  const effectiveTravelMode = travelMode ?? graph.defaultTravelMode;

  const resolved: Array<[number, number]> = [];
  const pathCache = new Map<string, { distance: number; nodeIds: string[] } | undefined>();
  let unresolvedSegmentCount = 0;
  for (let index = 1; index < controlPoints.length; index += 1) {
    const start = controlPoints[index - 1];
    const end = controlPoints[index];
    if (!start || !end) {
      continue;
    }
    const segment = resolveRoadSegment(start, end, graph, effectiveTravelMode, pathCache);
    if (!segment.resolved) {
      unresolvedSegmentCount += 1;
    }
    appendCoordinates(resolved, segment.coordinates);
  }
  return { coordinates: dedupeConsecutive(resolved), unresolvedSegmentCount };
}

function resolveRoadSegment(
  start: [number, number],
  end: [number, number],
  graph: VisualRoadGraph,
  travelMode: MapTravelMode,
  pathCache: Map<string, { distance: number; nodeIds: string[] } | undefined>,
): { coordinates: Array<[number, number]>; resolved: boolean } {
  const startCandidates = findRoadAccessCandidates(start, end, graph, travelMode);
  const endCandidates = findRoadAccessCandidates(end, start, graph, travelMode);
  let bestCoordinates: Array<[number, number]> | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const startAccess of startCandidates) {
    for (const endAccess of endCandidates) {
      const sameSegment = resolveSameRoadSegment(start, end, startAccess, endAccess);
      if (sameSegment && sameSegment.distance < bestDistance) {
        bestCoordinates = sameSegment.coordinates;
        bestDistance = sameSegment.distance;
      }

      for (const startNodeId of getDepartureNodeIds(startAccess)) {
        for (const endNodeId of getArrivalNodeIds(endAccess)) {
          const pathKey = `${startNodeId}->${endNodeId}`;
          if (!pathCache.has(pathKey)) {
            pathCache.set(pathKey, findShortestNodePath(startNodeId, endNodeId, graph, travelMode));
          }
          const path = pathCache.get(pathKey);
          if (!path) {
            continue;
          }
          const startNode = graph.nodesById.get(startNodeId);
          const endNode = graph.nodesById.get(endNodeId);
          if (!startNode || !endNode) {
            continue;
          }
          const distance =
            startAccess.distanceToPoint +
            coordinateDistance(startAccess.coordinate, startNode.coordinate) +
            path.distance +
            coordinateDistance(endNode.coordinate, endAccess.coordinate) +
            endAccess.distanceToPoint;
          if (distance >= bestDistance) {
            continue;
          }
          bestCoordinates = dedupeConsecutive([
            start,
            startAccess.coordinate,
            ...path.nodeIds.flatMap((nodeId) => {
              const node = graph.nodesById.get(nodeId);
              return node ? [node.coordinate] : [];
            }),
            endAccess.coordinate,
            end,
          ]);
          bestDistance = distance;
        }
      }
    }
  }

  return bestCoordinates
    ? { coordinates: bestCoordinates, resolved: true }
    : { coordinates: [start, end], resolved: false };
}

function resolveSameRoadSegment(
  start: [number, number],
  end: [number, number],
  startAccess: VisualRoadAccessCandidate,
  endAccess: VisualRoadAccessCandidate,
): { coordinates: Array<[number, number]>; distance: number } | undefined {
  if (
    startAccess.roadId !== endAccess.roadId ||
    startAccess.startNodeId !== endAccess.startNodeId ||
    startAccess.endNodeId !== endAccess.endNodeId
  ) {
    return undefined;
  }
  const travelDirection = Math.sign(endAccess.segmentRatio - startAccess.segmentRatio);
  if (
    (travelDirection > 0 && startAccess.direction === 'reverse') ||
    (travelDirection < 0 && startAccess.direction === 'forward')
  ) {
    return undefined;
  }
  return {
    coordinates: dedupeConsecutive([start, startAccess.coordinate, endAccess.coordinate, end]),
    distance:
      startAccess.distanceToPoint +
      Math.abs(startAccess.startDistance - endAccess.startDistance) +
      endAccess.distanceToPoint,
  };
}

function findRoadAccessCandidates(
  point: [number, number],
  target: [number, number],
  graph: VisualRoadGraph,
  travelMode: MapTravelMode,
  limit = 12,
): VisualRoadAccessCandidate[] {
  const candidates = graph.roadSegments
    .filter((segment) => {
      if (!segment.allowedModes.includes(travelMode)) {
        return false;
      }
      const projection = projectPointToRoadSegment(point, segment);
      return (
        Math.abs(interpolateSegmentY(segment, projection.coordinate) - graph.defaultY) <=
        graph.verticalTolerance
      );
    })
    .map((segment) => {
      const projection = projectPointToRoadSegment(point, segment);
      return {
        ...projection,
        score:
          projection.distanceToPoint +
          getRoadAccessDirectionPenalty(point, target, projection.coordinate),
      };
    });
  const byScore = [...candidates].sort((left, right) => left.score - right.score).slice(0, limit);
  const byDistance = [...candidates]
    .sort((left, right) => left.distanceToPoint - right.distanceToPoint)
    .slice(0, limit);
  const deduped = new Map<string, VisualRoadAccessCandidate>();
  const addCandidate = (candidate: VisualRoadAccessCandidate) => {
    const key = `${candidate.startNodeId}:${candidate.endNodeId}:${candidate.coordinate[0].toFixed(2)}:${candidate.coordinate[1].toFixed(2)}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  };

  for (const candidate of byScore.slice(0, Math.ceil(limit * 0.6))) {
    addCandidate(candidate);
  }
  for (const candidate of byDistance) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }
  for (const candidate of byScore) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }
  return [...deduped.values()];
}

function projectPointToRoadSegment(
  point: [number, number],
  segment: VisualRoadSegment,
): VisualRoadAccessCandidate {
  const projection = projectPointOntoSegment(segment.start, segment.end, point);
  const totalDistance = coordinateDistance(segment.start, segment.end);
  const startDistance = totalDistance * projection.ratio;
  return {
    coordinate: projection.coordinate,
    distanceToPoint: coordinateDistance(point, projection.coordinate),
    direction: segment.direction,
    endNodeId: segment.endNodeId,
    roadId: segment.roadId,
    segmentLength: totalDistance,
    segmentRatio: projection.ratio,
    startDistance,
    startNodeId: segment.startNodeId,
  };
}

function getDepartureNodeIds(candidate: VisualRoadAccessCandidate): string[] {
  if (candidate.direction === 'forward') {
    return [candidate.endNodeId];
  }
  if (candidate.direction === 'reverse') {
    return [candidate.startNodeId];
  }
  return [candidate.startNodeId, candidate.endNodeId];
}

function getArrivalNodeIds(candidate: VisualRoadAccessCandidate): string[] {
  if (candidate.direction === 'forward') {
    return [candidate.startNodeId];
  }
  if (candidate.direction === 'reverse') {
    return [candidate.endNodeId];
  }
  return [candidate.startNodeId, candidate.endNodeId];
}

function getRoadAccessDirectionPenalty(
  point: [number, number],
  target: [number, number],
  accessPoint: [number, number],
): number {
  const accessVector = [accessPoint[0] - point[0], accessPoint[1] - point[1]] as const;
  const targetVector = [target[0] - point[0], target[1] - point[1]] as const;
  const accessLength = Math.hypot(...accessVector);
  const targetLength = Math.hypot(...targetVector);
  if (accessLength === 0 || targetLength === 0) {
    return 0;
  }
  const cosine =
    (accessVector[0] * targetVector[0] + accessVector[1] * targetVector[1]) /
    (accessLength * targetLength);
  return (1 - Math.min(1, Math.max(-1, cosine))) * 18;
}

function findShortestNodePath(
  startNodeId: string,
  endNodeId: string,
  graph: VisualRoadGraph,
  travelMode: MapTravelMode,
): { distance: number; nodeIds: string[] } | undefined {
  if (startNodeId === endNodeId) {
    return { distance: 0, nodeIds: [startNodeId] };
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
      if (!edge.allowedModes.includes(travelMode)) {
        continue;
      }
      const nextDistance = current.distance + edge.distance;
      if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      distances.set(edge.to, nextDistance);
      previous.set(edge.to, current.nodeId);
      queue.push({ distance: nextDistance, nodeId: edge.to });
    }
  }

  const distance = distances.get(endNodeId);
  if (distance === undefined) {
    return undefined;
  }
  const nodeIds = [endNodeId];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const parent = previous.get(cursor);
    if (!parent) {
      return undefined;
    }
    nodeIds.push(parent);
    cursor = parent;
  }
  return { distance, nodeIds: nodeIds.reverse() };
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
  distance = visualNodeDistance(left, right),
  allowedModes: readonly MapTravelMode[] = allMapTravelModes,
  direction: MapNetworkDirection = 'both',
): void {
  if (direction !== 'reverse') {
    adjacency.get(left.id)?.push({ allowedModes, distance, to: right.id });
  }
  if (direction !== 'forward') {
    adjacency.get(right.id)?.push({ allowedModes, distance, to: left.id });
  }
}

function visualNodeDistance(left: VisualRoadNode, right: VisualRoadNode): number {
  return Math.hypot(
    left.coordinate[0] - right.coordinate[0],
    left.coordinate[1] - right.coordinate[1],
    left.y - right.y,
  );
}

function resolveVisualRoadAllowedModes(
  marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId' | 'spatial'>,
): readonly MapTravelMode[] {
  if (marker.spatial?.allowedModes) {
    return [...new Set(marker.spatial.allowedModes)];
  }
  if (marker.spatial?.networkKind === 'pedestrian' || marker.categoryId === 'pedestrian-path') {
    return ['walk'];
  }
  return allMapTravelModes;
}

function intersectTravelModes(
  left: readonly MapTravelMode[],
  right: readonly MapTravelMode[],
): readonly MapTravelMode[] {
  return left.filter((mode) => right.includes(mode));
}

function interpolateSegmentY(
  segment: Pick<VisualRoadSegment, 'end' | 'endY' | 'start' | 'startY'>,
  coordinate: [number, number],
): number {
  const ratio = projectPointOntoSegment(segment.start, segment.end, coordinate).ratio;
  return segment.startY + (segment.endY - segment.startY) * ratio;
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

function appendCoordinates(
  target: Array<[number, number]>,
  coordinates: Array<[number, number]>,
): void {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      target.push(coordinate);
    }
  }
}

function dedupeConsecutive(coordinates: Array<[number, number]>): Array<[number, number]> {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || coordinate[0] !== previous[0] || coordinate[1] !== previous[1];
  });
}

function dedupeRoadPoints<T extends { coordinate: [number, number] }>(points: T[]): T[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return (
      !previous ||
      point.coordinate[0] !== previous.coordinate[0] ||
      point.coordinate[1] !== previous.coordinate[1]
    );
  });
}

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
