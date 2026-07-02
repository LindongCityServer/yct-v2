import { randomUUID } from 'node:crypto';
import type {
  ContentAsset,
  ContentAssetKind,
  ContentAssetStatus,
  YctEvent,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { transitionContentAssetStatus } from '@yct/domain';
import { InMemoryEventBus } from '@yct/event-bus';
import {
  findContentAssetRecord,
  listContentAssetRecords,
  updateContentAssetRecord,
  withContentAssetStatus,
  writeContentAssetRecords,
  type StoredContentAssetRecord,
} from './content-asset-store';
import { storeUploadedContentAssetFile } from './content-asset-file-store';
import { readLegacyContentAssetInventory } from './legacy-content-asset-inventory';

const contentAssetEventBus = new InMemoryEventBus();

const uploadedMimeTypeByExtension: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export interface ContentAssetActionResult {
  ok: boolean;
  record?: StoredContentAssetRecord;
  records?: StoredContentAssetRecord[];
  status?: number;
  error?: string;
  message?: string;
  summary?: {
    total: number;
    created: number;
    refreshed: number;
    pendingReview: number;
  };
  reused?: boolean;
}

export async function listAdminContentAssetRecords(): Promise<StoredContentAssetRecord[]> {
  return listContentAssetRecords();
}

export async function importLegacyContentAssets(input: {
  actorId: string;
}): Promise<ContentAssetActionResult> {
  const inventoryResponse = await readLegacyContentAssetInventory();
  if (!inventoryResponse.item) {
    return {
      ok: false,
      status: inventoryResponse.meta.sourceStatus === 'not_configured' ? 404 : 502,
      error: 'legacy_content_asset_inventory_unavailable',
      message: inventoryResponse.meta.message ?? '旧内容素材清单不可用。',
    };
  }

  const existingRecords = await listContentAssetRecords();
  const existingById = new Map(existingRecords.map((record) => [record.asset.id, record]));
  const now = new Date().toISOString();
  let created = 0;
  let refreshed = 0;
  const importedRecords: StoredContentAssetRecord[] = [];
  const emittedAssets: ContentAsset[] = [];

  for (const item of inventoryResponse.item.items) {
    const existing = existingById.get(item.asset.id);
    if (existing) {
      refreshed += 1;
      importedRecords.push({
        ...existing,
        asset: refreshAssetSnapshot(existing.asset, item.asset),
        sourceKind: 'legacy',
        migratedPath: item.migratedPath,
        sha256: item.sha256,
        references: item.references,
        duplicateGroupId: item.duplicateGroupId,
        updatedAt: now,
      });
      continue;
    }

    created += 1;
    importedRecords.push({
      asset: item.asset,
      sourceKind: 'legacy',
      migratedPath: item.migratedPath,
      sha256: item.sha256,
      references: item.references,
      duplicateGroupId: item.duplicateGroupId,
      createdAt: now,
      updatedAt: now,
    });
    emittedAssets.push(item.asset);
  }

  const importedIds = new Set(importedRecords.map((record) => record.asset.id));
  const nextRecords = [
    ...existingRecords.filter((record) => !importedIds.has(record.asset.id)),
    ...importedRecords,
  ];
  await writeContentAssetRecords(nextRecords);

  for (const asset of emittedAssets) {
    const record = importedRecords.find((item) => item.asset.id === asset.id);
    await emitEvent('ContentAssetImported', input.actorId, {
      assetId: asset.id,
      fileName: asset.fileName,
      url: asset.url,
      sourceUrl: asset.sourceUrl,
      sha256: record?.sha256,
      referenceCount: record?.references.length ?? 0,
    });
  }

  return {
    ok: true,
    records: importedRecords,
    summary: {
      total: inventoryResponse.item.items.length,
      created,
      refreshed,
      pendingReview: nextRecords.filter((record) => record.asset.status === 'pending_review')
        .length,
    },
  };
}

export async function uploadContentAsset(input: {
  actorId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ContentAssetActionResult> {
  const validation = validateUploadedAsset(input);
  if (!validation.ok) {
    return validation;
  }

  const mimeType = normalizeUploadedMimeType(input.fileName, input.mimeType);
  const storedFile = await storeUploadedContentAssetFile({
    ...input,
    mimeType,
  });
  const existing = (await listContentAssetRecords()).find(
    (record) => record.sha256 === storedFile.sha256,
  );
  if (existing) {
    return {
      ok: true,
      record: existing,
      reused: true,
    };
  }

  const now = new Date().toISOString();
  const asset: ContentAsset = {
    id: `content_asset_${storedFile.sha256.slice(0, 24)}`,
    kind: inferUploadedAssetKind(mimeType),
    fileName: input.fileName,
    mimeType,
    sizeBytes: storedFile.sizeBytes,
    url: storedFile.publicPath,
    status: 'pending_review',
    uploadedBy: input.actorId,
    uploadedAt: now,
  };
  const records = await listContentAssetRecords();
  const record: StoredContentAssetRecord = {
    asset,
    sourceKind: 'upload',
    migratedPath: storedFile.publicPath,
    sha256: storedFile.sha256,
    references: [],
    createdAt: now,
    updatedAt: now,
  };

  await writeContentAssetRecords([...records, record]);
  await emitEvent('ContentAssetUploaded', input.actorId, {
    assetId: asset.id,
    fileName: asset.fileName,
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    sha256: storedFile.sha256,
  });

  return {
    ok: true,
    record,
  };
}

export async function reviewContentAsset(input: {
  assetId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<ContentAssetActionResult> {
  const record = await findContentAssetRecord(input.assetId);
  if (!record) {
    return notFound();
  }

  const nextStatus: ContentAssetStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionContentAssetStatus(record.asset.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateContentAssetRecord(input.assetId, (current) =>
    withContentAssetStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent('ContentAssetReviewed', input.actorId, {
      assetId: updated.asset.id,
      decision: input.decision,
      reviewerId: input.actorId,
      reason: input.reason,
    });
  }

  return { ok: true, record: updated };
}

function validateUploadedAsset(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): ContentAssetActionResult {
  const mimeType = normalizeUploadedMimeType(input.fileName, input.mimeType);
  if (!input.fileName.trim()) {
    return invalidUpload('文件名不能为空。');
  }

  if (input.fileName.trim().length > 200) {
    return invalidUpload('文件名不能超过 200 个字符。');
  }

  if (!mimeType) {
    return invalidUpload('无法识别上传文件类型。');
  }

  if (!isAllowedUploadedMimeType(mimeType)) {
    return invalidUpload('当前只允许上传常见图片、PDF、TXT 或 Markdown 附件。');
  }

  if (input.bytes.byteLength === 0) {
    return invalidUpload('上传文件不能为空。');
  }

  if (input.bytes.byteLength > 20 * 1024 * 1024) {
    return invalidUpload('上传文件不能超过 20MB。');
  }

  return { ok: true };
}

function isAllowedUploadedMimeType(mimeType: string): boolean {
  return [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/avif',
    'application/pdf',
    'text/plain',
    'text/markdown',
  ].includes(mimeType);
}

function inferUploadedAssetKind(mimeType: string): ContentAssetKind {
  return mimeType.startsWith('image/') ? 'image' : 'attachment';
}

function normalizeUploadedMimeType(fileName: string, mimeType: string): string {
  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed) {
    return trimmed;
  }

  const extensionStart = fileName.lastIndexOf('.');
  const extension = extensionStart >= 0 ? fileName.slice(extensionStart).toLowerCase() : '';
  return uploadedMimeTypeByExtension[extension] ?? '';
}

function refreshAssetSnapshot(existing: ContentAsset, incoming: ContentAsset): ContentAsset {
  return {
    ...incoming,
    status: existing.status,
    uploadedBy: existing.uploadedBy,
    uploadedAt: existing.uploadedAt,
    reviewedBy: existing.reviewedBy,
    reviewedAt: existing.reviewedAt,
    reviewReason: existing.reviewReason,
  };
}

function invalidUpload(message: string): ContentAssetActionResult {
  return {
    ok: false,
    status: 400,
    error: 'invalid_content_asset_upload',
    message,
  };
}

function notFound(): ContentAssetActionResult {
  return {
    ok: false,
    status: 404,
    error: 'content_asset_not_found',
    message: '内容素材不存在。',
  };
}

function invalidTransition(reason?: string): ContentAssetActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_content_asset_state',
    message: reason ?? '当前素材状态不允许执行该操作。',
  };
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  const event: YctEvent<TType> = {
    eventId: `event_${randomUUID()}`,
    type,
    occurredAt: new Date().toISOString(),
    profileId: 'default',
    actor: {
      type: 'admin',
      id: actorId,
    },
    payload,
  } as YctEvent<TType>;

  await contentAssetEventBus.emit(event);
}
