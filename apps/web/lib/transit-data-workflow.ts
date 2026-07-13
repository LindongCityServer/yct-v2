import { randomUUID } from 'node:crypto';
import { UnminedCustomMarkerProvider } from '@yct/adapters';
import type {
  MapMarkerSnapshot,
  TransitDataRevision,
  TransitDataRevisionStatus,
  TransitDataValidationIssue,
  TransitModeSnapshotSummary,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import {
  canPublishTransitDataRevision,
  canRestoreTransitDataRevision,
  transitionTransitDataRevisionStatus,
} from '@yct/domain';
import { publishDomainEvent } from './app-event-bus';
import { readLegacyTransitSnapshot, type LegacyTransitSnapshot } from './legacy-transit';
import { clearTransitLinePoiMarkerCache } from './map-transit-line-markers';
import { clearTransitOverviewCache } from './transit-data';
import {
  createTransitDataRevision,
  findTransitDataRevision,
  listTransitDataRevisions,
  publishTransitDataRevisionAtomically,
  updateTransitDataRevision,
  withTransitDataRevisionStatus,
} from './transit-data-store';
import { readRuntimeConfig } from './runtime-config';

export interface TransitDataActionResult {
  ok: boolean;
  revision?: TransitDataRevision;
  status?: number;
  error?: string;
  message?: string;
}

export type TransitLineEditableField =
  | 'mode'
  | 'name'
  | 'color'
  | 'stationSourceIds'
  | 'stops'
  | 'segmentPaths'
  | 'operator'
  | 'fare'
  | 'firstLastBus'
  | 'departureTimes'
  | 'bookingUrl';

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

  const snapshot = await bindTransitSnapshotStationsToExistingMarkers({
    ...result.snapshot,
    sourceProviderId: input.sourceProviderId,
  });
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

async function bindTransitSnapshotStationsToExistingMarkers(
  snapshot: LegacyTransitSnapshot,
): Promise<LegacyTransitSnapshot> {
  const markers = await readExistingTransitBindingMarkers();
  if (markers.length === 0) {
    return snapshot;
  }

  const markerIndex = buildTransitBindingMarkerIndex(markers);
  const modesByStationId = new Map<string, Set<TransitDataRevision['lines'][number]['mode']>>();
  for (const line of snapshot.lines) {
    for (const stationSourceId of line.stationSourceIds) {
      const modes = modesByStationId.get(stationSourceId) ?? new Set();
      modes.add(line.mode);
      modesByStationId.set(stationSourceId, modes);
    }
  }

  return {
    ...snapshot,
    stations: snapshot.stations.map((station) => {
      const marker = findBestTransitBindingMarker(
        [station.name, ...station.aliases],
        Array.from(modesByStationId.get(station.sourceId) ?? []),
        markerIndex,
      );
      if (!marker || marker.geometry.type !== 'Point') {
        return station;
      }

      return {
        ...station,
        x: marker.geometry.coordinates[0],
        z: marker.geometry.coordinates[1],
        boundPoiMarkerId: marker.id,
        boundPoiLabel: marker.label,
      };
    }),
  };
}

async function readExistingTransitBindingMarkers(): Promise<MapMarkerSnapshot['markers']> {
  const config = readRuntimeConfig();
  if (!config.unminedMapBaseUrl) {
    return [];
  }

  try {
    const provider = new UnminedCustomMarkerProvider({
      id: 'unmined-custom-markers',
      name: 'uNmINeD 静态标记',
      baseUrl: config.unminedMapBaseUrl,
      fetchTimeoutMs: config.markerBdslmTimeoutMs,
    });
    const snapshot = await provider.fetchMarkers('default');
    return snapshot.markers;
  } catch {
    return [];
  }
}

function buildTransitBindingMarkerIndex(
  markers: MapMarkerSnapshot['markers'],
): Map<string, MapMarkerSnapshot['markers']> {
  const index = new Map<string, MapMarkerSnapshot['markers']>();
  for (const marker of markers) {
    if (marker.geometry.type !== 'Point') {
      continue;
    }

    const key = normalizeTransitBindingLabel(marker.label);
    if (!key) {
      continue;
    }

    const group = index.get(key) ?? [];
    group.push(marker);
    index.set(key, group);
  }

  return index;
}

function findBestTransitBindingMarker(
  stationNames: string[],
  modes: Array<TransitDataRevision['lines'][number]['mode']>,
  markerIndex: Map<string, MapMarkerSnapshot['markers']>,
): MapMarkerSnapshot['markers'][number] | null {
  const candidates = stationNames.flatMap(
    (stationName) => markerIndex.get(normalizeTransitBindingLabel(stationName)) ?? [],
  );
  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates
      .map((marker) => ({
        marker,
        score: getTransitBindingMarkerScore(marker, modes),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.marker.id.localeCompare(right.marker.id, 'zh-CN'),
      )[0]?.marker ?? null
  );
}

function getTransitBindingMarkerScore(
  marker: MapMarkerSnapshot['markers'][number],
  modes: Array<TransitDataRevision['lines'][number]['mode']>,
): number {
  const categoryId = marker.categoryId?.toLowerCase() ?? '';
  const iconBaseName = getTransitBindingMarkerIconBaseName(marker.iconFileName);
  const source = `${categoryId} ${iconBaseName}`;
  const modeSet = new Set(modes);

  if (modeSet.has('metro') && source.includes('metro')) {
    return 100;
  }
  if (modeSet.has('tram') && (source.includes('tram') || source.includes('rail'))) {
    return 96;
  }
  if (modeSet.has('bus') && (source.includes('bus') || source.includes('stop'))) {
    return 92;
  }
  if (modeSet.has('coach') && (source.includes('coach') || source.includes('bus'))) {
    return 90;
  }
  if (modeSet.has('railway') && (source.includes('railway') || source.includes('station'))) {
    return 90;
  }
  if (source.includes('station') || source.includes('stop')) {
    return 60;
  }
  if (categoryId === 'road' || iconBaseName === 'road' || iconBaseName === 'roadpoint') {
    return 0;
  }

  return 20;
}

function normalizeTransitBindingLabel(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜]+/g, '')
    .trim()
    .toLocaleLowerCase('zh-CN');
}

