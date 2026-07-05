import type { UserMapFavorites } from '@yct/contracts';
import { appPath } from './app-paths';

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

export function mergeMapFavoritesFromAccount(markerIds: string[]): MapFavoriteState {
  const merged = dedupeStringValues([...readMapFavoriteMarkerIds(), ...markerIds]);
  writeMapFavoriteMarkerIds(merged);
  return readMapFavoriteState();
}

export async function syncMapFavoritesWithAccount(): Promise<MapFavoriteState> {
  const serverMarkerIds = await readServerMapFavoriteMarkerIds();
  const localMarkerIds = readMapFavoriteMarkerIds();
  const mergedMarkerIds = dedupeStringValues([...localMarkerIds, ...serverMarkerIds]);

  writeMapFavoriteMarkerIds(mergedMarkerIds);

  if (!haveSameMarkerIds(serverMarkerIds, mergedMarkerIds)) {
    await writeServerMapFavoriteMarkerIds(mergedMarkerIds);
  }

  return readMapFavoriteState();
}

export async function readServerMapFavoriteMarkerIds(): Promise<string[]> {
  const response = await fetch(appPath('/api/account/map-favorites'), {
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('账号地图收藏暂不可用');
  }

  const data = (await response.json()) as { item?: UserMapFavorites };
  return data.item ? dedupeStringValues(data.item.markerIds) : [];
}

export async function writeServerMapFavoriteMarkerIds(markerIds: string[]): Promise<string[]> {
  const response = await fetch(appPath('/api/account/map-favorites'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ markerIds: dedupeStringValues(markerIds) }),
  });

  if (!response.ok) {
    throw new Error('账号地图收藏同步失败');
  }

  const data = (await response.json()) as { item?: UserMapFavorites };
  return data.item ? dedupeStringValues(data.item.markerIds) : [];
}

function dedupeStringValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function haveSameMarkerIds(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((markerId) => rightSet.has(markerId));
}
