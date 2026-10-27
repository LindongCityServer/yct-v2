import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TransitTripLabelPool } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface TransitTripLabelPoolStoreSnapshot {
  version: 1;
  pools: TransitTripLabelPool[];
  updatedAt?: string;
  updatedBy?: string;
}

const maximumPoolCount = 64;
const maximumLabelCount = 2000;

export async function readTransitTripLabelPools(): Promise<TransitTripLabelPool[]> {
  const snapshot = await readSnapshot();
  return normalizePools(snapshot.pools);
}

export async function writeTransitTripLabelPools(input: {
  pools: TransitTripLabelPool[];
  actorId: string;
}): Promise<TransitTripLabelPool[]> {
  const now = new Date().toISOString();
  const pools = normalizePools(
    input.pools.map((pool) => ({
      ...pool,
      updatedAt: now,
      updatedBy: input.actorId,
    })),
  );

  await writeSnapshot({
    version: 1,
    pools,
    updatedAt: now,
    updatedBy: input.actorId,
  });
  return pools;
}

async function readSnapshot(): Promise<TransitTripLabelPoolStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TransitTripLabelPoolStoreSnapshot;
    return {
      version: 1,
      pools: Array.isArray(parsed.pools) ? parsed.pools : [],
      updatedAt: parsed.updatedAt,
      updatedBy: parsed.updatedBy,
    };
  } catch {
    return { version: 1, pools: [] };
  }
}

async function writeSnapshot(snapshot: TransitTripLabelPoolStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function normalizePools(pools: readonly TransitTripLabelPool[]): TransitTripLabelPool[] {
  const seenIds = new Set<string>();
  const normalized: TransitTripLabelPool[] = [];

  for (const pool of pools) {
    const id = pool.id.trim();
    const name = pool.name.trim();
    if (!id || !name || seenIds.has(id) || normalized.length >= maximumPoolCount) {
      continue;
    }
    seenIds.add(id);
    const labels: string[] = [];
    const seenLabels = new Set<string>();
    for (const label of pool.labels ?? []) {
      const trimmed = label.trim();
      if (!trimmed || seenLabels.has(trimmed) || labels.length >= maximumLabelCount) {
        continue;
      }
      seenLabels.add(trimmed);
      labels.push(trimmed);
    }
    normalized.push({
      id,
      name,
      labels,
      updatedAt: pool.updatedAt,
      updatedBy: pool.updatedBy,
    });
  }

  return normalized;
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.transitTripLabelPoolStorePath)
    ? config.transitTripLabelPoolStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.transitTripLabelPoolStorePath);
}