function getTransitBindingMarkerIconBaseName(fileName: string | undefined): string {
  return (
    fileName
      ?.trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? ''
  );
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
    clearTransitOverviewCache();
    clearTransitLinePoiMarkerCache();
    await emitEvent('TransitDataRevisionPublished', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      publishedAt,
    });
  }

  return { ok: true, revision: updated };
}

export async function restoreTransitDataRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const restoreCheck = canRestoreTransitDataRevision({
    revisionStatus: revision.status,
    validationErrorCount: revision.validation.errorCount,
  });
  if (!restoreCheck.ok) {
    return invalidTransition(restoreCheck.reason);
  }

  const publishedAt = new Date().toISOString();
  const updated = await publishTransitDataRevisionAtomically(input.revisionId, (current) =>
    withTransitDataRevisionStatus(current, 'published', { publishedAt }),
  );

  if (updated) {
    clearTransitOverviewCache();
    clearTransitLinePoiMarkerCache();
    await emitEvent('TransitDataRevisionPublished', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      publishedAt,
      restoredFromStatus: 'superseded',
    });
  }

  return { ok: true, revision: updated };
}

export async function archiveTransitDataRevision(input: {
  revisionId: string;
  actorId: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (revision.status === 'published') {
    return invalidTransition('当前发布中的交通数据版本不能直接归档，请先恢复或发布另一个版本。');
  }

  const transition = transitionTransitDataRevisionStatus(revision.status, 'archived');
  if (!transition.ok) {
    return invalidTransition(transition.reason);
  }

  const archivedAt = new Date().toISOString();
  const previousStatus = revision.status;
  const updated = await updateTransitDataRevision(input.revisionId, (current) =>
    withTransitDataRevisionStatus(current, 'archived'),
  );

  if (updated) {
    await emitEvent('TransitDataRevisionArchived', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      archivedBy: input.actorId,
      archivedAt,
      previousStatus: previousStatus as Exclude<TransitDataRevisionStatus, 'archived'>,
    });
  }

  return { ok: true, revision: updated };
}

