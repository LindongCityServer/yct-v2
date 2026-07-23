import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeInternalTaskRequest,
  readInternalTaskString,
} from '../../../../../lib/internal-task-auth';
import { syncPlayerLocations } from '../../../../../lib/player-location-workflow';

export async function POST(request: NextRequest) {
  const unauthorized = authorizeInternalTaskRequest(request, '玩家位置同步任务');
  if (unauthorized) {
    return unauthorized;
  }

  let source: unknown = {};
  try {
    source = await request.json();
  } catch {
    // 空请求体使用默认任务身份。
  }

  const result = await syncPlayerLocations({
    actorId: readInternalTaskString(source, 'actorId') ?? 'player_location_poller',
    actorType: 'system',
  });
  return NextResponse.json(result);
}
