import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ContentRevision, ContentRevisionStatus, ISODateTimeString } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

export interface StoredContentMetadata {
  excerpt?: string;
  showInBanner: boolean;
  bannerSortOrder?: number;
  customTags?: string[];
  coverColor?: string;
  coverImageUrl?: string;
  expiresAt?: ISODateTimeString;
}

export interface StoredContentRecord {
  contentId: string;
  revision: ContentRevision;
  metadata: StoredContentMetadata;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

interface ContentStoreSnapshot {
  version: 1;
  records: StoredContentRecord[];
}

const emptySnapshot: ContentStoreSnapshot = {
  version: 1,
  records: [],
};

export async function listContentRecords(): Promise<StoredContentRecord[]> {
  return (await readSnapshot()).records;
}

export async function listPublishedContentRecords(): Promise<StoredContentRecord[]> {
  const records = await listContentRecords();
  const now = Date.now();
  return records.filter((record) => {
    if (record.revision.status !== 'published') {
      return false;
    }

    const publishedAt = record.revision.publishedAt ?? record.updatedAt;
    const publishedTime = new Date(publishedAt).getTime();
    return Number.isNaN(publishedTime) || publishedTime <= now;
  });
}

export async function findContentRecord(
  contentId: string,
): Promise<StoredContentRecord | undefined> {
  const records = await listContentRecords();
  return records.find((record) => record.contentId === contentId);
}

export async function createContentRecord(input: {
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  metadata: StoredContentMetadata;
  actorId: string;
}): Promise<StoredContentRecord> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const contentId = `local_content_${randomUUID()}`;
  const revisionId = `local_revision_${randomUUID()}`;
  const record: StoredContentRecord = {
    contentId,
    revision: {
      id: revisionId,
      contentId,
      title: input.title,
      categoryId: input.categoryId,
      markdown: input.markdown,
      status: 'draft',
      assetIds: input.assetIds,
      submittedBy: input.actorId,
    },
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  await writeSnapshot({
    ...snapshot,
    records: [...snapshot.records, record],
  });
  return record;
}

export async function updateContentRecord(
  contentId: string,
  updater: (record: StoredContentRecord) => StoredContentRecord,
): Promise<StoredContentRecord | undefined> {
  const snapshot = await readSnapshot();
  const existing = snapshot.records.find((record) => record.contentId === contentId);
  if (!existing) {
    return undefined;
  }

  const updated = updater(existing);
  await writeSnapshot({
    ...snapshot,
    records: snapshot.records.map((record) => (record.contentId === contentId ? updated : record)),
  });
  return updated;
}

export function withRevisionStatus(
  record: StoredContentRecord,
  status: ContentRevisionStatus,
  patch: Partial<ContentRevision> = {},
): StoredContentRecord {
  return {
    ...record,
    revision: {
      ...record.revision,
      ...patch,
      status,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function readSnapshot(): Promise<ContentStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as ContentStoreSnapshot;
    return {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: ContentStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.contentStorePath)
    ? config.contentStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.contentStorePath);
}
