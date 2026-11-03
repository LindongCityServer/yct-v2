import { NextRequest, NextResponse } from 'next/server';
import { createApiMeta } from '../../../../lib/api-meta';
import {
  buildHolidayCalendarStates,
  readHolidayCalendarYears,
} from '../../../../lib/holiday-calendar-store';
import { ensureHolidayCalendarFreshness } from '../../../../lib/holiday-calendar-fetcher';

export const dynamic = 'force-dynamic';

/** 浏览器只访问本站接口；第三方节假日 API 一律由服务端拉取。 */
export async function GET(request: NextRequest) {
  const years = parseYears(request.nextUrl.searchParams);
  if (years.length === 0) {
    return NextResponse.json(
      { error: 'invalid_holiday_calendar_years', message: '请提供 1–3 个有效年份。' },
      { status: 400 },
    );
  }

  for (const year of years) {
    void ensureHolidayCalendarFreshness(year);
  }

  const results = await readHolidayCalendarYears(years);
  return NextResponse.json({
    meta: createApiMeta('ready'),
    years: buildHolidayCalendarStates(results),
    snapshots: results.flatMap((result) =>
      result.status === 'ready' && result.snapshot ? [result.snapshot] : [],
    ),
  });
}

function parseYears(params: URLSearchParams): number[] {
  const raw = params.get('years') ?? params.get('year') ?? '';
  const years = raw
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);
  return [...new Set(years)].slice(0, 3);
}
