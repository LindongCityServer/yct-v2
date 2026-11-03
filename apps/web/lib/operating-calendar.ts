import type {
  HolidayCalendarDayKind,
  HolidayCalendarYearSnapshot,
  TravelOperatingBufferMode,
  TravelOperatingCalendar,
  TravelOperatingOverrideMode,
  TravelOperatingPattern,
  TravelTripInstance,
} from '@yct/contracts';

export const shanghaiTimeZone = 'Asia/Shanghai';

export type OperatingDayStatus = 'open' | 'closed' | 'unknown' | 'unconfigured';

export type OperatingDayReason =
  | 'override_open'
  | 'override_closed'
  | 'buffer_closed'
  | 'buffer_holiday_open'
  | 'buffer_holiday_closed'
  | 'makeup_workday_open'
  | 'makeup_workday_closed'
  | 'holiday_open'
  | 'holiday_closed'
  | 'weekend_open'
  | 'weekend_closed'
  | 'workday_open'
  | 'workday_closed'
  | 'calendar_missing'
  | 'legacy_unkeyed'
  | 'invalid_date'
  | 'unconfigured';

export interface OperatingDayDecision {
  date: string;
  status: OperatingDayStatus;
  reason: OperatingDayReason;
}

export interface OperatingHolidayLookup {
  /** 对应年份是否已有可用快照；missing 时绝不把日期当普通工作日。 */
  getYearStatus(year: number): 'ready' | 'missing';
  /** 该日期在快照中的特殊日类型；普通日期返回 undefined。 */
  getDayKind(date: string): HolidayCalendarDayKind | undefined;
}

const shanghaiDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: shanghaiTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const shanghaiWeekdayKeys = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** 以 Asia/Shanghai 本地日期输出 YYYY-MM-DD，禁止使用 toISOString().slice(0, 10)。 */
export function toShanghaiDateString(date: Date = new Date()): string {
  const parts = shanghaiDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('无法解析 Asia/Shanghai 日期。');
  }

  return `${year}-${month}-${day}`;
}

export function getShanghaiYear(date: Date = new Date()): number {
  return Number(toShanghaiDateString(date).slice(0, 4));
}

export function isValidOperatingDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** 返回 0=周日 … 6=周六；纯日期计算，与服务器时区无关。 */
export function getOperatingWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function getOperatingWeekdayKey(date: string): string | undefined {
  if (!isValidOperatingDate(date)) {
    return undefined;
  }

  return shanghaiWeekdayKeys[getOperatingWeekday(date)];
}

export function addOperatingDays(date: string, amount: number): string {
  const value = Date.parse(`${date}T00:00:00Z`) + amount * 24 * 60 * 60 * 1000;
  return new Date(value).toISOString().slice(0, 10);
}

