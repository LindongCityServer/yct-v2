import type { MapMarkerSnapshot } from '@yct/contracts';

type MapMarker = MapMarkerSnapshot['markers'][number];

export type MapRoadMarkerKind = 'highway' | 'road';

export interface MapRoadProjection {
  coordinate: [number, number];
  distance: number;
  segmentEnd: [number, number];
  segmentStart: [number, number];
}

export interface MapRoadConnectionSegment {
  end: [number, number];
  endIsRoadTerminus: boolean;
  id: string;
  roadId: string;
  start: [number, number];
  startIsRoadTerminus: boolean;
}

export type MapRoadConnectionKind = 'intersection' | 'terminus_snap' | 'terminus_continuation';

export interface MapRoadConnectionProjection {
  distance: number;
  kind: MapRoadConnectionKind;
  leftCoordinate: [number, number];
  leftSegmentId: string;
  rightCoordinate: [number, number];
  rightSegmentId: string;
}

export type MapRoadSignDirectionMode = 'west_east' | 'east_west' | 'south_north' | 'north_south';

export function getMapRoadMarkerKind(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'label'> & {
    spatial?: MapMarker['spatial'];
  },
): MapRoadMarkerKind | undefined {
  // 名称带「高速/快速」的公交线路、站点并非道路，只有道路类对象才参与路网构建。
  if (marker.categoryId !== 'road' && marker.spatial?.networkKind !== 'road') {
    return undefined;
  }
  const label = normalizeRoadSearchText(marker.label);
  const iconFileName = marker.iconFileName?.toLowerCase() ?? '';
  if (
    label.includes('高速') ||
    label.includes('快速') ||
    iconFileName.includes('highway') ||
    iconFileName.includes('toll')
  ) {
    return 'highway';
  }

  return 'road';
}

export function isMapRoadGeometryMarker(marker: MapMarker): boolean {
  return (
    (marker.geometry.type === 'MultiPoint' || marker.geometry.type === 'LineString') &&
    getMapRoadMarkerKind(marker) !== undefined
  );
}

