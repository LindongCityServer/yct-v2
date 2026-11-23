import type { ApiListResponse, TransitStationDetailSnapshot } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { readLegacyTransitSnapshot } from './legacy-transit';
import { readPublicMapMarkerSnapshot } from './map-marker-public-snapshot-store';
import { readPublishedTransitEntitySnapshot } from './published-transit-read-model';
import { enrichTransitStationDetailsWithExitMarkers } from './transit-station-exit-facilities';

export async function readTransitStationDetails(): Promise<
  ApiListResponse<TransitStationDetailSnapshot>
> {
  try {
    // 出口的无障碍电梯/升降机设施挂在出口 POI 上，读取时把 POI 设施 join 回出口。
    const markerSnapshot = await readPublicMapMarkerSnapshot();
    const markers = markerSnapshot?.snapshot.markers ?? [];
    const published = await readPublishedTransitEntitySnapshot();
    if (published?.stationDetails?.length) {
      return {
        meta: createApiMeta('ready', '已发布站内设施详情。'),
        items: enrichTransitStationDetailsWithExitMarkers(published.stationDetails, markers),
      };
    }

    const legacy = await readLegacyTransitSnapshot();
    if (legacy.snapshot?.stationDetails?.length) {
      return {
        meta: createApiMeta('ready'),
        items: enrichTransitStationDetailsWithExitMarkers(legacy.snapshot.stationDetails, markers),
      };
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
