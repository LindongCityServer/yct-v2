import { randomUUID } from 'node:crypto';
import type {
  ContentPublishMode,
  ContentRevisionStatus,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { canPublishContentRevision, transitionContentRevisionStatus } from '@yct/domain';
import { publishDomainEvent } from './app-event-bus';
import {
  findContentAssetRecordsByIds,
  findContentAssetRecordsByPublicPaths,
} from './content-asset-store';
import {
  createContentRecord,
  findContentRecord,
  listContentRecords,
  type StoredContentMetadata,
  type StoredContentRecord,
  updateContentRecord,
  withRevisionStatus,
} from './content-store';

export interface ContentActionResult {
  ok: boolean;
  record?: StoredContentRecord;
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminContentRecords(): Promise<StoredContentRecord[]> {
  return listContentRecords();
}

export async function createContentDraft(input: {
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  metadata: StoredContentMetadata;
  actorId: string;
}): Promise<ContentActionResult> {
  const markdownAssetRecords = await findContentAssetRecordsByPublicPaths(
    extractContentAssetPaths(input.markdown),
  );
  const assetIds = mergeAssetIds([
    ...input.assetIds,
    ...markdownAssetRecords.map((record) => record.asset.id),
  ]);
  const record = await createContentRecord({
    ...input,
    assetIds,
  });
  return { ok: true, record };
}

export async function submitContentRevision(input: {
  contentId: string;
  actorId: string;
}): Promise<ContentActionResult> {
  const record = await findContentRecord(input.contentId);
  if (!record) {
    return notFound();
  }

  const transition = transitionContentRevisionStatus(record.revision.status, 'pending_review');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateContentRecord(input.contentId, (current) =>
    withRevisionStatus(current, 'pending_review', {
      submittedBy: input.actorId,
      submittedAt: now,
    }),
  );

  if (updated) {
    await emitEvent('ContentSubmitted', input.actorId, {
      contentId: updated.contentId,
      revisionId: updated.revision.id,
      title: updated.revision.title,
      categoryId: updated.revision.categoryId,
    });
  }

  return { ok: true, record: updated };
}

export async function reviewContentRevision(input: {
  contentId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<ContentActionResult> {
  const record = await findContentRecord(input.contentId);
  if (!record) {
    return notFound();
  }

  const nextStatus: ContentRevisionStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionContentRevisionStatus(record.revision.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateContentRecord(input.contentId, (current) =>
    withRevisionStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent('ContentReviewed', input.actorId, {
      contentId: updated.contentId,
      revisionId: updated.revision.id,
      decision: input.decision,
      reviewerId: input.actorId,
      reason: input.reason,
    });
  }

  return { ok: true, record: updated };
}

export async function publishContentRevision(input: {
  contentId: string;
  actorId: string;
  mode: ContentPublishMode;
  scheduledAt?: string;
}): Promise<ContentActionResult> {
  const record = await findContentRecord(input.contentId);
  if (!record) {
    return notFound();
  }

  const assetRecords = await findContentAssetRecordsByIds(record.revision.assetIds);
  const foundAssetIds = new Set(assetRecords.map((assetRecord) => assetRecord.asset.id));
  const missingAssetIds = record.revision.assetIds.filter((assetId) => !foundAssetIds.has(assetId));
  if (missingAssetIds.length > 0) {
    return invalidTransition(`内容引用了不存在的素材：${missingAssetIds.join('、')}`);
  }

  const publishCheck = canPublishContentRevision({
    revisionStatus: record.revision.status,
    assetStatuses: assetRecords.map((assetRecord) => assetRecord.asset.status),
    publishMode: input.mode,
    scheduledAt: input.scheduledAt,
  });

  if (!publishCheck.ok) {
    return invalidTransition(publishCheck.reason);
  }

  const now = new Date().toISOString();
  const publishedAt = input.mode === 'scheduled' ? (input.scheduledAt ?? now) : now;
  const updated = await updateContentRecord(input.contentId, (current) =>
    withRevisionStatus(current, 'published', {
      scheduledAt: input.mode === 'scheduled' ? input.scheduledAt : undefined,
      publishedAt,
    }),
  );

  if (updated) {
    await emitEvent('ContentPublished', input.actorId, {
      contentId: updated.contentId,
      revisionId: updated.revision.id,
      publishedAt,
    });
  }

  return { ok: true, record: updated };
}

function notFound(): ContentActionResult {
  return {
    ok: false,
    status: 404,
    error: 'content_not_found',
    message: '内容记录不存在。',
  };
}

function invalidTransition(reason?: string): ContentActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_content_state',
    message: reason ?? '当前内容状态不允许执行该操作。',
  };
}

function extractContentAssetPaths(markdown: string): string[] {
  const paths: string[] = [];
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(markdown)) !== null) {
    const source = match[1]?.trim();
    if (source) {
      paths.push(source);
    }
  }

  return paths;
}

function mergeAssetIds(assetIds: string[]): string[] {
  return Array.from(new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean)));
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await publishDomainEvent({
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    actor: {
      type: 'admin',
      id: actorId,
    },
    payload,
  });
}
