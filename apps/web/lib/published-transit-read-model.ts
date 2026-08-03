import type { TransitDataRevision, TransitModeSnapshotSummary } from '@yct/contracts';
import { listTransitDataRevisions } from './transit-data-store';

export interface PublishedTransitEntitySnapshot {
  lines: TransitDataRevision['lines'];
  stations: TransitDataRevision['stations'];
  stationDetails: NonNullable<TransitDataRevision['stationDetails']>;
  summary: TransitModeSnapshotSummary[];
  publishedAt?: string;
  sourceRevisionIds: string[];
}

export async function readPublishedTransitEntitySnapshot(): Promise<
  PublishedTransitEntitySnapshot | undefined
> {
  const revisions = await listTransitDataRevisions();
  const decidedLineIds = new Set<string>();
  const selectedLines: Array<{
    line: TransitDataRevision['lines'][number];
    revision: TransitDataRevision;
  }> = [];

  for (const revision of revisions) {
    for (const line of revision.lines) {
      if (decidedLineIds.has(line.sourceId)) {
        continue;
      }
      if (line.approvalStatus === 'archived') {
        decidedLineIds.add(line.sourceId);
        continue;
      }
      if (line.approvalStatus === 'published') {
        decidedLineIds.add(line.sourceId);
        selectedLines.push({ line, revision });
        continue;
      }
      if (!line.approvalStatus && revision.status === 'published') {
        decidedLineIds.add(line.sourceId);
        selectedLines.push({ line, revision });
      }
    }
  }

  if (selectedLines.length === 0) {
    return undefined;
  }

  const stationById = new Map<string, TransitDataRevision['stations'][number]>();
  for (const { line, revision } of selectedLines) {
    const revisionStationById = new Map(
      revision.stations.map((station) => [station.sourceId, station] as const),
    );
    for (const stationSourceId of line.stationSourceIds) {
      const station = revisionStationById.get(stationSourceId);
      if (station && !stationById.has(stationSourceId)) {
        stationById.set(stationSourceId, station);
      }
    }
  }

  const lines = selectedLines.map(({ line }) => line);
  const stations = Array.from(stationById.values());
  const sourceRevisionIds = Array.from(
    new Set(selectedLines.map(({ revision }) => revision.revisionId)),
  );
  const stationDetails = Array.from(
    new Map(
      selectedLines.flatMap(({ revision }) =>
        (revision.stationDetails ?? []).map((detail) => [detail.sourceId, detail] as const),
      ),
    ).values(),
  );
  const publishedAt = selectedLines
    .map(({ line, revision }) => line.publishedAt ?? revision.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    lines,
    stations,
    stationDetails,
    summary: buildPublishedTransitSummary(lines, stations),
    publishedAt,
    sourceRevisionIds,
  };
}

export function filterPublicOperatingTransitSnapshot(
  snapshot: PublishedTransitEntitySnapshot,
): PublishedTransitEntitySnapshot {
  const lines = snapshot.lines.filter(
    (line) => (line.operationStatus ?? 'operating') === 'operating',
  );
  const referencedStationIds = new Set(lines.flatMap((line) => line.stationSourceIds));
  const stations = snapshot.stations.filter((station) =>
    referencedStationIds.has(station.sourceId),
  );

  return {
    ...snapshot,
    lines,
    stations,
    summary: buildPublishedTransitSummary(lines, stations),
  };
}

export function filterMapVisibleTransitSnapshot(
  snapshot: PublishedTransitEntitySnapshot,
): PublishedTransitEntitySnapshot {
  const lines = snapshot.lines.filter(
    (line) => (line.operationStatus ?? 'operating') !== 'closed',
  );
  const referencedStationIds = new Set(lines.flatMap((line) => line.stationSourceIds));
  // 关闭站点仍需保留为线路几何锚点，是否公开由地图标记聚合层决定。
  const stations = snapshot.stations.filter((station) =>
    referencedStationIds.has(station.sourceId),
  );
  return {
    ...snapshot,
    lines,
    stations,
    summary: buildPublishedTransitSummary(lines, stations),
  };
}

