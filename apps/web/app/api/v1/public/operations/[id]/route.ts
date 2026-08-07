import { readOperationDetail } from '../../../../../../lib/operations-content';
import {
  createPublicApiMeta,
  createPublicJsonResponse,
  publicSiteUrl,
} from '../../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

type OperationDetailRouteProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

export async function GET(request: Request, { params }: OperationDetailRouteProps) {
  const { id } = await params;
  const decodedId = decodeSegment(id);
  const response = await readOperationDetail(decodedId);
  const item = response.item
    ? {
        ...response.item,
        canonicalUrl: publicSiteUrl(`/operations/${encodeURIComponent(response.item.id)}`),
      }
    : undefined;

  return createPublicJsonResponse(
    {
      data: item,
      meta: createPublicApiMeta(request, response.meta, {
        canonicalPath: `/api/v1/public/operations/${encodeURIComponent(decodedId)}`,
        asOf: item?.publishedAt,
      }),
    },
    { status: item ? 200 : 404 },
  );
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
