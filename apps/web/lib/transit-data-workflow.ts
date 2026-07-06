import { randomUUID } from 'node:crypto';
import type {
  TransitDataRevision,
  TransitDataValidationIssue,
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
  const issues: TransitDataValidationIssue[] = [];

  if (snapshot.lines.length === 0) {
    issues.push(createTransitValidationIssue({
      count: 1,
      examples: [],
      kind: 'broken_line',
      message: '没有读取到任何线路。',
      severity: 'error',
    }));
  }

  if (snapshot.stations.length === 0) {
    issues.push(createTransitValidationIssue({
      count: 1,
      examples: [],
      kind: 'orphan_station',
      message: '没有读取到任何站点。',
      severity: 'error',
    }));
  }

  const stationById = new Map(snapshot.stations.map((station) => [station.sourceId, station]));
  const brokenLines = snapshot.lines
    .map((line) => ({
      line,
      missingStations: line.stationSourceIds.filter((stationSourceId) => !stationById.has(stationSourceId)),
    }))
    .filter((item) => item.missingStations.length > 0 || item.line.stationSourceIds.length < 2);
  if (brokenLines.length > 0) {
    issues.push(createTransitValidationIssue({
      count: brokenLines.length,
      examples: brokenLines
        .slice(0, 6)
        .map(({ line, missingStations }) =>
          missingStations.length > 0
            ? `${line.name} 缺少站点 ${missingStations.slice(0, 2).join('、')}`
            : `${line.name} 站点数量不足`,
        ),
      kind: 'broken_line',
      message: `有 ${brokenLines.length} 条线路存在断点或缺少站点引用。`,
      severity: 'error',
    }));
  }

  const missingWorldCoordinateStations = snapshot.stations.filter(
    (station) => station.x === undefined || station.z === undefined,
  );
  if (missingWorldCoordinateStations.length > 0) {
    issues.push(createTransitValidationIssue({
      count: missingWorldCoordinateStations.length,
      examples: missingWorldCoordinateStations
        .slice(0, 6)
        .map((station) => station.name),
      kind: 'missing_world_coordinate',
      message: `${missingWorldCoordinateStations.length} 个站点缺少 Minecraft 世界坐标，地图级路线规划前需要补齐。`,
      severity: 'warning',
    }));
  }

  const duplicateStationGroups = findDuplicateValueGroups(
    snapshot.stations.map((station) => ({
      key: normalizeTransitStationName(station.name),
      label: station.name,
    })),
  );
  if (duplicateStationGroups.length > 0) {
    issues.push(createTransitValidationIssue({
      count: duplicateStationGroups.length,
      examples: duplicateStationGroups
        .slice(0, 6)
        .map((group) => `${group.label}（${group.count} 个）`),
      kind: 'duplicate_station_name',
      message: `${duplicateStationGroups.length} 组站点名称重复，需要人工确认是否为同站多标、上下行拆分或误导入。`,
      severity: 'warning',
    }));
  }

  const referencedStationIds = new Set(
    snapshot.lines.flatMap((line) => line.stationSourceIds),
  );
  const orphanStations = snapshot.stations.filter(
    (station) => !referencedStationIds.has(station.sourceId),
  );
  if (orphanStations.length > 0) {
    issues.push(createTransitValidationIssue({
      count: orphanStations.length,
      examples: orphanStations.slice(0, 6).map((station) => station.name),
      kind: 'orphan_station',
      message: `${orphanStations.length} 个站点没有被任何线路引用，发布前需要确认是否漏导线路或存在废弃站点。`,
      severity: 'warning',
    }));
  }

  const oneWayStations = getOneWayStationExamples(snapshot.lines, stationById);
  if (oneWayStations.length > 0) {
    issues.push(createTransitValidationIssue({
      count: oneWayStations.length,
      examples: oneWayStations.slice(0, 6),
      kind: 'one_way_station',
      message: `${oneWayStations.length} 个站点在线路中以单向停靠形式出现，地图与路线规划需要注意方向差异。`,
      severity: 'warning',
    }));
  }

  const errors = issues
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message);
  const warnings = issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.message);

  return {
    checkedAt: new Date().toISOString(),
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    issues,
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

function createTransitValidationIssue(
  input: TransitDataValidationIssue,
): TransitDataValidationIssue {
  return {
    ...input,
    examples: input.examples.filter(Boolean),
  };
}

function findDuplicateValueGroups(values: Array<{ key: string; label: string }>): Array<{
  count: number;
  label: string;
}> {
  const counts = new Map<string, { count: number; label: string }>();
  for (const value of values) {
    if (!value.key) {
      continue;
    }
    const current = counts.get(value.key) ?? { count: 0, label: value.label };
    current.count += 1;
    counts.set(value.key, current);
  }

  return Array.from(counts.values())
    .filter((item) => item.count > 1)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

function normalizeTransitStationName(value: string): string {
  return value.replace(/\s+/g, '').trim().toLocaleLowerCase('zh-CN');
}

function getOneWayStationExamples(
  lines: TransitDataRevision['lines'],
  stationById: Map<string, TransitDataRevision['stations'][number]>,
): string[] {
  const examples = new Set<string>();
  for (const line of lines) {
    for (const stop of line.stops) {
      if (!stop.oneWay) {
        continue;
      }

      const station = stationById.get(stop.stationSourceId);
      examples.add(
        `${station?.name ?? stop.stationSourceId} · ${line.name} · ${
          stop.oneWay === 'down' ? '顺向单向' : '反向单向'
        }`,
      );
      if (examples.size >= 12) {
        return Array.from(examples);
      }
    }
  }

  return Array.from(examples);
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
