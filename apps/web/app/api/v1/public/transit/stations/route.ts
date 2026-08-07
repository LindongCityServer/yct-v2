import { createPublicApiMeta, createPublicJsonResponse } from '../../../../../../lib/public-api';
import { readTransitStationDetails } from '../../../../../../lib/transit-station-details';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const response = await readTransitStationDetails();

  return createPublicJsonResponse({
    data: response.items,
    meta: createPublicApiMeta(request, response.meta, {
      canonicalPath: '/api/v1/public/transit/stations',
    }),
  });
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