export function getTransitStationMarkerOperationStatuses(
  snapshot: PublishedTransitEntitySnapshot,
): Map<string, 'operating' | 'planned' | 'closed'> {
  const statusByMarkerId = new Map<string, 'operating' | 'planned' | 'closed'>();
  for (const station of snapshot.stations) {
    const status = getTransitStationMapOperationStatus(snapshot, station.sourceId);
    for (const markerId of [
      station.boundPoiMarkerId,
      ...(station.boundPoiRefs ?? []).map((ref) => ref.markerId),
    ]) {
      if (!markerId) continue;
      const current = statusByMarkerId.get(markerId);
      if (!current || transitOperationStatusRank(status) > transitOperationStatusRank(current)) {
        statusByMarkerId.set(markerId, status);
      }
    }
  }
  return statusByMarkerId;
}

export function getTransitStationMapOperationStatus(
  snapshot: PublishedTransitEntitySnapshot,
  stationSourceId: string,
): 'operating' | 'planned' | 'closed' {
  const station = snapshot.stations.find((item) => item.sourceId === stationSourceId);
  const stationStatus = station?.operationStatus ?? 'operating';
  if (stationStatus === 'closed') {
    return 'closed';
  }

  const servingLineStatuses = snapshot.lines
    .filter((line) => line.stationSourceIds.includes(stationSourceId))
    .map((line) => line.operationStatus ?? 'operating')
    .filter((status) => status !== 'closed');
  if (servingLineStatuses.length === 0) {
    return 'closed';
  }
  if (stationStatus === 'planned') {
    return 'planned';
  }
  return servingLineStatuses.includes('operating') ? 'operating' : 'planned';
}

export function getNonPublicTransitStationMarkerIds(
  snapshot: PublishedTransitEntitySnapshot,
): Set<string> {
  const publicMarkerIds = new Set<string>();
  const nonPublicMarkerIds = new Set<string>();
  for (const station of snapshot.stations) {
    const target =
      (station.operationStatus ?? 'operating') === 'operating'
        ? publicMarkerIds
        : nonPublicMarkerIds;
    for (const markerId of [
      station.boundPoiMarkerId,
      ...(station.boundPoiRefs ?? []).map((ref) => ref.markerId),
    ]) {
      if (markerId) {
        target.add(markerId);
      }
    }
  }
  return new Set([...nonPublicMarkerIds].filter((markerId) => !publicMarkerIds.has(markerId)));
}

function transitOperationStatusRank(status: 'operating' | 'planned' | 'closed'): number {
  return status === 'operating' ? 3 : status === 'planned' ? 2 : 1;
}

function buildPublishedTransitSummary(
  lines: TransitDataRevision['lines'],
  stations: TransitDataRevision['stations'],
): TransitModeSnapshotSummary[] {
  const stationIds = new Set(stations.map((station) => station.sourceId));
  const byMode = new Map<
    TransitDataRevision['lines'][number]['mode'],
    { lineCount: number; stationIds: Set<string> }
  >();
  for (const line of lines) {
    const current = byMode.get(line.mode) ?? { lineCount: 0, stationIds: new Set<string>() };
    current.lineCount += 1;
    for (const stationSourceId of line.stationSourceIds) {
      if (stationIds.has(stationSourceId)) {
        current.stationIds.add(stationSourceId);
      }
    }
    byMode.set(line.mode, current);
  }

  return Array.from(byMode.entries()).map(([mode, value]) => ({
    mode,
    label: formatTransitModeLabel(mode),
    lineCount: value.lineCount,
    stationCount: value.stationIds.size,
  }));
}

function formatTransitModeLabel(mode: TransitDataRevision['lines'][number]['mode']): string {
  const labels: Record<TransitDataRevision['lines'][number]['mode'], string> = {
    metro: '地铁',
    tram: '有轨',
    bus: '公交',
    coach: '客运',
    ferry: '轮渡',
    railway: '地方铁路',
    custom: '线路',
  };
  return labels[mode];
}
