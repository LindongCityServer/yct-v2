import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeInternalTaskRequest,
  readInternalTaskJsonBody,
  readInternalTaskLimit,
  readInternalTaskString,
} from '../../../../../lib/internal-task-auth';
import { processDuePushDeliveries } from '../../../../../lib/notification-delivery-workflow';

export async function POST(request: NextRequest) {
  const unauthorized = authorizeInternalTaskRequest(request, '内部通知投递任务');
  if (unauthorized) {
    return unauthorized;
  }

  const body = await readInternalTaskJsonBody(request);
  const result = await processDuePushDeliveries({
    limit: readInternalTaskLimit(body),
    now: readInternalTaskString(body, 'now'),
  });
  return NextResponse.json(result);
}
