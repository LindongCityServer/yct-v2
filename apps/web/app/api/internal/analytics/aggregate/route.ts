import { NextRequest, NextResponse } from 'next/server';
import { runAggregation } from '../../../../../lib/analytics/aggregate';
import {
  authorizeInternalTaskRequest,
  readInternalTaskBoolean,
  readInternalTaskJsonBody,
  readInternalTaskLimit,
  readInternalTaskString,
} from '../../../../../lib/internal-task-auth';

export const dynamic = 'force-dynamic';

/**
 * 统计聚合内部任务。
 *
 * 生产环境只部署 standalone 产物，无法执行仓库里的脚本，
 * 因此聚合入口放在应用内，由计划任务携带内部令牌触发。
 */
export async function GET(request: NextRequest) {
  return handleAggregateRequest(request, request.nextUrl.searchParams);
}

export async function POST(request: NextRequest) {
  return handleAggregateRequest(request, await readInternalTaskJsonBody(request));
}

async function handleAggregateRequest(request: NextRequest, source: unknown) {
  const unauthorized = authorizeInternalTaskRequest(request, '统计聚合任务');
  if (unauthorized) {
    return unauthorized;
  }

  const days = readInternalTaskLimit(source, 'days', 90) ?? 3;
  const purge = readInternalTaskBoolean(source, 'purge') ?? true;
  const nowText = readInternalTaskString(source, 'now');
  const now = nowText ? new Date(nowText) : undefined;

  if (now && Number.isNaN(now.getTime())) {
    return NextResponse.json(
      { error: 'invalid_now', message: 'now 不是合法时间。' },
      { status: 400 },
    );
  }

  try {
    const result = await runAggregation({ days, purge, now });
    return NextResponse.json({
      ok: true,
      purged: result.purged,
      metricsFilePath: result.metricsFilePath,
      days: result.results.map((item) => ({
        day: item.day,
        projects: Object.fromEntries(
          Object.entries(item.projects).map(([project, rows]) => [
            project,
            (rows ?? []).map((row) => ({
              metric: row.metric,
              dimension: row.dimension,
              value: row.value,
            })),
          ]),
        ),
      })),
    });
  } catch {
    return NextResponse.json(
      { error: 'aggregate_failed', message: '统计聚合执行失败。' },
      { status: 500 },
    );
  }
}
