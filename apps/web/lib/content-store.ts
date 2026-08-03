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
  relatedPoiMarkerIds?: string[];
}

export interface StoredContentPublishSnapshot {
  snapshotId: string;
  revisionId: string;
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  metadata: StoredContentMetadata;
  publishedAt: ISODateTimeString;
  publishedBy: string;
}

export interface StoredContentRecord {
  contentId: string;
  revision: ContentRevision;
  metadata: StoredContentMetadata;
  publishHistory?: StoredContentPublishSnapshot[];
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

interface ContentStoreSnapshot {
  version: 1;
  records: StoredContentRecord[];
}

export interface CreateContentRecordInput {
  contentId?: string;
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  metadata: StoredContentMetadata;
  actorId: string;
}

export interface CreateMissingContentRecordsResult {
  createdRecords: StoredContentRecord[];
  skippedContentIds: string[];
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

export async function createContentRecord(
  input: CreateContentRecordInput,
): Promise<StoredContentRecord> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const record = buildContentRecord(input, now);

  await writeSnapshot({
    ...snapshot,
    records: [...snapshot.records, record],
  });
  return record;
}

export async function createMissingContentRecords(
  inputs: Array<CreateContentRecordInput & { contentId: string }>,
): Promise<CreateMissingContentRecordsResult> {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const knownContentIds = new Set(snapshot.records.map((record) => record.contentId));
  const createdRecords: StoredContentRecord[] = [];
  const skippedContentIds: string[] = [];

  for (const input of inputs) {
    const contentId = input.contentId.trim();
    if (!contentId) {
      throw new Error('批量创建内容时 contentId 不能为空。');
    }

    if (knownContentIds.has(contentId)) {
      skippedContentIds.push(contentId);
      continue;
    }

    const record = buildContentRecord({ ...input, contentId }, now);
    createdRecords.push(record);
    knownContentIds.add(contentId);
  }

  if (createdRecords.length > 0) {
    await writeSnapshot({
      ...snapshot,
      records: [...snapshot.records, ...createdRecords],
    });
  }

  return {
    createdRecords,
    skippedContentIds,
  };
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

function buildContentRecord(
  input: CreateContentRecordInput,
  now: ISODateTimeString,
): StoredContentRecord {
  const contentId = input.contentId?.trim() || `local_content_${randomUUID()}`;
  return {
    contentId,
    revision: {
      id: `local_revision_${randomUUID()}`,
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
}
