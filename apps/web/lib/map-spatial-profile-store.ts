import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MapSpatialProfile } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface MapSpatialProfileStoreSnapshot {
  version: 1;
  profile: MapSpatialProfile;
}

export const defaultMapSpatialProfile: MapSpatialProfile = {
  mapId: 'lindong-main-map',
  worldId: 'lindong-overworld',
  worldName: '主世界',
  defaultY: 64,
  verticalTolerance: 0,
  defaultDrivingSpeedKmh: 60,
  roadTiming: {
    defaultBusSpeedKmh: 30,
    junctionSnapTolerance: 30,
    taxiJunctionDelaySeconds: 8,
    busJunctionDelaySeconds: 12,
  },
  taxiFare: {
    baseFareCents: 900,
    baseDistanceMeters: 3000,
    incrementDistanceMeters: 450,
    incrementFareCents: 100,
    longDistanceThresholdMeters: 15000,
    longDistanceSurchargePermille: 200,
    longDistanceSurchargeScope: 'excess_distance',
  },
  transitFare: {
    busDefaultFareCents: 200,
    ferryDefaultFareCents: 200,
    railDistanceBands: [
      { maximumDistanceMeters: 6000, fareCents: 200 },
      { maximumDistanceMeters: 10000, fareCents: 300 },
      { maximumDistanceMeters: 14000, fareCents: 400 },
      { maximumDistanceMeters: 21000, fareCents: 500 },
      { maximumDistanceMeters: 28000, fareCents: 600 },
      { maximumDistanceMeters: 38000, fareCents: 700 },
      { maximumDistanceMeters: 48000, fareCents: 800 },
    ],
  },
};

export async function readMapSpatialProfile(): Promise<MapSpatialProfile> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const parsed = JSON.parse(source) as Partial<MapSpatialProfileStoreSnapshot>;
    return normalizeMapSpatialProfile(parsed.profile);
  } catch {
    return { ...defaultMapSpatialProfile };
  }
}

export async function writeMapSpatialProfile(input: {
  profile: MapSpatialProfile;
}): Promise<MapSpatialProfile> {
  const profile = normalizeMapSpatialProfile(input.profile);
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    `${JSON.stringify({ version: 1, profile } satisfies MapSpatialProfileStoreSnapshot, null, 2)}\n`,
    'utf8',
  );
  return profile;
}

function normalizeMapSpatialProfile(
  profile: Partial<MapSpatialProfile> | undefined,
): MapSpatialProfile {
  return {
    ...defaultMapSpatialProfile,
    ...profile,
    taxiFare: {
      ...defaultMapSpatialProfile.taxiFare,
      ...profile?.taxiFare,
    },
    roadTiming: {
      ...defaultMapSpatialProfile.roadTiming,
      ...profile?.roadTiming,
    },
    transitFare: {
      ...defaultMapSpatialProfile.transitFare,
      ...profile?.transitFare,
      railDistanceBands:
        profile?.transitFare?.railDistanceBands ??
        defaultMapSpatialProfile.transitFare.railDistanceBands,
    },
    mapId: defaultMapSpatialProfile.mapId,
    worldId: defaultMapSpatialProfile.worldId,
  };
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.mapSpatialProfileStorePath)
    ? config.mapSpatialProfileStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.mapSpatialProfileStorePath);
}
