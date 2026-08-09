import { readOperationDetail } from '../../../../../../lib/operations-content';
import {
  createPublicApiMeta,
  createPublicErrorResponse,
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

  const meta = createPublicApiMeta(request, response.meta, {
    canonicalPath: `/api/v1/public/operations/${encodeURIComponent(decodedId)}`,
    asOf: item?.publishedAt,
  });
  if (!item) {
    return createPublicErrorResponse({
      code: 'not_found',
      message: response.meta.message ?? '内容不存在或当前未公开。',
      meta,
      status: 404,
    });
  }

  return createPublicJsonResponse({ data: item, meta });
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
