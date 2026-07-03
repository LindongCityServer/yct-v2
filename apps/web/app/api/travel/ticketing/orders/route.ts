import type { ApiItemResponse, TicketOrderDraftResult } from '@yct/contracts';
import { ticketOrderDraftCreateSchema } from '@yct/schemas';
import { NextRequest, NextResponse } from 'next/server';
import { createApiMeta } from '../../../../../lib/api-meta';
import {
  createTicketOrderDraft,
  listTicketOrdersForUser,
  TicketOrderWorkflowError,
} from '../../../../../lib/ticket-order-workflow';
import { readTravelScheduleQuery } from '../../../../../lib/travel-schedules';
import { requireActiveLdpassUser } from '../../../../../lib/user-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  return NextResponse.json({
    meta: createApiMeta('ready'),
    items: await listTicketOrdersForUser(user.userId),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await readJsonBody(request);
  const parsed = ticketOrderDraftCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: '订单草稿参数不完整或格式不正确。',
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const schedules = await readTravelScheduleQuery({
    serviceDate: parsed.data.serviceDate,
    timeScope: 'all',
  });
  const trip = schedules.item?.trips.find(
    (item) => item.tripInstanceId === parsed.data.tripInstanceId,
  );
  if (!trip) {
    return NextResponse.json(
      {
        error: 'trip_not_found',
        message: '没有找到对应班次，无法创建订单草稿。',
      },
      { status: 404 },
    );
  }

  try {
    const result = await createTicketOrderDraft({
      trip,
      userId: user.userId,
      ldpassUserId: user.ldpassUserId,
      fareProductId: parsed.data.fareProductId,
      passengerCount: parsed.data.passengerCount,
    });
    const response: ApiItemResponse<TicketOrderDraftResult> = {
      meta: createApiMeta('ready'),
      item: result,
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof TicketOrderWorkflowError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: 409 },
      );
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