export async function updateTransitStationCoordinate(input: {
  revisionId: string;
  stationSourceId: string;
  actorId: string;
  x: number;
  z: number;
  boundPoiMarkerId?: string;
  boundPoiLabel?: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTransitRevisionStationCoordinate(revision.status)) {
    return invalidTransition(
      '当前交通数据版本状态不允许修正站点坐标，请在已导入、校验失败、待审核或已驳回状态下操作。',
    );
  }

  const station = revision.stations.find((item) => item.sourceId === input.stationSourceId);
  if (!station) {
    return {
      ok: false,
      status: 404,
      error: 'transit_station_not_found',
      message: '交通数据版本中不存在该站点。',
    };
  }

  const nextBoundPoiMarkerId = input.boundPoiMarkerId?.trim() || undefined;
  const nextBoundPoiLabel = nextBoundPoiMarkerId
    ? input.boundPoiLabel?.trim() || undefined
    : undefined;

  if (
    station.x === input.x &&
    station.z === input.z &&
    station.boundPoiMarkerId === nextBoundPoiMarkerId &&
    station.boundPoiLabel === nextBoundPoiLabel
  ) {
    return { ok: true, revision };
  }

  const previousCoordinate = { x: station.x, z: station.z };
  const previousBoundPoi = {
    markerId: station.boundPoiMarkerId,
    label: station.boundPoiLabel,
  };
  const nextStations = revision.stations.map((item) =>
    item.sourceId === input.stationSourceId
      ? {
          ...item,
          x: input.x,
          z: input.z,
          boundPoiMarkerId: nextBoundPoiMarkerId,
          boundPoiLabel: nextBoundPoiLabel,
        }
      : item,
  );
  const validation = validateTransitSnapshot({
    summary: revision.summary,
    lines: revision.lines,
    stations: nextStations,
  });
  const nextStatus = getTransitRevisionEditableStatus(revision.status, validation.errorCount);
  const updatedAt = new Date().toISOString();
  const shouldResetReviewTrail =
    revision.status === 'pending_review' || revision.status === 'approved';
  const updated = await updateTransitDataRevision(input.revisionId, (current) => ({
    ...current,
    stations: nextStations,
    status: nextStatus,
    validation,
    submittedAt: shouldResetReviewTrail ? undefined : current.submittedAt,
    submittedBy: shouldResetReviewTrail ? undefined : current.submittedBy,
    reviewedAt: shouldResetReviewTrail ? undefined : current.reviewedAt,
    reviewedBy: shouldResetReviewTrail ? undefined : current.reviewedBy,
    reviewReason: shouldResetReviewTrail ? undefined : current.reviewReason,
  }));

  if (updated) {
    await emitEvent('TransitDataRevisionStationUpdated', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      stationSourceId: station.sourceId,
      stationName: station.name,
      updatedBy: input.actorId,
      updatedAt,
      previousCoordinate,
      previousBoundPoi,
      nextCoordinate: {
        x: input.x,
        z: input.z,
      },
      nextBoundPoi: nextBoundPoiMarkerId
        ? {
            markerId: nextBoundPoiMarkerId,
            label: nextBoundPoiLabel,
          }
        : undefined,
    });
  }

  return { ok: true, revision: updated };
}

