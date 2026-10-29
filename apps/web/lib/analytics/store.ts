import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  analyticsMetricNames,
  analyticsTaskFlows,
  isAnalyticsFeatureId,
  type AnalyticsEventRecord,
  type AnalyticsProject,
  type AnalyticsStore,
  type DailyMetricRow,
} from './schema';

const schemaSql = `
CREATE TABLE IF NOT EXISTS analytics_event (
  event_id       TEXT PRIMARY KEY,
  event_name     TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  project        TEXT NOT NULL,
  env            TEXT NOT NULL,
  occurred_at    TEXT NOT NULL,
  received_at    TEXT NOT NULL,
  day            TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  session_id     TEXT NOT NULL,
  user_id        TEXT,
  route          TEXT,
  locale         TEXT,
  embed_host     TEXT,
  release        TEXT,
  properties     TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_day_name
  ON analytics_event (project, day, event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_event_day_client
  ON analytics_event (project, day, client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_session
  ON analytics_event (session_id);

CREATE TABLE IF NOT EXISTS analytics_metric_daily (
  project    TEXT NOT NULL,
  day        TEXT NOT NULL,
  metric     TEXT NOT NULL,
  dimension  TEXT NOT NULL DEFAULT '',
  value      REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project, day, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_analytics_metric_day
  ON analytics_metric_daily (project, day);
`;

interface AnalyticsDatabaseCache {
  path: string;
  db: DatabaseSync;
}

interface CountRow {
  users: number | bigint;
  sessions: number | bigint;
}

interface SessionErrorRow {
  error_sessions: number | bigint;
  total_sessions: number | bigint;
}

interface EventCountRow {
  event_name: string;
  total: number | bigint;
}

interface FeatureRow {
  feature: string | null;
  users: number | bigint;
}

interface MetricRowResult {
  day: string;
  project: string;
  metric: string;
  dimension: string;
  value: number;
}

const globalCache = globalThis as typeof globalThis & {
  __yctAnalyticsDatabase?: AnalyticsDatabaseCache;
};

/**
 * 获取进程内共享的 SQLite 连接。
 *
 * 单机部署下每个进程各持有一个连接，WAL 模式保证多进程并发安全；
 * 开发环境热重载时复用同一连接，避免文件句柄泄漏。
 */
export function getAnalyticsDatabase(dbPath: string): DatabaseSync {
  const cached = globalCache.__yctAnalyticsDatabase;
  if (cached && cached.path === dbPath) {
    return cached.db;
  }

  if (cached) {
    try {
      cached.db.close();
    } catch {
      // 关闭失败不影响新连接建立。
    }
  }

  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(schemaSql);

  globalCache.__yctAnalyticsDatabase = { path: dbPath, db };
  return db;
}

