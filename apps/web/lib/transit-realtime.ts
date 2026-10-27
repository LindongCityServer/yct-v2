export type TransitRealtimeVehicleStatus = 'at_station' | 'in_segment';

export interface TransitRealtimeVehicle {
  id: string;
  /** 当日按发车时刻排序后的班次序号，从 1 开始。 */
  ordinal: number;
  /** 首站计划发车时刻，保留线路数据中的 HH:mm 文本。 */
  departureTime: string;
  status: TransitRealtimeVehicleStatus;
  stationName?: string;
  /** 停靠站或所在区间起点站在当前方向站序中的索引。 */
  stationIndex?: number;
  segmentIndex?: number;
  fromStationName?: string;
  toStationName?: string;
  /** 当前区间/停靠站的完整到站分钟序列，供选中站点预计到站时间使用。 */
  stationArrivalMinutes?: number[];
  /** 当前区间/停靠站的完整离站分钟序列，供判断是否已驶离选中站。 */
  stationDepartureMinutes?: number[];
  /** 当前区间的行驶进度，0 表示刚离开上一站，1 表示即将到达下一站。 */
  progress: number;
  minutesToNextStation?: number;
}

export interface TransitRealtimeSnapshot {
  vehicles: TransitRealtimeVehicle[];
  /** 当前时刻之后最近的一班首站发车时刻；无时刻表时为空。 */
  nextDepartureTime?: string;
  nextDepartureDayOffset?: number;
}

export type TransitStationBoardStatus =
  'waiting' | 'arriving' | 'arriving_now' | 'leaving' | 'passed';

export interface TransitStationBoardEntry {
  id: string;
  ordinal: number;
  /** 首站计划发车时刻。 */
  departureTime: string;
  status: TransitStationBoardStatus;
  /** 尚未到达选中站时，距离到站的分钟数。 */
  minutesToStation?: number;
  arrivalMinutes: number;
  departureMinutes: number;
}

const defaultDwellMinutes = 1;

/** 运营时刻统一按北京时间（UTC+8）计算，不随浏览器本地时区变化。 */
export function getBeijingClockMinutes(date: Date = new Date()): number {
  return (date.getUTCHours() * 60 + date.getUTCMinutes() + 8 * 60) % (24 * 60);
}

/**
 * 生成选中站点的班次看板，按到站时间排序。
 * 默认仅保留尚未离开该站的班次；includePassed 为 true 时按服务日（03:00 为界）
 * 保留全天所有班次，已驶离该站的班次以 passed 状态返回，供“全部班次”列表使用。
 */
export function buildTransitStationBoard(input: {
  departureTimes: readonly string[];
  stopNames: readonly string[];
  segmentMinutes: readonly number[];
  stationIndex: number;
  nowMinutes: number;
  dwellMinutes?: number;
  includePassed?: boolean;
}): TransitStationBoardEntry[] {
  const stopNames = input.stopNames.filter(Boolean);
  const departureTimes = normalizeDepartureTimes(input.departureTimes);
  if (
    stopNames.length < 2 ||
    departureTimes.length === 0 ||
    input.stationIndex < 0 ||
    input.stationIndex >= stopNames.length
  ) {
    return [];
  }

  const segmentMinutes = normalizeSegmentMinutes(input.segmentMinutes, stopNames.length - 1);
  const dwellMinutes = Math.max(0, input.dwellMinutes ?? defaultDwellMinutes);
  const isTerminal = input.stationIndex === stopNames.length - 1;
  // “全部班次”按服务日时间轴展示，避免把清晨班次误判为次日班次。
  const referenceMinutes = input.includePassed
    ? normalizeServiceDayMinutes(input.nowMinutes)
    : input.nowMinutes;
  const entries: TransitStationBoardEntry[] = [];

  for (const [index, departureTime] of departureTimes.entries()) {
    const scheduledMinutes = getTransitClockMinutes(departureTime);
    if (scheduledMinutes === undefined) {
      continue;
    }

    const adjustedDeparture = input.includePassed
      ? normalizeServiceDayMinutes(scheduledMinutes)
      : adjustDepartureMinutes(scheduledMinutes, input.nowMinutes);
    const { arrivals, departures } = buildTripTimeline({
      adjustedDeparture,
      dwellMinutes,
      segmentMinutes,
      stopCount: stopNames.length,
    });
    const stationArrival = arrivals[input.stationIndex]!;
    const stationDeparture = departures[input.stationIndex]!;
    const hasLeftStation =
      referenceMinutes >= stationDeparture || (isTerminal && referenceMinutes >= stationArrival);

    if (hasLeftStation && !input.includePassed) {
      continue;
    }

    let status: TransitStationBoardStatus;
    let minutesToStation: number | undefined;
    if (hasLeftStation) {
      status = 'passed';
      minutesToStation = 0;
    } else if (referenceMinutes < adjustedDeparture) {
      // 首站没有停站时间，发车前 1 分钟内按“即将离开”处理。
      status =
        input.stationIndex === 0 && adjustedDeparture - referenceMinutes <= 1
          ? 'leaving'
          : 'waiting';
    } else if (referenceMinutes < stationArrival) {
      const minutes = Math.max(1, Math.ceil(stationArrival - referenceMinutes));
      status = minutes <= 1 ? 'arriving_now' : 'arriving';
      minutesToStation = minutes;
    } else {
      status = 'leaving';
      minutesToStation = 0;
    }

    entries.push({
      id: `${departureTime}-${index + 1}`,
      ordinal: index + 1,
      departureTime,
      status,
      minutesToStation,
      arrivalMinutes: stationArrival,
      departureMinutes: stationDeparture,
    });
  }

  return entries.sort(
    (left, right) => left.arrivalMinutes - right.arrivalMinutes || left.ordinal - right.ordinal,
  );
}

