import type { MapGeometry, MapMarkerSnapshot } from '@yct/contracts';

type Marker = MapMarkerSnapshot['markers'][number];

function isPublicMarker(marker: Marker): boolean {
  const metadata = marker as Marker & { status?: string; visibility?: string };
  return (
    Boolean(marker.id.trim() && marker.label.trim()) &&
    (!metadata.status || metadata.status === 'published') &&
    (!metadata.visibility || metadata.visibility === 'public')
  );
}

export function hasExplorableGeometry(geometry: MapGeometry): boolean {
  let coordinates: number[][];
  if (geometry.type === 'Point') coordinates = [geometry.coordinates];
  else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString')
    coordinates = geometry.coordinates;
  else if (geometry.type === 'Polygon') coordinates = geometry.coordinates.flat();
  else if (geometry.type === 'MultiPolygon') coordinates = geometry.coordinates.flat(2);
  else {
    const bounds = geometry.type === 'Rectangle' ? [geometry.bounds] : geometry.rectangles;
    return (
      bounds.length > 0 &&
      bounds.every(
        (b) =>
          [b.minX, b.minZ, b.maxX, b.maxZ].every(Number.isFinite) &&
          b.minX < b.maxX &&
          b.minZ < b.maxZ,
      )
    );
  }
  return (
    coordinates.length > 0 && coordinates.every((p) => p.length === 2 && p.every(Number.isFinite))
  );
}

/** Input must already come from the public marker read model, never an admin snapshot. */
export function isExplorablePoi(marker: Marker): boolean {
  // Defensive checks also exclude accidentally mixed unpublished input.
  return (
    isPublicMarker(marker) &&
    Boolean(marker.categoryId) &&
    !['player', 'road', 'transit-line'].includes(marker.categoryId!) &&
    !marker.playerLocation &&
    !marker.spatial?.networkKind &&
    !marker.spatial?.traversalBarrier &&
    !marker.spatial?.hideMarkerIcon &&
    !marker.spatial?.dynamicSymbol &&
    (!marker.transitOperationStatus || marker.transitOperationStatus === 'operating') &&
    hasExplorableGeometry(marker.geometry)
  );
}

export function buildExploreCandidates<T extends Marker>(
  markers: T[],
  lines: ReadonlyArray<{ id: string; operationStatus?: string }>,
): T[] {
  const operatingIds = new Set(
    lines
      .filter((line) => !line.operationStatus || line.operationStatus === 'operating')
      .map((line) => line.id),
  );
  const seen = new Set<string>();
  return markers.filter((marker) => {
    const line = marker.categoryId === 'transit-line';
    const valid = line
      ? marker.geometry.type === 'MultiPoint' &&
        hasExplorableGeometry(marker.geometry) &&
        operatingIds.has(marker.id.replace(/^transit-line-/, '')) &&
        (!marker.transitOperationStatus || marker.transitOperationStatus === 'operating')
      : isExplorablePoi(marker);
    const key = `${line ? 'line' : 'poi'}:${marker.id}`;
    if (!valid || !isPublicMarker(marker) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pickExploreCandidate<T extends { id: string }>(
  candidates: readonly T[],
  previousId?: string,
  random: () => number = Math.random,
): T | undefined {
  const choices =
    candidates.length > 1 ? candidates.filter((item) => item.id !== previousId) : candidates;
  if (!choices.length) return undefined;
  const value = random();
  const index = Math.floor(
    Math.min(1 - Number.EPSILON, Math.max(0, Number.isFinite(value) ? value : 0)) * choices.length,
  );
  return choices[index];
}

/** Stable within a render session; caller changes the seed only on entry or refresh. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = Math.floor((state / 4294967296) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function nextSuggestionSeed(previous: number): number {
  const seed = Math.floor(Math.random() * 4294967296);
  return seed === previous ? (previous + 1) >>> 0 : seed;
}
