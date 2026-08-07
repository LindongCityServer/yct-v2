import { readOperationsDetails } from '../../../../../lib/operations-content';
import {
  createPublicApiMeta,
  createPublicJsonResponse,
  latestIsoDate,
  publicSiteUrl,
} from '../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const response = await readOperationsDetails();
  const items = response.items.map((item) => ({
    ...item,
    canonicalUrl: publicSiteUrl(`/operations/${encodeURIComponent(item.id)}`),
  }));

  return createPublicJsonResponse({
    data: items,
    meta: createPublicApiMeta(request, response.meta, {
      canonicalPath: '/api/v1/public/operations',
      asOf: latestIsoDate(response.items.map((item) => item.publishedAt)),
    }),
  });
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}