export function orderMapRoadCoordinates(
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  const remaining = Array.from(
    new Map(
      coordinates.map((coordinate) => [`${coordinate[0]}:${coordinate[1]}`, coordinate]),
    ).values(),
  );
  if (remaining.length < 2) {
    return remaining;
  }
  const firstIndex = findRoadStartIndex(remaining);
  const ordered = [remaining.splice(firstIndex, 1)[0]].filter(Boolean) as Array<[number, number]>;

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1]!;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((coordinate, index) => {
      const distance = squaredDistance(last, coordinate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

export function projectPointOntoMapRoad(
  point: [number, number],
  coordinates: Array<[number, number]>,
): MapRoadProjection | undefined {
  if (coordinates.length < 2) {
    return undefined;
  }
  let nearest: MapRoadProjection | undefined;
  for (let index = 1; index < coordinates.length; index += 1) {
    const segmentStart = coordinates[index - 1];
    const segmentEnd = coordinates[index];
    if (!segmentStart || !segmentEnd) {
      continue;
    }
    const projection = projectPointOntoSegment(point, segmentStart, segmentEnd);
    if (!nearest || projection.distance < nearest.distance) {
      nearest = { ...projection, segmentStart, segmentEnd };
    }
  }
  return nearest;
}

export function collectMapRoadConnectionProjections(
  segments: readonly MapRoadConnectionSegment[],
  junctionSnapTolerance: number,
): MapRoadConnectionProjection[] {
  const connections = new Map<string, MapRoadConnectionProjection>();
  const exactTerminusKeys = new Set<string>();
  const roadIdBySegmentId = new Map(segments.map((segment) => [segment.id, segment.roadId]));

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const left = segments[leftIndex];
      const right = segments[rightIndex];
      if (!left || !right || left.roadId === right.roadId) {
        continue;
      }
      const intersection = getSegmentIntersection(left.start, left.end, right.start, right.end);
      if (!intersection) {
        continue;
      }
      addRoadConnection(connections, {
        distance: 0,
        kind: 'intersection',
        leftCoordinate: intersection,
        leftSegmentId: left.id,
        rightCoordinate: intersection,
        rightSegmentId: right.id,
      });
      markConnectedTermini(exactTerminusKeys, left, intersection);
      markConnectedTermini(exactTerminusKeys, right, intersection);
    }
  }

  const tolerance = Math.max(0, junctionSnapTolerance);
  if (tolerance <= 0) {
    return [...connections.values()];
  }

  collectRoadTerminusContinuations(segments, tolerance, exactTerminusKeys, connections);
  // 数据绘制时端点常越过路口中心线 1~2 格，允许这一量级的越线吸附，避免合法 T 型路口被误判
  const terminusOvershootTolerance = Math.min(tolerance, 2);

  const snapCandidatesByTerminus = new Map<string, MapRoadConnectionProjection[]>();
  for (const source of segments) {
    for (const terminus of getRoadSegmentTermini(source)) {
      if (exactTerminusKeys.has(terminus.key)) {
        continue;
      }
      for (const target of segments) {
        if (source.roadId === target.roadId || areSegmentsNearlyParallel(source, target)) {
          continue;
        }
        const projection = projectPointOntoSegment(terminus.coordinate, target.start, target.end);
        if (
          projection.distance <= 0.01 ||
          projection.distance > tolerance ||
          !isProjectionOutsideTerminus(terminus, projection.coordinate, terminusOvershootTolerance) ||
          (projection.ratio <= 0.000001 && target.startIsRoadTerminus) ||
          (projection.ratio >= 0.999999 && target.endIsRoadTerminus)
        ) {
          continue;
        }
        const current = snapCandidatesByTerminus.get(terminus.key) ?? [];
        current.push({
          distance: projection.distance,
          kind: 'terminus_snap',
          leftCoordinate: terminus.coordinate,
          leftSegmentId: source.id,
          rightCoordinate: projection.coordinate,
          rightSegmentId: target.id,
        });
        snapCandidatesByTerminus.set(terminus.key, current);
      }
    }
  }

  for (const candidates of snapCandidatesByTerminus.values()) {
    const nearestByTargetRoad = new Map<string, MapRoadConnectionProjection>();
    for (const candidate of candidates) {
      const targetRoadId = roadIdBySegmentId.get(candidate.rightSegmentId);
      if (!targetRoadId) {
        continue;
      }
      const current = nearestByTargetRoad.get(targetRoadId);
      if (!current || candidate.distance < current.distance) {
        nearestByTargetRoad.set(targetRoadId, candidate);
      }
    }
    const ranked = [...nearestByTargetRoad.values()].sort(
      (left, right) => left.distance - right.distance,
    );
    const best = ranked[0];
    const second = ranked[1];
    if (!best) {
      continue;
    }
    const ambiguityMargin = Math.max(2, tolerance * 0.15);
    if (second && second.distance - best.distance < ambiguityMargin) {
      continue;
    }
    addRoadConnection(connections, best);
  }

  return [...connections.values()].sort((left, right) => left.distance - right.distance);
}

export function shouldUseVerticalMapRoadLabel(
  coordinates: Array<[number, number]>,
  center: [number, number],
): boolean {
  if (coordinates.length < 2) {
    return false;
  }
  const nearest = [...coordinates]
    .sort((left, right) => squaredDistance(left, center) - squaredDistance(right, center))
    .slice(0, 2);
  const sample = [center, ...nearest];
  const xValues = sample.map(([x]) => x);
  const zValues = sample.map(([, z]) => z);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const zRange = Math.max(...zValues) - Math.min(...zValues);
  return zRange > Math.max(8, xRange * 1.35);
}

export function resolveMapRoadSignDirectionMode(
  sourceCoordinate: [number, number],
  projectedCoordinate: [number, number],
  vertical: boolean,
): MapRoadSignDirectionMode {
  if (vertical) {
    return sourceCoordinate[0] > projectedCoordinate[0] ? 'north_south' : 'south_north';
  }
  return sourceCoordinate[1] < projectedCoordinate[1] ? 'west_east' : 'east_west';
}

export function isMapRoadStartOnSignLeft(
  start: [number, number],
  end: [number, number],
  directionMode: MapRoadSignDirectionMode,
): boolean {
  if (directionMode === 'west_east') {
    return start[0] <= end[0];
  }
  if (directionMode === 'east_west') {
    return start[0] >= end[0];
  }
  if (directionMode === 'north_south') {
    return start[1] <= end[1];
  }
  return start[1] >= end[1];
}

function findRoadStartIndex(coordinates: Array<[number, number]>): number {
  const xValues = coordinates.map((coordinate) => coordinate[0]);
  const zValues = coordinates.map((coordinate) => coordinate[1]);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const zRange = Math.max(...zValues) - Math.min(...zValues);
  const primaryAxis = xRange > zRange ? 0 : 1;
  const secondaryAxis = primaryAxis === 0 ? 1 : 0;

  return coordinates.reduce((bestIndex, coordinate, index) => {
    const best = coordinates[bestIndex];
    if (!best) {
      return index;
    }
    if (coordinate[primaryAxis] === best[primaryAxis]) {
      return coordinate[secondaryAxis] < best[secondaryAxis] ? index : bestIndex;
    }
    return coordinate[primaryAxis] < best[primaryAxis] ? index : bestIndex;
  }, 0);
}

function normalizeRoadSearchText(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜]+/g, '')
    .trim()
    .toLowerCase();
}

function squaredDistance(left: [number, number], right: [number, number]): number {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2;
}