export async function saveTransitLine(input: {
  revisionId: string;
  actorId: string;
  lineSourceId?: string;
  patch: {
    mode: TransitDataRevision['lines'][number]['mode'];
    name: string;
    color?: string;
    stationSourceIds: string[];
    oneWayStops?: Array<{
      stationSourceId: string;
      oneWay?: 'up' | 'down' | null;
    }>;
    segmentPaths?: TransitDataRevision['lines'][number]['segmentPaths'];
    operator?: string;
    fare?: string;
    firstBus?: string;
    lastBus?: string;
    departureTimes?: string[];
    bookingUrl?: string;
  };
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTransitRevisionLine(revision.status)) {
    return invalidTransition('当前交通数据版本状态不允许编辑线路。');
  }

  const nextStationSourceIds = input.patch.stationSourceIds
    .map((stationSourceId) => stationSourceId.trim())
    .filter(Boolean);
  if (nextStationSourceIds.length < 2) {
    return invalidTransition('线路至少需要 2 个站点。');
  }

  const stationById = new Map(revision.stations.map((station) => [station.sourceId, station]));
  const missingStationIds = nextStationSourceIds.filter(
    (stationSourceId) => !stationById.has(stationSourceId),
  );
  if (missingStationIds.length > 0) {
    return invalidTransition(`线路引用了不存在的站点：${missingStationIds.slice(0, 6).join('、')}`);
  }

  const line = input.lineSourceId
    ? revision.lines.find((item) => item.sourceId === input.lineSourceId)
    : undefined;
  if (input.lineSourceId && !line) {
    return {
      ok: false,
      status: 404,
      error: 'transit_line_not_found',
      message: '交通数据版本中不存在该线路。',
    };
  }

  const nextLine = buildTransitLineSnapshot(line, input.patch, nextStationSourceIds);
  const changedFields = line ? getChangedTransitLineFields(line, nextLine) : [];
  if (line && changedFields.length === 0) {
    return { ok: true, revision };
  }

  const nextLines = line
    ? revision.lines.map((item) => (item.sourceId === line.sourceId ? nextLine : item))
    : [...revision.lines, nextLine];
  const publishedValidationError = getPublishedTransitRevisionMutationError(revision, nextLines);
  if (publishedValidationError) {
    return invalidTransition(publishedValidationError);
  }

  const updatedAt = new Date().toISOString();
  const updated = await updateTransitDataRevision(input.revisionId, (current) =>
    applyTransitLineMutation(current, nextLines),
  );

  if (updated) {
    if (updated.status === 'published') {
      clearTransitOverviewCache();
      clearTransitLinePoiMarkerCache();
    }
    if (line) {
      await emitEvent('TransitDataRevisionLineUpdated', input.actorId, {
        datasetId: updated.datasetId,
        revisionId: updated.revisionId,
        lineSourceId: line.sourceId,
        lineName: nextLine.name,
        updatedBy: input.actorId,
        updatedAt,
        changedFields,
        stationCountBefore: line.stationSourceIds.length,
        stationCountAfter: nextLine.stationSourceIds.length,
      });
    } else {
      await emitEvent('TransitDataRevisionLineCreated', input.actorId, {
        datasetId: updated.datasetId,
        revisionId: updated.revisionId,
        lineSourceId: nextLine.sourceId,
        lineName: nextLine.name,
        mode: nextLine.mode,
        stationCount: nextLine.stationSourceIds.length,
        createdBy: input.actorId,
        createdAt: updatedAt,
      });
    }
  }

  return { ok: true, revision: updated };
}

