import type {
  ApiMeta,
  LocalizedLabelMap,
  TransitModeProfile,
  TransitLineRouteMode,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
  TransitLineSnapshot,
  TransitModeSnapshotSummary,
  TransitStationSnapshot,
} from '@yct/contracts';
import {
  normalizeLegacyCoachStationName,
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
import { readRuntimeConfig, type RuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

export interface TransitLineSummary {
  id: string;
  mode: LegacyTransitMode;
  name: string;
  localizedName?: LocalizedLabelMap;
  color?: string;
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  bookingUrl?: string;
  routeMode?: TransitLineRouteMode;
  routeNodes?: TransitLineRouteNodeSnapshot[];
  segmentPaths?: TransitLineSegmentPathSnapshot[];
  stationCount: number;
  stopMetadataCount: number;
  stationNames: string[];
  stationStops: TransitLineStopSummary[];
  firstStationName?: string;
  lastStationName?: string;
  sourcePath?: string;
}

export interface TransitLineStopSummary {
  stationSourceId?: string;
  stationName: string;
  localizedStationName?: LocalizedLabelMap;
  stationMarkerIds?: string[];
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
type LegacyTransitSnapshotResult = {
  meta: ApiMeta;
  snapshot?: LegacyTransitSnapshot;
};

type ParsedLegacyTransitSourceResult =
  | {
      source: LegacyTransitSourceConfig;
      sourcePath: string;
      parsed: ReturnType<typeof parseLegacyTransitSource>;
    }
  | {
      source: LegacyTransitSourceConfig;
      error: unknown;
    };

const legacyTransitSnapshotCache = createTimedCache<LegacyTransitSnapshotResult>(5 * 60 * 1000);

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
  return legacyTransitSnapshotCache.read(createLegacyTransitCacheKey(config), () =>
    readLegacyTransitSnapshotUncached(config),
  );
}

async function readLegacyTransitSnapshotUncached(
  config: RuntimeConfig,
): Promise<LegacyTransitSnapshotResult> {
  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧线路数据目录尚未配置。'),
    };
  }

  const summary: TransitModeSnapshotSummary[] = [];
  const lines: TransitLineSnapshot[] = [];
  const stationMap = new Map<string, TransitStationSnapshot>();
  const sourceFiles: string[] = [];
  const parsedSources = await Promise.all(
    legacyTransitSources.map((source) => readAndParseLegacyTransitSource(config, source)),
  );

  for (const result of parsedSources) {
    if ('error' in result) {
      if (result.error instanceof LegacyDataSourceNotConfiguredError) {
        return {
          meta: createApiMeta('not_configured', result.error.message),
        };
      }

      continue;
    }

    sourceFiles.push(result.sourcePath);

    for (const station of result.parsed.stations) {
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
      mode: result.source.mode,
      label: result.source.label,
      lineCount: result.parsed.lines.length,
      stationCount: result.parsed.stations.length,
    });

    for (const line of result.parsed.lines) {
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

async function readAndParseLegacyTransitSource(
  config: RuntimeConfig,
  source: LegacyTransitSourceConfig,
): Promise<ParsedLegacyTransitSourceResult> {
  try {
    const legacyFile =
      source.kind === 'coach_route'
        ? await readLegacyPublicFile(config, source.fileName)
        : await readLegacyDataSourceFile(config, source.fileName);
    const sourcePath = legacyFile.sourcePath;
    const parsed =
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

    return {
      source,
      sourcePath,
      parsed,
    };
  } catch (error) {
    return {
      source,
      error,
    };
  }
}

function createLegacyTransitCacheKey(config: RuntimeConfig): string {
  return [
    config.legacyDataSource,
    config.legacyDataDir ?? '',
    config.legacyDataRemoteBaseUrl,
    config.legacyPublicBaseUrl,
    config.legacyDataFetchTimeoutMs,
  ].join('|');
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
      .map((stationSourceId) =>
        normalizeTransitStationName(line.mode, stationById.get(stationSourceId)?.name),
      )
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
      routeMode: line.routeMode,
      routeNodes: line.routeNodes,
      segmentPaths: line.segmentPaths,
      stationCount: line.stationSourceIds.length,
      stopMetadataCount: countStopMetadata(line.stops),
      stationNames,
      stationStops,
      firstStationName: normalizeTransitStationName(line.mode, firstStation?.name),
      lastStationName: normalizeTransitStationName(line.mode, lastStation?.name),
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
      const stationName = normalizeTransitStationName(
        line.mode,
        stationById.get(stop.stationSourceId)?.name,
      );
      if (!stationName) {
        return undefined;
      }

      return {
        stationSourceId: stop.stationSourceId,
        stationName,
        stationMarkerIds: getTransitStationMarkerIds(stationById.get(stop.stationSourceId)),
        sequence: stop.sequence,
        oneWay: stop.oneWay,
        status: stop.status,
        travelTime: stop.travelTime,
      };
    })
    .filter((stop): stop is TransitLineStopSummary => Boolean(stop))
    .sort((left, right) => left.sequence - right.sequence);
}

function getTransitStationMarkerIds(station: TransitStationSnapshot | undefined): string[] {
  if (!station) {
    return [];
  }

  return Array.from(
    new Set(
      [station.boundPoiMarkerId, ...(station.boundPoiRefs ?? []).map((ref) => ref.markerId)].filter(
        (markerId): markerId is string => Boolean(markerId?.trim()),
      ),
    ),
  );
}

function normalizeTransitStationName(
  mode: LegacyTransitMode,
  stationName: string | undefined,
): string | undefined {
  if (!stationName) {
    return undefined;
  }

  return mode === 'coach' ? normalizeLegacyCoachStationName(stationName) : stationName;
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
