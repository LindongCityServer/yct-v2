import type { ApiMeta, MapMarkerSnapshot } from '@yct/contracts';
import { GET as getMapMarkers } from '../../../../../api/map/markers/route';
import { createPublicApiMeta, createPublicJsonResponse } from '../../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

interface InternalMapMarkersResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl: string;
}

export async function GET(request: Request) {
  const internalResponse = await getMapMarkers();
  const body = (await internalResponse.json()) as InternalMapMarkersResponse;

  return createPublicJsonResponse(
    {
      data: {
        ...body.snapshot,
        iconBaseUrl: body.iconBaseUrl,
      },
      meta: createPublicApiMeta(request, body.meta, {
        canonicalPath: '/api/v1/public/map/markers',
        asOf: body.snapshot.fetchedAt,
      }),
    },
    { cacheSeconds: 60 },
  );
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
