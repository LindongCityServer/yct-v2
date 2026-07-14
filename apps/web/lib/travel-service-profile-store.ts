import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TravelScheduleServiceProfile } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface TravelServiceProfileStoreSnapshot {
  version: 1;
  profileId: string;
  services: TravelScheduleServiceProfile[];
  updatedAt?: string;
  updatedBy?: string;
}

export const defaultTravelServiceProfiles: TravelScheduleServiceProfile[] = [
  {
    kind: 'coach',
    label: '客运',
    color: '#8BBF35',
    icon: 'airport_shuttle',
    sortOrder: 0,
    enabled: true,
  },
  {
    kind: 'ferry',
    label: '轮渡',
    color: '#168AA5',
    icon: 'directions_boat',
    sortOrder: 1,
    enabled: true,
  },
  {
    kind: 'flight',
    label: '航班',
    color: '#6657D9',
    icon: 'flight_takeoff',
    sortOrder: 2,
    enabled: true,
  },
  {
    kind: 'railway',
    label: '地方铁路',
    color: '#8B5E34',
    icon: 'train',
    sortOrder: 3,
    enabled: true,
  },
  {
    kind: 'custom',
    label: '自定义',
    color: '#168F78',
    icon: 'route',
    sortOrder: 4,
    enabled: true,
  },
];

const defaultSnapshot: TravelServiceProfileStoreSnapshot = {
  version: 1,
  profileId: 'default',
  services: defaultTravelServiceProfiles,
};

export async function readTravelServiceProfiles(): Promise<TravelScheduleServiceProfile[]> {
  const snapshot = await readSnapshot();
  return normalizeProfiles(snapshot.services);
}

export async function writeTravelServiceProfiles(input: {
  services: TravelScheduleServiceProfile[];
  actorId: string;
}): Promise<TravelScheduleServiceProfile[]> {
  const now = new Date().toISOString();
  const services = normalizeProfiles(
    input.services.map((service) => ({
      ...service,
      updatedAt: now,
      updatedBy: input.actorId,
    })),
  );

  await writeSnapshot({
    version: 1,
    profileId: 'default',
    services,
    updatedAt: now,
    updatedBy: input.actorId,
  });
  return services;
}

async function readSnapshot(): Promise<TravelServiceProfileStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TravelServiceProfileStoreSnapshot;
    return {
      version: 1,
      profileId: 'default',
      services: Array.isArray(parsed.services) ? parsed.services : defaultTravelServiceProfiles,
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return defaultSnapshot;
  }
}

async function writeSnapshot(snapshot: TravelServiceProfileStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizeProfiles(
  services: TravelScheduleServiceProfile[],
): TravelScheduleServiceProfile[] {
  const byKind = new Map<TravelScheduleServiceProfile['kind'], TravelScheduleServiceProfile>();
  for (const service of services) {
    byKind.set(service.kind, { ...service, enabled: service.enabled ?? true });
  }

  return Array.from(byKind.values()).sort((left, right) => left.sortOrder - right.sortOrder);
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.travelServiceProfileStorePath)
    ? config.travelServiceProfileStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.travelServiceProfileStorePath);
}
