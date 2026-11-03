import type {
  HolidayCalendarDay,
  HolidayCalendarSource,
  HolidayCalendarYearSnapshot,
} from '@yct/contracts';
import {
  normalizeHolidayCalendarSnapshot,
  readHolidayCalendarYear,
  writeHolidayCalendarSnapshot,
} from './holiday-calendar-store';
import { getShanghaiYear, toShanghaiDateString } from './operating-calendar';

export const holidayCalendarPrimarySourceUrl =
  'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master';
export const holidayCalendarSecondarySourceUrl = 'https://timor.tech/api/holiday/year';

const requestTimeoutMs = 4000;
const maxRetries = 2;
const retryBaseDelayMs = 600;
const maxRetryAfterMs = 5000;
const staleRefreshAgeMs = 30 * 24 * 60 * 60 * 1000;

export interface HolidayCalendarFetchDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface HolidayCalendarFetchFailure {
  source: HolidayCalendarSource;
  message: string;
}

export interface HolidayCalendarRefreshResult {
  year: number;
  ok: boolean;
  source?: HolidayCalendarSource;
  snapshot?: HolidayCalendarYearSnapshot;
  message: string;
  failures: HolidayCalendarFetchFailure[];
}

const inflightRefreshes = new Map<number, Promise<HolidayCalendarRefreshResult>>();
const lastAttemptDate = new Map<number, string>();

/**
 * 手动/自动刷新入口。默认单飞：同一年的并发刷新复用同一个 Promise。
 */
export async function refreshHolidayCalendarYear(
  year: number,
  options: { force?: boolean; persist?: boolean; deps?: HolidayCalendarFetchDeps } = {},
): Promise<HolidayCalendarRefreshResult> {
  const existing = inflightRefreshes.get(year);
  if (existing) {
    return existing;
  }

  const promise = runRefresh(year, options).finally(() => {
    inflightRefreshes.delete(year);
  });
  inflightRefreshes.set(year, promise);
  return promise;
}

/**
 * 查询路径上的非阻塞刷新：进程内按日节流，失败只告警，绝不阻塞用户请求。
 */
