import assert from 'node:assert/strict';
import type { HolidayCalendarYearSnapshot, TravelOperatingCalendar } from '@yct/contracts';
import { travelOperatingCalendarSchema } from '@yct/schemas';
import {
  buildOperatingDayPreview,
  createHolidayLookup,
  deriveOperatingDays,
  deriveTravelTripKey,
  ensureTravelTripKey,
  getOperatingCalendarConflict,
  getOperatingWeekdayKey,
  resolveOperatingDay,
  resolveTripOperatingDay,
  toShanghaiDateString,
} from '../../apps/web/lib/operating-calendar';
import {
  parseHolidayCnPayload,
  parseTimorTechPayload,
  refreshHolidayCalendarYear,
  type HolidayCalendarFetchDeps,
} from '../../apps/web/lib/holiday-calendar-fetcher';
import { normalizeHolidayCalendarSnapshot } from '../../apps/web/lib/holiday-calendar-store';
import { holidayCalendarSeeds } from '../../apps/web/lib/holiday-calendar-seed';

const year2025 = holidayCalendarSeeds.find((item) => item.year === 2025);
const year2026 = holidayCalendarSeeds.find((item) => item.year === 2026);
assert.ok(year2025 && year2026, '种子数据应包含 2025、2026 年');

const holiday2026 = createHolidayLookup([year2026]);
const holidayBoth = createHolidayLookup([year2025, year2026]);
const holidayNone = createHolidayLookup([]);

let failureCount = 0;
function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failureCount += 1;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

async function asyncTest(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failureCount += 1;
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.message : error);
  }
}

function buildTrip(overrides: Record<string, unknown> = {}) {
  return {
    tripInstanceId: 'trip-1',
    serviceKind: 'coach' as const,
    departureTime: '08:00',
    lineName: '雨城—临东',
    serviceId: 'svc-1',
    stationNames: ['雨城汽车站', '临东客运站'],
    originStationName: '雨城汽车站',
    destinationStationName: '临东客运站',
    availability: 'available' as const,
    operatingCalendar: undefined,
    ...overrides,
  };
}

test('上海本地日期不使用 UTC 截断', () => {
  assert.equal(toShanghaiDateString(new Date('2026-12-31T16:30:00Z')), '2027-01-01');
  assert.equal(toShanghaiDateString(new Date('2026-12-31T15:59:00Z')), '2026-12-31');
});

test('星期计算与服务器时区无关', () => {
  assert.equal(getOperatingWeekdayKey('2026-01-04'), 'SUN');
  assert.equal(getOperatingWeekdayKey('2026-01-10'), 'SAT');
  assert.equal(getOperatingWeekdayKey('2026-10-01'), 'THU');
});

test('tripKey 对同一业务班次稳定、对不同发班时刻独立', () => {
  const first = buildTrip();
  const second = buildTrip({ tripInstanceId: 'trip-2' });
  assert.equal(deriveTravelTripKey(first), deriveTravelTripKey(second));
  assert.notEqual(
    deriveTravelTripKey(first),
    deriveTravelTripKey(buildTrip({ departureTime: '09:00' })),
  );
  assert.equal(
    deriveTravelTripKey(buildTrip({ serviceId: undefined })),
    deriveTravelTripKey(buildTrip({ serviceId: undefined, tripInstanceId: 'trip-3' })),
  );
});

test('缺少发班时刻时 tripKey 标记 legacy_unkeyed', () => {
  const trip = buildTrip({ departureTime: undefined, operatingCalendar: undefined });
  const result = ensureTravelTripKey(trip as never);
  assert.equal(result.tripKey, undefined);
  assert.equal(result.tripKeyStatus, 'legacy_unkeyed');
  assert.equal(
    resolveTripOperatingDay(
      {
        operatingCalendar: { version: 1, patterns: ['WORKDAY'] },
        tripKeyStatus: 'legacy_unkeyed',
      },
      '2026-10-09',
      holiday2026,
    ).status,
    'unknown',
  );
});

