import { getTransitStationNameMatchKeys } from './transit-station-detail-match';

export type TransitRealtimeVehicleStatus = 'at_station' | 'in_segment';

export interface TransitRealtimeVehicle {
  id: string;
  /** 当日按发车时刻排序后的班次序号，从 1 开始。 */
  ordinal: number;
  /** 首站计划发车时刻，保留线路数据中的 HH:mm 文本。 */
  departureTime: string;
  /** 班次性质文本（如“快速”“直达”），来自已发布班次实例。 */
  serviceNature?: string;
  tripCode?: string;
  status: TransitRealtimeVehicleStatus;
  stationName?: string;
  /** 停靠站或所在区间起点站在当前方向站序中的索引。 */
  stationIndex?: number;
  segmentIndex?: number;
  fromStationName?: string;
  toStationName?: string;
  /** 当前区间/停靠站的完整到站分钟序列，方向站序中未经过的车站为 undefined。 */
  stationArrivalMinutes?: Array<number | undefined>;
  /** 当前区间/停靠站的完整离站分钟序列，供判断是否已驶离选中站。 */
  stationDepartureMinutes?: Array<number | undefined>;
  /** 当前区间的行驶进度，0 表示刚离开上一站，1 表示即将到达下一站。 */
  progress: number;
  minutesToNextStation?: number;
}

/** 已发布班次实例中的单站时刻，字段与 TravelTripStopTime 对齐。 */
export interface TransitTripStopTime {
  stationName: string;
  isStop: boolean;
  arrivalTime?: string;
  departureTime?: string;
  arrivalDayOffset?: number;
  departureDayOffset?: number;
  dwellMinutes?: number;
}

/** 已发布班次实例中实时公交需要的精简字段。 */
export interface TransitTripInstance {
  tripCode?: string;
  departureTime: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  serviceNature?: string;
  /** 班次备注，例如“原夜经济班次并入”。 */
  routeNote?: string;
  stationNames: string[];
  stopTimes?: TransitTripStopTime[];
  originStationName?: string;
  destinationStationName?: string;
}

/** 线路发车规则中的特殊班次标注。 */
export interface TransitSpecialTripInfo {
  serviceNature?: string;
  routeNote?: string;
  /** 短交路经停站名（按当前方向站序）；缺省表示停靠整条线路。 */
  stationNames?: string[];
}

/**
 * 单个班次相对首站发车的时刻偏移（分钟）。
 * 数组与当前方向站序一一对应；班次未经过的车站为 undefined，
 * 经过但“通过不停”的车站 isStop 为 false 且到离站偏移相同。
 */
export interface TransitRealtimeSchedule {
  departureTime: string;
  /** 当日按发车时刻排序后的班次序号，从 1 开始。 */
  ordinal: number;
  serviceNature?: string;
  /** 班次备注，例如短交路或并入说明。 */
  routeNote?: string;
  tripCode?: string;
  arrivalOffsets: Array<number | undefined>;
  departureOffsets: Array<number | undefined>;
  isStop: boolean[];
  /** 班次实际经过的站序索引，按行驶顺序排列。 */
  servedStopIndexes: number[];
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
  /** 班次性质文本，来自已发布班次实例或线路特殊班次标注。 */
  serviceNature?: string;
  /** 班次备注，例如短交路或并入说明。 */
  routeNote?: string;
  tripCode?: string;
  status: TransitStationBoardStatus;
  /** 尚未到达选中站时，距离到站的分钟数。 */
  minutesToStation?: number;
  arrivalMinutes: number;
  departureMinutes: number;
  /** 本班次实际经停的站数。 */
  servedStopCount: number;
  /** 本方向线路总站数。 */
  totalStopCount: number;
}

const defaultDwellMinutes = 1;

/** 运营时刻统一按北京时间（UTC+8）计算，不随浏览器本地时区变化。 */
export function getBeijingClockMinutes(date: Date = new Date()): number {
  return (date.getUTCHours() * 60 + date.getUTCMinutes() + 8 * 60) % (24 * 60);
}

/**
 * 生成方向内每个班次的时刻偏移表。
 * 优先使用已发布班次实例（含“通过不停”与逐站停站时长）；
 * 没有匹配实例时回退到线路首站发车时刻 + 区间用时（每站统一停站）。
 */
