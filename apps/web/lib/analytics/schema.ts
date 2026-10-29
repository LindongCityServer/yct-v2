/**
 * 统计事件契约。
 *
 * 本文件只包含常量、类型与纯函数，不引入 Node 或 Next.js 运行时依赖，
 * 以便采集接口、聚合模块与独立脚本共用同一套定义。
 */

export const analyticsProjectValues = ['yct', 'ldpass'] as const;
export type AnalyticsProject = (typeof analyticsProjectValues)[number];

/** 当前事件规范版本，字段结构变化时必须递增。 */
export const analyticsSchemaVersion = 1;

/**
 * 允许入库的事件名白名单。
 * 新增事件需同步更新 docs/ANALYTICS_PLAN.md 第 6.3 节。
 */
export const analyticsEventNames = [
  'app.session.started',
  'page.viewed',
  'feature.used',
  'map.search.performed',
  'map.route.failed',
  'material.export.started',
  'material.export.succeeded',
  'material.export.failed',
  'material.preview.succeeded',
  'ticket.order.started',
  'ticket.order.succeeded',
  'ticket.order.failed',
  'poi.submit.started',
  'poi.submit.succeeded',
  'poi.review.completed',
  'error.client',
  'error.api',
] as const;
export type AnalyticsEventName = (typeof analyticsEventNames)[number];

/** 功能枚举。前端只能上报这些值，避免指标口径被自由字符串污染。 */
export const analyticsFeatureIds = [
  'map.browse',
  'map.poi_view',
  'map.search',
  'map.route_plan',
  'travel.line_query',
  'travel.schedule_query',
  'travel.journey_plan',
  'ticket.order',
  'ticket.checkin',
  'ridecode.session',
  'material.preview',
  'material.export',
  'material.import',
  'content.view',
  'service.open',
  'telegraph.print',
  'telegraph.download',
  'poi.submit',
  'settings.locale',
  'settings.push',
] as const;
export type AnalyticsFeatureId = (typeof analyticsFeatureIds)[number];

/** 需要计算任务成功率的链路：成功事件数除以发起事件数。 */
export const analyticsTaskFlows = [
  { id: 'ticket.order', started: 'ticket.order.started', succeeded: 'ticket.order.succeeded' },
  {
    id: 'material.export',
    started: 'material.export.started',
    succeeded: 'material.export.succeeded',
  },
  { id: 'poi.submit', started: 'poi.submit.started', succeeded: 'poi.submit.succeeded' },
] as const satisfies ReadonlyArray<{
  id: string;
  started: AnalyticsEventName;
  succeeded: AnalyticsEventName;
}>;

export const analyticsLimits = {
  maxBatchSize: 100,
  maxPropertiesBytes: 2048,
  maxRouteLength: 512,
  maxEventAgeDays: 7,
} as const;

export const analyticsMetricNames = {
  activeUsers: 'active_users',
  sessions: 'sessions',
  errorRate: 'error_rate',
  featureUsers: 'feature_users',
  featurePenetration: 'feature_penetration',
  taskSuccessRate: 'task_success_rate',
} as const;

export interface AnalyticsEventRecord {
  eventId: string;
  eventName: AnalyticsEventName;
  schemaVersion: number;
  project: AnalyticsProject;
  env: string;
  occurredAt: string;
  receivedAt: string;
  /** Asia/Shanghai 自然日，格式 YYYY-MM-DD。 */
  day: string;
  clientId: string;
  sessionId: string;
  userId?: string;
  route?: string;
  locale?: string;
  embedHost?: string;
  release?: string;
  properties: Record<string, unknown>;
}

export interface DailyMetricRow {
  day: string;
  project: AnalyticsProject;
  metric: string;
  dimension: string;
  value: number;
}

export interface AnalyticsStore {
  /** 幂等写入，返回实际新增的行数。 */
  append(events: AnalyticsEventRecord[]): Promise<number>;
  /** 按日计算指标，返回尚未落库的指标行。 */
  computeDayMetrics(input: { day: string; project: AnalyticsProject }): Promise<DailyMetricRow[]>;
  /** 覆盖写入指定日期的指标，重复执行结果一致。 */
  replaceDailyMetrics(rows: DailyMetricRow[]): Promise<void>;
  listDailyMetrics(input: {
    project: AnalyticsProject;
    fromDay: string;
    toDay: string;
  }): Promise<DailyMetricRow[]>;
  /** 删除指定日期之前的原始事件，返回删除行数。 */
  purgeBefore(input: { day: string; project: AnalyticsProject }): Promise<number>;
  /** 已生成指标的最早日期，用于限制清理范围。 */
  findEarliestMetricDay(project: AnalyticsProject): Promise<string | undefined>;
}

export interface DailyMetricsFile {
  generatedAt: string;
  days: Array<{
    day: string;
    projects: Partial<Record<AnalyticsProject, DailyMetricRow[]>>;
  }>;
}

const shanghaiOffsetMs = 8 * 60 * 60 * 1000;

/** 把时间归一到 Asia/Shanghai 自然日，统一用于切天与聚合。 */
export function toAnalyticsDay(value: string | Date): string | undefined {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Date(date.getTime() + shanghaiOffsetMs).toISOString().slice(0, 10);
}

/** 按自然日加减，用于计算聚合窗口与保留期。 */
export function shiftAnalyticsDay(day: string, deltaDays: number): string {
  const base = new Date(`${day}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (analyticsEventNames as readonly string[]).includes(value);
}

export function isAnalyticsProject(value: string): value is AnalyticsProject {
  return (analyticsProjectValues as readonly string[]).includes(value);
}

export function isAnalyticsFeatureId(value: string): value is AnalyticsFeatureId {
  return (analyticsFeatureIds as readonly string[]).includes(value);
}