test('同线路不同班次拥有独立规则', () => {
  const holidayTrip = buildTrip({
    tripInstanceId: 'trip-a',
    departureTime: '08:00',
    operatingCalendar: { version: 1, patterns: ['WORKDAY', 'HOLIDAY'] },
  });
  const weekdayTrip = buildTrip({
    tripInstanceId: 'trip-b',
    departureTime: '10:00',
    operatingCalendar: { version: 1, patterns: ['WORKDAY'] },
  });
  assert.equal(
    resolveTripOperatingDay(holidayTrip, '2026-10-01', holiday2026).status,
    'open',
    '班次 A 法定节假日应营业',
  );
  assert.equal(
    resolveTripOperatingDay(weekdayTrip, '2026-10-01', holiday2026).status,
    'closed',
    '班次 B 法定节假日应停运',
  );
});

test('缓冲日停运优先于调休上班日', () => {
  const calendar: TravelOperatingCalendar = {
    version: 1,
    patterns: ['WORKDAY', 'MAKEUP_WORKDAY'],
    bufferDays: [{ from: '2026-02-14', to: '2026-02-14', mode: 'closed' }],
  };
  const decision = resolveOperatingDay(calendar, '2026-02-14', holiday2026);
  assert.equal(decision.status, 'closed');
  assert.equal(decision.reason, 'buffer_closed');
});

test('缓冲日按节假日规则运营时，即使调休上班也按 HOLIDAY 处理', () => {
  const openCalendar: TravelOperatingCalendar = {
    version: 1,
    patterns: ['WORKDAY', 'HOLIDAY', 'MAKEUP_WORKDAY'],
    bufferDays: [{ from: '2026-01-31', to: '2026-02-08', mode: 'holiday' }],
  };
  const closedCalendar: TravelOperatingCalendar = {
    version: 1,
    patterns: ['WORKDAY'],
    bufferDays: [{ from: '2026-01-31', to: '2026-02-08', mode: 'holiday' }],
  };
  // 2026-02-07 为周六，不在法定节假日表中，缓冲日应覆盖为“按节假日”。
  assert.equal(resolveOperatingDay(openCalendar, '2026-02-07', holiday2026).status, 'open');
  assert.equal(resolveOperatingDay(closedCalendar, '2026-02-07', holiday2026).status, 'closed');
  assert.equal(
    resolveOperatingDay(openCalendar, '2026-02-28', holiday2026).status,
    'open',
    '缓冲日结束后应回到调休上班日规则',
  );
  assert.equal(
    resolveOperatingDay(openCalendar, '2026-02-28', holiday2026).reason,
    'makeup_workday_open',
  );
});

test('调休上班日按 MAKEUP_WORKDAY 判定，不被普通工作日覆盖', () => {
  const calendar: TravelOperatingCalendar = { version: 1, patterns: ['WORKDAY'] };
  assert.equal(resolveOperatingDay(calendar, '2026-01-04', holiday2026).status, 'closed');
  assert.equal(
    resolveOperatingDay(calendar, '2026-01-04', holiday2026).reason,
    'makeup_workday_closed',
  );
  const makeupCalendar: TravelOperatingCalendar = {
    version: 1,
    patterns: ['WORKDAY', 'MAKEUP_WORKDAY'],
  };
  assert.equal(resolveOperatingDay(makeupCalendar, '2026-01-04', holiday2026).status, 'open');
});

test('法定节假日、周末、普通工作日按 patterns 判定', () => {
  assert.equal(
    resolveOperatingDay({ version: 1, patterns: ['WORKDAY'] }, '2026-10-01', holiday2026).status,
    'closed',
  );
  assert.equal(
    resolveOperatingDay({ version: 1, patterns: ['WORKDAY', 'HOLIDAY'] }, '2026-10-01', holiday2026)
      .reason,
    'holiday_open',
  );
  assert.equal(
    resolveOperatingDay({ version: 1, patterns: ['WORKDAY'] }, '2026-01-10', holiday2026).status,
    'closed',
  );
  assert.equal(
    resolveOperatingDay({ version: 1, patterns: ['WORKDAY', 'WEEKEND'] }, '2026-01-10', holiday2026)
      .status,
    'open',
  );
  assert.equal(
    resolveOperatingDay({ version: 1, patterns: ['WORKDAY'] }, '2026-10-09', holiday2026).status,
    'open',
  );
});

