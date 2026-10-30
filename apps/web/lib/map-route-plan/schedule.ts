import type { TransitLineTravelDirection } from '../transit-line-direction';
import { resolveDirectionalDepartureTimes } from '../transit-departure-editor';
import { resolveLineSegmentMinutes } from '../transit-segment-minutes';
import {
  buildTransitSchedules,
  formatTransitClockMinutes,
  getTransitClockMinutes,
  type TransitRealtimeSchedule,
} from '../transit-realtime';
import type { TransitLineStopForMap, TransitOverviewLine } from './types';

/** 运营日以 03:00 为界，凌晨 00:xx–02:59 归入前一日夜间时段。 */
const serviceDayBoundaryMinutes = 3 * 60;

/** 把 0–1439 的时钟分钟转换为服务日分钟，保证跨日班次时间轴单调。 */
export function normalizeServiceDayMinutes(value: number): number {
  const minutes = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  return minutes < serviceDayBoundaryMinutes ? minutes + 24 * 60 : minutes;
}

/** 解析 HH:mm 为服务日分钟；时刻非法时返回 undefined。 */
export function clockToServiceDayMinutes(value: string | undefined): number | undefined {
  const minutes = value === undefined ? undefined : getTransitClockMinutes(value);
  return minutes === undefined ? undefined : normalizeServiceDayMinutes(minutes);
}

/** 服务日分钟还原为可展示的 HH:mm 与跨日天数。 */
export function formatServiceDayMinutes(value: number): { time: string; dayOffset: number } {
  return {
    time: formatTransitClockMinutes(value),
    dayOffset: Math.floor(value / (24 * 60)),
  };
}

export interface TransitLineDirectionSchedules {
  /** 是否拿到真实时刻（已发布班次实例或线路发车时刻表）。 */
  hasScheduleData: boolean;
  schedules: TransitRealtimeSchedule[];
  stopCount: number;
}

/**
 * 生成某线路某一方向的完整班次时刻表。
 * 已发布班次实例优先（保留“通过不停”与逐站实际时刻），
 * 缺失时回退到线路配置的首站发车时刻 + 区间用时。
 */
export function buildLineDirectionSchedules(input: {
  line: TransitOverviewLine;
  direction: TransitLineTravelDirection;
  /** 与方向站序一致的站点列表。 */
  stops: TransitLineStopForMap[];
  /** 缺少区间用时数据时，用相邻站距离估算该段分钟数。 */
  estimateSegmentMinutes?: (index: number) => number;
}): TransitLineDirectionSchedules {
  const stops = input.stops;
  if (stops.length < 2) {
    return { hasScheduleData: false, schedules: [], stopCount: stops.length };
  }

  const stopNames = stops.map((stop) => stop.stationName);
  const stationSourceIds = stops.map((stop) => stop.stationSourceId ?? '');
  const resolvedSegmentMinutes = resolveLineSegmentMinutes({
    segmentPaths: input.line.segmentPaths,
    stationSourceIds,
    stopTravelTimes: stops.map((stop) => stop.travelTime),
  });
  const segmentMinutes = resolvedSegmentMinutes.map((minutes, index) => {
    if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) {
      return minutes;
    }
    const estimated = input.estimateSegmentMinutes?.(index);
    return typeof estimated === 'number' && Number.isFinite(estimated) && estimated > 0
      ? estimated
      : 1;
  });

  const directional = resolveDirectionalDepartureTimes(input.line);
  const departureTimes = input.direction === 'forward' ? directional.down : directional.up;
  const schedules = buildTransitSchedules({
    departureTimes,
    trips: input.line.tripInstances,
    stopNames,
    segmentMinutes,
    specialTrips:
      input.line.specialTripsByDirection?.[input.direction === 'forward' ? 'down' : 'up'],
  });

  return {
    hasScheduleData: schedules.some((schedule) => schedule.servedStopIndexes.length >= 2),
    schedules,
    stopCount: stops.length,
  };
}

