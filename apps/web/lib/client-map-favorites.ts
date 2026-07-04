export const mapFavoriteStorageKey = 'yct.mapFavorites.v1';

export interface MapFavoriteState {
  markerIds: string[];
  summary: {
    total: number;
  };
}

export function readMapFavoriteState(): MapFavoriteState {
  const markerIds = readMapFavoriteMarkerIds();
  return {
    markerIds,
    summary: {
      total: markerIds.length,
    },
  };
}

export function readMapFavoriteMarkerIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const source = window.localStorage.getItem(mapFavoriteStorageKey);
    const parsed = source ? JSON.parse(source) : [];
    return Array.isArray(parsed)
      ? dedupeStringValues(parsed.filter((item): item is string => typeof item === 'string'))
      : [];
  } catch {
    return [];
  }
}

export function writeMapFavoriteMarkerIds(markerIds: string[]) {
  window.localStorage.setItem(mapFavoriteStorageKey, JSON.stringify(dedupeStringValues(markerIds)));
}

export function clearMapFavoriteMarkers() {
  window.localStorage.removeItem(mapFavoriteStorageKey);
}

function dedupeStringValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
