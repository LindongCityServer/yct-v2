import type { ApiItemResponse, TransitScreenSnapshot } from '@yct/contracts';
import {
  parseLegacyCoachRuntimeSegmentSource,
  parseLegacyCoachScreenGateSource,
  parseLegacyCoachScreenStationSource,
  parseLegacyCoachScreenTripSource,
} from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyPublicFile,
} from './legacy-data-source';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

const transitScreenSnapshotCache = createTimedCache<ApiItemResponse<TransitScreenSnapshot>>(
  30 * 1000,
);

export async function readTransitScreenSnapshot(): Promise<ApiItemResponse<TransitScreenSnapshot>> {
  const config = readRuntimeConfig();
  const cacheKey = [
    config.legacyDataSource,
    config.legacyDataDir ?? '',
    config.legacyDataRemoteBaseUrl,
    config.legacyPublicBaseUrl,
    config.legacyDataFetchTimeoutMs,
  ].join('|');

  return transitScreenSnapshotCache.read(cacheKey, () => readTransitScreenSnapshotUncached(config));
}

async function readTransitScreenSnapshotUncached(
  config: ReturnType<typeof readRuntimeConfig>,
): Promise<ApiItemResponse<TransitScreenSnapshot>> {
  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧客运大屏数据源尚未配置。'),
    };
  }

  try {
    const [routeFile, stationFile, gateFile, runtimeFile, noticeFile] = await Promise.all([
      readLegacyPublicFile(config, 'ltcx/route.txt'),
      readLegacyPublicFile(config, 'ltcx/screen/station.txt'),
      readLegacyPublicFile(config, 'ltcx/screen/tickets.txt'),
      readLegacyPublicFile(config, 'ltcx/screen/rttime.txt'),
      readLegacyPublicFile(config, 'ltcx/screen/notice.txt'),
    ]);

    const item: TransitScreenSnapshot = {
      stations: parseLegacyCoachScreenStationSource({
        source: stationFile.source,
        sourcePath: stationFile.sourcePath,
      }),
      trips: parseLegacyCoachScreenTripSource({
        source: routeFile.source,
        sourcePath: routeFile.sourcePath,
        sourcePrefix: 'coach-screen-trip',
      }),
      gates: parseLegacyCoachScreenGateSource({
        source: gateFile.source,
        sourcePath: gateFile.sourcePath,
        sourcePrefix: 'coach-screen-gate',
      }),
      runtimeSegments: parseLegacyCoachRuntimeSegmentSource({
        source: runtimeFile.source,
        sourcePath: runtimeFile.sourcePath,
        sourcePrefix: 'coach-runtime-segment',
      }),
      notice: normalizeNotice(noticeFile.source),
      sourceFiles: [
        routeFile.sourcePath,
        stationFile.sourcePath,
        gateFile.sourcePath,
        runtimeFile.sourcePath,
        noticeFile.sourcePath,
      ],
    };

    return {
      meta: createApiMeta('ready'),
      item,
    };
  } catch (error) {
    if (error instanceof LegacyDataSourceNotConfiguredError) {
      return {
        meta: createApiMeta('not_configured', error.message),
      };
    }

    return {
      meta: createApiMeta(
        'unavailable',
        error instanceof Error ? error.message : '旧客运大屏数据暂不可用。',
      ),
    };
  }
}

function normalizeNotice(source: string): string | undefined {
  const trimmed = source.replace(/\s+/g, ' ').trim();
  return trimmed || undefined;
}
