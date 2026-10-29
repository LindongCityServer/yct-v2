import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readMetricsFile } from '../../../../../lib/analytics/aggregate';
import { buildAnalyticsOverview } from '../../../../../lib/analytics/overview';
import { toAnalyticsDay } from '../../../../../lib/analytics/schema';
import { markResponseNoStore } from '../../../../../lib/http-cache';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

export const dynamic = 'force-dynamic';

/**
 * 后台数据概览。
 *
 * 只读取聚合脚本产出的日指标快照，不直接查询原始事件表，
 * 保证看板查询与采集写入互相隔离。
 */
export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const days = parseDays(new URL(request.url).searchParams.get('days'));
  const today = toAnalyticsDay(new Date());
  if (!today) {
    return NextResponse.json(
      { error: 'server_clock_invalid', message: '服务端时间不可用。' },
      { status: 500 },
    );
  }

  const config = readRuntimeConfig();
  const snapshot = await readMetricsFile(config.analyticsMetricsFilePath);
  const overview = buildAnalyticsOverview({ days, today, snapshot });

  return markResponseNoStore(NextResponse.json(overview));
}

function parseDays(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 90) : 30;
}
