import {
  createPublicApiMetaFromStatus,
  createPublicErrorResponse,
  createPublicJsonResponse,
  resolvePublicLocale,
} from '../../../../../../lib/public-api';
import {
  findTransitLineMarker,
  queryAlongLineMarkers,
  readSpatialMarkerContext,
} from '../../../../../../lib/map-spatial-query';

export const dynamic = 'force-dynamic';

const canonicalPath = '/api/v1/public/map/along-line';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lineId = url.searchParams.get('lineId')?.trim();
  const lineLabel = url.searchParams.get('line')?.trim();
  const corridor = clamp(parseNumber(url.searchParams.get('corridor')) ?? 300, 1, 1000);
  const fromMileage = Math.max(0, parseNumber(url.searchParams.get('from')) ?? 0);
  const toMileage = parseNumber(url.searchParams.get('to'));
  const limit = clamp(parseNumber(url.searchParams.get('limit')) ?? 30, 1, 80);
  const categories = (url.searchParams.get('category') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const context = await readSpatialMarkerContext(resolvePublicLocale(request));
  const meta = createPublicApiMetaFromStatus(request, context ? 'ready' : 'unavailable', {
    canonicalPath,
    asOf: context?.fetchedAt,
  });
  if (!context) {
    return createPublicErrorResponse({
      code: 'source_unavailable',
      message: '地图标记源暂不可用。',
      meta,
      status: 502,
    });
  }

  const line =
    lineId || lineLabel
      ? findTransitLineMarker(context.markers, { lineId, label: lineLabel })
      : undefined;
  if (!line) {
    return createPublicErrorResponse({
      code: 'not_found',
      message: '没有找到可用于沿线搜索的线路，请提供 lineId 或 line。',
      meta,
      status: 404,
    });
  }

  const result = queryAlongLineMarkers(context, {
    line,
    corridor,
    fromMileage,
    toMileage,
    categories,
    limit,
  });
  if (!result) {
    return createPublicErrorResponse({
      code: 'not_found',
      message: '这条线路缺少可用的路线坐标，无法计算沿线标记。',
      meta,
      status: 404,
    });
  }

  return createPublicJsonResponse({ data: result, meta }, { cacheSeconds: 30 });
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}

function parseNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