export async function deleteTransitLine(input: {
  revisionId: string;
  actorId: string;
  lineSourceId: string;
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  if (!canEditTransitRevisionLine(revision.status)) {
    return invalidTransition('当前交通数据版本状态不允许删除线路。');
  }

  const line = revision.lines.find((item) => item.sourceId === input.lineSourceId);
  if (!line) {
    return {
      ok: false,
      status: 404,
      error: 'transit_line_not_found',
      message: '交通数据版本中不存在该线路。',
    };
  }

  const deletedAt = new Date().toISOString();
  const nextLines = revision.lines.filter((item) => item.sourceId !== input.lineSourceId);
  const publishedValidationError = getPublishedTransitRevisionMutationError(revision, nextLines);
  if (publishedValidationError) {
    return invalidTransition(publishedValidationError);
  }
  const updated = await updateTransitDataRevision(input.revisionId, (current) =>
    applyTransitLineMutation(current, nextLines),
  );

  if (updated) {
    if (updated.status === 'published') {
      clearTransitOverviewCache();
      clearTransitLinePoiMarkerCache();
    }
    await emitEvent('TransitDataRevisionLineDeleted', input.actorId, {
      datasetId: updated.datasetId,
      revisionId: updated.revisionId,
      lineSourceId: line.sourceId,
      lineName: line.name,
      deletedBy: input.actorId,
      deletedAt,
      stationCount: line.stationSourceIds.length,
    });
  }

  return { ok: true, revision: updated };
}

export async function updateTransitLineStationOrder(input: {
  revisionId: string;
  lineSourceId: string;
  actorId: string;
  stationSourceIds: string[];
}): Promise<TransitDataActionResult> {
  const revision = await findTransitDataRevision(input.revisionId);
  if (!revision) {
    return notFound();
  }

  const line = revision.lines.find((item) => item.sourceId === input.lineSourceId);
  if (!line) {
    return {
      ok: false,
      status: 404,
      error: 'transit_line_not_found',
      message: '交通数据版本中不存在该线路。',
    };
  }

  return saveTransitLine({
    revisionId: input.revisionId,
    actorId: input.actorId,
    lineSourceId: input.lineSourceId,
    patch: {
      mode: line.mode,
      name: line.name,
      color: line.color,
      stationSourceIds: input.stationSourceIds,
      oneWayStops: line.stops.map((stop) => ({
        stationSourceId: stop.stationSourceId,
        oneWay: stop.oneWay,
      })),
      segmentPaths: line.segmentPaths,
      operator: line.operator,
      fare: line.fare,
      firstBus: line.firstLastBus?.first,
      lastBus: line.firstLastBus?.last,
      departureTimes: line.departureTimes,
      bookingUrl: line.bookingUrl,
    },
  });
}

function buildTransitLineSnapshot(
  previous: TransitDataRevision['lines'][number] | undefined,
  patch: {
    mode: TransitDataRevision['lines'][number]['mode'];
    name: string;
    color?: string;
    stationSourceIds: string[];
    oneWayStops?: Array<{
      stationSourceId: string;
      oneWay?: 'up' | 'down' | null;
    }>;
    segmentPaths?: TransitDataRevision['lines'][number]['segmentPaths'];
    operator?: string;
    fare?: string;
    firstBus?: string;
    lastBus?: string;
    departureTimes?: string[];
    bookingUrl?: string;
  },
  stationSourceIds: string[],
): TransitDataRevision['lines'][number] {
  const previousStopByStationId = new Map(
    (previous?.stops ?? []).map((stop) => [stop.stationSourceId, stop]),
  );
  const oneWayByStationId = new Map(
    (patch.oneWayStops ?? [])
      .map((stop) => [stop.stationSourceId.trim(), stop.oneWay ?? undefined] as const)
      .filter(([stationSourceId]) => Boolean(stationSourceId)),
  );
  const departureTimes = Array.from(
    new Set((patch.departureTimes ?? []).map((item) => item.trim()).filter(Boolean)),
  );
  const segmentPaths = normalizeTransitLineSegmentPaths(patch.segmentPaths, stationSourceIds);

  return {
    sourceId: previous?.sourceId ?? `manual_line_${randomUUID()}`,
    mode: patch.mode,
    name: patch.name.trim(),
    color: patch.color?.trim() || undefined,
    stationSourceIds,
    stops: stationSourceIds.map((stationSourceId, index) => ({
      ...previousStopByStationId.get(stationSourceId),
      stationSourceId,
      sequence: index + 1,
      oneWay: oneWayByStationId.has(stationSourceId)
        ? oneWayByStationId.get(stationSourceId)
        : previousStopByStationId.get(stationSourceId)?.oneWay,
    })),
    segmentPaths: segmentPaths.length > 0 ? segmentPaths : undefined,
    operator: patch.operator?.trim() || undefined,
    fare: patch.fare?.trim() || undefined,
    firstLastBus:
      patch.firstBus?.trim() || patch.lastBus?.trim()
        ? {
            first: patch.firstBus?.trim() || undefined,
            last: patch.lastBus?.trim() || undefined,
          }
        : undefined,
    departureTimes: departureTimes.length > 0 ? departureTimes : undefined,
    bookingUrl: patch.bookingUrl?.trim() || undefined,
    sourcePath: previous?.sourcePath,
  };
}

function getChangedTransitLineFields(
  previous: TransitDataRevision['lines'][number],
  next: TransitDataRevision['lines'][number],
): TransitLineEditableField[] {
  const fields: TransitLineEditableField[] = [
    'mode',
    'name',
    'color',
    'stationSourceIds',
    'stops',
    'segmentPaths',
    'operator',
    'fare',
    'firstLastBus',
    'departureTimes',
    'bookingUrl',
  ];

  return fields.filter((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    return JSON.stringify(previousValue ?? null) !== JSON.stringify(nextValue ?? null);
  });
}

function normalizeTransitLineSegmentPaths(
  segmentPaths: TransitDataRevision['lines'][number]['segmentPaths'] | undefined,
  stationSourceIds: string[],
): NonNullable<TransitDataRevision['lines'][number]['segmentPaths']> {
  if (!segmentPaths?.length) {
    return [];
  }

  const adjacentSegmentKeys = new Set(
    stationSourceIds
      .slice(0, -1)
      .map((stationSourceId, index) =>
        getTransitLineSegmentKey(stationSourceId, stationSourceIds[index + 1] ?? ''),
      ),
  );
  const normalized: NonNullable<TransitDataRevision['lines'][number]['segmentPaths']> = [];
  const seen = new Set<string>();

  for (const path of segmentPaths) {
    const fromStationSourceId = path.fromStationSourceId.trim();
    const toStationSourceId = path.toStationSourceId.trim();
    const key = getTransitLineSegmentKey(fromStationSourceId, toStationSourceId);
    if (!adjacentSegmentKeys.has(key) || seen.has(key)) {
      continue;
    }

    const waypoints = path.waypoints
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z))
      .map((point) => ({
        x: point.x,
        z: point.z,
      }));
    if (path.mode === 'road' && waypoints.length === 0) {
      continue;
    }

    normalized.push({
      fromStationSourceId,
      toStationSourceId,
      mode: path.mode,
      waypoints,
      note: path.note?.trim() || undefined,
    });
    seen.add(key);
  }

  return normalized;
}

