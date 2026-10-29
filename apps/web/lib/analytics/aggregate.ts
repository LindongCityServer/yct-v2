import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from '../runtime-config';
import {
  shiftAnalyticsDay,
  toAnalyticsDay,
  type AnalyticsProject,
  type DailyMetricRow,
  type DailyMetricsFile,
} from './schema';
import { createAnalyticsStore } from './store';
import type { AnalyticsStore } from './schema';

export interface AggregateResult {
  day: string;
  projects: Partial<Record<AnalyticsProject, DailyMetricRow[]>>;
}

export interface RunAggregationInput {
  /** 重算的天数（含当天），默认 3，用于覆盖延迟上报。 */
  days?: number;
  projects?: AnalyticsProject[];
  now?: Date;
  /** 是否顺带清理过期原始事件，默认开启。 */
  purge?: boolean;
  dbPath?: string;
  metricsFilePath?: string;
  retentionDays?: number;
}

export interface RunAggregationResult {
  results: AggregateResult[];
  purged: number;
  metricsFilePath: string;
}

/**
 * 按日聚合指标并写入快照文件。
 *
 * 指标写入使用主键覆盖，重复执行结果一致，因此无需分布式锁；
 * 清理只发生在已生成指标的日期范围内，避免删掉未聚合的数据。
 */
export async function runAggregation(
  input: RunAggregationInput = {},
): Promise<RunAggregationResult> {
  const config = readRuntimeConfig();
  const dbPath = input.dbPath ?? config.analyticsDbPath;
  const metricsFilePath = input.metricsFilePath ?? config.analyticsMetricsFilePath;
  const projects = input.projects?.length ? input.projects : (['yct'] as AnalyticsProject[]);
  const days = Math.min(Math.max(input.days ?? 3, 1), 90);
  const today = toAnalyticsDay(input.now ?? new Date());

  if (!today) {
    throw new Error('无法解析当前日期，聚合已终止。');
  }

  const store = createAnalyticsStore(dbPath);
  const results: AggregateResult[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftAnalyticsDay(today, -offset);
    const projectRows: Partial<Record<AnalyticsProject, DailyMetricRow[]>> = {};

    for (const project of projects) {
      const rows = await store.computeDayMetrics({ day, project });
      await store.replaceDailyMetrics(rows);
      projectRows[project] = rows;
    }

    results.push({ day, projects: projectRows });
  }

  await writeMetricsFile({ filePath: metricsFilePath, results });

  const purged =
    input.purge === false
      ? 0
      : await purgeExpiredEvents({
          store,
          projects,
          today,
          retentionDays: input.retentionDays ?? config.analyticsRetentionDays,
        });

  return { results, purged, metricsFilePath };
}

/** 合并写入日指标快照，保留文件中已有的其他日期。 */
export async function writeMetricsFile(input: {
  filePath: string;
  results: AggregateResult[];
}): Promise<void> {
  const existing = await readMetricsFile(input.filePath);
  const merged = new Map<string, Partial<Record<AnalyticsProject, DailyMetricRow[]>>>();

  for (const item of existing.days) {
    merged.set(item.day, item.projects);
  }

  for (const result of input.results) {
    merged.set(result.day, {
      ...(merged.get(result.day) ?? {}),
      ...result.projects,
    });
  }

  const file: DailyMetricsFile = {
    generatedAt: new Date().toISOString(),
    days: [...merged.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, projects]) => ({ day, projects })),
  };

  await mkdir(path.dirname(input.filePath), { recursive: true });
  await writeFile(input.filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
}

/** 读取日指标快照；文件缺失或损坏时返回空结构，调用方按"暂无数据"处理。 */
export async function readMetricsFile(filePath: string): Promise<DailyMetricsFile> {
  try {
    const source = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(source) as DailyMetricsFile;
    return {
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
      days: Array.isArray(parsed.days) ? parsed.days : [],
    };
  } catch {
    return { generatedAt: '', days: [] };
  }
}

async function purgeExpiredEvents(input: {
  store: AnalyticsStore;
  projects: AnalyticsProject[];
  today: string;
  retentionDays: number;
}): Promise<number> {
  const retentionDays = Math.max(1, input.retentionDays);
  const cutoff = shiftAnalyticsDay(input.today, -retentionDays);
  let purged = 0;

  for (const project of input.projects) {
    const earliest = await input.store.findEarliestMetricDay(project);
    if (!earliest) {
      continue;
    }

    // 只删除已有指标覆盖范围之前的过期数据，未聚合的日期不动。
    const safeCutoff = cutoff > earliest ? cutoff : earliest;
    if (safeCutoff <= earliest) {
      continue;
    }

    purged += await input.store.purgeBefore({ day: safeCutoff, project });
  }

  return purged;
}