export function maybeRefreshHolidayCalendarYear(year: number): void {
  lastAttemptDate.set(year, toShanghaiDateString());
  void refreshHolidayCalendarYear(year, { persist: true }).catch((error) => {
    console.warn(
      `[holiday-calendar] 自动刷新 ${year} 年失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/**
 * 自动刷新策略：当年缺失则刷新；快照超过 30 天刷新；11–12 月额外预热次年。
 */
export async function ensureHolidayCalendarFreshness(year: number): Promise<void> {
  const today = toShanghaiDateString();
  if (lastAttemptDate.get(year) === today) {
    return;
  }

  const result = await readHolidayCalendarYear(year);
  const stale =
    result.status === 'ready' && result.snapshot
      ? Date.now() - Date.parse(result.snapshot.fetchedAt) > staleRefreshAgeMs
      : false;
  if (result.status === 'missing' || stale) {
    maybeRefreshHolidayCalendarYear(year);
  }
}

export function isHolidayCalendarRefreshPending(year: number): boolean {
  return inflightRefreshes.has(year);
}

export function buildHolidayCalendarFetchUrl(source: HolidayCalendarSource, year: number): string {
  return source === 'holiday-cn'
    ? `${holidayCalendarPrimarySourceUrl}/${year}.json`
    : `${holidayCalendarSecondarySourceUrl}/${year}`;
}

/** 解析 holiday-cn 静态 JSON；空占位返回 undefined。 */
export function parseHolidayCnPayload(value: unknown, year: number): HolidayCalendarDay[] {
  const payload = value as { year?: unknown; days?: unknown };
  if (typeof payload?.year !== 'number' || payload.year !== year) {
    throw new Error(`holiday-cn 返回年份不一致（期望 ${year}）。`);
  }
  if (!Array.isArray(payload.days) || payload.days.length === 0) {
    return [];
  }

  return payload.days.map((item) => {
    const day = item as { date?: unknown; name?: unknown; isOffDay?: unknown };
    if (typeof day.date !== 'string' || typeof day.isOffDay !== 'boolean') {
      throw new Error('holiday-cn 数据结构异常。');
    }
    if (!day.date.startsWith(`${year}-`)) {
      throw new Error(`holiday-cn 返回跨年日期：${day.date}`);
    }

    return {
      date: day.date,
      name: typeof day.name === 'string' && day.name.trim() ? day.name.trim() : '节假日',
      kind: day.isOffDay ? 'holiday' : 'makeup_workday',
    };
  });
}

/** 解析 timor.tech 返回；空占位返回 undefined。 */
export function parseTimorTechPayload(value: unknown, year: number): HolidayCalendarDay[] {
  const payload = value as {
    code?: unknown;
    holiday?: unknown;
  };
  if (payload?.code !== 0 || !payload.holiday || typeof payload.holiday !== 'object') {
    throw new Error('timor.tech 返回结构异常。');
  }

  const entries = Object.values(payload.holiday as Record<string, unknown>);
  if (entries.length === 0) {
    return [];
  }

  return entries.map((item) => {
    const day = item as { date?: unknown; name?: unknown; holiday?: unknown };
    if (typeof day.date !== 'string' || typeof day.holiday !== 'boolean') {
      throw new Error('timor.tech 数据结构异常。');
    }
    if (!day.date.startsWith(`${year}-`)) {
      throw new Error(`timor.tech 返回跨年日期：${day.date}`);
    }

    return {
      date: day.date,
      name: typeof day.name === 'string' && day.name.trim() ? day.name.trim() : '节假日',
      // holiday=true 表示放假日，false 表示补班（调休上班日）。
      kind: day.holiday ? 'holiday' : 'makeup_workday',
    };
  });
}

async function runRefresh(
  year: number,
  options: { force?: boolean; persist?: boolean; deps?: HolidayCalendarFetchDeps },
): Promise<HolidayCalendarRefreshResult> {
  const deps = options.deps ?? {};
  const persist = options.persist ?? true;
  const today = toShanghaiDateString(deps.now?.() ?? new Date());
  const failures: HolidayCalendarFetchFailure[] = [];

  if (!options.force && persist) {
    const existing = await readHolidayCalendarYear(year);
    if (
      lastAttemptDate.get(year) === today &&
      existing.status === 'ready' &&
      existing.origin === 'snapshot'
    ) {
      return {
        year,
        ok: true,
        snapshot: existing.snapshot,
        source: existing.snapshot?.source,
        message: `${year} 年节假日快照今日已刷新，跳过重复请求。`,
        failures,
      };
    }
  }

  lastAttemptDate.set(year, today);
  const primary = await fetchSource('holiday-cn', year, deps, failures);
  const secondary = await fetchSource('timor.tech', year, deps, failures);

  const chosen = primary.days?.length ? primary : secondary;
  if (!chosen.days?.length) {
    const message =
      failures.length > 0
        ? `${year} 年节假日刷新失败：${failures.map((failure) => failure.message).join('；')}`
        : `${year} 年节假日公告尚未发布（数据源为空占位），保留已有快照。`;
    console.warn(`[holiday-calendar] ${message}`);
    return { year, ok: false, message, failures };
  }

  if (primary.days?.length && secondary.days?.length) {
    const discrepancy = compareHolidayCalendarDays(primary.days, secondary.days);
    if (discrepancy) {
      console.warn(`[holiday-calendar] ${year} 年主备数据源差异：${discrepancy}`);
    }
  }

  try {
    const snapshot = normalizeHolidayCalendarSnapshot({
      version: 1,
      year,
      source: chosen.source,
      sourceUrl: chosen.sourceUrl,
      fetchedAt: new Date(deps.now?.() ?? new Date()).toISOString(),
      papers: chosen.papers,
      days: chosen.days,
    });

    if (persist) {
      await writeHolidayCalendarSnapshot(snapshot);
    }

    return {
      year,
      ok: true,
      source: snapshot.source,
      snapshot,
      message: `${year} 年节假日快照已更新（${snapshot.days.length} 条，来源 ${snapshot.source}）。`,
      failures,
    };
  } catch (error) {
    const message = `${year} 年节假日数据校验失败：${
      error instanceof Error ? error.message : String(error)
    }`;
    console.warn(`[holiday-calendar] ${message}`);
    return { year, ok: false, message, failures };
  }
}

async function fetchSource(
  source: HolidayCalendarSource,
  year: number,
  deps: HolidayCalendarFetchDeps,
  failures: HolidayCalendarFetchFailure[],
): Promise<{
  source: HolidayCalendarSource;
  sourceUrl: string;
  days?: HolidayCalendarDay[];
  papers?: string[];
}> {
  const sourceUrl = buildHolidayCalendarFetchUrl(source, year);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? delay;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(sourceUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'user-agent': 'yct-holiday-calendar/1.0',
        },
      });

      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        if (attempt < maxRetries) {
          await sleep(Math.min(retryAfter ?? retryBaseDelayMs, maxRetryAfterMs));
          continue;
        }
        throw new Error('数据源触发限流（429）。');
      }

      if (!response.ok) {
        throw new Error(`数据源返回 HTTP ${response.status}。`);
      }

      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('数据源返回的不是 JSON。');
      }
      const days =
        source === 'holiday-cn'
          ? parseHolidayCnPayload(payload, year)
          : parseTimorTechPayload(payload, year);
      const papers =
        source === 'holiday-cn' && Array.isArray((payload as { papers?: unknown }).papers)
          ? ((payload as { papers: string[] }).papers ?? [])
          : [];
      return { source, sourceUrl, days, papers };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const message = isAbort
        ? `${source} 请求超时（${requestTimeoutMs}ms）。`
        : `${source} 请求失败：${error instanceof Error ? error.message : String(error)}`;
      if (attempt < maxRetries) {
        await sleep(retryBaseDelayMs * 2 ** attempt);
        continue;
      }
      failures.push({ source, message });
      return { source, sourceUrl };
    } finally {
      clearTimeout(timer);
    }
  }

  return { source, sourceUrl };
}

function compareHolidayCalendarDays(
  primary: readonly HolidayCalendarDay[],
  secondary: readonly HolidayCalendarDay[],
): string | undefined {
  const primaryMap = new Map(primary.map((day) => [day.date, day.kind]));
  const secondaryMap = new Map(secondary.map((day) => [day.date, day.kind]));
  const differences: string[] = [];
  for (const [date, kind] of primaryMap) {
    const other = secondaryMap.get(date);
    if (!other) {
      differences.push(`${date} 仅主源列出`);
    } else if (other !== kind) {
      differences.push(`${date} 类型不一致（主源 ${kind} / 备源 ${other}）`);
    }
  }
  for (const date of secondaryMap.keys()) {
    if (!primaryMap.has(date)) {
      differences.push(`${date} 仅备源列出`);
    }
  }

  return differences.length > 0 ? differences.slice(0, 5).join('；') : undefined;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** 自动刷新时判断是否需要预热次年：11–12 月触发。 */
export function shouldPreloadNextYear(now: Date = new Date()): number | undefined {
  const currentYear = getShanghaiYear(now);
  const month = Number(toShanghaiDateString(now).slice(5, 7));
  return month >= 11 ? currentYear + 1 : undefined;
}
