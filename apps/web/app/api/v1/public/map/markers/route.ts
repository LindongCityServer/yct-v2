import type { ApiMeta, MapMarkerSnapshot } from '@yct/contracts';
import { GET as getMapMarkers } from '../../../../../api/map/markers/route';
import {
  createPublicApiMeta,
  createPublicErrorResponse,
  createPublicJsonResponse,
} from '../../../../../../lib/public-api';
import { readPublicMapMarkerSnapshot } from '../../../../../../lib/map-marker-public-snapshot-store';

export const dynamic = 'force-dynamic';

interface InternalMapMarkersResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl: string;
}

export async function GET(request: Request) {
  const persisted = await readPublicMapMarkerSnapshot();
  if (persisted) {
    return createPublicJsonResponse({
      data: {
        ...persisted.snapshot,
        iconBaseUrl: persisted.iconBaseUrl,
      },
      meta: createPublicApiMeta(
        request,
        {
          ...persisted.meta,
          generatedAt: new Date().toISOString(),
          message: [persisted.meta.message, '当前响应读取最近一次成功地图快照。']
            .filter(Boolean)
            .join(' '),
        },
        {
          canonicalPath: '/api/v1/public/map/markers',
          asOf: persisted.snapshot.fetchedAt,
        },
      ),
    });
  }

  const internalResponse = await getMapMarkers();
  const body = (await internalResponse.json()) as InternalMapMarkersResponse;
  const meta = createPublicApiMeta(request, body.meta, {
    canonicalPath: '/api/v1/public/map/markers',
    asOf: body.snapshot.fetchedAt,
  });
  if (!internalResponse.ok) {
    return createPublicErrorResponse({
      code: 'source_unavailable',
      message: body.meta.message ?? '地图标记源暂不可用。',
      meta,
      status: internalResponse.status,
    });
  }

  return createPublicJsonResponse(
    {
      data: {
        ...body.snapshot,
        iconBaseUrl: body.iconBaseUrl,
      },
      meta,
    },
    { cacheSeconds: 60 },
  );
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
