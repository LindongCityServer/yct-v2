/**
 * 线路区间用时的统一解析，供工作台、班次标签与地图页共用。
 *
 * 数据来源优先级：
 * 1. 后台人工维护的 `segmentPaths[].travelMinutes`；
 * 2. 旧数据 `stops[].travelTime`（挂在出发站上的区间用时，见旧数据文件头说明）；
 * 3. 调用方自己的估算兜底（班次实测中位数、距离与路口估算等）。
 */

export interface TransitSegmentPathLike {
  fromStationSourceId: string;
  toStationSourceId: string;
  travelMinutes?: number;
}

export interface StopTravelTimeLike {
  sequence?: number;
  travelTime?: number;
}

const isMinutes = (value: number | undefined | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 按站序取出旧数据 travelTime，结果与线路正序站序对齐。 */
export function collectStopTravelTimes(
  stops: readonly StopTravelTimeLike[],
): Array<number | undefined> {
  return [...stops]
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
    .map((stop) => (isMinutes(stop.travelTime) ? stop.travelTime : undefined));
}

/**
 * 解析旧数据 travelTime，返回与传入顺序对齐的逐段用时。
 *
 * 旧数据约定：`travelTime` 挂在出发站上，表示"当前站到下一站"的运行时间（分钟），
 * 例如 A 站 travelTime 为 3 表示 A 到 B 需要 3 分钟。
 * 因此逐段值直接取前 n-1 个站点的值，末站没有下一站，其值忽略。
 */
export function resolveLegacySegmentMinutes(travelTimes: readonly (number | undefined)[]): {
  segmentMinutes: Array<number | undefined>;
  totalMinutes?: number;
} {
  const values = travelTimes.map((value) => (isMinutes(value) ? value : undefined));
  const segmentMinutes = values.slice(0, -1);
  const total = segmentMinutes.reduce<number>(
    (sum, value) => (value === undefined ? sum : sum + value),
    0,
  );
  return { segmentMinutes, totalMinutes: total > 0 ? total : undefined };
}

/**
 * 按站序逐段合并区间用时：后台配置优先，缺失段用旧数据 travelTime 兜底。
 * `stopTravelTimes` 必须与 `stationSourceIds` 同序，缺失的段返回 undefined。
 */
export function resolveLineSegmentMinutes(input: {
  segmentPaths?: readonly TransitSegmentPathLike[];
  stationSourceIds?: readonly string[];
  stopTravelTimes?: readonly (number | undefined)[];
}): Array<number | undefined> {
  const stationSourceIds = input.stationSourceIds ?? [];
  const configured = new Map<string, number>();
  for (const path of input.segmentPaths ?? []) {
    if (!isMinutes(path.travelMinutes)) {
      continue;
    }
    configured.set(`${path.fromStationSourceId}->${path.toStationSourceId}`, path.travelMinutes);
    configured.set(`${path.toStationSourceId}->${path.fromStationSourceId}`, path.travelMinutes);
  }
  const legacy = input.stopTravelTimes?.length
    ? resolveLegacySegmentMinutes(input.stopTravelTimes).segmentMinutes
    : [];
  const segmentCount = Math.max(0, stationSourceIds.length - 1);

  return Array.from({ length: segmentCount }, (_, index) => {
    const from = stationSourceIds[index];
    const to = stationSourceIds[index + 1];
    const configuredMinutes = from && to ? configured.get(`${from}->${to}`) : undefined;
    if (isMinutes(configuredMinutes)) {
      return configuredMinutes;
    }
    return legacy[index];
  });
}

/** 逐段合并后的总时长；任一段缺失时返回 undefined，交由调用方继续兜底。 */
export function resolveLineTotalMinutes(input: {
  segmentPaths?: readonly TransitSegmentPathLike[];
  stationSourceIds?: readonly string[];
  stopTravelTimes?: readonly (number | undefined)[];
}): number | undefined {
  const segmentMinutes = resolveLineSegmentMinutes(input);
  if (segmentMinutes.length === 0 || segmentMinutes.some((value) => value === undefined)) {
    return undefined;
  }
  return segmentMinutes.reduce<number>((total, value) => total + (value ?? 0), 0);
}
