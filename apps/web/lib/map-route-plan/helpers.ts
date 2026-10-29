import type { MapGeometry, MapMarkerSnapshot } from '@yct/contracts';
import {
  getCoordinateBounds,
  getCoordinateChainDistance,
  getGeometryCoordinates,
} from '../map-spatial';
import { orderMapRoadCoordinates } from '../map-road-geometry';
import { getTransitStopLocationMarkerIdsForDirection } from '../transit-stop-location';
import {
  isTransitLineDirectionIncluded,
  type TransitLineTravelDirection,
} from '../transit-line-direction';
import { getTransitStationNameMatchKeys } from '../transit-station-detail-match';
import type {
  CenterableMarker,
  RegionGeometry,
  TransitLineStopForMap,
  TransitOverviewLine,
} from './types';

/** 去掉地图标记文本里的分隔符和多余空白，供搜索、匹配和展示共用。 */
export function normalizeMarkerDisplayText(value: string): string {
  return value
    .replace(/[|｜]+/g, '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
}

/** 与地图端一致的实体名称本地化：中文源文本保留紧凑写法，其他语言优先使用译名。 */
export function resolveLocalizedLabel(
  sourceText: string,
  localizedLabels: Partial<Record<string, string>> | undefined,
  locale: string,
): string {
  const normalizedSourceText =
    sourceText.replace(/[\s\u3000|｜]+/g, '').trim() || sourceText.trim();
  if (locale === 'zh-CN') {
    return normalizedSourceText;
  }
  return localizedLabels?.[locale]?.trim() || normalizedSourceText;
}

export function formatMarkerDisplayName(value: string): string {
  return normalizeMarkerDisplayText(value) || value.trim();
}

export function normalizeMarkerSearchText(value: string): string {
  return normalizeMarkerDisplayText(value)
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

export function getMarkerIconBaseName(fileName?: string): string {
  return (
    fileName
      ?.trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? ''
  );
}

export function isExitMarkerIcon(fileName?: string): boolean {
  return getMarkerIconBaseName(fileName).startsWith('exit');
}

export function isWayAccessMarkerIcon(fileName?: string): boolean {
  const baseName = getMarkerIconBaseName(fileName);
  return baseName === 'way-in' || baseName === 'way-out';
}

export function getMarkerCenter(marker: CenterableMarker): [number, number] | undefined {
  if (marker.geometry.type === 'Point') {
    return marker.geometry.coordinates;
  }

  const coordinates = getGeometryCoordinates(marker.geometry);
  if (coordinates.length === 0) {
    return undefined;
  }
  const bounds = getCoordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

/**
 * 道路走向：只有真正乱序的坐标才需要按最近邻重排。
 * 新建的线性道路（LineString）按录入顺序保存；旧道路分类散点也会在接口侧预先排序，
 * 这两类数据再排一次会被重新选起点、把走向打乱甚至反向，因此只在重排后明显更短时才采用。
 */
export function getRoadTraceCoordinates(marker: {
  geometry: MapGeometry;
}): Array<[number, number]> {
  if (marker.geometry.type === 'LineString') {
    return marker.geometry.coordinates;
  }
  const coordinates = getGeometryCoordinates(marker.geometry);
  if (coordinates.length < 3) {
    return coordinates;
  }
  const ordered = orderMapRoadCoordinates(coordinates);
  const orderedDistance = getCoordinateChainDistance(ordered);
  return orderedDistance < getCoordinateChainDistance(coordinates) * 0.98 ? ordered : coordinates;
}

export function getDirectionalLineStops(
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
): TransitLineStopForMap[] {
  const sourceStops: TransitLineStopForMap[] =
    line.stationStops && line.stationStops.length > 0
      ? line.stationStops
      : line.stationNames.map((stationName, sequence) => ({
          stationName,
          operationStatus: 'operating' as const,
          displayStationName: line.displayStationNames?.[sequence],
          sequence,
        }));

  const filteredStops = sourceStops
    .filter((stop) => isTransitLineStopVisibleInDirection(stop, direction))
    .map((stop) => {
      const configuredLocationMarkerIds = new Set(
        (stop.stopLocationRefs ?? []).map((ref) => ref.markerId),
      );
      return {
        ...stop,
        stationMarkerIds: [
          ...getTransitStopLocationMarkerIdsForDirection(stop.stopLocationRefs, direction),
          ...(stop.stationMarkerIds ?? []).filter(
            (markerId) => !configuredLocationMarkerIds.has(markerId),
          ),
        ].filter((markerId, index, markerIds) => markerIds.indexOf(markerId) === index),
      };
    });

  const sortedStops = [...filteredStops].sort((left, right) => left.sequence - right.sequence);
  return direction === 'forward' ? sortedStops : sortedStops.reverse();
}

function isTransitLineStopVisibleInDirection(
  stop: TransitLineStopForMap,
  direction: TransitLineTravelDirection,
): boolean {
  return isTransitLineDirectionIncluded(stop.oneWay, direction);
}

export function isTransitStationPoi(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return Boolean(
    marker.categoryId &&
    [
      'airport',
      'bus-stop',
      'coach-station',
      'ferry-port',
      'metro-station',
      'railway-station',
      'tram-station',
    ].includes(marker.categoryId),
  );
}

export function isMetroStationPoi(
  marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId'>,
): boolean {
  return marker.categoryId === 'metro-station';
}

export function getMarkerStationNameMatchKeys(marker: {
  label: string;
  sourceLabel?: string;
}): string[] {
  return dedupeValues([
    ...getTransitStationNameMatchKeys(marker.sourceLabel ?? marker.label),
    ...getTransitStationNameMatchKeys(marker.label),
  ]);
}

export function dedupeValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function isCoordinateInsideRegion(
  coordinate: [number, number],
  region: RegionGeometry,
): boolean {
  if (region.type === 'Rectangle') {
    return isCoordinateInsideRectangle(coordinate, region.bounds);
  }
  if (region.type === 'MultiRectangle') {
    return region.rectangles.some((bounds) => isCoordinateInsideRectangle(coordinate, bounds));
  }
  if (region.type === 'Polygon') {
    return isCoordinateInsidePolygon(coordinate, region.coordinates);
  }
  return region.coordinates.some((polygon) => isCoordinateInsidePolygon(coordinate, polygon));
}

function isCoordinateInsideRectangle(
  [x, z]: [number, number],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function isCoordinateInsidePolygon(
  coordinate: [number, number],
  rings: Array<Array<[number, number]>>,
): boolean {
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

function isCoordinateOnRingBoundary(
  coordinate: [number, number],
  ring: Array<[number, number]>,
): boolean {
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (start && end && isCoordinateOnSegment(coordinate, start, end)) {
      return true;
    }
  }
  return false;
}

export function isCoordinateOnSegment(
  [x, z]: [number, number],
  [startX, startZ]: [number, number],
  [endX, endZ]: [number, number],
): boolean {
  const cross = (x - startX) * (endZ - startZ) - (z - startZ) * (endX - startX);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  return (
    x >= Math.min(startX, endX) &&
    x <= Math.max(startX, endX) &&
    z >= Math.min(startZ, endZ) &&
    z <= Math.max(startZ, endZ)
  );
}

function isCoordinateInsideRing([x, z]: [number, number], ring: Array<[number, number]>): boolean {
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

export function rectangleBoundsToMapCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): Array<[number, number]> {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
    [bounds.minX, bounds.minZ],
  ];
}

export function interpolateCoordinate(
  from: [number, number],
  to: [number, number],
  ratio: number,
): [number, number] {
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
}
