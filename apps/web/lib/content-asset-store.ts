import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ContentAsset,
  ContentAssetStatus,
  ISODateTimeString,
  LegacyContentAssetReference,
} from '@yct/contracts';
import { appBasePath } from './app-paths';
import { readRuntimeConfig } from './runtime-config';

export interface StoredContentAssetRecord {
  asset: ContentAsset;
  sourceKind: 'legacy' | 'upload' | 'external';
  migratedPath?: string;
  sha256?: string;
  references: LegacyContentAssetReference[];
  duplicateGroupId?: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

interface ContentAssetStoreSnapshot {
  version: 1;
  records: StoredContentAssetRecord[];
}

const emptySnapshot: ContentAssetStoreSnapshot = {
  version: 1,
  records: [],
};

export async function listContentAssetRecords(): Promise<StoredContentAssetRecord[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.records].sort(compareContentAssetRecords);
}

export async function findContentAssetRecord(
  assetId: string,
): Promise<StoredContentAssetRecord | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.records.find((record) => record.asset.id === assetId);
}

export async function findContentAssetRecordsByIds(
  assetIds: string[],
): Promise<StoredContentAssetRecord[]> {
  if (assetIds.length === 0) {
    return [];
  }

  const requestedIds = new Set(assetIds);
  const snapshot = await readSnapshot();
  return snapshot.records.filter((record) => requestedIds.has(record.asset.id));
}

export async function findContentAssetRecordsByPublicPaths(
  paths: string[],
): Promise<StoredContentAssetRecord[]> {
  if (paths.length === 0) {
    return [];
  }

  const requestedPaths = new Set(paths.map(normalizeContentAssetPublicPath).filter(Boolean));
  const snapshot = await readSnapshot();
  return snapshot.records.filter((record) =>
    requestedPaths.has(normalizeContentAssetPublicPath(record.asset.url)),
  );
}

export async function writeContentAssetRecords(records: StoredContentAssetRecord[]): Promise<void> {
  await writeSnapshot({
    version: 1,
    records,
  });
}

export async function updateContentAssetRecord(
  assetId: string,
  updater: (record: StoredContentAssetRecord) => StoredContentAssetRecord,
): Promise<StoredContentAssetRecord | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.records.find((record) => record.asset.id === assetId);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  await writeSnapshot({
    ...snapshot,
    records: snapshot.records.map((record) => (record.asset.id === assetId ? updated : record)),
  });
  return updated;
}

export function withContentAssetStatus(
  record: StoredContentAssetRecord,
  status: ContentAssetStatus,
  patch: Partial<ContentAsset> = {},
): StoredContentAssetRecord {
  return {
    ...record,
    asset: {
      ...record.asset,
      ...patch,
      status,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function readSnapshot(): Promise<ContentAssetStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as ContentAssetStoreSnapshot;
    return {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: ContentAssetStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.contentAssetStorePath)
    ? config.contentAssetStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.contentAssetStorePath);
}

function compareContentAssetRecords(
  left: StoredContentAssetRecord,
  right: StoredContentAssetRecord,
): number {
  const leftPending = left.asset.status === 'pending_review' ? 0 : 1;
  const rightPending = right.asset.status === 'pending_review' ? 0 : 1;
  if (leftPending !== rightPending) {
    return leftPending - rightPending;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function normalizeContentAssetPublicPath(value: string): string {
  const pathname = safePathname(value);
  const basePrefix = appBasePath ? `${appBasePath}/content-assets/` : '';
  if (basePrefix && pathname.startsWith(basePrefix)) {
    return pathname.slice(appBasePath.length);
  }

  return pathname.startsWith('/content-assets/') ? pathname : '';
}

function safePathname(value: string): string {
  try {
    return new URL(value, 'https://yct.local').pathname;
  } catch {
    return value;
  }
}
