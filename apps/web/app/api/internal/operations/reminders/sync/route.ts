import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeInternalTaskRequest,
  readInternalTaskBoolean,
  readInternalTaskJsonBody,
  readInternalTaskString,
} from '../../../../../../lib/internal-task-auth';
import { syncTransitServiceNoticeReminderSource } from '../../../../../../lib/operations-reminder-source-sync-workflow';

export async function POST(request: NextRequest) {
  const unauthorized = authorizeInternalTaskRequest(request, '运营提醒公告源同步任务');
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readInternalTaskJsonBody(request);
  const actorId = readInternalTaskString(body, 'actorId');
  const forceRefresh = readInternalTaskBoolean(body, 'force');

  const result = await syncTransitServiceNoticeReminderSource({
    actorId,
    actorType: 'system',
    forceRefresh,
  });

  return NextResponse.json(result);
}
