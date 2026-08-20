import type { ApiItemResponse, TicketJourneyDraftResult } from '@yct/contracts';
import { ticketJourneyDraftCreateSchema } from '@yct/schemas';
import { NextRequest, NextResponse } from 'next/server';
import { createApiMeta } from '../../../../../lib/api-meta';
import { planTravelJourneys } from '../../../../../lib/travel-journey-planner';
import {
  createTicketJourneyDraft,
  TicketOrderWorkflowError,
} from '../../../../../lib/ticket-order-workflow';
import { readTravelScheduleQuery } from '../../../../../lib/travel-schedules';
import { requireActiveLdpassUser } from '../../../../../lib/user-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const parsed = ticketJourneyDraftCreateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_journey_order',
        message: '联合订票参数不完整或格式不正确。',
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const schedules = await readTravelScheduleQuery({
    serviceDate: parsed.data.serviceDate,
    timeScope: 'all',
  });
  if (!schedules.item) {
    return NextResponse.json(
      {
        error: 'travel_schedule_unavailable',
        message: schedules.meta.message ?? '班次数据暂不可用。',
      },
      { status: 503 },
    );
  }
  const plan = await planTravelJourneys({
    trips: schedules.item.trips,
    serviceDate: parsed.data.serviceDate ?? new Date().toISOString().slice(0, 10),
    originStationName: parsed.data.originStationName,
    destinationStationName: parsed.data.destinationStationName,
    transferOptions: schedules.item.transferOptions,
    actorId: user.userId,
  });
  const journey = plan.journeys.find(
    (item) =>
      item.journeyId === parsed.data.journeyId &&
      item.legs.map((leg) => leg.tripInstanceId).join('|') ===
        parsed.data.tripInstanceIds.join('|'),
  );
  if (!journey) {
    return NextResponse.json(
      { error: 'journey_not_found', message: '行程方案已变化，请重新查询后再联合订票。' },
      { status: 409 },
    );
  }
  if (journey.ticketingStatus !== 'order_available') {
    return NextResponse.json(
      { error: 'journey_not_orderable', message: '该方案存在不可售行程段，暂不能联合订票。' },
      { status: 409 },
    );
  }

  const tripById = new Map(schedules.item.trips.map((trip) => [trip.tripInstanceId, trip]));
  const trips = journey.legs.map((leg) => tripById.get(leg.tripInstanceId)).filter(isDefined);
  if (trips.length !== journey.legs.length) {
    return NextResponse.json(
      { error: 'trip_not_found', message: '部分行程段已失效，请重新查询。' },
      { status: 409 },
    );
  }

  try {
    const item = await createTicketJourneyDraft({
      journeyId: journey.journeyId,
      serviceDate: parsed.data.serviceDate,
      trips,
      userId: user.userId,
      ldpassUserId: user.ldpassUserId,
      passengerCount: parsed.data.passengerCount,
    });
    const response: ApiItemResponse<TicketJourneyDraftResult> = {
      meta: createApiMeta('ready'),
      item,
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof TicketOrderWorkflowError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
    }
    throw error;
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
