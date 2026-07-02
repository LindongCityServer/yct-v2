import type { ApiListResponse, TransitStationDetailSnapshot } from '@yct/contracts';
import { parseLegacyMetroStationDetailSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyDataSourceFile,
} from './legacy-data-source';
import { readRuntimeConfig } from './runtime-config';

export async function readTransitStationDetails(): Promise<
  ApiListResponse<TransitStationDetailSnapshot>
> {
  const config = readRuntimeConfig();

  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧地铁站点详情数据源尚未配置。'),
      items: [],
    };
  }

  try {
    const legacyFile = await readLegacyDataSourceFile(config, 'metro_station_detail.js');
    const items = parseLegacyMetroStationDetailSource({
      source: legacyFile.source,
      sourcePath: legacyFile.sourcePath,
      sourcePrefix: 'metro-station-detail',
    }).map((detail) => ({
      sourceId: detail.sourceId,
      lineName: detail.lineName,
      stationName: detail.stationName,
      overGround: detail.overGround,
      layers: detail.layers,
      facilities: detail.facilities,
      transfers: detail.transfers,
      exits: detail.exits,
      surroundingStationNames: detail.surroundingStationNames,
      sourcePath: detail.sourcePath,
    }));

    return {
      meta: createApiMeta('ready'),
      items,
    };
  } catch (error) {
    if (error instanceof LegacyDataSourceNotConfiguredError) {
      return {
        meta: createApiMeta('not_configured', error.message),
        items: [],
      };
    }

    return {
      meta: createApiMeta(
        'unavailable',
        error instanceof Error ? error.message : '旧地铁站点详情暂不可用。',
      ),
      items: [],
    };
  }
}
