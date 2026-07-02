import type {
  ApiMeta,
  TransitModeProfile,
  TransitLineSnapshot,
  TransitModeSnapshotSummary,
  TransitStationSnapshot,
} from '@yct/contracts';
import {
  parseLegacyCoachRouteSource,
  parseLegacyTransitSource,
  type LegacyTransitMode,
} from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyDataSourceFile,
  readLegacyPublicFile,
} from './legacy-data-source';
import { readRuntimeConfig } from './runtime-config';

export interface TransitLineSummary {
  id: string;
  mode: LegacyTransitMode;
  name: string;
  color?: string;
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  bookingUrl?: string;
  stationCount: number;
  stopMetadataCount: number;
  stationNames: string[];
  stationStops: TransitLineStopSummary[];
  firstStationName?: string;
  lastStationName?: string;
  sourcePath?: string;
}

export interface TransitLineStopSummary {
  stationName: string;
  sequence: number;
  oneWay?: 'up' | 'down';
  status?: string;
  travelTime?: number;
}

export interface TransitModeSummary {
  mode: LegacyTransitMode;
  label: string;
  lineCount: number;
  stationCount: number;
}

export interface TransitOverview {
  meta: ApiMeta;
  summary: TransitModeSummary[];
  lines: TransitLineSummary[];
  modeProfiles?: TransitModeProfile[];
}

export interface LegacyTransitSnapshot {
  sourceProviderId: string;
  sourcePath: string;
  sourceFiles: string[];
  summary: TransitModeSnapshotSummary[];
  lines: TransitLineSnapshot[];
  stations: TransitStationSnapshot[];
}

interface LegacyTransitSource {
  kind: 'js';
  mode: LegacyTransitMode;
  label: string;
  fileName: string;
  exportExpression: string;
  sourcePrefix: string;
}

interface LegacyCoachRouteSource {
  kind: 'coach_route';
  mode: 'coach';
  label: string;
  fileName: string;
  sourcePrefix: string;
}

type LegacyTransitSourceConfig = LegacyTransitSource | LegacyCoachRouteSource;

const legacyTransitSources: LegacyTransitSourceConfig[] = [
  {
    kind: 'js',
    mode: 'metro',
    label: '地铁',
    fileName: 'metro_data.js',
    exportExpression: 'lines',
    sourcePrefix: 'metro',
  },
  {
    kind: 'js',
    mode: 'tram',
    label: '有轨电车',
    fileName: 'tram_data.js',
    exportExpression: 'tramLines',
    sourcePrefix: 'tram',
  },
  {
    kind: 'js',
    mode: 'bus',
    label: '公交',
    fileName: 'bus_data.js',
    exportExpression: '__legacy_default__',
    sourcePrefix: 'bus',
  },
  {
    kind: 'js',
    mode: 'railway',
    label: '地方铁路',
    fileName: 'local_railway_data.js',
    exportExpression: 'localRailways',
    sourcePrefix: 'local-railway',
  },
  {
    kind: 'coach_route',
    mode: 'coach',
    label: '客运',
    fileName: 'ltcx/route.txt',
    sourcePrefix: 'coach',
  },
];

