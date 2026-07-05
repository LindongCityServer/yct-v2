import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ISODateTimeString, UserMapFavorites } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface MapFavoriteStoreSnapshot {
  version: 1;
  favorites: UserMapFavorites[];
}

const emptySnapshot: MapFavoriteStoreSnapshot = {
  version: 1,
  favorites: [],
};

export async function findMapFavoritesByUserId(
  userId: string,
): Promise<UserMapFavorites | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.favorites.find((item) => item.userId === userId);
}

export async function upsertMapFavorites(favorites: UserMapFavorites): Promise<UserMapFavorites> {
  const snapshot = await readSnapshot();
  const existing = snapshot.favorites.find((item) => item.userId === favorites.userId);
  const next: UserMapFavorites = {
    ...favorites,
    markerIds: dedupeMarkerIds(favorites.markerIds),
    updatedAt: favorites.updatedAt || new Date().toISOString(),
  };

  await writeSnapshot({
    ...snapshot,
    favorites: existing
      ? snapshot.favorites.map((item) => (item.userId === favorites.userId ? next : item))
      : [...snapshot.favorites, next],
  });

  return next;
}

export function createDefaultMapFavorites(input: {
  userId: string;
  ldpassUserId: string;
  updatedAt?: ISODateTimeString;
}): UserMapFavorites {
  return {
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    markerIds: [],
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

function dedupeMarkerIds(markerIds: string[]): string[] {
  return [...new Set(markerIds.map((markerId) => markerId.trim()).filter(Boolean))];
}

async function readSnapshot(): Promise<MapFavoriteStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as MapFavoriteStoreSnapshot;
    return {
      version: 1,
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: MapFavoriteStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.mapFavoriteStorePath)
    ? config.mapFavoriteStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.mapFavoriteStorePath);
}
