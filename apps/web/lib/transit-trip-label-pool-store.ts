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
  actorName?: string;
}): Promise<TransitTripLabelPool[]> {
  const now = new Date().toISOString();
  const actorName = input.actorName?.trim() || input.actorId;
  const existingById = new Map((await readTransitTripLabelPools()).map((pool) => [pool.id, pool]));
  // 整组提交时未改动的池不应被刷新更新时间，否则列表里的“最近更新”会失真。
  const pools = normalizePools(input.pools).map((pool) => {
    const previous = existingById.get(pool.id);
    const changed = !previous || !isSamePoolContent(previous, pool);
    return {
      ...pool,
      // 创建者与创建时间只在首次写入时确定，后续编辑不能覆盖。
      createdAt: previous?.createdAt ?? now,
      createdBy: previous?.createdBy ?? actorName,
      updatedAt: changed ? now : (previous?.updatedAt ?? now),
      updatedBy: changed ? actorName : (previous?.updatedBy ?? actorName),
    };
  });

  await writeSnapshot({
    version: 1,
    pools,
    updatedAt: now,
    updatedBy: actorName,
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
      ruleText: pool.ruleText?.trim() || undefined,
      maxConsecutiveTrips: pool.maxConsecutiveTrips,
      maxContinuousWorkMinutes: pool.maxContinuousWorkMinutes,
      mandatoryRestMinutes: pool.mandatoryRestMinutes,
      createdAt: pool.createdAt,
      createdBy: pool.createdBy,
      updatedAt: pool.updatedAt,
      updatedBy: pool.updatedBy,
    });
  }

  return normalized;
}

function isSamePoolContent(left: TransitTripLabelPool, right: TransitTripLabelPool): boolean {
  return (
    left.name === right.name &&
    (left.ruleText ?? '') === (right.ruleText ?? '') &&
    left.labels.length === right.labels.length &&
    left.labels.every((label, index) => label === right.labels[index])
  );
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.transitTripLabelPoolStorePath)
    ? config.transitTripLabelPoolStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.transitTripLabelPoolStorePath);
}
