import { randomUUID } from 'node:crypto';
import type {
  ContentAsset,
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
import { readLegacyContentAssetInventory } from './legacy-content-asset-inventory';

const contentAssetEventBus = new InMemoryEventBus();

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
