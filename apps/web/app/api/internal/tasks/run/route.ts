import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeInternalTaskRequest,
  readInternalTaskBoolean,
  readInternalTaskJsonBody,
  readInternalTaskLimit,
  readInternalTaskString,
} from '../../../../../lib/internal-task-auth';
import { runInternalTasks as runInternalTasksWorkflow } from '../../../../../lib/internal-task-runner';

export async function GET(request: NextRequest) {
  return handleInternalTasksRequest(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  const body = await readInternalTaskJsonBody(request);
  return handleInternalTasksRequest(request, body);
}

async function handleInternalTasksRequest(request: NextRequest, source: unknown) {
  const unauthorized = authorizeInternalTaskRequest(request, '内部计划任务 runner');
  if (unauthorized) {
    return unauthorized;
  }

  const sharedLimit = readInternalTaskLimit(source);
  const eventLimit = readInternalTaskLimit(source, 'eventLimit') ?? sharedLimit;
  const pushLimit = readInternalTaskLimit(source, 'pushLimit') ?? sharedLimit;
  const now = readInternalTaskString(source, 'now');
  const syncOperationsReminders = readInternalTaskBoolean(source, 'syncOperationsReminders') ?? true;
  const forceOperationsReminderRefresh =
    readInternalTaskBoolean(source, 'forceOperationsReminderRefresh') ?? false;
  const actorId = readInternalTaskString(source, 'actorId');
  const result = await runInternalTasksWorkflow({
    actorId,
    actorType: 'system',
    eventLimit,
    pushLimit,
    now,
    syncOperationsReminders,
    forceOperationsReminderRefresh,
  });

  return NextResponse.json(result);
}
