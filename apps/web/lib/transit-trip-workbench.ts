import type { TransitLineSnapshot, TravelTripInstance } from '@yct/contracts';
import { resolveLineSegmentMinutes } from './transit-segment-minutes';
import { formatAbsoluteMinutes, toAbsoluteMinutes } from './travel-schedule-timing';

export type WorkbenchDirection = 'down' | 'up';
export type WorkbenchTool = 'pan' | 'draw' | 'move';
export type WorkbenchLinkMode = 'none' | 'before' | 'after' | 'all';
export type WorkbenchEdge = 'arrival' | 'departure';

export const workbenchDirectionOptions: Array<{ value: WorkbenchDirection; label: string }> = [
  { value: 'down', label: '正向' },
  { value: 'up', label: '反向' },
];

/** 中间停靠站的默认停站分钟，用于补齐导入数据里的 0 停站。 */
export const defaultDwellMinutes = 1;

export const workbenchLinkModeOptions: Array<{ value: WorkbenchLinkMode; label: string }> = [
  { value: 'none', label: '不连锁' },
  { value: 'before', label: '之前' },
  { value: 'after', label: '之后' },
  { value: 'all', label: '全部' },
];

export interface WorkbenchTripStop {
  stationName: string;
  isStop: boolean;
  arrivalMinutes?: number;
  departureMinutes?: number;
  dwellMinutes?: number;
}

export interface WorkbenchStationRow {
  stationSourceId: string;
  stationName: string;
  /** 该站中心线在运行图中的纵坐标。 */
  y: number;
  /** 站点所属区间的上下边界，用于交替填色。 */
  bandTop: number;
  bandBottom: number;
}

export interface WorkbenchTrip {
  trip: TravelTripInstance;
  /** 草稿中的停站时刻；与 trip.stopTimes 相比可能已被编辑。 */
  stops: WorkbenchTripStop[];
  isNew?: boolean;
}

export interface WorkbenchChartPoint {
  stationName: string;
  y: number;
  minutes: number;
  edge: WorkbenchEdge;
  stopIndex: number;
}

/** 按方向返回线路站序：反向往返就是正序取反。 */
export function getDirectionStationSourceIds(
  line: Pick<TransitLineSnapshot, 'stationSourceIds'>,
  direction: WorkbenchDirection,
): string[] {
  return direction === 'down' ? [...line.stationSourceIds] : [...line.stationSourceIds].reverse();
}

/**
 * 判定班次属于哪个方向。
 * 以班次首站、末站在线路正序中的相对位置为准，小交路（截短站序）也能正确归类。
 */
export function resolveTripDirection(
  trip: Pick<TravelTripInstance, 'stationNames' | 'stopTimes'>,
  line: Pick<TransitLineSnapshot, 'stationSourceIds'>,
  stationNameOf?: (stationSourceId: string) => string,
): WorkbenchDirection {
  // 线路站序是 stationSourceId，班次里存的是站名，必须先把线路站序翻译成站名再比较。
  const orderedNames = stationNameOf
    ? line.stationSourceIds.map(stationNameOf)
    : [...line.stationSourceIds];
  const order = new Map(orderedNames.map((name, index) => [name, index]));
  const stopNames = trip.stopTimes?.length
    ? trip.stopTimes.map((stopTime) => stopTime.stationName)
    : trip.stationNames;
  const names = stopNames.filter((name) => order.has(name));
  if (names.length < 2) {
    return trip.stationNames[0] === orderedNames[0] ? 'down' : 'up';
  }
  return (order.get(names[0]) ?? 0) <= (order.get(names.at(-1) ?? '') ?? 0) ? 'down' : 'up';
}

/** 把班次时刻整理成可编辑结构，缺失 stopTimes 时按首末站兜底。 */
export function resolveWorkbenchStops(trip: TravelTripInstance): WorkbenchTripStop[] {
  const configured = trip.stopTimes?.length
    ? trip.stopTimes
    : trip.stationNames.map((stationName, index) => ({
        stationName,
        isStop: true,
        arrivalTime: index === trip.stationNames.length - 1 ? trip.arrivalTime : undefined,
        departureTime: index === 0 ? trip.departureTime : undefined,
        arrivalDayOffset:
          index === trip.stationNames.length - 1 ? (trip.arrivalDayOffset ?? 0) : undefined,
        departureDayOffset: index === 0 ? 0 : undefined,
        dwellMinutes: undefined,
      }));

  return configured.map((stopTime, index) => {
    const arrivalMinutes = toAbsoluteMinutes(stopTime.arrivalTime, stopTime.arrivalDayOffset);
    let departureMinutes = toAbsoluteMinutes(stopTime.departureTime, stopTime.departureDayOffset);
    // 导入数据里中间停靠站的停站常被写成 0；补成默认停站，
    // 运行图上才有可分辨的到达/发车端点，恢复自动时也不会再额外增加。
    if (
      stopTime.isStop &&
      index > 0 &&
      index < configured.length - 1 &&
      arrivalMinutes !== undefined &&
      departureMinutes !== undefined &&
      departureMinutes <= arrivalMinutes
    ) {
      departureMinutes = arrivalMinutes + defaultDwellMinutes;
    }
    return {
      stationName: stopTime.stationName,
      isStop: stopTime.isStop,
      arrivalMinutes,
      departureMinutes,
      dwellMinutes: stopTime.dwellMinutes,
    };
  });
}

