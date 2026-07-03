import { randomUUID } from 'node:crypto';
import type {
  TransitDataRevision,
  TransitModeSnapshotSummary,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { canPublishTransitDataRevision, transitionTransitDataRevisionStatus } from '@yct/domain';
import { publishDomainEvent } from './app-event-bus';
import { readLegacyTransitSnapshot } from './legacy-transit';
import {
  createTransitDataRevision,
  findTransitDataRevision,
  listTransitDataRevisions,
  publishTransitDataRevisionAtomically,
  updateTransitDataRevision,
  withTransitDataRevisionStatus,
} from './transit-data-store';

export interface TransitDataActionResult {
  ok: boolean;
  revision?: TransitDataRevision;
  status?: number;
  error?: string;
  message?: string;
}

export async function listAdminTransitDataRevisions(): Promise<TransitDataRevision[]> {
  return listTransitDataRevisions();
}

export async function importLegacyTransitDataRevision(input: {
  actorId: string;
  sourceProviderId: string;
}): Promise<TransitDataActionResult> {
  const result = await readLegacyTransitSnapshot();
  if (!result.snapshot) {
    return {
      ok: false,
      status: result.meta.sourceStatus === 'not_configured' ? 503 : 502,
      error: 'legacy_transit_unavailable',
      message: result.meta.message ?? '旧线路数据不可用。',
    };
  }

  const snapshot = {
    ...result.snapshot,
    sourceProviderId: input.sourceProviderId,
  };
  const revision = await createTransitDataRevision({
    snapshot,
    actorId: input.actorId,
    validation: validateTransitSnapshot(snapshot),
  });

  await emitEvent('TransitDataRevisionImported', input.actorId, {
    datasetId: revision.datasetId,
    revisionId: revision.revisionId,
    sourceProviderId: revision.sourceProviderId,
    sourceFiles: revision.sourceFiles,
    summary: revision.summary,
  });

  return { ok: true, revision };
}

export async function submitTransitDataRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (revision.validation.errorCount > 0) {
    return invalidTransition('交通数据仍存在校验错误，不能提交审核。');
  }

  const transition = transitionTransitDataRevisionStatus(revision.status, 'pending_review');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateTransitDataRevision(input.revisionId, (current) =>
    withTransitDataRevisionStatus(current, 'pending_review', {
      submittedBy: input.actorId,
      submittedAt: now,
    }),
  );

  if (updated) {
    const counts = countTransitItems(updated.summary);
    await emitEvent('TransitDataRevisionSubmitted', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      dataKind: 'transit_dataset',
      sourceProviderId: updated.sourceProviderId,
      summary: counts,
    });
  }

  return { ok: true, revision: updated };
}

export async function reviewTransitDataRevision(input: {
  revisionId: string;
  actorId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const nextStatus = input.decision === 'approved' ? 'approved' : 'rejected';
  const transition = transitionTransitDataRevisionStatus(revision.status, nextStatus);
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const now = new Date().toISOString();
  const updated = await updateTransitDataRevision(input.revisionId, (current) =>
    withTransitDataRevisionStatus(current, nextStatus, {
      reviewedBy: input.actorId,
      reviewedAt: now,
      reviewReason: input.reason,
    }),
  );

  if (updated) {
    await emitEvent('TransitDataRevisionReviewed', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      decision: input.decision,
      reviewerId: input.actorId,
      reason: input.reason,
    });
  }

  return { ok: true, revision: updated };
}

export async function publishTransitDataRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const publishCheck = canPublishTransitDataRevision({
    revisionStatus: revision.status,
    validationErrorCount: revision.validation.errorCount,
  });
  if (!publishCheck.ok) {
    return invalidTransition(publishCheck.reason);
  }

  const transition = transitionTransitDataRevisionStatus(revision.status, 'published');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await publishTransitDataRevisionAtomically(input.revisionId, (current) =>
    withTransitDataRevisionStatus(current, 'published', {
      publishedAt,
    }),
  );

  if (updated) {
    await emitEvent('TransitDataRevisionPublished', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      publishedAt,
    });
  }

  return { ok: true, revision: updated };
}

function validateTransitSnapshot(snapshot: {
  summary: TransitModeSnapshotSummary[];
  lines: TransitDataRevision['lines'];
  stations: TransitDataRevision['stations'];
}): TransitDataRevision['validation'] {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (snapshot.lines.length === 0) {
    errors.push('没有读取到任何线路。');
  }

  if (snapshot.stations.length === 0) {
    errors.push('没有读取到任何站点。');
  }

  const stationIds = new Set(snapshot.stations.map((station) => station.sourceId));
  const brokenLines = snapshot.lines.filter((line) =>
    line.stationSourceIds.some((stationSourceId) => !stationIds.has(stationSourceId)),
  );
  if (brokenLines.length > 0) {
    errors.push(`有 ${brokenLines.length} 条线路引用了不存在的站点。`);
  }

  const missingWorldCoordinateCount = snapshot.stations.filter(
    (station) => station.x === undefined || station.z === undefined,
  ).length;
  if (missingWorldCoordinateCount > 0) {
    warnings.push(
      `${missingWorldCoordinateCount} 个站点缺少 Minecraft 世界坐标，地图级路线规划前需要补齐。`,
    );
  }

  const duplicateLineNames = countDuplicates(
    snapshot.lines.map((line) => `${line.mode}:${line.name}`),
  );
  if (duplicateLineNames > 0) {
    warnings.push(
      `${duplicateLineNames} 个线路名称在同一交通方式下重复，需要人工确认是否为上下行或重名线路。`,
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
  };
}

function countTransitItems(summary: TransitModeSnapshotSummary[]): {
  lineCount: number;
  stationCount: number;
} {
  return summary.reduce(
    (total, item) => ({
      lineCount: total.lineCount + item.lineCount,
      stationCount: total.stationCount + item.stationCount,
    }),
    { lineCount: 0, stationCount: 0 },
  );
}

function countDuplicates(values: string[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return duplicates.size;
}

function notFound(): TransitDataActionResult {
  return {
    ok: false,
    status: 404,
    error: 'transit_revision_not_found',
    message: '交通数据版本不存在。',
  };
}

function invalidTransition(reason?: string): TransitDataActionResult {
  return {
    ok: false,
    status: 409,
    error: 'invalid_transit_revision_state',
    message: reason ?? '当前交通数据版本状态不允许执行该操作。',
  };
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
