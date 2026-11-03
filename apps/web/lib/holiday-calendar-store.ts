import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  HolidayCalendarDay,
  HolidayCalendarDayKind,
  HolidayCalendarSource,
  HolidayCalendarYearSnapshot,
  HolidayCalendarYearState,
} from '@yct/contracts';
import { createTimedKeyedCache } from './server-cache';
import { readRuntimeConfig } from './runtime-config';
import { holidayCalendarSeeds } from './holiday-calendar-seed';

export interface HolidayCalendarYearReadResult {
  year: number;
  status: 'ready' | 'missing';
  snapshot?: HolidayCalendarYearSnapshot;
  /** snapshot 来自磁盘还是冷启动种子。 */
  origin?: 'snapshot' | 'seed';
  message?: string;
}

const yearCache = createTimedKeyedCache<HolidayCalendarYearReadResult>(60 * 1000);

export function clearHolidayCalendarCache(): void {
  yearCache.clear();
}

export async function readHolidayCalendarYear(
  year: number,
): Promise<HolidayCalendarYearReadResult> {
  return yearCache.read(String(year), () => loadHolidayCalendarYear(year));
}

export async function readHolidayCalendarYears(
  years: readonly number[],
): Promise<HolidayCalendarYearReadResult[]> {
  const uniqueYears = [...new Set(years.filter((year) => Number.isInteger(year)))].sort(
    (left, right) => left - right,
  );
  return Promise.all(uniqueYears.map((year) => readHolidayCalendarYear(year)));
}

export function buildHolidayCalendarStates(
  results: readonly HolidayCalendarYearReadResult[],
): HolidayCalendarYearState[] {
  return results.map((result) =>
    result.status === 'ready' && result.snapshot
      ? {
          year: result.year,
          status: 'ready',
          source: result.snapshot.source,
          fetchedAt: result.snapshot.fetchedAt,
        }
      : {
          year: result.year,
          status: 'missing',
          message: result.message ?? `${result.year} 年节假日日历尚未收录。`,
        },
  );
}

export async function writeHolidayCalendarSnapshot(
  snapshot: HolidayCalendarYearSnapshot,
): Promise<HolidayCalendarYearSnapshot> {
  const normalized = normalizeHolidayCalendarSnapshot(snapshot);
  const directory = readRuntimeConfig().holidayCalendarDir;
  await mkdir(directory, { recursive: true });
  const targetPath = path.join(directory, `${normalized.year}.json`);
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  const previousPath = path.join(directory, `${normalized.year}.previous.json`);

  // 原子写：临时文件 + rename；上一版保留为 *.previous.json 供回滚。
  await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  try {
    const current = await readFile(targetPath, 'utf8');
    await writeFile(previousPath, current, 'utf8');
  } catch {
    // 首次写入没有旧快照，忽略即可。
  }
  await rename(temporaryPath, targetPath);
  clearHolidayCalendarCache();
  return normalized;
}

/** 结构校验：年份一致、日期合法且在当年、无重复、无放假日/调休日冲突。 */
export function normalizeHolidayCalendarSnapshot(
  value: HolidayCalendarYearSnapshot,
): HolidayCalendarYearSnapshot {
  if (!Number.isInteger(value.year) || value.year < 2000 || value.year > 2100) {
    throw new Error('节假日快照年份非法。');
  }
  if (!Array.isArray(value.days) || value.days.length === 0) {
    throw new Error(`${value.year} 年节假日快照为空，拒绝写入。`);
  }

  const seen = new Map<string, HolidayCalendarDayKind>();
  const papers = Array.isArray(value.papers)
    ? [...new Set(value.papers.filter((paper) => typeof paper === 'string' && paper.trim()))]
    : [];

  const days: HolidayCalendarDay[] = value.days.map((day) => {
    const date = day.date?.trim();
    const name = day.name?.trim() || '节假日';
    const kind = day.kind;
    if (!isIsoCalendarDate(date)) {
      throw new Error(`节假日快照包含非法日期：${day.date}`);
    }
    if (!date.startsWith(`${value.year}-`)) {
      throw new Error(`${value.year} 年快照包含跨年日期：${date}`);
    }
    if (kind !== 'holiday' && kind !== 'makeup_workday') {
      throw new Error(`节假日快照包含未知类型：${String(kind)}`);
    }

    const previous = seen.get(date);
    if (previous && previous !== kind) {
      throw new Error(`${date} 同时被标记为放假日与调休上班日，拒绝写入。`);
    }
    seen.set(date, kind);
    return { date, name, kind };
  });

  return {
    version: 1,
    year: value.year,
    source: normalizeSource(value.source),
    sourceUrl: value.sourceUrl,
    fetchedAt: value.fetchedAt,
    papers,
    days: days.sort((left, right) => left.date.localeCompare(right.date)),
  };
}

function normalizeSource(value: HolidayCalendarSource): HolidayCalendarSource {
  if (value === 'holiday-cn' || value === 'timor.tech' || value === 'seed') {
    return value;
  }

  throw new Error(`未知节假日数据源：${String(value)}`);
}

async function loadHolidayCalendarYear(year: number): Promise<HolidayCalendarYearReadResult> {
  const directory = readRuntimeConfig().holidayCalendarDir;
  try {
    const text = await readFile(path.join(directory, `${year}.json`), 'utf8');
    const snapshot = normalizeHolidayCalendarSnapshot(
      JSON.parse(text) as HolidayCalendarYearSnapshot,
    );
    return { year, status: 'ready', snapshot, origin: 'snapshot' };
  } catch (error) {
    const seed = holidayCalendarSeeds.find((item) => item.year === year);
    if (seed) {
      return {
        year,
        status: 'ready',
        snapshot: normalizeHolidayCalendarSnapshot(seed),
        origin: 'seed',
      };
    }

    const message =
      error instanceof Error && 'code' in error && error.code === 'ENOENT'
        ? `${year} 年节假日日历尚未收录，相关日期判定为未知。`
        : `${year} 年节假日快照不可用（${error instanceof Error ? error.message : String(error)}），相关日期判定为未知。`;
    console.warn(`[holiday-calendar] ${message}`);
    return { year, status: 'missing', message };
  }
}

function isIsoCalendarDate(value: string | undefined): value is string {
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
