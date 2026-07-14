import { createApiMeta } from './api-meta';
import {
  buildTransitOverview,
  readLegacyTransitOverview,
  type TransitOverview,
} from './legacy-transit';
import { createTimedCache } from './server-cache';
import { readPublishedTransitEntitySnapshot } from './published-transit-read-model';
import { readTransitModeProfiles } from './transit-mode-profile-store';

const transitOverviewCache = createTimedCache<TransitOverview>(30 * 1000);

export async function readTransitOverview(): Promise<TransitOverview> {
  return transitOverviewCache.read('transit-overview', readTransitOverviewUncached);
}

export function clearTransitOverviewCache(): void {
  transitOverviewCache.clear();
}

async function readTransitOverviewUncached(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (publishedSnapshot) {
    return {
      ...buildTransitOverview(
        {
          summary: publishedSnapshot.summary,
          lines: publishedSnapshot.lines,
          stations: publishedSnapshot.stations,
        },
        createApiMeta(
          'ready',
          `已发布 ${publishedSnapshot.lines.length} 条线路，来源批次 ${publishedSnapshot.sourceRevisionIds.length} 个。`,
        ),
      ),
      modeProfiles,
    };
  }

  return {
    ...(await readLegacyTransitOverview()),
    modeProfiles,
  };
}
