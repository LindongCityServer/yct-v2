import type { ApiListResponse, TransitServiceNotice } from '@yct/contracts';
import { parseLegacyCoachStopNoticeSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyPublicFile,
} from './legacy-data-source';
import { readRuntimeConfig } from './runtime-config';

export async function readTransitServiceNotices(): Promise<ApiListResponse<TransitServiceNotice>> {
  const config = readRuntimeConfig();

  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧客运公告数据源尚未配置。'),
      items: [],
    };
  }

  try {
    const legacyFile = await readLegacyPublicFile(config, 'ltcx/stop.txt');
    const items = parseLegacyCoachStopNoticeSource({
      source: legacyFile.source,
      sourcePath: legacyFile.sourcePath,
      sourcePrefix: 'coach-notice',
    }).map((notice) => ({
      id: notice.sourceId,
      mode: notice.mode,
      title: notice.title,
      periodText: notice.periodText,
      reason: notice.reason,
      startsAt: notice.startsAt,
      endsAt: notice.endsAt,
      sourcePath: notice.sourcePath,
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
        error instanceof Error ? error.message : '旧客运公告暂不可用。',
      ),
      items: [],
    };
  }
}
