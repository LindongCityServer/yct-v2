import { createApiMeta } from './api-meta';
import {
  buildTransitOverview,
  readLegacyTransitOverview,
  type TransitOverview,
} from './legacy-transit';
import { createTimedCache } from './server-cache';
import {
  filterPublicOperatingTransitSnapshot,
  readPublishedTransitEntitySnapshot,
} from './published-transit-read-model';
import { readTransitModeProfiles } from './transit-mode-profile-store';
import { readTransitTripLabelPools } from './transit-trip-label-pool-store';
import { getTransitTripLabelServiceDateKey, resolveTransitTripLabels } from './transit-trip-labels';

const transitOverviewCache = createTimedCache<TransitOverview>(30 * 1000);

export async function readTransitOverview(): Promise<TransitOverview> {
  return transitOverviewCache.read('transit-overview', readTransitOverviewUncached);
}

export function clearTransitOverviewCache(): void {
  transitOverviewCache.clear();
}

export async function readMaterialTransitOverview(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (!publishedSnapshot) {
    return { ...(await readLegacyTransitOverview()), modeProfiles };
  }
  return {
    ...buildTransitOverview(
      publishedSnapshot,
      createApiMeta(
        'ready',
        `物料目录包含 ${publishedSnapshot.lines.length} 条已发布线路（含规划及关闭对象）。`,
      ),
    ),
    modeProfiles,
  };
}

async function readTransitOverviewUncached(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (publishedSnapshot) {
    const publicSnapshot = filterPublicOperatingTransitSnapshot(publishedSnapshot);
    return attachTransitTripLabels({
      ...buildTransitOverview(
        {
          summary: publicSnapshot.summary,
          lines: publicSnapshot.lines,
          stations: publicSnapshot.stations,
          stationDetails: publicSnapshot.stationDetails,
        },
        createApiMeta(
          'ready',
          `公开 ${publicSnapshot.lines.length} 条已运营线路，来源批次 ${publicSnapshot.sourceRevisionIds.length} 个。`,
        ),
      ),
      modeProfiles,
    });
  }

  return attachTransitTripLabels({
    ...(await readLegacyTransitOverview()),
    modeProfiles,
  });
}

/**
 * 依据全局标签池与当天日期补齐班次标签；手动标签在算法里优先且占用时间窗。
 */
async function attachTransitTripLabels(overview: TransitOverview): Promise<TransitOverview> {
  if (overview.lines.length === 0) {
    return overview;
  }
  const pools = await readTransitTripLabelPools();
  if (pools.length === 0) {
    return overview;
  }
  const labels = resolveTransitTripLabels({
    dateKey: getTransitTripLabelServiceDateKey(),
    lines: overview.lines,
    pools,
  });
  if (labels.size === 0) {
    return overview;
  }

  return {
    ...overview,
    lines: overview.lines.map((line) => {
      const tripLabels = labels.get(line.id);
      return tripLabels ? { ...line, tripLabelsByDirection: tripLabels } : line;
    }),
  };
}
