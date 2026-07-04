import type { ApiItemResponse, TicketOrderListItem } from '@yct/contracts';
import { NextRequest, NextResponse } from 'next/server';
import { createApiMeta } from '../../../../../../lib/api-meta';
import {
  getTicketOrderForUser,
  TicketOrderWorkflowError,
} from '../../../../../../lib/ticket-order-workflow';
import { requireActiveLdpassUser } from '../../../../../../lib/user-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ orderId: string }> }>,
) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const { orderId } = await params;
  try {
    const item = await getTicketOrderForUser({
      orderId: decodeSegment(orderId),
      userId: user.userId,
      ldpassUserId: user.ldpassUserId,
    });
    const response: ApiItemResponse<TicketOrderListItem> = {
      meta: createApiMeta('ready'),
      item,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof TicketOrderWorkflowError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: error.code === 'order_not_found' ? 404 : 409 },
      );
    }

    throw error;
  }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
