import type { ApiListResponse, TransitStationDetailSnapshot } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { readLegacyTransitSnapshot } from './legacy-transit';
import { readPublishedTransitEntitySnapshot } from './published-transit-read-model';

export async function readTransitStationDetails(): Promise<
  ApiListResponse<TransitStationDetailSnapshot>
> {
  try {
    const published = await readPublishedTransitEntitySnapshot();
    if (published?.stationDetails?.length) {
      return {
        meta: createApiMeta('ready', '已发布站内设施详情。'),
        items: published.stationDetails,
      };
    }

    const legacy = await readLegacyTransitSnapshot();
    if (legacy.snapshot?.stationDetails?.length) {
      return { meta: createApiMeta('ready'), items: legacy.snapshot.stationDetails };
    }
    return { meta: legacy.meta, items: [] };
  } catch (error) {
    return {
      meta: createApiMeta(
        'unavailable',
        error instanceof Error ? error.message : '地铁站点详情暂不可用。',
      ),
      items: [],
    };
  }
}
