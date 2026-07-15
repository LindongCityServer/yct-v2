import type { MapMarkerSnapshot } from '@yct/contracts';

type MapMarker = MapMarkerSnapshot['markers'][number];

export type MapRoadMarkerKind = 'highway' | 'road';

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