export function createAnalyticsStore(dbPath: string): AnalyticsStore {
  return {
    async append(events) {
      if (events.length === 0) {
        return 0;
      }

      const db = getAnalyticsDatabase(dbPath);
      const statement = db.prepare(`
        INSERT OR IGNORE INTO analytics_event (
          event_id, event_name, schema_version, project, env,
          occurred_at, received_at, day, client_id, session_id,
          user_id, route, locale, embed_host, release, properties
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const event of events) {
          const result = statement.run(
            event.eventId,
            event.eventName,
            event.schemaVersion,
            event.project,
            event.env,
            event.occurredAt,
            event.receivedAt,
            event.day,
            event.clientId,
            event.sessionId,
            event.userId ?? null,
            event.route ?? null,
            event.locale ?? null,
            event.embedHost ?? null,
            event.release ?? null,
            JSON.stringify(event.properties),
          );
          inserted += Number(result.changes);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      return inserted;
    },

    async computeDayMetrics({ day, project }) {
      const db = getAnalyticsDatabase(dbPath);
      const rows: DailyMetricRow[] = [];

      const totals = db
        .prepare(
          `SELECT
             COUNT(DISTINCT COALESCE(user_id, client_id)) AS users,
             COUNT(DISTINCT session_id) AS sessions
           FROM analytics_event
           WHERE day = ? AND project = ?`,
        )
        .get(day, project) as unknown as CountRow | undefined;

      const activeUsers = Number(totals?.users ?? 0);
      const sessions = Number(totals?.sessions ?? 0);

      rows.push({
        day,
        project,
        metric: analyticsMetricNames.activeUsers,
        dimension: '',
        value: activeUsers,
      });
      rows.push({
        day,
        project,
        metric: analyticsMetricNames.sessions,
        dimension: '',
        value: sessions,
      });

      const errorRow = db
        .prepare(
          `SELECT
             COUNT(DISTINCT CASE WHEN event_name = 'error.client' THEN session_id END) AS error_sessions,
             COUNT(DISTINCT session_id) AS total_sessions
           FROM analytics_event
           WHERE day = ? AND project = ?`,
        )
        .get(day, project) as unknown as SessionErrorRow | undefined;

      const totalSessions = Number(errorRow?.total_sessions ?? 0);
      if (totalSessions > 0) {
        rows.push({
          day,
          project,
          metric: analyticsMetricNames.errorRate,
          dimension: '',
          value: Number(errorRow?.error_sessions ?? 0) / totalSessions,
        });
      }

      if (activeUsers > 0) {
        const featureRows = db
          .prepare(
            `SELECT json_extract(properties, '$.feature') AS feature,
                    COUNT(DISTINCT COALESCE(user_id, client_id)) AS users
             FROM analytics_event
             WHERE day = ? AND project = ? AND event_name = 'feature.used'
             GROUP BY feature`,
          )
          .all(day, project) as unknown as FeatureRow[];

        for (const item of featureRows) {
          const feature = item.feature;
          if (!feature || !isAnalyticsFeatureId(feature)) {
            continue;
          }

          const users = Number(item.users);
          rows.push({
            day,
            project,
            metric: analyticsMetricNames.featureUsers,
            dimension: feature,
            value: users,
          });
          rows.push({
            day,
            project,
            metric: analyticsMetricNames.featurePenetration,
            dimension: feature,
            value: users / activeUsers,
          });
        }
      }

      const flowEventNames = analyticsTaskFlows.flatMap((flow) => [flow.started, flow.succeeded]);
      if (flowEventNames.length > 0) {
        const placeholders = flowEventNames.map(() => '?').join(', ');
        const counts = db
          .prepare(
            `SELECT event_name, COUNT(*) AS total
             FROM analytics_event
             WHERE day = ? AND project = ? AND event_name IN (${placeholders})
             GROUP BY event_name`,
          )
          .all(day, project, ...flowEventNames) as unknown as EventCountRow[];

        const countByName = new Map(counts.map((item) => [item.event_name, Number(item.total)]));
        for (const flow of analyticsTaskFlows) {
          const started = countByName.get(flow.started) ?? 0;
          if (started === 0) {
            continue;
          }

          const succeeded = countByName.get(flow.succeeded) ?? 0;
          rows.push({
            day,
            project,
            metric: analyticsMetricNames.taskSuccessRate,
            dimension: flow.id,
            value: succeeded / started,
          });
        }
      }

      return rows;
    },

    async replaceDailyMetrics(rows) {
      if (rows.length === 0) {
        return;
      }

      const db = getAnalyticsDatabase(dbPath);
      const statement = db.prepare(`
        INSERT INTO analytics_metric_daily (project, day, metric, dimension, value, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (project, day, metric, dimension)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `);
      const updatedAt = new Date().toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) {
          statement.run(row.project, row.day, row.metric, row.dimension, row.value, updatedAt);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async listDailyMetrics({ project, fromDay, toDay }) {
      const db = getAnalyticsDatabase(dbPath);
      const results = db
        .prepare(
          `SELECT day, project, metric, dimension, value
           FROM analytics_metric_daily
           WHERE project = ? AND day >= ? AND day <= ?
           ORDER BY day ASC, metric ASC, dimension ASC`,
        )
        .all(project, fromDay, toDay) as unknown as MetricRowResult[];

      return results.map((row) => ({
        day: row.day,
        project: row.project as AnalyticsProject,
        metric: row.metric,
        dimension: row.dimension,
        value: Number(row.value),
      }));
    },

    async purgeBefore({ day, project }) {
      const db = getAnalyticsDatabase(dbPath);
      const result = db
        .prepare('DELETE FROM analytics_event WHERE day < ? AND project = ?')
        .run(day, project);
      return Number(result.changes);
    },

    async findEarliestMetricDay(project) {
      const db = getAnalyticsDatabase(dbPath);
      const row = db
        .prepare('SELECT MIN(day) AS day FROM analytics_metric_daily WHERE project = ?')
        .get(project) as unknown as { day: string | null } | undefined;

      return row?.day ?? undefined;
    },
  };
}

/** 把记录转换为可用于断言的稳定结构，避免聚合结果受插入顺序影响。 */
export function sortMetricRows(rows: DailyMetricRow[]): DailyMetricRow[] {
  return [...rows].sort((left, right) => {
    const dayOrder = left.day.localeCompare(right.day);
    if (dayOrder !== 0) return dayOrder;
    const metricOrder = left.metric.localeCompare(right.metric);
    if (metricOrder !== 0) return metricOrder;
    return left.dimension.localeCompare(right.dimension);
  });
}

export type { AnalyticsEventRecord };
