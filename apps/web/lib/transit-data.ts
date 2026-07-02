import { createApiMeta } from './api-meta';
import {
  buildTransitOverview,
  readLegacyTransitOverview,
  type TransitOverview,
} from './legacy-transit';
import { findPublishedTransitDataRevision } from './transit-data-store';
import { readTransitModeProfiles } from './transit-mode-profile-store';

export async function readTransitOverview(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedRevision = await findPublishedTransitDataRevision();
  if (publishedRevision) {
    return {
      ...buildTransitOverview(
        {
          summary: publishedRevision.summary,
          lines: publishedRevision.lines,
          stations: publishedRevision.stations,
        },
        createApiMeta('ready', `已发布交通数据版本：${publishedRevision.revisionId}`),
      ),
      modeProfiles,
    };
  }

  return {
    ...(await readLegacyTransitOverview()),
    modeProfiles,
  };
}