function addRoadConnection(
  connections: Map<string, MapRoadConnectionProjection>,
  candidate: MapRoadConnectionProjection,
): void {
  const key = [
    candidate.leftSegmentId,
    candidate.rightSegmentId,
    candidate.leftCoordinate[0].toFixed(2),
    candidate.leftCoordinate[1].toFixed(2),
    candidate.rightCoordinate[0].toFixed(2),
    candidate.rightCoordinate[1].toFixed(2),
  ].join(':');
  connections.set(key, candidate);
}

interface RoadSegmentTerminus {
  coordinate: [number, number];
  innerCoordinate: [number, number];
  key: string;
}

interface RoadTerminusContinuation {
  connection: MapRoadConnectionProjection;
  targetKey: string;
}

function getRoadSegmentTermini(segment: MapRoadConnectionSegment): RoadSegmentTerminus[] {
  return [
    ...(segment.startIsRoadTerminus
      ? [
          {
            coordinate: segment.start,
            innerCoordinate: segment.end,
            key: `${segment.roadId}:start`,
          },
        ]
      : []),
    ...(segment.endIsRoadTerminus
      ? [
          {
            coordinate: segment.end,
            innerCoordinate: segment.start,
            key: `${segment.roadId}:end`,
          },
        ]
      : []),
  ];
}

/**
 * 收集“端点—端点”续接。
 *
 * 同一条物理道路在路口改名或拆成多个标记时，两侧自由端点之间通常只差 1 格左右：
 * 平面交点检测（容差 0.01）捕获不到，端点吸附又因为“端点对端点”和“近似平行”被排除，
 * 导致这类交界处永远不连通。这里单独补充端点续接，但只在两端都是自由端点、
 * 走向连续（转角不超过 90°）且候选明显唯一时才建立连接。
 */
function collectRoadTerminusContinuations(
  segments: readonly MapRoadConnectionSegment[],
  tolerance: number,
  exactTerminusKeys: ReadonlySet<string>,
  connections: Map<string, MapRoadConnectionProjection>,
): void {
  const continuedTerminusKeys = new Set<string>();
  const connectionKeys = new Set<string>();
  if (segments.length < 2) {
    return;
  }
  const roadIdBySegmentId = new Map(segments.map((segment) => [segment.id, segment.roadId]));

  for (const source of segments) {
    for (const sourceTerminus of getRoadSegmentTermini(source)) {
      if (
        exactTerminusKeys.has(sourceTerminus.key) ||
        continuedTerminusKeys.has(sourceTerminus.key)
      ) {
        continue;
      }
      const candidates: RoadTerminusContinuation[] = [];
      for (const target of segments) {
        if (source.roadId === target.roadId) {
          continue;
        }
        for (const targetTerminus of getRoadSegmentTermini(target)) {
          const distance = Math.sqrt(
            squaredDistance(sourceTerminus.coordinate, targetTerminus.coordinate),
          );
          if (distance <= 0.01 || distance > tolerance) {
            continue;
          }
          if (!isRoadTerminusContinuation(sourceTerminus, targetTerminus)) {
            continue;
          }
          candidates.push({
            connection: {
              distance,
              kind: 'terminus_continuation',
              leftCoordinate: sourceTerminus.coordinate,
              leftSegmentId: source.id,
              rightCoordinate: targetTerminus.coordinate,
              rightSegmentId: target.id,
            },
            targetKey: targetTerminus.key,
          });
        }
      }

      const best = pickUnambiguousRoadTerminusContinuation(
        candidates,
        roadIdBySegmentId,
        tolerance,
      );
      if (!best) {
        continue;
      }
      const connectionKey = getUndirectedRoadConnectionKey(best.connection);
      if (connectionKeys.has(connectionKey)) {
        continue;
      }
      connectionKeys.add(connectionKey);
      addRoadConnection(connections, best.connection);
      continuedTerminusKeys.add(sourceTerminus.key);
      continuedTerminusKeys.add(best.targetKey);
    }
  }
}

function pickUnambiguousRoadTerminusContinuation(
  candidates: readonly RoadTerminusContinuation[],
  roadIdBySegmentId: ReadonlyMap<string, string>,
  tolerance: number,
): RoadTerminusContinuation | undefined {
  const nearestByTargetRoad = new Map<string, RoadTerminusContinuation>();
  for (const candidate of candidates) {
    const targetRoadId = roadIdBySegmentId.get(candidate.connection.rightSegmentId);
    if (!targetRoadId) {
      continue;
    }
    const current = nearestByTargetRoad.get(targetRoadId);
    if (!current || candidate.connection.distance < current.connection.distance) {
      nearestByTargetRoad.set(targetRoadId, candidate);
    }
  }
  const ranked = [...nearestByTargetRoad.values()].sort(
    (left, right) => left.connection.distance - right.connection.distance,
  );
  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return undefined;
  }
  const ambiguityMargin = Math.max(2, tolerance * 0.15);
  if (second && second.connection.distance - best.connection.distance < ambiguityMargin) {
    return undefined;
  }
  return best;
}

