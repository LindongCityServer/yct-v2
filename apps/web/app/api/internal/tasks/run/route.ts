import { NextRequest, NextResponse } from 'next/server';
import { replayPendingAppEvents } from '../../../../../lib/app-event-bus';
import {
  authorizeInternalTaskRequest,
  readInternalTaskJsonBody,
  readInternalTaskLimit,
  readInternalTaskString,
} from '../../../../../lib/internal-task-auth';
import { ensureNotificationDeliveryListenersRegistered } from '../../../../../lib/notification-delivery-listeners';
import { processDuePushDeliveries } from '../../../../../lib/notification-delivery-workflow';

export async function GET(request: NextRequest) {
  return runInternalTasks(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const body = await readInternalTaskJsonBody(request);
  return runInternalTasks(request, body);
}

async function runInternalTasks(request: NextRequest, source: unknown) {
  const unauthorized = authorizeInternalTaskRequest(request, '内部计划任务 runner');
  if (unauthorized) {
    return unauthorized;
  }

  ensureNotificationDeliveryListenersRegistered();
  const sharedLimit = readInternalTaskLimit(source);
  const eventLimit = readInternalTaskLimit(source, 'eventLimit') ?? sharedLimit;
  const pushLimit = readInternalTaskLimit(source, 'pushLimit') ?? sharedLimit;
  const now = readInternalTaskString(source, 'now');

  const events = await replayPendingAppEvents(eventLimit);
  const notifications = await processDuePushDeliveries({
    limit: pushLimit,
    now,
  });

  return NextResponse.json({
    processedAt: new Date().toISOString(),
    events,
    notifications,
  });
}