export async function readLegacyTransitSnapshot(): Promise<{
  meta: ApiMeta;
  snapshot?: LegacyTransitSnapshot;
}> {
  const config = readRuntimeConfig();

  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧线路数据目录尚未配置。'),
    };
  }

  const summary: TransitModeSnapshotSummary[] = [];
  const lines: TransitLineSnapshot[] = [];
  const stationMap = new Map<string, TransitStationSnapshot>();
  const sourceFiles: string[] = [];

  for (const source of legacyTransitSources) {
    let parsed: ReturnType<typeof parseLegacyTransitSource>;
    let sourcePath = '';

    try {
      const legacyFile =
        source.kind === 'coach_route'
          ? await readLegacyPublicFile(config, source.fileName)
          : await readLegacyDataSourceFile(config, source.fileName);
      sourcePath = legacyFile.sourcePath;
      sourceFiles.push(sourcePath);
      parsed =
        source.kind === 'coach_route'
          ? parseLegacyCoachRouteSource({
              source: legacyFile.source,
              sourcePath,
              sourcePrefix: source.sourcePrefix,
            })
          : parseLegacyTransitSource({
              source: legacyFile.source,
              sourcePath,
              mode: source.mode,
              exportExpression: source.exportExpression,
              sourcePrefix: source.sourcePrefix,
            });
    } catch (error) {
      if (error instanceof LegacyDataSourceNotConfiguredError) {
        return {
          meta: createApiMeta('not_configured', error.message),
        };
      }

      continue;
    }

    for (const station of parsed.stations) {
      const existing = stationMap.get(station.sourceId);
      stationMap.set(station.sourceId, {
        sourceId: station.sourceId,
        name: existing?.name ?? station.name,
        aliases: mergeAliases(existing?.aliases ?? [], station.aliases),
        diagramX: existing?.diagramX ?? station.diagramX,
        diagramY: existing?.diagramY ?? station.diagramY,
        x: existing?.x ?? station.x,
        z: existing?.z ?? station.z,
        sourcePath: existing?.sourcePath ?? station.sourcePath,
      });
    }

    summary.push({
      mode: source.mode,
      label: source.label,
      lineCount: parsed.lines.length,
      stationCount: parsed.stations.length,
    });

    for (const line of parsed.lines) {
      lines.push({
        sourceId: line.sourceId,
        mode: line.mode,
        name: line.name,
        stationSourceIds: line.stationSourceIds,
        stops: line.stops ?? [],
        color: line.color,
        operator: line.operator,
        fare: line.fare,
        firstLastBus: line.firstLastBus,
        departureTimes: line.departureTimes,
        bookingUrl: line.bookingUrl,
        sourcePath: line.sourcePath,
      });
    }
  }

  if (lines.length === 0) {
    return {
      meta: createApiMeta('unavailable', '未能从旧线路数据目录读取可用线路。'),
    };
  }

  return {
    meta: createApiMeta('ready'),
    snapshot: {
      sourceProviderId: 'legacy-yct',
      sourcePath:
        config.legacyDataSource === 'local' && config.legacyDataDir
          ? config.legacyDataDir
          : config.legacyDataRemoteBaseUrl,
      sourceFiles,
      summary,
      lines,
      stations: Array.from(stationMap.values()),
    },
  };
}

export async function readLegacyTransitOverview(): Promise<TransitOverview> {
  const result = await readLegacyTransitSnapshot();

  if (!result.snapshot) {
    return {
      meta: result.meta,
      summary: [],
      lines: [],
    };
  }

  return buildTransitOverview(result.snapshot, result.meta);
}

export function buildTransitOverview(
  snapshot: Pick<LegacyTransitSnapshot, 'summary' | 'lines' | 'stations'>,
  meta: ApiMeta,
): TransitOverview {
  const stationById = new Map(snapshot.stations.map((station) => [station.sourceId, station]));
  const lines = snapshot.lines.map((line) => {
    const firstStation = stationById.get(line.stationSourceIds[0] ?? '');
    const lastStation = stationById.get(
      line.stationSourceIds[line.stationSourceIds.length - 1] ?? '',
    );
    const stationNames = line.stationSourceIds
      .map((stationSourceId) => stationById.get(stationSourceId)?.name)
      .filter((stationName): stationName is string => Boolean(stationName));
    const stationStops = buildTransitLineStopSummaries(line, stationById);

    return {
      id: line.sourceId,
      mode: line.mode,
      name: line.name,
      color: line.color,
      operator: line.operator,
      fare: line.fare,
      firstLastBus: line.firstLastBus,
      departureTimes: line.departureTimes,
      bookingUrl: line.bookingUrl,
      stationCount: line.stationSourceIds.length,
      stopMetadataCount: countStopMetadata(line.stops),
      stationNames,
      stationStops,
      firstStationName: firstStation?.name,
      lastStationName: lastStation?.name,
      sourcePath: line.sourcePath,
    };
  });

  return {
    meta,
    summary: snapshot.summary,
    lines,
  };
}

function buildTransitLineStopSummaries(
  line: TransitLineSnapshot,
  stationById: Map<string, TransitStationSnapshot>,
): TransitLineStopSummary[] {
  const stops: TransitLineSnapshot['stops'] =
    line.stops.length > 0
      ? line.stops
      : line.stationSourceIds.map((stationSourceId, sequence) => ({
          stationSourceId,
          sequence,
        }));

  return stops
    .map((stop): TransitLineStopSummary | undefined => {
      const stationName = stationById.get(stop.stationSourceId)?.name;
      if (!stationName) {
        return undefined;
      }

      return {
        stationName,
        sequence: stop.sequence,
        oneWay: stop.oneWay,
        status: stop.status,
        travelTime: stop.travelTime,
      };
    })
    .filter((stop): stop is TransitLineStopSummary => Boolean(stop))
    .sort((left, right) => left.sequence - right.sequence);
}

function mergeAliases(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].filter(Boolean)));
}

function countStopMetadata(lineStops: TransitLineSnapshot['stops']): number {
  return (
    lineStops?.filter(
      (stop) =>
        stop.oneWay ||
        stop.status ||
        stop.travelTime !== undefined ||
        stop.platformSide ||
        stop.fareZone ||
        stop.labelOffset ||
        stop.trainPosition !== undefined,
    ).length ?? 0
  );
}