export function buildTransitSchedules(input: {
  departureTimes?: readonly string[];
  trips?: readonly TransitTripInstance[];
  stopNames: readonly string[];
  segmentMinutes: readonly number[];
  dwellMinutes?: number;
  /** 线路规则中的特殊班次标注，键为首站发车时刻（HH:mm）。 */
  specialTrips?: Record<string, TransitSpecialTripInfo>;
}): TransitRealtimeSchedule[] {
  const stopNames = input.stopNames.filter(Boolean);
  if (stopNames.length < 2) {
    return [];
  }

  const segmentMinutes = normalizeSegmentMinutes(input.segmentMinutes, stopNames.length - 1);
  const dwellMinutes = Math.max(0, input.dwellMinutes ?? defaultDwellMinutes);
  const stopMatchKeys = stopNames.map((name) => new Set(getTransitStationNameMatchKeys(name)));
  const findStopIndex = (name: string | undefined): number | undefined => {
    if (!name) {
      return undefined;
    }
    const keys = getTransitStationNameMatchKeys(name);
    const index = stopMatchKeys.findIndex((candidates) => keys.some((key) => candidates.has(key)));
    return index >= 0 ? index : undefined;
  };

  const tripSchedules = (input.trips ?? [])
    .map((trip): Omit<TransitRealtimeSchedule, 'ordinal'> | undefined => {
      const schedule = buildTripSchedule({
        trip,
        stopNames,
        findStopIndex,
        segmentMinutes,
        dwellMinutes,
      });
      if (!schedule) {
        return undefined;
      }
      const special = input.specialTrips?.[trip.departureTime];
      return {
        ...schedule,
        serviceNature: schedule.serviceNature || special?.serviceNature,
        routeNote: schedule.routeNote ?? special?.routeNote,
      };
    })
    .filter(
      (schedule): schedule is Omit<TransitRealtimeSchedule, 'ordinal'> => schedule !== undefined,
    )
    .sort(
      (left, right) =>
        (getServiceDayMinutes(left.departureTime) ?? 0) -
        (getServiceDayMinutes(right.departureTime) ?? 0),
    )
    .map((schedule, index) => ({ ...schedule, ordinal: index + 1 }));

  if (tripSchedules.length > 0) {
    // 已发布班次实例优先；线路配置里尚未生成实例的发车时刻继续兜底，避免班次缺失。
    const coveredDepartures = new Set(
      tripSchedules
        .map((schedule) => getServiceDayMinutes(schedule.departureTime))
        .filter((minutes): minutes is number => minutes !== undefined),
    );
    const fallbackSchedules = normalizeDepartureTimes(input.departureTimes ?? [])
      .filter((departureTime) => {
        const minutes = getServiceDayMinutes(departureTime);
        return minutes === undefined || !coveredDepartures.has(minutes);
      })
      .map((departureTime) =>
        buildDepartureSchedule({
          departureTime,
          stopNames,
          stopCount: stopNames.length,
          segmentMinutes,
          dwellMinutes,
          findStopIndex,
          special: input.specialTrips?.[departureTime],
        }),
      );

    return [...tripSchedules, ...fallbackSchedules]
      .sort(
        (left, right) =>
          (getServiceDayMinutes(left.departureTime) ?? 0) -
          (getServiceDayMinutes(right.departureTime) ?? 0),
      )
      .map((schedule, index) => ({ ...schedule, ordinal: index + 1 }));
  }

  return normalizeDepartureTimes(input.departureTimes ?? []).map((departureTime, index) => ({
    ...buildDepartureSchedule({
      departureTime,
      stopNames,
      stopCount: stopNames.length,
      segmentMinutes,
      dwellMinutes,
      findStopIndex,
      special: input.specialTrips?.[departureTime],
    }),
    ordinal: index + 1,
  }));
}

/**
 * 生成选中站点的班次看板，按到站时间排序。
 * 默认仅保留尚未离开该站的班次；includePassed 为 true 时按服务日（03:00 为界）
 * 保留全天所有班次，已驶离该站的班次以 passed 状态返回，供“全部班次”列表使用。
 * 班次未经过该站、或在该站“通过不停”时不进入看板。
 */