export interface TransitRideSelection {
  /** 上车时刻（服务日分钟）。 */
  boardMinutes: number;
  /** 到达时刻（服务日分钟）。 */
  arrivalMinutes: number;
  /** 相对期望上车时刻的等待分钟数。 */
  waitMinutes: number;
  /** 车上分钟数。 */
  rideMinutes: number;
  tripCode?: string;
  serviceNature?: string;
  /** 时刻来自已发布班次实例还是线路时刻表。 */
  source: 'trip' | 'schedule';
}

/**
 * 出发模式：找出期望时刻之后、在上车站可上车且能到达目标站的最早班次。
 */
export function selectDepartureRide(input: {
  schedules: readonly TransitRealtimeSchedule[];
  originIndex: number;
  destinationIndex: number;
  readyMinutes: number;
}): TransitRideSelection | undefined {
  let best: TransitRideSelection | undefined;
  for (const schedule of input.schedules) {
    const ride = resolveScheduleRide(schedule, input.originIndex, input.destinationIndex);
    if (!ride || ride.boardMinutes < input.readyMinutes) {
      continue;
    }
    if (!best || ride.boardMinutes < best.boardMinutes) {
      best = { ...ride, waitMinutes: ride.boardMinutes - input.readyMinutes };
    }
  }
  return best;
}

/**
 * 到达模式：列出能在期望到达时刻前抵达、且仍来得及从起点出发的班次，
 * 按到达时刻从晚到早排序，供换乘衔接时逐个尝试。
 */
export function listArrivalRides(input: {
  schedules: readonly TransitRealtimeSchedule[];
  originIndex: number;
  destinationIndex: number;
  deadlineMinutes: number;
  /** 最早可上车时刻，避免倒推出已经错过的班次。 */
  earliestBoardMinutes: number;
}): TransitRideSelection[] {
  const rides: TransitRideSelection[] = [];
  for (const schedule of input.schedules) {
    const ride = resolveScheduleRide(schedule, input.originIndex, input.destinationIndex);
    if (
      !ride ||
      ride.arrivalMinutes > input.deadlineMinutes ||
      ride.boardMinutes < input.earliestBoardMinutes
    ) {
      continue;
    }
    rides.push({ ...ride, waitMinutes: 0 });
  }
  return rides.sort((left, right) => right.arrivalMinutes - left.arrivalMinutes);
}

/** 到达模式：取最晚一班能按时抵达的班次。 */
export function selectArrivalRide(input: {
  schedules: readonly TransitRealtimeSchedule[];
  originIndex: number;
  destinationIndex: number;
  deadlineMinutes: number;
  earliestBoardMinutes: number;
}): TransitRideSelection | undefined {
  return listArrivalRides(input)[0];
}

function resolveScheduleRide(
  schedule: TransitRealtimeSchedule,
  originIndex: number,
  destinationIndex: number,
): Omit<TransitRideSelection, 'waitMinutes'> | undefined {
  if (destinationIndex <= originIndex) {
    return undefined;
  }
  // 通过不停的车站不能上下车。
  if (schedule.isStop[originIndex] !== true || schedule.isStop[destinationIndex] !== true) {
    return undefined;
  }
  const baseMinutes = clockToServiceDayMinutes(schedule.departureTime);
  const originDepartureOffset = schedule.departureOffsets[originIndex];
  const destinationArrivalOffset = schedule.arrivalOffsets[destinationIndex];
  if (
    baseMinutes === undefined ||
    originDepartureOffset === undefined ||
    destinationArrivalOffset === undefined
  ) {
    return undefined;
  }

  const boardMinutes = baseMinutes + originDepartureOffset;
  const arrivalMinutes = baseMinutes + destinationArrivalOffset;
  if (arrivalMinutes <= boardMinutes) {
    return undefined;
  }

  return {
    boardMinutes,
    arrivalMinutes,
    rideMinutes: arrivalMinutes - boardMinutes,
    tripCode: schedule.tripCode,
    serviceNature: schedule.serviceNature,
    source: schedule.tripCode ? 'trip' : 'schedule',
  };
}