/**
 * 计算每段区间的基准用时：
 * 优先线路配置，其次旧数据 stops[].travelTime，再次班次实测中位数，最后兜底 4 分钟。
 */
export function resolveSegmentBaseMinutes(input: {
  line: Pick<TransitLineSnapshot, 'segmentPaths' | 'stops' | 'stationSourceIds'>;
  stationSourceIds: string[];
  trips: readonly WorkbenchTrip[];
}): number[] {
  const travelTimeByStation = new Map(
    input.line.stops.map((stop) => [stop.stationSourceId, stop.travelTime]),
  );
  const resolved = resolveLineSegmentMinutes({
    segmentPaths: input.line.segmentPaths,
    stationSourceIds: input.stationSourceIds,
    stopTravelTimes: input.stationSourceIds.map((stationSourceId) =>
      travelTimeByStation.get(stationSourceId),
    ),
  });

  const segmentCount = Math.max(0, input.stationSourceIds.length - 1);
  return Array.from({ length: segmentCount }, (_, index) => {
    const resolvedMinutes = resolved[index];
    if (resolvedMinutes !== undefined) {
      return resolvedMinutes;
    }
    const observed = median(input.trips.flatMap((trip) => measureSegment(trip.stops, index)));
    return observed ?? 4;
  });
}

/**
 * 按区间用时分配站点纵坐标。
 * 站点间距与区间用时成正比，所有班次共用同一把尺子，斜率才可比。
 */
export function buildStationRows(input: {
  stationSourceIds: string[];
  stationNameOf: (stationSourceId: string) => string;
  segmentMinutes: number[];
  top: number;
  bottom: number;
}): WorkbenchStationRow[] {
  const usable = Math.max(40, input.bottom - input.top);
  const weights = input.segmentMinutes.map((minutes) => Math.max(0.2, minutes));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let cursor = input.top;

  return input.stationSourceIds.map((stationSourceId, index) => {
    const bandTop = cursor;
    const bandHeight = index < weights.length ? (weights[index] / total) * usable : 0;
    cursor += bandHeight;
    return {
      stationSourceId,
      stationName: input.stationNameOf(stationSourceId),
      y: Math.round(bandTop * 100) / 100,
      bandTop: Math.round(bandTop * 100) / 100,
      bandBottom: Math.round((bandTop + bandHeight) * 100) / 100,
    };
  });
}

/** 把一笔时刻改动限制在相邻时刻之间，避免出现时间倒序。 */
export function clampStopEdgeMinutes(
  stops: readonly WorkbenchTripStop[],
  index: number,
  edge: WorkbenchEdge,
  nextMinutes: number,
): number {
  const current = stops[index];
  if (!current) {
    return nextMinutes;
  }
  const previous = findPreviousMinutes(stops, index);
  const next = findNextMinutes(stops, index);
  if (edge === 'arrival') {
    // 到达时刻允许越过当前发车时刻：拖它就是在改上一区间用时，
    // 发车时刻会跟着平移以保持停站时长，因此上限要扣掉停站时间。
    const dwell = getStopDwellMinutes(current);
    const floor = previous ?? 0;
    const ceiling = next === undefined ? 24 * 60 * 2 : next - dwell;
    return Math.min(Math.max(nextMinutes, floor), Math.max(floor, ceiling));
  }
  const floor = current.arrivalMinutes ?? previous ?? 0;
  const ceiling = next ?? 24 * 60 * 2;
  return Math.min(Math.max(nextMinutes, floor), Math.max(floor, ceiling));
}

/** 当前停站时长；通过站或缺少时刻时按 0 处理。 */
export function getStopDwellMinutes(stop: WorkbenchTripStop): number {
  if (!stop.isStop || stop.arrivalMinutes === undefined || stop.departureMinutes === undefined) {
    return 0;
  }
  return Math.max(0, stop.departureMinutes - stop.arrivalMinutes);
}

/** 连锁拖动：按模式同步平移同一班次线的其他端点。 */
export function shiftLinkedStops(
  stops: readonly WorkbenchTripStop[],
  anchorIndex: number,
  mode: WorkbenchLinkMode,
  deltaMinutes: number,
): WorkbenchTripStop[] {
  if (mode === 'none' || deltaMinutes === 0) {
    return stops.map((stop) => ({ ...stop }));
  }
  return stops.map((stop, index) => {
    // 锚点已经在调用方单独设置过，不能再平移一次，否则它会以双倍速度移动。
    const linked =
      index !== anchorIndex &&
      (mode === 'all' ||
        (mode === 'before' && index < anchorIndex) ||
        (mode === 'after' && index > anchorIndex));
    if (!linked) {
      return { ...stop };
    }
    return {
      ...stop,
      arrivalMinutes:
        stop.arrivalMinutes === undefined ? undefined : stop.arrivalMinutes + deltaMinutes,
      departureMinutes:
        stop.departureMinutes === undefined ? undefined : stop.departureMinutes + deltaMinutes,
    };
  });
}