/**
 * 依据线路首站发车时刻表与站间用时，推算当前时刻每辆车的运行位置。
 * 仅做纯时间推算，不读取任何外部状态，便于在不同页面复用。
 */
export function buildTransitRealtimeSnapshot(input: {
  departureTimes: readonly string[];
  stopNames: readonly string[];
  segmentMinutes: readonly number[];
  nowMinutes: number;
  dwellMinutes?: number;
}): TransitRealtimeSnapshot {
  const stopNames = input.stopNames.filter(Boolean);
  const departureTimes = normalizeDepartureTimes(input.departureTimes);
  if (stopNames.length < 2 || departureTimes.length === 0) {
    return { vehicles: [] };
  }

  const segmentMinutes = normalizeSegmentMinutes(input.segmentMinutes, stopNames.length - 1);
  const dwellMinutes = Math.max(0, input.dwellMinutes ?? defaultDwellMinutes);
  const vehicles: TransitRealtimeVehicle[] = [];
  let nextCandidate: { minutes: number; time: string; dayOffset: number } | undefined;

  for (const [index, departureTime] of departureTimes.entries()) {
    const scheduledMinutes = getTransitClockMinutes(departureTime);
    if (scheduledMinutes === undefined) {
      continue;
    }

    const adjustedDeparture = adjustDepartureMinutes(scheduledMinutes, input.nowMinutes);
    if (adjustedDeparture > input.nowMinutes) {
      const dayOffset = Math.floor(adjustedDeparture / (24 * 60));
      if (!nextCandidate || adjustedDeparture < nextCandidate.minutes) {
        nextCandidate = {
          minutes: adjustedDeparture,
          time: departureTime,
          dayOffset,
        };
      }
      continue;
    }

    const vehicle = resolveVehicleState({
      adjustedDeparture,
      departureTime,
      dwellMinutes,
      nowMinutes: input.nowMinutes,
      ordinal: index + 1,
      segmentMinutes,
      stopNames,
    });
    if (vehicle) {
      vehicles.push(vehicle);
    }
  }

  vehicles.sort(
    (left, right) =>
      (getServiceDayMinutes(left.departureTime) ?? 0) -
        (getServiceDayMinutes(right.departureTime) ?? 0) || left.ordinal - right.ordinal,
  );

  return {
    vehicles,
    nextDepartureTime: nextCandidate?.time,
    nextDepartureDayOffset: nextCandidate?.dayOffset,
  };
}

export function getTransitClockMinutes(value: string): number | undefined {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 24) {
    return undefined;
  }
  if (hours === 24 && minutes !== 0) {
    return undefined;
  }

  return hours * 60 + minutes;
}