function getTransitLineSegmentKey(fromStationSourceId: string, toStationSourceId: string): string {
  return `${fromStationSourceId}\u0000${toStationSourceId}`;
}

function applyTransitLineMutation(
  revision: TransitDataRevision,
  lines: TransitDataRevision['lines'],
): TransitDataRevision {
  const summary = buildTransitModeSummary(revision.summary, lines, revision.stations);
  const validation = validateTransitSnapshot({
    summary,
    lines,
    stations: revision.stations,
  });
  const nextStatus = getTransitRevisionEditableStatus(revision.status, validation.errorCount);
  const shouldResetReviewTrail =
    revision.status === 'pending_review' || revision.status === 'approved';

  return {
    ...revision,
    lines,
    summary,
    validation,
    status: nextStatus,
    submittedAt: shouldResetReviewTrail ? undefined : revision.submittedAt,
    submittedBy: shouldResetReviewTrail ? undefined : revision.submittedBy,
    reviewedAt: shouldResetReviewTrail ? undefined : revision.reviewedAt,
    reviewedBy: shouldResetReviewTrail ? undefined : revision.reviewedBy,
    reviewReason: shouldResetReviewTrail ? undefined : revision.reviewReason,
  };
}

function buildTransitModeSummary(
  previousSummary: TransitModeSnapshotSummary[],
  lines: TransitDataRevision['lines'],
  stations: TransitDataRevision['stations'],
): TransitModeSnapshotSummary[] {
  const labelByMode = new Map(previousSummary.map((item) => [item.mode, item.label]));
  const stationById = new Map(stations.map((station) => [station.sourceId, station]));
  const modes = Array.from(new Set(lines.map((line) => line.mode)));

  return modes.map((mode) => {
    const modeLines = lines.filter((line) => line.mode === mode);
    const stationIds = new Set(
      modeLines.flatMap((line) =>
        line.stationSourceIds.filter((stationSourceId) => stationById.has(stationSourceId)),
      ),
    );
    return {
      mode,
      label: labelByMode.get(mode) ?? defaultTransitModeLabel(mode),
      lineCount: modeLines.length,
      stationCount: stationIds.size,
    };
  });
}

function getTransitRevisionEditableStatus(
  status: TransitDataRevisionStatus,
  errorCount: number,
): TransitDataRevisionStatus {
  if (
    status === 'imported' ||
    status === 'validation_failed' ||
    status === 'pending_review' ||
    status === 'approved'
  ) {
    return errorCount > 0 ? 'validation_failed' : 'imported';
  }

  return status;
}

function defaultTransitModeLabel(mode: TransitDataRevision['lines'][number]['mode']): string {
  const labels: Record<TransitDataRevision['lines'][number]['mode'], string> = {
    metro: '地铁',
    tram: '有轨电车',
    bus: '公交',
    coach: '客运',
    ferry: '轮渡',
    railway: '铁路',
    custom: '自定义',
  };

  return labels[mode] ?? mode;
}