export function buildTransitStationBoard(input: {
  schedules: readonly TransitRealtimeSchedule[];
  stationIndex: number;
  nowMinutes: number;
  includePassed?: boolean;
}): TransitStationBoardEntry[] {
  const { stationIndex } = input;
  if (stationIndex < 0 || input.schedules.length === 0) {
    return [];
  }

  // “全部班次”按服务日时间轴展示，避免把清晨班次误判为次日班次。
  const referenceMinutes = input.includePassed
    ? normalizeServiceDayMinutes(input.nowMinutes)
    : input.nowMinutes;
  const entries: TransitStationBoardEntry[] = [];

  for (const schedule of input.schedules) {
    const arrivalOffset = schedule.arrivalOffsets[stationIndex];
    if (arrivalOffset === undefined || schedule.isStop[stationIndex] === false) {
      continue;
    }

    const scheduledMinutes = getTransitClockMinutes(schedule.departureTime);
    if (scheduledMinutes === undefined) {
      continue;
    }

    const adjustedDeparture = input.includePassed
      ? normalizeServiceDayMinutes(scheduledMinutes)
      : adjustDepartureMinutes(scheduledMinutes, input.nowMinutes);
    const departureOffset = schedule.departureOffsets[stationIndex] ?? arrivalOffset;
    const stationArrival = adjustedDeparture + arrivalOffset;
    const stationDeparture = adjustedDeparture + departureOffset;
    // 终到站与通过站的到离站偏移相同，抵达即视为驶离。
    const hasLeftStation =
      referenceMinutes >= stationDeparture ||
      (departureOffset === arrivalOffset && referenceMinutes >= stationArrival);

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
        stationIndex === 0 && adjustedDeparture - referenceMinutes <= 1 ? 'leaving' : 'waiting';
    } else if (referenceMinutes < stationArrival) {
      const minutes = Math.max(1, Math.ceil(stationArrival - referenceMinutes));
      status = minutes <= 1 ? 'arriving_now' : 'arriving';
      minutesToStation = minutes;
    } else {
      status = 'leaving';
      minutesToStation = 0;
    }

    entries.push({
      id: `${schedule.departureTime}-${schedule.ordinal}`,
      ordinal: schedule.ordinal,
      departureTime: schedule.departureTime,
      serviceNature: schedule.serviceNature,
      routeNote: schedule.routeNote,
      tripCode: schedule.tripCode,
      status,
      minutesToStation,
      arrivalMinutes: stationArrival,
      departureMinutes: stationDeparture,
      servedStopCount: schedule.servedStopIndexes.length,
      totalStopCount: schedule.isStop.length,
    });
  }

  return entries.sort(
    (left, right) => left.arrivalMinutes - right.arrivalMinutes || left.ordinal - right.ordinal,
  );
}

/**
 * 依据班次时刻表推算当前时刻每辆车的运行位置。
 * 仅做纯时间推算，不读取任何外部状态，便于在不同页面复用。
 */
