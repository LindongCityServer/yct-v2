import type { TicketableServiceKind, TravelScheduleTimeScope } from '@yct/contracts';
import { readTravelScheduleQuery } from '../../../../../../lib/travel-schedules';
import {
  createPublicApiMeta,
  createPublicJsonResponse,
  latestIsoDate,
} from '../../../../../../lib/public-api';

export const dynamic = 'force-dynamic';

const serviceKinds = new Set<TicketableServiceKind>([
  'coach',
  'ferry',
  'flight',
  'railway',
  'custom',
]);
const timeScopes = new Set<TravelScheduleTimeScope>(['all', 'upcoming', 'past']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await readTravelScheduleQuery({
    serviceKind: normalizeServiceKind(url.searchParams.get('serviceKind')),
    query: normalizeString(url.searchParams.get('q')),
    stationName: normalizeString(url.searchParams.get('stationName')),
    originStationName: normalizeString(
      url.searchParams.get('originStationName') ??
        url.searchParams.get('origin') ??
        url.searchParams.get('from'),
    ),
    destinationStationName: normalizeString(
      url.searchParams.get('destinationStationName') ??
        url.searchParams.get('destination') ??
        url.searchParams.get('to'),
    ),
    serviceDate: normalizeServiceDate(
      url.searchParams.get('serviceDate') ?? url.searchParams.get('date'),
    ),
    timeScope: normalizeTimeScope(url.searchParams.get('timeScope')),
  });

  const asOf = latestIsoDate(result.item?.trips.map((trip) => trip.publishedAt) ?? []);
  return createPublicJsonResponse(
    {
      data: result.item,
      meta: createPublicApiMeta(request, result.meta, {
        canonicalPath: '/api/v1/public/travel/schedules',
        asOf,
      }),
    },
    { cacheSeconds: 15 },
  );
}

export function OPTIONS() {
  return createPublicJsonResponse(null);
}

function normalizeServiceKind(value: string | null): TicketableServiceKind | 'all' | undefined {
  if (!value || value === 'all') {
    return 'all';
  }

  return serviceKinds.has(value as TicketableServiceKind)
    ? (value as TicketableServiceKind)
    : undefined;
}

function normalizeTimeScope(value: string | null): TravelScheduleTimeScope | undefined {
  if (!value) {
    return undefined;
  }

  return timeScopes.has(value as TravelScheduleTimeScope)
    ? (value as TravelScheduleTimeScope)
    : undefined;
}

function normalizeString(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeServiceDate(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }

  const [yearText, monthText, dayText] = trimmed.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? trimmed
    : undefined;
}
