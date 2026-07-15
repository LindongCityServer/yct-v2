import { NextRequest, NextResponse } from 'next/server';
import { replayPendingAppEvents } from '../../../../../lib/app-event-bus';
import {
  authorizeInternalTaskRequest,
  readInternalTaskJsonBody,
  readInternalTaskLimit,
} from '../../../../../lib/internal-task-auth';
import { ensureNotificationDeliveryListenersRegistered } from '../../../../../lib/notification-delivery-listeners';
import { ensureTransitCacheInvalidationListenersRegistered } from '../../../../../lib/transit-cache-invalidation-listeners';

export async function POST(request: NextRequest) {
  const unauthorized = authorizeInternalTaskRequest(request, '内部事件 Outbox 重放任务');
  if (unauthorized) {
    return unauthorized;
  }

  ensureNotificationDeliveryListenersRegistered();
  ensureTransitCacheInvalidationListenersRegistered();
  const body = await readInternalTaskJsonBody(request);
  const result = await replayPendingAppEvents(readInternalTaskLimit(body));
  return NextResponse.json(result);
}