test('人工指定日期优先级最高', () => {
  const calendar: TravelOperatingCalendar = {
    version: 1,
    patterns: ['WORKDAY'],
    overrides: [{ date: '2026-10-02', mode: 'open' }],
  };
  assert.equal(resolveOperatingDay(calendar, '2026-10-02', holiday2026).status, 'open');
  assert.equal(resolveOperatingDay(calendar, '2026-10-02', holiday2026).reason, 'override_open');
});

test('当年快照缺失时返回 unknown，绝不静默当工作日', () => {
  const calendar: TravelOperatingCalendar = { version: 1, patterns: ['WORKDAY'] };
  const decision = resolveOperatingDay(calendar, '2027-01-04', holidayNone);
  assert.equal(decision.status, 'unknown');
  assert.equal(decision.reason, 'calendar_missing');
});

test('跨年：12/31 使用 2026 快照，1/1 使用 2027 缺失状态', () => {
  const calendar: TravelOperatingCalendar = { version: 1, patterns: ['WORKDAY'] };
  assert.equal(resolveOperatingDay(calendar, '2026-12-31', holidayBoth).status, 'open');
  assert.equal(resolveOperatingDay(calendar, '2027-01-01', holidayBoth).status, 'unknown');
  assert.equal(resolveOperatingDay(calendar, '2027-01-01', holidayBoth).reason, 'calendar_missing');
});

test('未配置结构化日历的旧班次返回 unconfigured', () => {
  assert.equal(
    resolveTripOperatingDay(buildTrip(), '2026-10-01', holiday2026).status,
    'unconfigured',
  );
});

test('patterns 派生旧星期码', () => {
  assert.deepEqual(deriveOperatingDays(['WORKDAY']), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
  assert.deepEqual(deriveOperatingDays(['WORKDAY', 'WEEKEND']), [
    'MON',
    'TUE',
    'WED',
    'THU',
    'FRI',
    'SAT',
    'SUN',
  ]);
  assert.equal(deriveOperatingDays(['HOLIDAY']), undefined);
});

test('未来 7 天预览连续且跨年不串数据', () => {
  const calendar: TravelOperatingCalendar = { version: 1, patterns: ['WORKDAY'] };
  const preview = buildOperatingDayPreview(
    { operatingCalendar: calendar },
    '2026-12-28',
    holidayBoth,
    7,
  );
  assert.equal(preview.length, 7);
  assert.equal(preview.at(-1)?.date, '2027-01-03');
  assert.equal(preview.at(-1)?.status, 'unknown');
});

test('同一日期同时营业与停运时 schema 拒绝保存', () => {
  const calendar = {
    version: 1 as const,
    patterns: ['WORKDAY' as const],
    bufferDays: [{ from: '2026-10-01', to: '2026-10-03', mode: 'closed' as const }],
    overrides: [{ date: '2026-10-02', mode: 'open' as const }],
  };
  const parsed = travelOperatingCalendarSchema.safeParse(calendar);
  assert.equal(parsed.success, false);
  const message = parsed.success ? '' : (parsed.error.issues[0]?.message ?? '');
  assert.match(message, /2026-10-02 同时被设为营业和停运/);
  assert.equal(
    getOperatingCalendarConflict(calendar),
    '2026-10-02 同时被设为营业和停运，请保留一条。',
  );
});

test('合法日历通过 schema 校验', () => {
  const parsed = travelOperatingCalendarSchema.safeParse({
    version: 1,
    patterns: ['WORKDAY', 'WEEKEND'],
    bufferDays: [{ from: '2026-02-14', to: '2026-02-28', mode: 'holiday', anchor: '春节' }],
    overrides: [{ from: '2026-05-01', to: '2026-05-05', mode: 'open' }],
  });
  assert.equal(parsed.success, true);
});

test('节假日快照结构校验拒绝空快照与跨年数据', () => {
  assert.throws(
    () =>
      normalizeHolidayCalendarSnapshot({
        version: 1,
        year: 2027,
        source: 'seed',
        fetchedAt: '2026-11-03T00:00:00+08:00',
        days: [],
      }),
    /为空/,
  );
  assert.throws(
    () =>
      normalizeHolidayCalendarSnapshot({
        version: 1,
        year: 2026,
        source: 'seed',
        fetchedAt: '2026-11-03T00:00:00+08:00',
        days: [{ date: '2027-01-01', name: '元旦', kind: 'holiday' }],
      }),
    /跨年/,
  );
});

test('holiday-cn 与 timor.tech 归一化', () => {
  assert.deepEqual(
    parseHolidayCnPayload(
      { year: 2026, days: [{ name: '元旦', date: '2026-01-01', isOffDay: true }] },
      2026,
    ),
    [{ date: '2026-01-01', name: '元旦', kind: 'holiday' }],
  );
  assert.deepEqual(parseHolidayCnPayload({ year: 2027, days: [] }, 2027), []);
  assert.throws(() => parseHolidayCnPayload({ year: 2027, days: [] }, 2026), /年份不一致/);
  assert.deepEqual(
    parseTimorTechPayload(
      {
        code: 0,
        holiday: { '01-01': { holiday: true, name: '元旦', date: '2026-01-01' } },
      },
      2026,
    ),
    [{ date: '2026-01-01', name: '元旦', kind: 'holiday' }],
  );
  assert.deepEqual(
    parseTimorTechPayload({ code: 0, holiday: {} }, 2027),
    [],
    '空占位应视为尚未发布',
  );
});

const timorPayload = {
  code: 0,
  holiday: {
    '10-01': { holiday: true, name: '国庆节', date: '2026-10-01' },
    '10-10': { holiday: false, name: '调休', date: '2026-10-10' },
  },
};

await asyncTest('主源超时后降级到备源', async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('holiday-cn')) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return new Response(JSON.stringify(timorPayload), { status: 200 });
  }) as typeof fetch;

  const result = await refreshHolidayCalendarYear(2026, {
    persist: false,
    force: true,
    deps: { fetchImpl, sleep: async () => {} },
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'timor.tech');
  assert.equal(result.snapshot?.days.length, 2);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0]?.message ?? '', /超时/);
});

