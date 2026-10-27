import type { MapGeometry } from '@yct/contracts';

export type MapCoordinate = [number, number];

export interface CoordinateChainProjection {
  coordinate: MapCoordinate;
  distance: number;
  mileage: number;
}

export interface CoordinateBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 地图距离统一按欧氏距离（地图格）计算，平方距离只用于排序比较。 */
export function getCoordinateDistance(left: MapCoordinate, right: MapCoordinate): number {
  const deltaX = left[0] - right[0];
  const deltaZ = left[1] - right[1];
  return Math.hypot(deltaX, deltaZ);
}

export function squaredDistance(a: MapCoordinate, b: MapCoordinate): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

export function getCoordinateChainDistance(chain: MapCoordinate[]): number {
  return chain.slice(1).reduce((total, coordinate, index) => {
    const previous = chain[index];
    return previous ? total + getCoordinateDistance(previous, coordinate) : total;
  }, 0);
}

/** 把点投影到折线上，返回最近点、垂距和沿线里程。 */
export function findCoordinateChainProjection(
  point: MapCoordinate,
  chain: MapCoordinate[],
): CoordinateChainProjection | undefined {
  if (chain.length === 0) {
    return undefined;
  }
  if (chain.length === 1) {
    const coordinate = chain[0]!;
    return { coordinate, distance: getCoordinateDistance(point, coordinate), mileage: 0 };
  }

  let best: CoordinateChainProjection | undefined;
  let traveled = 0;
  for (let index = 1; index < chain.length; index += 1) {
    const from = chain[index - 1]!;
    const to = chain[index]!;
    const deltaX = to[0] - from[0];
    const deltaZ = to[1] - from[1];
    const segmentLength = Math.hypot(deltaX, deltaZ);
    const squareLength = deltaX * deltaX + deltaZ * deltaZ;
    const ratio =
      squareLength === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point[0] - from[0]) * deltaX + (point[1] - from[1]) * deltaZ) / squareLength,
            ),
          );
    const coordinate: MapCoordinate = [from[0] + deltaX * ratio, from[1] + deltaZ * ratio];
    const distance = getCoordinateDistance(point, coordinate);
    if (!best || distance < best.distance) {
      best = { coordinate, distance, mileage: traveled + segmentLength * ratio };
    }
    traveled += segmentLength;
  }

  return best;
}

/** 取出几何里所有坐标，用于取中心点、范围和区域内判断。 */
export function getGeometryCoordinates(geometry: MapGeometry): MapCoordinate[] {
  if (geometry.type === 'Point') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    return geometry.coordinates;
  }
  if (geometry.type === 'Rectangle') {
    return rectangleBoundsToCoordinates(geometry.bounds);
  }
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.flatMap(rectangleBoundsToCoordinates);
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }
  return geometry.coordinates.flat(2);
}

export function getGeometryCenter(geometry: MapGeometry): MapCoordinate | undefined {
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }

  const coordinates = getGeometryCoordinates(geometry);
  if (coordinates.length === 0) {
    return undefined;
  }
  const bounds = getCoordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

