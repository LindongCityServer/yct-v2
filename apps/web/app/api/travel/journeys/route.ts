import type { ApiItemResponse, TravelJourneyPlanResult } from '@yct/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { createApiMeta } from '../../../../lib/api-meta';
import { planTravelJourneys } from '../../../../lib/travel-journey-planner';
import { readTravelScheduleQuery } from '../../../../lib/travel-schedules';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const originStationName = searchParams.get('origin')?.trim();
  const destinationStationName = searchParams.get('destination')?.trim();
  const serviceDate = searchParams.get('serviceDate')?.trim();
  if (
    !originStationName ||
    !destinationStationName ||
    !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate ?? '')
  ) {
    return NextResponse.json(
      { error: 'invalid_journey_query', message: '需要提供有效的起点、终点和乘车日期。' },
      { status: 400 },
    );
  }

  const schedules = await readTravelScheduleQuery({ serviceDate, timeScope: 'all' });
  if (!schedules.item) {
    return NextResponse.json(
      {
        error: 'travel_schedule_unavailable',
        message: schedules.meta.message ?? '班次数据暂不可用。',
      },
      { status: 503 },
    );
  }

  const item = await planTravelJourneys({
    trips: schedules.item.trips,
    serviceDate: serviceDate!,
    originStationName,
    destinationStationName,
    transferOptions: schedules.item.transferOptions,
  });
  const response: ApiItemResponse<TravelJourneyPlanResult> = {
    meta: createApiMeta('ready'),
    item,
  };
  return NextResponse.json(response);
}
