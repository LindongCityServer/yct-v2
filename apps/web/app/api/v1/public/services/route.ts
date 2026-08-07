import { readServiceEntryGroups } from '../../../../../lib/service-entries';
import {
  createPublicApiMeta,
  createPublicJsonResponse,
  latestIsoDate,
} from '../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const response = await readServiceEntryGroups();
  const asOf = latestIsoDate(
    response.items.flatMap((group) => group.items.map((item) => item.publishedAt)),
  );

  return createPublicJsonResponse({
    data: response.items,
    meta: createPublicApiMeta(request, response.meta, {
      canonicalPath: '/api/v1/public/services',
      asOf,
    }),
  });
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