/** 切换停站/通过；改为通过时清空该站时刻，折线会在图上直接跨过该站。 */
export function toggleStopAt(
  stops: readonly WorkbenchTripStop[],
  index: number,
): WorkbenchTripStop[] {
  return stops.map((stop, currentIndex) => {
    if (currentIndex !== index) {
      return { ...stop };
    }
    if (stop.isStop) {
      return { ...stop, isStop: false, arrivalMinutes: undefined, departureMinutes: undefined };
    }
    return { ...stop, isStop: true };
  });
}

/** 在指定站写入一个时刻点，用于画图工具新增锚点。 */
export function setStopEdgeAt(
  stops: readonly WorkbenchTripStop[],
  index: number,
  edge: WorkbenchEdge,
  minutes: number,
): WorkbenchTripStop[] {
  return stops.map((stop, currentIndex) => {
    if (currentIndex !== index) {
      return { ...stop };
    }
    const clamped = clampStopEdgeMinutes(stops, index, edge, minutes);
    if (edge === 'arrival') {
      return {
        ...stop,
        isStop: true,
        arrivalMinutes: clamped,
        departureMinutes: stop.departureMinutes ?? clamped,
      };
    }
    return {
      ...stop,
      isStop: true,
      arrivalMinutes: stop.arrivalMinutes ?? clamped,
      departureMinutes: clamped,
    };
  });
}

/** 截短或延长班次交路：只保留首站到目标站之间的站序。 */
export function truncateTripStops(
  stops: readonly WorkbenchTripStop[],
  index: number,
  edge: 'start' | 'end',
): WorkbenchTripStop[] {
  if (stops.length <= 2) {
    return stops.map((stop) => ({ ...stop }));
  }
  return (edge === 'start' ? stops.slice(index) : stops.slice(0, index + 1)).map((stop) => ({
    ...stop,
  }));
}

/** 连锁平移后校验时间是否仍然单调，越界时放弃本次改动。 */
export function isStopSequenceMonotonic(stops: readonly WorkbenchTripStop[]): boolean {
  let previous: number | undefined;
  for (const stop of stops) {
    const arrival = stop.arrivalMinutes;
    const departure = stop.departureMinutes;
    if (arrival !== undefined) {
      if (previous !== undefined && arrival < previous) {
        return false;
      }
      previous = arrival;
    }
    if (departure !== undefined) {
      if (previous !== undefined && departure < previous) {
        return false;
      }
      previous = departure;
    }
  }
  return true;
}

export function formatWorkbenchMinutes(minutes: number | undefined): string {
  if (minutes === undefined) {
    return '';
  }
  const formatted = formatAbsoluteMinutes(minutes);
  return formatted.dayOffset > 0 ? `${formatted.time}+${formatted.dayOffset}` : formatted.time;
}

/** 把分钟数写回 HH:mm，供保存时还原 stopTimes。 */
export function toClockTime(minutes: number | undefined): string | undefined {
  if (minutes === undefined) {
    return undefined;
  }
  return formatAbsoluteMinutes(minutes).time;
}

export function toDayOffset(minutes: number | undefined): number | undefined {
  if (minutes === undefined) {
    return undefined;
  }
  return formatAbsoluteMinutes(minutes).dayOffset;
}

/** 取一个班次最早与最晚的时刻，用于自动缩放时间轴。 */
export function getTripMinuteRange(stops: readonly WorkbenchTripStop[]): [number, number] | null {
  const values = stops.flatMap((stop) =>
    [stop.arrivalMinutes, stop.departureMinutes].filter(
      (minutes): minutes is number => minutes !== undefined,
    ),
  );
  if (values.length === 0) {
    return null;
  }
  return [Math.min(...values), Math.max(...values)];
}

function measureSegment(stops: readonly WorkbenchTripStop[], index: number): number[] {
  const from = stops[index];
  const to = stops[index + 1];
  if (!from || !to) {
    return [];
  }
  const start = from.departureMinutes ?? from.arrivalMinutes;
  const end = to.arrivalMinutes ?? to.departureMinutes;
  if (start === undefined || end === undefined || end <= start) {
    return [];
  }
  return [end - start];
}

function findPreviousMinutes(
  stops: readonly WorkbenchTripStop[],
  index: number,
): number | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const value = stops[cursor]?.departureMinutes ?? stops[cursor]?.arrivalMinutes;
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function findNextMinutes(stops: readonly WorkbenchTripStop[], index: number): number | undefined {
  for (let cursor = index + 1; cursor < stops.length; cursor += 1) {
    const value = stops[cursor]?.arrivalMinutes ?? stops[cursor]?.departureMinutes;
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}
