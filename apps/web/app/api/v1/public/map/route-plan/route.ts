import {
  createPublicApiMetaFromStatus,
  createPublicErrorResponse,
  createPublicJsonResponse,
  resolvePublicLocale,
} from '../../../../../../lib/public-api';
import { MapRoutePlanError, planMapRoute } from '../../../../../../lib/map-route-plan/service';
import type { RouteTransportMode } from '../../../../../../lib/map-route-plan';

export const dynamic = 'force-dynamic';

const canonicalPath = '/api/v1/public/map/route-plan';
const supportedModes = new Set<RouteTransportMode>([
  'walk',
  'taxi',
  'bus',
  'metro',
  'tram',
  'coach',
  'ferry',
  'railway',
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.searchParams.get('origin')?.trim();
  const originId = url.searchParams.get('originId')?.trim();
  const destination = url.searchParams.get('destination')?.trim();
  const destinationId = url.searchParams.get('destinationId')?.trim();
  const limit = clamp(parseNumber(url.searchParams.get('limit')) ?? 5, 1, 10);
  const time = url.searchParams.get('time')?.trim() || undefined;
  const timeModeParam = url.searchParams.get('timeMode')?.trim();
  const timeMode = timeModeParam === 'arrival' ? 'arrival' : 'departure';
  const modes = (url.searchParams.get('modes') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is RouteTransportMode =>
      supportedModes.has(value as RouteTransportMode),
    );

  if ((!origin && !originId) || (!destination && !destinationId)) {
    const meta = createPublicApiMetaFromStatus(request, 'ready', { canonicalPath });
    return createPublicErrorResponse({
      code: 'not_found',
      message: '需要提供 origin/originId 与 destination/destinationId。',
      meta,
      status: 400,
    });
  }

  try {
    const result = await planMapRoute({
      origin: { name: origin, markerId: originId },
      destination: { name: destination, markerId: destinationId },
      modes: modes.length > 0 ? modes : undefined,
      locale: resolvePublicLocale(request),
      limit,
      time,
      timeMode,
    });
    return createPublicJsonResponse(
      {
        data: result,
        meta: createPublicApiMetaFromStatus(request, 'ready', {
          canonicalPath,
          asOf: result.asOf,
        }),
      },
      { cacheSeconds: 30 },
    );
  } catch (error) {
    const unavailable = !(error instanceof MapRoutePlanError) || error.kind === 'unavailable';
    const meta = createPublicApiMetaFromStatus(request, unavailable ? 'unavailable' : 'ready', {
      canonicalPath,
    });
    return createPublicErrorResponse({
      code: unavailable ? 'source_unavailable' : 'not_found',
      message: error instanceof MapRoutePlanError ? error.message : '路线规划失败。',
      meta,
      status: unavailable ? 502 : 404,
    });
  }
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
