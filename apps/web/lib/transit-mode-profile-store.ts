import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TransitModeProfile } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface TransitModeProfileStoreSnapshot {
  version: 1;
  profileId: string;
  modes: TransitModeProfile[];
  updatedAt?: string;
  updatedBy?: string;
}

export const defaultTransitModeProfiles: TransitModeProfile[] = [
  {
    mode: 'metro',
    label: '地铁',
    color: '#2584E8',
    icon: 'subway',
    sortOrder: 0,
    enabled: true,
  },
  {
    mode: 'tram',
    label: '有轨',
    color: '#C64255',
    icon: 'tram',
    sortOrder: 1,
    enabled: true,
  },
  {
    mode: 'bus',
    label: '公交',
    color: '#F59B22',
    icon: 'directions_bus',
    sortOrder: 2,
    enabled: true,
  },
  {
    mode: 'coach',
    label: '客运',
    color: '#8BBF35',
    icon: 'airport_shuttle',
    sortOrder: 3,
    enabled: true,
  },
  {
    mode: 'ferry',
    label: '轮渡',
    color: '#168AA5',
    icon: 'directions_boat',
    sortOrder: 4,
    enabled: true,
  },
  {
    mode: 'railway',
    label: '地方铁路',
    color: '#8B5E34',
    icon: 'train',
    sortOrder: 5,
    enabled: true,
  },
  {
    mode: 'custom',
    label: '线路',
    color: '#168F78',
    icon: 'route',
    sortOrder: 6,
    enabled: true,
  },
];

const defaultSnapshot: TransitModeProfileStoreSnapshot = {
  version: 1,
  profileId: 'default',
  modes: defaultTransitModeProfiles,
};

export async function readTransitModeProfiles(): Promise<TransitModeProfile[]> {
  const snapshot = await readSnapshot();
  return normalizeProfiles(snapshot.modes);
}

export async function writeTransitModeProfiles(input: {
  modes: TransitModeProfile[];
  actorId: string;
}): Promise<TransitModeProfile[]> {
  const now = new Date().toISOString();
  const modes = normalizeProfiles(
    input.modes.map((mode) => ({
      ...mode,
      updatedAt: now,
      updatedBy: input.actorId,
    })),
  );

  await writeSnapshot({
    version: 1,
    profileId: 'default',
    modes,
    updatedAt: now,
    updatedBy: input.actorId,
  });
  return modes;
}

async function readSnapshot(): Promise<TransitModeProfileStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TransitModeProfileStoreSnapshot;
    return {
      version: 1,
      profileId: 'default',
      modes: Array.isArray(parsed.modes) ? parsed.modes : defaultTransitModeProfiles,
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return defaultSnapshot;
  }
}

async function writeSnapshot(snapshot: TransitModeProfileStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizeProfiles(modes: TransitModeProfile[]): TransitModeProfile[] {
  const byMode = new Map<TransitModeProfile['mode'], TransitModeProfile>();
  for (const mode of modes) {
    byMode.set(mode.mode, { ...mode, enabled: mode.enabled ?? true });
  }

  return Array.from(byMode.values()).sort((left, right) => left.sortOrder - right.sortOrder);
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.transitModeProfileStorePath)
    ? config.transitModeProfileStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.transitModeProfileStorePath);
}
