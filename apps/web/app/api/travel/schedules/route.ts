import type { TicketableServiceKind, TravelScheduleTimeScope } from '@yct/contracts';
import { NextResponse } from 'next/server';
import { readTravelScheduleQuery } from '../../../../lib/travel-schedules';

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
    timeScope: normalizeTimeScope(url.searchParams.get('timeScope')),
  });

  return NextResponse.json(result);
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
