import type { MapMarkerSnapshot } from '@yct/contracts';

type MapMarker = MapMarkerSnapshot['markers'][number];

export type MapRoadMarkerKind = 'highway' | 'road';

export interface MapRoadProjection {
  coordinate: [number, number];
  distance: number;
  segmentEnd: [number, number];
  segmentStart: [number, number];
}

export function getMapRoadMarkerKind(
  marker: Pick<MapMarker, 'categoryId' | 'iconFileName' | 'label'>,
): MapRoadMarkerKind | undefined {
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

  return marker.categoryId === 'road' ? 'road' : undefined;
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

function projectPointOntoSegment(
  point: [number, number],
  segmentStart: [number, number],
  segmentEnd: [number, number],
): Pick<MapRoadProjection, 'coordinate' | 'distance'> {
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
  return { coordinate, distance: Math.sqrt(squaredDistance(point, coordinate)) };
}