function isRoadTerminusContinuation(
  source: RoadSegmentTerminus,
  target: RoadSegmentTerminus,
): boolean {
  const sourceOutward: [number, number] = [
    source.coordinate[0] - source.innerCoordinate[0],
    source.coordinate[1] - source.innerCoordinate[1],
  ];
  const targetInward: [number, number] = [
    target.innerCoordinate[0] - target.coordinate[0],
    target.innerCoordinate[1] - target.coordinate[1],
  ];
  const sourceLength = Math.hypot(sourceOutward[0], sourceOutward[1]);
  const targetLength = Math.hypot(targetInward[0], targetInward[1]);
  if (sourceLength <= 0.000001 || targetLength <= 0.000001) {
    return false;
  }
  const cosine =
    (sourceOutward[0] * targetInward[0] + sourceOutward[1] * targetInward[1]) /
    (sourceLength * targetLength);
  // 只接受转角不超过 90° 的走向延续，拒绝掉头与反向顶住的端点对
  return cosine >= 0;
}

function getUndirectedRoadConnectionKey(connection: MapRoadConnectionProjection): string {
  const leftKey = `${connection.leftSegmentId}@${connection.leftCoordinate[0].toFixed(3)}@${connection.leftCoordinate[1].toFixed(3)}`;
  const rightKey = `${connection.rightSegmentId}@${connection.rightCoordinate[0].toFixed(3)}@${connection.rightCoordinate[1].toFixed(3)}`;
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
}

function isProjectionOutsideTerminus(
  terminus: { coordinate: [number, number]; innerCoordinate: [number, number] },
  projection: [number, number],
  overshootTolerance = 0,
): boolean {
  const inwardVector: [number, number] = [
    terminus.innerCoordinate[0] - terminus.coordinate[0],
    terminus.innerCoordinate[1] - terminus.coordinate[1],
  ];
  const inwardLength = Math.hypot(inwardVector[0], inwardVector[1]);
  if (inwardLength <= 0.000001) {
    return false;
  }
  const forwardDistance =
    ((projection[0] - terminus.coordinate[0]) * inwardVector[0] +
      (projection[1] - terminus.coordinate[1]) * inwardVector[1]) /
    inwardLength;
  return forwardDistance <= Math.max(0, overshootTolerance);
}

function markConnectedTermini(
  target: Set<string>,
  segment: MapRoadConnectionSegment,
  coordinate: [number, number],
): void {
  for (const terminus of getRoadSegmentTermini(segment)) {
    if (squaredDistance(terminus.coordinate, coordinate) <= 0.0001) {
      target.add(terminus.key);
    }
  }
}

function areSegmentsNearlyParallel(
  left: MapRoadConnectionSegment,
  right: MapRoadConnectionSegment,
): boolean {
  const leftVector: [number, number] = [left.end[0] - left.start[0], left.end[1] - left.start[1]];
  const rightVector: [number, number] = [
    right.end[0] - right.start[0],
    right.end[1] - right.start[1],
  ];
  const lengthProduct = Math.hypot(...leftVector) * Math.hypot(...rightVector);
  if (lengthProduct <= 0.000001) {
    return true;
  }
  const cosine = Math.abs(
    (leftVector[0] * rightVector[0] + leftVector[1] * rightVector[1]) / lengthProduct,
  );
  return cosine >= Math.cos((20 * Math.PI) / 180);
}

function getSegmentIntersection(
  leftStart: [number, number],
  leftEnd: [number, number],
  rightStart: [number, number],
  rightEnd: [number, number],
): [number, number] | undefined {
  for (const left of [leftStart, leftEnd]) {
    for (const right of [rightStart, rightEnd]) {
      if (squaredDistance(left, right) <= 0.0001) {
        return left;
      }
    }
  }

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

function projectPointOntoSegment(
  point: [number, number],
  segmentStart: [number, number],
  segmentEnd: [number, number],
): Pick<MapRoadProjection, 'coordinate' | 'distance'> & { ratio: number } {
  const deltaX = segmentEnd[0] - segmentStart[0];
  const deltaZ = segmentEnd[1] - segmentStart[1];
  const lengthSquared = deltaX ** 2 + deltaZ ** 2;
  const ratio =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point[0] - segmentStart[0]) * deltaX + (point[1] - segmentStart[1]) * deltaZ) /
              lengthSquared,
          ),
        );
  const coordinate: [number, number] = [
    segmentStart[0] + deltaX * ratio,
    segmentStart[1] + deltaZ * ratio,
  ];
  return { coordinate, distance: Math.sqrt(squaredDistance(point, coordinate)), ratio };
}
