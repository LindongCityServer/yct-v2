import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { isAnalyticsEventName } from '../../../../../lib/analytics/schema';
import { createAnalyticsStore } from '../../../../../lib/analytics/store';
import { markResponseNoStore } from '../../../../../lib/http-cache';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

export const dynamic = 'force-dynamic';

/**
 * 行为事件明细。
 *
 * 与概览接口不同，这里直接查询原始事件表，用于排查具体问题。
 * 结果按接收时间倒序，支持分页与基础筛选。
 */
export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const params = new URL(request.url).searchParams;
  const limit = parseInteger(params.get('limit'), 50, 1, 200);
  const offset = parseInteger(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);

  const eventName = params.get('eventName')?.trim();
  if (eventName && !isAnalyticsEventName(eventName)) {
    return NextResponse.json(
      { error: 'invalid_event_name', message: '事件名不在白名单内。' },
      { status: 400 },
    );
  }

  const fromDayParam = params.get('fromDay');
  const toDayParam = params.get('toDay');
  const fromDay = parseDay(fromDayParam);
  const toDay = parseDay(toDayParam);
  if ((fromDayParam && !fromDay) || (toDayParam && !toDay)) {
    return NextResponse.json(
      { error: 'invalid_day', message: '日期格式应为 YYYY-MM-DD。' },
      { status: 400 },
    );
  }

  const config = readRuntimeConfig();
  const store = createAnalyticsStore(config.analyticsDbPath);

  try {
    const page = await store.listEvents({
      project: 'yct',
      eventName: eventName || undefined,
      route: params.get('route')?.trim() || undefined,
      userId: params.get('userId')?.trim() || undefined,
      fromDay,
      toDay,
      limit,
      offset,
    });

    return markResponseNoStore(NextResponse.json({ ...page, limit, offset }));
  } catch {
    return NextResponse.json(
      { error: 'analytics_store_unavailable', message: '统计存储暂不可用。' },
      { status: 500 },
    );
  }
}

function parseInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function parseDay(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}