/** 展开闭区间；倒置区间按单日处理，避免产生空规则。 */
export function expandOperatingDateRange(from: string | undefined, to?: string): string[] {
  if (!isValidOperatingDate(from)) {
    return [];
  }

  const end = to && isValidOperatingDate(to) && to >= from ? to : from;
  const dates: string[] = [];
  for (let date = from; date <= end && dates.length < 366; date = addOperatingDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function isWeekendDate(date: string): boolean {
  const weekday = getOperatingWeekday(date);
  return weekday === 0 || weekday === 6;
}

/** 把 patterns 派生为旧版星期码，供旧消费者与小屏展示只读使用。 */
export function deriveOperatingDays(patterns: TravelOperatingPattern[]): string[] | undefined {
  const days = new Set<string>();
  if (patterns.includes('WORKDAY') || patterns.includes('MAKEUP_WORKDAY')) {
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      days.add(day);
    }
  }
  if (patterns.includes('WEEKEND')) {
    days.add('SAT');
    days.add('SUN');
  }

  return days.size > 0 ? [...days] : undefined;
}

const tripKeyScopeLengthLimit = 120;

/**
 * 演示稳定业务键：优先 serviceId，缺省回退 lineName；再拼发班时刻与 OD。
 * 使用 FNV-1a 32 位哈希，保证客户端 / 服务端结果一致且无加密依赖。
 */
export function deriveTravelTripKey(
  trip: Pick<
    TravelTripInstance,
    | 'serviceId'
    | 'lineName'
    | 'departureTime'
    | 'originStationName'
    | 'destinationStationName'
    | 'stationNames'
    | 'stopTimes'
  >,
): string | undefined {
  const departureTime = trip.departureTime?.trim();
  const scope = (trip.serviceId ?? trip.lineName)?.trim();
  const origin = resolveTripOrigin(trip);
  const destination = resolveTripDestination(trip);
  if (!departureTime || !scope || !origin || !destination) {
    return undefined;
  }

  const canonical = [
    scope.slice(0, tripKeyScopeLengthLimit),
    departureTime,
    origin,
    destination,
  ].join('\u0000');
  return `trip_${fnv1a32(canonical)}`;
}

export function ensureTravelTripKey(trip: TravelTripInstance): {
  tripKey?: string;
  tripKeyStatus: 'derived' | 'legacy_unkeyed';
} {
  const derived = deriveTravelTripKey(trip);
  if (trip.tripKey) {
    return { tripKey: trip.tripKey, tripKeyStatus: 'derived' };
  }

  return derived
    ? { tripKey: derived, tripKeyStatus: 'derived' }
    : { tripKey: undefined, tripKeyStatus: 'legacy_unkeyed' };
}

/** 读取路径上的惰性补算：只补内存对象，不改写磁盘，下一次保存时自然落盘。 */
export function withDerivedTripKey(trip: TravelTripInstance): TravelTripInstance {
  const derived = deriveTravelTripKey(trip);
  if (trip.tripKey || !derived) {
    return trip;
  }

  return { ...trip, tripKey: derived, tripKeyStatus: 'derived' };
}

function resolveTripOrigin(
  trip: Pick<TravelTripInstance, 'originStationName' | 'stationNames' | 'stopTimes'>,
): string | undefined {
  return (
    trip.originStationName?.trim() ||
    trip.stopTimes?.find((stopTime) => stopTime.isStop)?.stationName?.trim() ||
    trip.stationNames?.[0]?.trim() ||
    undefined
  );
}

function resolveTripDestination(
  trip: Pick<TravelTripInstance, 'destinationStationName' | 'stationNames' | 'stopTimes'>,
): string | undefined {
  const stopping = trip.stopTimes?.filter((stopTime) => stopTime.isStop) ?? [];
  return (
    trip.destinationStationName?.trim() ||
    stopping.at(-1)?.stationName?.trim() ||
    trip.stationNames?.at(-1)?.trim() ||
    undefined
  );
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function createHolidayLookup(
  snapshots: readonly HolidayCalendarYearSnapshot[],
): OperatingHolidayLookup {
  const daysByYear = new Map<number, Map<string, HolidayCalendarDayKind>>();
  for (const snapshot of snapshots) {
    const days = new Map<string, HolidayCalendarDayKind>();
    for (const day of snapshot.days) {
      days.set(day.date, day.kind);
    }
    daysByYear.set(snapshot.year, days);
  }

  return {
    getYearStatus(year) {
      return daysByYear.has(year) ? 'ready' : 'missing';
    },
    getDayKind(date) {
      return daysByYear.get(Number(date.slice(0, 4)))?.get(date);
    },
  };
}

export function createEmptyHolidayLookup(): OperatingHolidayLookup {
  return createHolidayLookup([]);
}

/**
 * 判定优先级（最高到最低）：
 * 人工指定日期/区间 > 自定义缓冲日（同属人工声明，保存时禁止同日冲突）
 * > 调休工作日 > 法定节假日 > 周末 > 默认工作日。
 */
export function resolveOperatingDay(
  calendar: TravelOperatingCalendar,
  date: string,
  holiday: OperatingHolidayLookup,
): OperatingDayDecision {
  if (!isValidOperatingDate(date)) {
    return { date, status: 'unknown', reason: 'invalid_date' };
  }

  const override = findOverride(calendar.overrides ?? [], date);
  if (override) {
    return {
      date,
      status: override === 'open' ? 'open' : 'closed',
      reason: override === 'open' ? 'override_open' : 'override_closed',
    };
  }

  const bufferMode = findBufferMode(calendar.bufferDays ?? [], date);
  if (bufferMode) {
    return resolveBufferDay(calendar.patterns, date, bufferMode);
  }

  const year = Number(date.slice(0, 4));
  if (holiday.getYearStatus(year) === 'missing') {
    return { date, status: 'unknown', reason: 'calendar_missing' };
  }

  const dayKind = holiday.getDayKind(date);
  if (dayKind === 'makeup_workday') {
    return resolvePatternDay(calendar.patterns, date, 'MAKEUP_WORKDAY', 'makeup_workday');
  }

  if (dayKind === 'holiday') {
    return resolvePatternDay(calendar.patterns, date, 'HOLIDAY', 'holiday');
  }

  if (isWeekendDate(date)) {
    return resolvePatternDay(calendar.patterns, date, 'WEEKEND', 'weekend');
  }

  return resolvePatternDay(calendar.patterns, date, 'WORKDAY', 'workday');
}

/** 班次级别判定；未配置结构化日历的旧数据返回 unconfigured，交由旧 operatingDays 逻辑处理。 */
export function resolveTripOperatingDay(
  trip: Pick<TravelTripInstance, 'operatingCalendar' | 'tripKey' | 'tripKeyStatus'>,
  date: string,
  holiday: OperatingHolidayLookup,
): OperatingDayDecision {
  if (!trip.operatingCalendar) {
    return { date, status: 'unconfigured', reason: 'unconfigured' };
  }

  if (trip.tripKeyStatus === 'legacy_unkeyed' && !trip.tripKey) {
    return { date, status: 'unknown', reason: 'legacy_unkeyed' };
  }

  return resolveOperatingDay(trip.operatingCalendar, date, holiday);
}

export function buildOperatingDayPreview(
  trip: Pick<TravelTripInstance, 'operatingCalendar' | 'tripKey' | 'tripKeyStatus'>,
  startDate: string,
  holiday: OperatingHolidayLookup,
  count = 7,
): OperatingDayDecision[] {
  if (!isValidOperatingDate(startDate) || count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) =>
    resolveTripOperatingDay(trip, addOperatingDays(startDate, index), holiday),
  );
}

export function formatOperatingDayStatusLabel(decision: OperatingDayDecision): string {
  if (decision.status === 'open') {
    return '营业';
  }
  if (decision.status === 'closed') {
    return '休息';
  }
  if (decision.status === 'unconfigured') {
    return '未设置规则';
  }
  return '未知';
}

export function formatOperatingDayReasonLabel(reason: OperatingDayReason): string {
  switch (reason) {
    case 'override_open':
      return '人工指定营业';
    case 'override_closed':
      return '人工指定停运';
    case 'buffer_closed':
      return '缓冲日停运';
    case 'buffer_holiday_open':
      return '缓冲日按节假日营业';
    case 'buffer_holiday_closed':
      return '缓冲日按节假日停运';
    case 'makeup_workday_open':
      return '调休上班日营业';
    case 'makeup_workday_closed':
      return '调休上班日停运';
    case 'holiday_open':
      return '法定节假日营业';
    case 'holiday_closed':
      return '法定节假日停运';
    case 'weekend_open':
      return '周末营业';
    case 'weekend_closed':
      return '周末停运';
    case 'workday_open':
      return '工作日营业';
    case 'workday_closed':
      return '工作日停运';
    case 'calendar_missing':
      return '当年节假日日历缺失';
    case 'legacy_unkeyed':
      return '缺少稳定班次标识';
    case 'invalid_date':
      return '日期非法';
    case 'unconfigured':
      return '未设置结构化规则';
  }
}

/** 供前端保存前预校验；服务端仍会由 zod 再校验一次。 */
export function getOperatingCalendarConflict(
  calendar: Pick<TravelOperatingCalendar, 'bufferDays' | 'overrides'>,
): string | undefined {
  const modesByDate = new Map<string, 'open' | 'closed'>();
  for (const bufferDay of calendar.bufferDays ?? []) {
    for (const date of expandOperatingDateRange(bufferDay.from, bufferDay.to)) {
      if (
        !recordOperatingMode(modesByDate, date, bufferDay.mode === 'closed' ? 'closed' : 'open')
      ) {
        return `${date} 同时被设为营业和停运，请保留一条。`;
      }
    }
  }

  for (const override of calendar.overrides ?? []) {
    const dates = override.date
      ? [override.date]
      : expandOperatingDateRange(override.from, override.to);
    for (const date of dates) {
      if (!recordOperatingMode(modesByDate, date, override.mode)) {
        return `${date} 同时被设为营业和停运，请保留一条。`;
      }
    }
  }

  return undefined;
}

function recordOperatingMode(
  modesByDate: Map<string, 'open' | 'closed'>,
  date: string,
  mode: 'open' | 'closed',
): boolean {
  const previous = modesByDate.get(date);
  if (previous && previous !== mode) {
    return false;
  }

  modesByDate.set(date, mode);
  return true;
}

function findOverride(
  overrides: NonNullable<TravelOperatingCalendar['overrides']>,
  date: string,
): TravelOperatingOverrideMode | undefined {
  for (const override of overrides) {
    const from = override.date ?? override.from;
    const to = override.date ?? override.to;
    if (from && to && date >= from && date <= to) {
      return override.mode;
    }
  }

  return undefined;
}

function findBufferMode(
  bufferDays: NonNullable<TravelOperatingCalendar['bufferDays']>,
  date: string,
): TravelOperatingBufferMode | undefined {
  for (const bufferDay of bufferDays) {
    const to = bufferDay.to ?? bufferDay.from;
    if (date >= bufferDay.from && date <= to) {
      return bufferDay.mode;
    }
  }

  return undefined;
}

function resolveBufferDay(
  patterns: TravelOperatingPattern[],
  date: string,
  mode: TravelOperatingBufferMode,
): OperatingDayDecision {
  if (mode === 'closed') {
    return { date, status: 'closed', reason: 'buffer_closed' };
  }

  const open = patterns.includes('HOLIDAY');
  return {
    date,
    status: open ? 'open' : 'closed',
    reason: open ? 'buffer_holiday_open' : 'buffer_holiday_closed',
  };
}

function resolvePatternDay(
  patterns: TravelOperatingPattern[],
  date: string,
  pattern: TravelOperatingPattern,
  reasonPrefix: 'makeup_workday' | 'holiday' | 'weekend' | 'workday',
): OperatingDayDecision {
  const open = patterns.includes(pattern);
  return {
    date,
    status: open ? 'open' : 'closed',
    reason: `${reasonPrefix}_${open ? 'open' : 'closed'}` as OperatingDayReason,
  };
}