function validateTransitSnapshot(snapshot: {
  summary: TransitModeSnapshotSummary[];
  lines: TransitDataRevision['lines'];
  stations: TransitDataRevision['stations'];
}): TransitDataRevision['validation'] {
  const issues: TransitDataValidationIssue[] = [];

  if (snapshot.lines.length === 0) {
    issues.push(
      createTransitValidationIssue({
        count: 1,
        examples: [],
        kind: 'broken_line',
        message: '没有读取到任何线路。',
        severity: 'error',
      }),
    );
  }

  if (snapshot.stations.length === 0) {
    issues.push(
      createTransitValidationIssue({
        count: 1,
        examples: [],
        kind: 'orphan_station',
        message: '没有读取到任何站点。',
        severity: 'error',
      }),
    );
  }

  const stationById = new Map(snapshot.stations.map((station) => [station.sourceId, station]));
  const brokenLines = snapshot.lines
    .map((line) => ({
      line,
      missingStations: line.stationSourceIds.filter(
        (stationSourceId) => !stationById.has(stationSourceId),
      ),
    }))
    .filter((item) => item.missingStations.length > 0 || item.line.stationSourceIds.length < 2);
  if (brokenLines.length > 0) {
    issues.push(
      createTransitValidationIssue({
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
      }),
    );
  }

  const missingWorldCoordinateStations = snapshot.stations.filter(
    (station) => station.x === undefined || station.z === undefined,
  );
  if (missingWorldCoordinateStations.length > 0) {
    issues.push(
      createTransitValidationIssue({
        count: missingWorldCoordinateStations.length,
        examples: missingWorldCoordinateStations.slice(0, 6).map((station) => station.name),
        kind: 'missing_world_coordinate',
        message: `${missingWorldCoordinateStations.length} 个站点缺少 Minecraft 世界坐标，地图级路线规划前需要补齐。`,
        severity: 'warning',
      }),
    );
  }

  const duplicateStationGroups = findDuplicateValueGroups(
    snapshot.stations.map((station) => ({
      key: normalizeTransitStationName(station.name),
      label: station.name,
    })),
  );
  if (duplicateStationGroups.length > 0) {
    issues.push(
      createTransitValidationIssue({
        count: duplicateStationGroups.length,
        examples: duplicateStationGroups
          .slice(0, 6)
          .map((group) => `${group.label}（${group.count} 个）`),
        kind: 'duplicate_station_name',
        message: `${duplicateStationGroups.length} 组站点名称重复，需要人工确认是否为同站多标、上下行拆分或误导入。`,
        severity: 'warning',
      }),
    );
  }

  const referencedStationIds = new Set(snapshot.lines.flatMap((line) => line.stationSourceIds));
  const orphanStations = snapshot.stations.filter(
    (station) => !referencedStationIds.has(station.sourceId),
  );
  if (orphanStations.length > 0) {
    issues.push(
      createTransitValidationIssue({
        count: orphanStations.length,
        examples: orphanStations.slice(0, 6).map((station) => station.name),
        kind: 'orphan_station',
        message: `${orphanStations.length} 个站点没有被任何线路引用，发布前需要确认是否漏导线路或存在废弃站点。`,
        severity: 'warning',
      }),
    );
  }

  const oneWayStations = getOneWayStationExamples(snapshot.lines, stationById);
  if (oneWayStations.length > 0) {
    issues.push(
      createTransitValidationIssue({
        count: oneWayStations.length,
        examples: oneWayStations.slice(0, 6),
        kind: 'one_way_station',
        message: `${oneWayStations.length} 个站点在线路中以单向停靠形式出现，地图与路线规划需要注意方向差异。`,
        severity: 'warning',
      }),
    );
  }

  const errors = issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
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

function canEditTransitRevisionStationCoordinate(status: TransitDataRevisionStatus): boolean {
  return (
    status === 'imported' ||
    status === 'validation_failed' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'rejected'
  );
}

function canEditTransitRevisionLine(status: TransitDataRevisionStatus): boolean {
  return canEditTransitRevisionStationCoordinate(status) || status === 'published';
}

function getPublishedTransitRevisionMutationError(
  revision: TransitDataRevision,
  nextLines: TransitDataRevision['lines'],
): string | null {
  if (revision.status !== 'published') {
    return null;
  }

  const candidate = applyTransitLineMutation(revision, nextLines);
  if (candidate.validation.errorCount === 0) {
    return null;
  }

  return '当前发布中的交通数据版本不能保存会产生校验错误的线路改动。';
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
    .sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'),
    );
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
