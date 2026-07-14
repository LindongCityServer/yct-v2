import type { TransitDataRevision, TransitModeSnapshotSummary } from '@yct/contracts';
import { listTransitDataRevisions } from './transit-data-store';

export interface PublishedTransitEntitySnapshot {
  lines: TransitDataRevision['lines'];
  stations: TransitDataRevision['stations'];
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
  const publishedAt = selectedLines
    .map(({ line, revision }) => line.publishedAt ?? revision.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    lines,
    stations,
    summary: buildPublishedTransitSummary(lines, stations),
    publishedAt,
    sourceRevisionIds,
  };
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