export function getCoordinateBounds(coordinates: MapCoordinate[]): CoordinateBounds {
  return coordinates.reduce(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

/** 区域（行政区、区域型 POI）内外判断，与地图“区域内/区域外附近”一致。 */
export function isCoordinateInsideRegionGeometry(
  coordinate: MapCoordinate,
  geometry: MapGeometry,
): boolean {
  if (geometry.type === 'Rectangle') {
    return isCoordinateInsideRectangle(coordinate, geometry.bounds);
  }
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.some((bounds) => isCoordinateInsideRectangle(coordinate, bounds));
  }
  if (geometry.type === 'Polygon') {
    return isCoordinateInsidePolygon(coordinate, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => isCoordinateInsidePolygon(coordinate, polygon));
  }
  return false;
}

export interface SpatialMarkerLike {
  id: string;
  geometry: MapGeometry;
}

export interface NearbyMarkerMatch<T extends SpatialMarkerLike> {
  marker: T;
  distance: number;
}

export interface AlongChainMarkerMatch<T extends SpatialMarkerLike> extends NearbyMarkerMatch<T> {
  mileage: number;
}

/** 地图“周边搜索”：按到中心点的距离筛选，距离单位为地图格。 */
export function findNearbyMarkerMatches<T extends SpatialMarkerLike>(
  markers: T[],
  options: {
    center: MapCoordinate;
    radius: number;
    excludeIds?: Iterable<string>;
    filter?: (marker: T) => boolean;
    limit?: number;
  },
): NearbyMarkerMatch<T>[] {
  const excludeIds = new Set(options.excludeIds ?? []);
  const matches: NearbyMarkerMatch<T>[] = [];

  for (const marker of markers) {
    if (excludeIds.has(marker.id) || (options.filter && !options.filter(marker))) {
      continue;
    }
    const center = getGeometryCenter(marker.geometry);
    if (!center) {
      continue;
    }
    const distance = getCoordinateDistance(options.center, center);
    if (distance <= options.radius) {
      matches.push({ marker, distance });
    }
  }

  return matches
    .sort((left, right) => left.distance - right.distance)
    .slice(0, options.limit ?? 50);
}

/** 地图“沿线搜索”：按到折线的垂距和沿线里程筛选，默认走廊与地图一致。 */
export function findAlongChainMarkerMatches<T extends SpatialMarkerLike>(
  markers: T[],
  options: {
    chain: MapCoordinate[];
    corridorDistance?: number;
    fromMileage?: number;
    toMileage?: number;
    excludeIds?: Iterable<string>;
    filter?: (marker: T) => boolean;
    limit?: number;
  },
): AlongChainMarkerMatch<T>[] {
  if (options.chain.length < 2) {
    return [];
  }

  const excludeIds = new Set(options.excludeIds ?? []);
  const corridorDistance = options.corridorDistance ?? 300;
  const fromMileage = Math.min(options.fromMileage ?? 0, options.toMileage ?? Number.MAX_VALUE);
  const toMileage = Math.max(options.fromMileage ?? 0, options.toMileage ?? Number.MAX_VALUE);
  const matches: AlongChainMarkerMatch<T>[] = [];

  for (const marker of markers) {
    if (excludeIds.has(marker.id) || (options.filter && !options.filter(marker))) {
      continue;
    }
    const center = getGeometryCenter(marker.geometry);
    if (!center) {
      continue;
    }
    const projection = findCoordinateChainProjection(center, options.chain);
    if (
      !projection ||
      projection.distance > corridorDistance ||
      projection.mileage < fromMileage ||
      projection.mileage > toMileage
    ) {
      continue;
    }
    matches.push({ marker, distance: projection.distance, mileage: projection.mileage });
  }

  return matches.sort((left, right) => left.mileage - right.mileage).slice(0, options.limit ?? 80);
}

function rectangleBoundsToCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): MapCoordinate[] {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
    [bounds.minX, bounds.minZ],
  ];
}

function isCoordinateInsideRectangle(
  [x, z]: MapCoordinate,
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function isCoordinateInsidePolygon(coordinate: MapCoordinate, rings: MapCoordinate[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (isCoordinateOnRingBoundary(coordinate, ring)) {
      return true;
    }
    if (isCoordinateInsideRing(coordinate, ring)) {
      inside = !inside;
    }
  }
  return inside;
}

function isCoordinateOnRingBoundary(coordinate: MapCoordinate, ring: MapCoordinate[]): boolean {
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (start && end && isCoordinateOnSegment(coordinate, start, end)) {
      return true;
    }
  }
  return false;
}

function isCoordinateOnSegment(
  [x, z]: MapCoordinate,
  [startX, startZ]: MapCoordinate,
  [endX, endZ]: MapCoordinate,
): boolean {
  const cross = (x - startX) * (endZ - startZ) - (z - startZ) * (endX - startX);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  const squaredLength = (endX - startX) ** 2 + (endZ - startZ) ** 2;
  // 多边形首尾点重复时会形成零长度边，不能把所有点都判成在边界上。
  if (squaredLength === 0) {
    return false;
  }
  const dot = (x - startX) * (endX - startX) + (z - startZ) * (endZ - startZ);
  return dot >= 0 && dot <= squaredLength;
}

function isCoordinateInsideRing([x, z]: MapCoordinate, ring: MapCoordinate[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    const intersects =
      currentPoint[1] > z !== previousPoint[1] > z &&
      x <
        ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
