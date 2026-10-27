import {
  createPublicApiMetaFromStatus,
  createPublicErrorResponse,
  createPublicJsonResponse,
  resolvePublicLocale,
} from '../../../../../../lib/public-api';
import {
  findSpatialMarker,
  queryNearbyMarkers,
  readSpatialMarkerContext,
  type SpatialMarker,
} from '../../../../../../lib/map-spatial-query';

export const dynamic = 'force-dynamic';

const canonicalPath = '/api/v1/public/map/nearby';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const markerId = url.searchParams.get('markerId')?.trim();
  const label = url.searchParams.get('marker')?.trim();
  const x = parseNumber(url.searchParams.get('x'));
  const z = parseNumber(url.searchParams.get('z'));
  const radius = clamp(parseNumber(url.searchParams.get('radius')) ?? 200, 1, 2000);
  const limit = clamp(parseNumber(url.searchParams.get('limit')) ?? 20, 1, 50);
  const categories = (url.searchParams.get('category') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const scopeParam = url.searchParams.get('scope');
  const scope = scopeParam === 'inside' || scopeParam === 'outside' ? scopeParam : 'all';

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

  const anchor: SpatialMarker | undefined =
    x !== undefined && z !== undefined
      ? {
          id: '',
          label: label ?? `${x}, ${z}`,
          geometry: { type: 'Point', coordinates: [x, z] },
        }
      : findSpatialMarker(context.markers, { markerId, label });

  if (!anchor) {
    return createPublicErrorResponse({
      code: 'not_found',
      message: '没有找到周边搜索的锚点，请提供 markerId、marker 或 x/z。',
      meta,
      status: 400,
    });
  }

  const result = queryNearbyMarkers(context, { anchor, radius, categories, scope, limit });
  if (!result) {
    return createPublicErrorResponse({
      code: 'not_found',
      message: '锚点没有可用的坐标，无法计算周边。',
      meta,
      status: 400,
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
