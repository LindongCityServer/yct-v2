import {
  analyticsMetricNames,
  shiftAnalyticsDay,
  type DailyMetricRow,
  type DailyMetricsFile,
} from './schema';

export interface AnalyticsOverviewFeature {
  id: string;
  users: number;
  penetration: number | null;
}

export interface AnalyticsOverviewTask {
  id: string;
  rate: number;
}

export interface AnalyticsOverviewSeriesItem {
  day: string;
  activeUsers: number | null;
  sessions: number | null;
}

export interface AnalyticsOverviewResponse {
  days: number;
  updatedAt: string;
  series: AnalyticsOverviewSeriesItem[];
  latest: {
    day: string;
    activeUsers: number | null;
    sessions: number | null;
    errorRate: number | null;
    features: AnalyticsOverviewFeature[];
    tasks: AnalyticsOverviewTask[];
  } | null;
}

/**
 * 把日指标快照整理成看板需要的结构。
 *
 * 纯函数，不触碰文件与数据库，便于接口层与脚本层复用同一份口径。
 */
export function buildAnalyticsOverview(input: {
  days: number;
  today: string;
  snapshot: DailyMetricsFile;
}): AnalyticsOverviewResponse {
  const fromDay = shiftAnalyticsDay(input.today, -(input.days - 1));
  const dayRows = new Map<string, DailyMetricRow[]>();

  for (const item of input.snapshot.days) {
    if (item.day < fromDay || item.day > input.today) {
      continue;
    }

    const rows = item.projects.yct;
    if (rows?.length) {
      dayRows.set(item.day, rows);
    }
  }

  const series = [...dayRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, rows]) => ({
      day,
      activeUsers: pickTotal(rows, analyticsMetricNames.activeUsers),
      sessions: pickTotal(rows, analyticsMetricNames.sessions),
    }));

  const latestDay = series.at(-1)?.day;
  const latestRows = latestDay ? (dayRows.get(latestDay) ?? []) : [];
  const featureRates = new Map(
    latestRows
      .filter((row) => row.metric === analyticsMetricNames.featurePenetration)
      .map((row) => [row.dimension, row.value]),
  );

  return {
    days: input.days,
    updatedAt: input.snapshot.generatedAt,
    series,
    latest: latestDay
      ? {
          day: latestDay,
          activeUsers: pickTotal(latestRows, analyticsMetricNames.activeUsers),
          sessions: pickTotal(latestRows, analyticsMetricNames.sessions),
          errorRate: pickTotal(latestRows, analyticsMetricNames.errorRate),
          features: latestRows
            .filter((row) => row.metric === analyticsMetricNames.featureUsers)
            .map((row) => ({
              id: row.dimension,
              users: row.value,
              penetration: featureRates.get(row.dimension) ?? null,
            }))
            .sort((left, right) => right.users - left.users),
          tasks: latestRows
            .filter((row) => row.metric === analyticsMetricNames.taskSuccessRate)
            .map((row) => ({ id: row.dimension, rate: row.value })),
        }
      : null,
  };
}

function pickTotal(rows: DailyMetricRow[], metric: string): number | null {
  const row = rows.find((item) => item.metric === metric && item.dimension === '');
  return row ? row.value : null;
}
