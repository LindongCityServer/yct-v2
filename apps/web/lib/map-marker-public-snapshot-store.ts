import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ApiMeta, MapMarkerSnapshot } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface PublicMapMarkerSnapshotRecord {
  version: 1;
  refreshedAt: string;
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl: string;
}

export async function readPublicMapMarkerSnapshot(): Promise<
  PublicMapMarkerSnapshotRecord | undefined
> {
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    return normalizeRecord(JSON.parse(source));
  } catch {
    return undefined;
  }
}

export async function writePublicMapMarkerSnapshot(input: {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl: string;
}): Promise<PublicMapMarkerSnapshotRecord> {
  const record: PublicMapMarkerSnapshotRecord = {
    version: 1,
    refreshedAt: new Date().toISOString(),
    meta: input.meta,
    snapshot: input.snapshot,
    iconBaseUrl: input.iconBaseUrl,
  };
  const storePath = resolveStorePath();
  const temporaryPath = `${storePath}.${randomUUID()}.tmp`;

  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, 'utf8');
  await rename(temporaryPath, storePath);
  return record;
}

function resolveStorePath(): string {
  const configuredPath = readRuntimeConfig().mapMarkerPublicSnapshotStorePath;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

function normalizeRecord(value: unknown): PublicMapMarkerSnapshotRecord | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Partial<PublicMapMarkerSnapshotRecord>;
  if (
    candidate.version !== 1 ||
    !candidate.meta ||
    !candidate.snapshot ||
    typeof candidate.iconBaseUrl !== 'string' ||
    typeof candidate.refreshedAt !== 'string' ||
    typeof candidate.snapshot.fetchedAt !== 'string' ||
    !Array.isArray(candidate.snapshot.markers)
  ) {
    return undefined;
  }

  return candidate as PublicMapMarkerSnapshotRecord;
}