await asyncTest('双源失败时降级为失败结果且不写空快照', async () => {
  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  const result = await refreshHolidayCalendarYear(2026, {
    persist: false,
    force: true,
    deps: { fetchImpl, sleep: async () => {} },
  });
  assert.equal(result.ok, false);
  assert.equal(result.snapshot, undefined);
  assert.equal(result.failures.length, 2);
  assert.match(result.message, /刷新失败/);
});

await asyncTest('双源空占位时保留已有快照并给出公告未发布说明', async () => {
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    return url.includes('holiday-cn')
      ? new Response(JSON.stringify({ year: 2027, days: [] }), { status: 200 })
      : new Response(JSON.stringify({ code: 0, holiday: {} }), { status: 200 });
  }) as typeof fetch;

  const result = await refreshHolidayCalendarYear(2027, {
    persist: false,
    force: true,
    deps: { fetchImpl, sleep: async () => {} },
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /公告尚未发布/);
});

await asyncTest('429 限流按 Retry-After 退避后仍可成功', async () => {
  let attempts = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('holiday-cn')) {
      attempts += 1;
      if (attempts === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'retry-after': '1' },
        });
      }
      return new Response(
        JSON.stringify({
          year: 2026,
          days: [{ name: '国庆节', date: '2026-10-01', isOffDay: true }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(timorPayload), { status: 200 });
  }) as typeof fetch;
  const sleeps: number[] = [];

  const result = await refreshHolidayCalendarYear(2026, {
    persist: false,
    force: true,
    deps: {
      fetchImpl,
      sleep: async (milliseconds: number) => {
        sleeps.push(milliseconds);
      },
    } satisfies HolidayCalendarFetchDeps,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'holiday-cn');
  assert.deepEqual(sleeps, [1000]);
});

if (failureCount > 0) {
  console.error(`\n${failureCount} 项检查失败`);
  process.exitCode = 1;
} else {
  console.log('\n全部运营日历检查通过');
}
