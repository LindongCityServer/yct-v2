import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ISODateTimeString, RectangleBounds } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface StoredOfflinePackageRequest {
  packageId: string;
  userId: string;
  ldpassUserId: string;
  name: string;
  bounds: RectangleBounds;
  status: 'requested';
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  lastRequestedAt: ISODateTimeString;
}

interface OfflinePackageStoreSnapshot {
  version: 1;
  requests: StoredOfflinePackageRequest[];
}

const emptySnapshot: OfflinePackageStoreSnapshot = {
  version: 1,
  requests: [],
};

export async function listOfflinePackageRequestsForUser(
  userId: string,
): Promise<StoredOfflinePackageRequest[]> {
  const snapshot = await readSnapshot();
  return snapshot.requests
    .filter((request) => request.userId === userId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function upsertOfflinePackageRequest(input: {
  packageId: string;
  userId: string;
  ldpassUserId: string;
  name: string;
  bounds: RectangleBounds;
  requestedAt?: ISODateTimeString;
}): Promise<{ request: StoredOfflinePackageRequest; created: boolean }> {
  const snapshot = await readSnapshot();
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const normalizedBounds = normalizeBounds(input.bounds);
  const existing = snapshot.requests.find(
    (request) => request.packageId === input.packageId && request.userId === input.userId,
  );

  if (existing) {
    const updated: StoredOfflinePackageRequest = {
      ...existing,
      ldpassUserId: input.ldpassUserId,
      name: input.name.trim(),
      bounds: normalizedBounds,
      status: 'requested',
      updatedAt: requestedAt,
      lastRequestedAt: requestedAt,
    };
    await writeSnapshot({
      ...snapshot,
      requests: snapshot.requests.map((request) =>
        request.packageId === existing.packageId && request.userId === existing.userId
          ? updated
          : request,
      ),
    });
    return { request: updated, created: false };
  }

  const created: StoredOfflinePackageRequest = {
    packageId: input.packageId,
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    name: input.name.trim(),
    bounds: normalizedBounds,
    status: 'requested',
    createdAt: requestedAt,
    updatedAt: requestedAt,
    lastRequestedAt: requestedAt,
  };

  await writeSnapshot({
    ...snapshot,
    requests: [...snapshot.requests, created],
  });
  return { request: created, created: true };
}

export async function deleteOfflinePackageRequestForUser(input: {
  packageId: string;
  userId: string;
}): Promise<StoredOfflinePackageRequest | null> {
  const snapshot = await readSnapshot();
  const deleted = snapshot.requests.find(
    (request) => request.packageId === input.packageId && request.userId === input.userId,
  );

  if (!deleted) {
    return null;
  }

  await writeSnapshot({
    ...snapshot,
    requests: snapshot.requests.filter(
      (request) => request.packageId !== input.packageId || request.userId !== input.userId,
    ),
  });

  return deleted;
}

async function readSnapshot(): Promise<OfflinePackageStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as OfflinePackageStoreSnapshot;
    return {
      version: 1,
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: OfflinePackageStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.offlinePackageStorePath)
    ? config.offlinePackageStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.offlinePackageStorePath);
}

function normalizeBounds(bounds: RectangleBounds): RectangleBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxZ: Math.max(bounds.minZ, bounds.maxZ),
  };
}