export function buildTransitRealtimeSnapshot(input: {
  schedules: readonly TransitRealtimeSchedule[];
  stopNames: readonly string[];
  segmentMinutes: readonly number[];
  nowMinutes: number;
}): TransitRealtimeSnapshot {
  const stopNames = input.stopNames.filter(Boolean);
  if (stopNames.length < 2 || input.schedules.length === 0) {
    return { vehicles: [] };
  }

  const segmentMinutes = normalizeSegmentMinutes(input.segmentMinutes, stopNames.length - 1);
  const vehicles: TransitRealtimeVehicle[] = [];
  let nextCandidate: { minutes: number; time: string; dayOffset: number } | undefined;

  for (const schedule of input.schedules) {
    const scheduledMinutes = getTransitClockMinutes(schedule.departureTime);
    if (scheduledMinutes === undefined) {
      continue;
    }

    const adjustedDeparture = adjustDepartureMinutes(scheduledMinutes, input.nowMinutes);
    if (adjustedDeparture > input.nowMinutes) {
      const dayOffset = Math.floor(adjustedDeparture / (24 * 60));
      if (!nextCandidate || adjustedDeparture < nextCandidate.minutes) {
        nextCandidate = {
          minutes: adjustedDeparture,
          time: schedule.departureTime,
          dayOffset,
        };
      }
      continue;
    }

    const vehicle = resolveScheduleVehicle({
      schedule,
      adjustedDeparture,
      nowMinutes: input.nowMinutes,
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

/**
 * 由线路首站发车时刻生成班次时刻表（没有班次实例时的回退）。
 * 若该发车时刻带有特殊班次标注，则按短交路经停站生成，未经停的站不进入看板。
 */
function buildDepartureSchedule(input: {
  departureTime: string;
  stopCount: number;
  stopNames: readonly string[];
  segmentMinutes: number[];
  dwellMinutes: number;
  findStopIndex: (name: string | undefined) => number | undefined;
  special?: TransitSpecialTripInfo;
}): Omit<TransitRealtimeSchedule, 'ordinal'> {
  const arrivalOffsets: Array<number | undefined> = Array.from(
    { length: input.stopCount },
    () => undefined,
  );
  const departureOffsets: Array<number | undefined> = Array.from(
    { length: input.stopCount },
    () => undefined,
  );
  const isStop = Array.from({ length: input.stopCount }, () => false);

  const requestedIndexes = Array.from(
    new Set(
      (input.special?.stationNames ?? [])
        .map((stationName) => input.findStopIndex(stationName))
        .filter((index): index is number => index !== undefined),
    ),
  );
  // 只有站名全部能匹配且保持本方向单调递增时才按短交路处理，避免异常数据把整条线路吞掉。
  const servedStopIndexes =
    requestedIndexes.length >= 2 &&
    requestedIndexes.every((index, position) => position === 0 || index > requestedIndexes[position - 1]!)
      ? requestedIndexes
      : Array.from({ length: input.stopCount }, (_, index) => index);

  const sumSegmentMinutes = (fromIndex: number, toIndex: number): number => {
    let total = 0;
    for (let index = fromIndex; index < toIndex; index += 1) {
      total += input.segmentMinutes[index] ?? 1;
    }
    return total > 0 ? total : 1;
  };

  let previousDeparture = 0;
  let previousIndex = servedStopIndexes[0] ?? 0;
  servedStopIndexes.forEach((stopIndex, position) => {
    const isLast = position === servedStopIndexes.length - 1;
    const arrival =
      position === 0 ? 0 : previousDeparture + sumSegmentMinutes(previousIndex, stopIndex);
    const departure = isLast ? arrival : arrival + input.dwellMinutes;
    arrivalOffsets[stopIndex] = arrival;
    departureOffsets[stopIndex] = departure;
    isStop[stopIndex] = true;
    previousDeparture = departure;
    previousIndex = stopIndex;
  });

  return {
    departureTime: input.departureTime,
    serviceNature: input.special?.serviceNature,
    routeNote: input.special?.routeNote,
    arrivalOffsets,
    departureOffsets,
    isStop,
    servedStopIndexes,
  };
}

/**
 * 将单条班次实例转换为与方向站序对齐的时刻偏移表。
 * 班次首末站与当前方向不一致时返回 undefined，交由调用方过滤。
 */
function buildTripSchedule(input: {
  trip: TransitTripInstance;
  stopNames: string[];
  findStopIndex: (name: string | undefined) => number | undefined;
  segmentMinutes: number[];
  dwellMinutes: number;
}): Omit<TransitRealtimeSchedule, 'ordinal'> | undefined {
  const { trip, stopNames } = input;
  const baseDeparture = getTransitClockMinutes(trip.departureTime);
  if (baseDeparture === undefined) {
    return undefined;
  }

  const originName = trip.originStationName ?? trip.stationNames[0];
  const destinationName = trip.destinationStationName ?? trip.stationNames.at(-1);
  if (!originName || !destinationName) {
    return undefined;
  }

  const mappedStops = trip.stationNames
    .map((stationName, stationIndex) => {
      const lineStopIndex = input.findStopIndex(stationName);
      if (lineStopIndex === undefined) {
        return undefined;
      }
      return { lineStopIndex, stopTime: trip.stopTimes?.[stationIndex] };
    })
    .filter(
      (stop): stop is { lineStopIndex: number; stopTime: TransitTripStopTime | undefined } =>
        stop !== undefined,
    );
  if (mappedStops.length < 2) {
    return undefined;
  }

  // 只接受与本方向站序同向的班次；反向班次映射后索引会递减，交给另一方向处理。
  // 用单调性判断可同时覆盖全程班次与小交路（区间车）。
  const sameDirection = mappedStops.every(
    (stop, index) => index === 0 || stop.lineStopIndex >= mappedStops[index - 1]!.lineStopIndex,
  );
  if (!sameDirection) {
    return undefined;
  }

  const firstStopTime = trip.stopTimes?.[0];
  const baseMinutes =
    parseTransitStopMinutes(firstStopTime?.departureTime, firstStopTime?.departureDayOffset) ??
    parseTransitStopMinutes(firstStopTime?.arrivalTime, firstStopTime?.arrivalDayOffset) ??
    baseDeparture;
  // 跨日班次的相对偏移需保持单调递增；只有明显跨日（超过半天）才加一天，
  // 避免相邻站时刻抖动被放大成 24 小时。
  const alignOffset = (value: number, minimum: number): number => {
    let result = value;
    while (result < minimum - 12 * 60) {
      result += 24 * 60;
    }
    return Math.max(minimum, result);
  };
  const fallbackTravelMinutes = (fromStopIndex: number, toStopIndex: number): number => {
    const from = Math.min(fromStopIndex, toStopIndex);
    const to = Math.max(fromStopIndex, toStopIndex);
    let total = 0;
    for (let index = from; index < to; index += 1) {
      total += input.segmentMinutes[index] ?? 1;
    }
    return total > 0 ? total : 1;
  };

  const arrivalOffsets: Array<number | undefined> = Array.from(
    { length: stopNames.length },
    () => undefined,
  );
  const departureOffsets: Array<number | undefined> = Array.from(
    { length: stopNames.length },
    () => undefined,
  );
  const isStop = Array.from({ length: stopNames.length }, () => false);
  const servedStopIndexes: number[] = [];
  let previousDepartureOffset = 0;
  let previousStopIndex: number | undefined;

  mappedStops.forEach((stop, index) => {
    const isLast = index === mappedStops.length - 1;
    const explicitArrival = parseTransitStopMinutes(
      stop.stopTime?.arrivalTime,
      stop.stopTime?.arrivalDayOffset,
    );
    const explicitDeparture = parseTransitStopMinutes(
      stop.stopTime?.departureTime,
      stop.stopTime?.departureDayOffset,
    );
    const arrivalOffset =
      index === 0
        ? 0
        : explicitArrival !== undefined
          ? alignOffset(explicitArrival - baseMinutes, previousDepartureOffset)
          : previousDepartureOffset +
            fallbackTravelMinutes(previousStopIndex ?? stop.lineStopIndex, stop.lineStopIndex);
    const stopping = stop.stopTime?.isStop ?? true;
    let departureOffset: number;
    if (isLast) {
      departureOffset = arrivalOffset;
    } else if (explicitDeparture !== undefined) {
      departureOffset = Math.max(
        arrivalOffset,
        alignOffset(explicitDeparture - baseMinutes, arrivalOffset),
      );
    } else {
      departureOffset =
        arrivalOffset + (stopping ? (stop.stopTime?.dwellMinutes ?? input.dwellMinutes) : 0);
    }

    arrivalOffsets[stop.lineStopIndex] = arrivalOffset;
    departureOffsets[stop.lineStopIndex] = Math.max(arrivalOffset, departureOffset);
    isStop[stop.lineStopIndex] = stopping || isLast;
    if (isLast || !servedStopIndexes.includes(stop.lineStopIndex)) {
      servedStopIndexes.push(stop.lineStopIndex);
    }
    previousDepartureOffset = departureOffset;
    previousStopIndex = stop.lineStopIndex;
  });

  return {
    departureTime: trip.departureTime,
    serviceNature: trip.serviceNature || undefined,
    routeNote: trip.routeNote,
    tripCode: trip.tripCode,
    arrivalOffsets,
    departureOffsets,
    isStop,
    servedStopIndexes,
  };
}

/** 解析班次单站时刻为“分钟数 + 跨日偏移”的绝对值。 */
function parseTransitStopMinutes(value?: string, dayOffset?: number): number | undefined {
  if (!value) {
    return undefined;
  }
  const minutes = getTransitClockMinutes(value);
  if (minutes === undefined) {
    return undefined;
  }
  return minutes + (dayOffset ?? 0) * (24 * 60);
}

function resolveScheduleVehicle(input: {
  schedule: TransitRealtimeSchedule;
  adjustedDeparture: number;
  nowMinutes: number;
  segmentMinutes: number[];
  stopNames: string[];
}): TransitRealtimeVehicle | undefined {
  const { schedule, adjustedDeparture, nowMinutes, segmentMinutes, stopNames } = input;
  const arrivalMinutes = schedule.arrivalOffsets.map((offset) =>
    offset === undefined ? undefined : adjustedDeparture + offset,
  );
  const departureMinutes = schedule.departureOffsets.map((offset) =>
    offset === undefined ? undefined : adjustedDeparture + offset,
  );
  // 通过不停的车站不产生停站窗口，但保留首末站作为运行区间的锚点。
  const anchors = schedule.servedStopIndexes
    .map((stopIndex) => ({
      stopIndex,
      arrival: arrivalMinutes[stopIndex],
      departure: departureMinutes[stopIndex],
      isStop: schedule.isStop[stopIndex] !== false,
    }))
    .filter(
      (anchor, index, list) =>
        anchor.arrival !== undefined &&
        anchor.departure !== undefined &&
        (anchor.isStop || index === 0 || index === list.length - 1),
    );
  if (anchors.length < 2) {
    return undefined;
  }

  const firstAnchor = anchors[0]!;
  const lastAnchor = anchors.at(-1)!;
  if (nowMinutes < firstAnchor.arrival! || nowMinutes > lastAnchor.departure!) {
    return undefined;
  }

  const base = {
    id: `${schedule.departureTime}-${schedule.ordinal}`,
    ordinal: schedule.ordinal,
    departureTime: schedule.departureTime,
    serviceNature: schedule.serviceNature,
    tripCode: schedule.tripCode,
    stationArrivalMinutes: arrivalMinutes,
    stationDepartureMinutes: departureMinutes,
  };

  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index]!;
    if (nowMinutes >= current.arrival! && nowMinutes < current.departure!) {
      return {
        ...base,
        status: 'at_station',
        stationName: stopNames[current.stopIndex],
        stationIndex: current.stopIndex,
        progress: 0,
      };
    }

    const next = anchors[index + 1];
    if (!next || nowMinutes < current.departure! || nowMinutes >= next.arrival!) {
      continue;
    }

    const position = resolveSegmentPosition({
      fromStopIndex: current.stopIndex,
      toStopIndex: next.stopIndex,
      departureMinutes: current.departure!,
      arrivalMinutes: next.arrival!,
      nowMinutes,
      segmentMinutes,
    });
    return {
      ...base,
      status: 'in_segment',
      segmentIndex: position.segmentIndex,
      fromStationName: stopNames[current.stopIndex],
      toStationName: stopNames[next.stopIndex],
      progress: position.progress,
      minutesToNextStation: Math.max(1, Math.ceil(next.arrival! - nowMinutes)),
    };
  }

  return undefined;
}

/** 跨多个线路区间时，按区间基准用时比例拆分行驶进度。 */
function resolveSegmentPosition(input: {
  fromStopIndex: number;
  toStopIndex: number;
  departureMinutes: number;
  arrivalMinutes: number;
  nowMinutes: number;
  segmentMinutes: number[];
}): { segmentIndex: number; progress: number } {
  const from = Math.min(input.fromStopIndex, input.toStopIndex);
  const to = Math.max(input.fromStopIndex, input.toStopIndex);
  const span = to - from;
  if (span <= 0) {
    return { segmentIndex: from, progress: 0 };
  }

  const durations = Array.from({ length: span }, (_, index) =>
    Math.max(1, input.segmentMinutes[from + index] ?? 1),
  );
  const total = durations.reduce((sum, value) => sum + value, 0);
  const legDuration = Math.max(1, input.arrivalMinutes - input.departureMinutes);
  const ratio = Math.max(0, Math.min(1, (input.nowMinutes - input.departureMinutes) / legDuration));
  let target = ratio * total;

  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index]!;
    if (target < duration || index === durations.length - 1) {
      return {
        segmentIndex: from + index,
        progress: Math.max(0, Math.min(1, target / duration)),
      };
    }
    target -= duration;
  }

  return { segmentIndex: to - 1, progress: 1 };
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