export function formatTransitClockMinutes(value: number): string {
  const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function buildTripTimeline(input: {
  adjustedDeparture: number;
  dwellMinutes: number;
  segmentMinutes: number[];
  stopCount: number;
}): { arrivals: number[]; departures: number[] } {
  const arrivals: number[] = [input.adjustedDeparture];
  const departures: number[] = [input.adjustedDeparture];

  for (let index = 1; index < input.stopCount; index += 1) {
    const arrival = departures[index - 1]! + input.segmentMinutes[index - 1]!;
    arrivals.push(arrival);
    departures.push(index === input.stopCount - 1 ? arrival : arrival + input.dwellMinutes);
  }

  return { arrivals, departures };
}

function resolveVehicleState(input: {
  adjustedDeparture: number;
  departureTime: string;
  dwellMinutes: number;
  nowMinutes: number;
  ordinal: number;
  segmentMinutes: number[];
  stopNames: string[];
}): TransitRealtimeVehicle | undefined {
  const { nowMinutes, segmentMinutes, stopNames } = input;
  const { arrivals, departures } = buildTripTimeline({
    adjustedDeparture: input.adjustedDeparture,
    dwellMinutes: input.dwellMinutes,
    segmentMinutes,
    stopCount: stopNames.length,
  });

  const terminalArrival = arrivals.at(-1)!;
  if (nowMinutes < arrivals[0]! || nowMinutes > terminalArrival + input.dwellMinutes) {
    return undefined;
  }

  for (let index = 0; index < stopNames.length; index += 1) {
    const arrival = arrivals[index]!;
    const departure = departures[index]!;
    const isLast = index === stopNames.length - 1;
    const stationEnd = isLast ? arrival + input.dwellMinutes : departure;
    if (nowMinutes >= arrival && nowMinutes < stationEnd) {
      return {
        id: `${input.departureTime}-${input.ordinal}`,
        ordinal: input.ordinal,
        departureTime: input.departureTime,
        status: 'at_station',
        stationName: stopNames[index],
        stationIndex: index,
        stationArrivalMinutes: arrivals,
        stationDepartureMinutes: departures,
        progress: 0,
      };
    }

    const nextArrival = arrivals[index + 1];
    if (nextArrival !== undefined && nowMinutes >= departure && nowMinutes < nextArrival) {
      const segment = segmentMinutes[index] ?? 1;
      const progress = Math.max(0, Math.min(1, (nowMinutes - departure) / segment));
      return {
        id: `${input.departureTime}-${input.ordinal}`,
        ordinal: input.ordinal,
        departureTime: input.departureTime,
        status: 'in_segment',
        segmentIndex: index,
        fromStationName: stopNames[index],
        toStationName: stopNames[index + 1],
        stationArrivalMinutes: arrivals,
        stationDepartureMinutes: departures,
        progress,
        minutesToNextStation: Math.max(1, Math.ceil(nextArrival - nowMinutes)),
      };
    }
  }

  return undefined;
}

function normalizeDepartureTimes(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .filter((value) => getTransitClockMinutes(value) !== undefined)
    .sort((left, right) => (getServiceDayMinutes(left) ?? 0) - (getServiceDayMinutes(right) ?? 0));
}

/** 服务日以 03:00 为界，00:xx 的末班应排在 23:xx 之后。 */
function getServiceDayMinutes(value: string): number | undefined {
  const minutes = getTransitClockMinutes(value);
  if (minutes === undefined) {
    return undefined;
  }
  return minutes < 3 * 60 ? minutes + 24 * 60 : minutes;
}

function normalizeSegmentMinutes(values: readonly number[], count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const value = values[index];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.max(1, Math.round(value))
      : 1;
  });
}

function adjustDepartureMinutes(scheduledMinutes: number, nowMinutes: number): number {
  const halfDayMinutes = 12 * 60;
  if (scheduledMinutes - nowMinutes > halfDayMinutes) {
    // 凌晨查看昨晚的末班：把 23:xx 映射到前一日。
    return scheduledMinutes - 24 * 60;
  }
  if (nowMinutes - scheduledMinutes > halfDayMinutes) {
    // 深夜查看次日首班：把 00:xx / 05:xx 映射到次日。
    return scheduledMinutes + 24 * 60;
  }
  return scheduledMinutes;
}

/** 服务日以 03:00 为界，00:xx–02:59 归入前一日 24:xx 之后，保证全天班次时间轴连续。 */
function normalizeServiceDayMinutes(minutes: number): number {
  return minutes < 3 * 60 ? minutes + 24 * 60 : minutes;
}
