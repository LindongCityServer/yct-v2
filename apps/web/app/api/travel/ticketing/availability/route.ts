import type { ApiItemResponse, TravelTicketingAvailability } from '@yct/contracts';
import { NextResponse } from 'next/server';
import { createApiMeta } from '../../../../../lib/api-meta';
import { readTravelScheduleQuery } from '../../../../../lib/travel-schedules';
import { resolveTripNotFoundTicketingAvailability } from '../../../../../lib/travel-ticketing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tripInstanceId = normalizeString(url.searchParams.get('tripInstanceId'));
  if (!tripInstanceId) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: '需要提供 tripInstanceId。',
      },
      { status: 400 },
    );
  }

  const schedules = await readTravelScheduleQuery({
    serviceDate: normalizeServiceDate(url.searchParams.get('serviceDate')),
    timeScope: 'all',
  });
  const trip = schedules.item?.trips.find((item) => item.tripInstanceId === tripInstanceId);
  const response: ApiItemResponse<TravelTicketingAvailability> = {
    meta: trip ? createApiMeta('ready') : createApiMeta('ready', '没有找到对应班次。'),
    item: trip?.ticketing ?? resolveTripNotFoundTicketingAvailability(tripInstanceId),
  };

  return NextResponse.json(response);
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
