import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  buildHolidayCalendarStates,
  readHolidayCalendarYears,
} from '../../../../../lib/holiday-calendar-store';
import {
  isHolidayCalendarRefreshPending,
  refreshHolidayCalendarYear,
} from '../../../../../lib/holiday-calendar-fetcher';
import { getShanghaiYear } from '../../../../../lib/operating-calendar';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const currentYear = getShanghaiYear();
  const years = [currentYear, currentYear + 1];
  const results = await readHolidayCalendarYears(years);
  return NextResponse.json({
    years: buildHolidayCalendarStates(results).map((state) => ({
      ...state,
      refreshing: isHolidayCalendarRefreshPending(state.year),
    })),
    snapshots: results.flatMap((result) =>
      result.status === 'ready' && result.snapshot ? [result.snapshot] : [],
    ),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => null)) as { year?: unknown } | null;
  const year = Number(body?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: 'invalid_holiday_calendar_year', message: '请提供有效年份。' },
      { status: 400 },
    );
  }

  const result = await refreshHolidayCalendarYear(year, { force: true, persist: true });
  const results = await readHolidayCalendarYears([year]);
  return NextResponse.json(
    {
      result,
      years: buildHolidayCalendarStates(results),
    },
    { status: result.ok ? 200 : 502 },
  );
}
