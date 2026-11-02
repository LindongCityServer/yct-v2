import type { TravelTripInstance } from '@yct/contracts';
import { createApiMeta } from './api-meta';
import {
  buildTransitOverview,
  readLegacyTransitOverview,
  type TransitLineSummary,
  type TransitOverview,
} from './legacy-transit';
import { readPublishedTravelScheduleEntitySnapshot } from './published-travel-schedule-read-model';
import { createTimedCache } from './server-cache';
import {
  filterPublicOperatingTransitSnapshot,
  readPublishedTransitEntitySnapshot,
} from './published-transit-read-model';
import { getTransitStationNameMatchKeys } from './transit-station-detail-match';
import { readTransitModeProfiles } from './transit-mode-profile-store';
import { readTransitTripLabelPools } from './transit-trip-label-pool-store';
import {
  getTransitTripLabelServiceDateKey,
  resolveTransitTripLabels,
  type TransitTripLabelLineSource,
  type TransitTripLabelTripSource,
} from './transit-trip-labels';
import { collectStopTravelTimes } from './transit-segment-minutes';
import type { TransitTripInstance, TransitTripStopTime } from './transit-realtime';

const transitOverviewCache = createTimedCache<TransitOverview>(30 * 1000);
const transitRealtimeOverviewCache = createTimedCache<TransitOverview>(30 * 1000);

export async function readTransitOverview(): Promise<TransitOverview> {
  return transitOverviewCache.read('transit-overview', readTransitOverviewUncached);
}

/**
 * 实时公交专用接口：在公开线路快照上附加已发布班次实例，
 * 供到站时间与车辆位置按实际停站（通过不停、逐站停站时长）推算。
 * 附加实例后重新计算标签，让小交路班次按实际折返站参与车辆接续。
 */
export async function readTransitRealtimeOverview(): Promise<TransitOverview> {
  return transitRealtimeOverviewCache.read('transit-realtime-overview', async () =>
    attachTransitTripLabels(await attachTransitTripInstances(await readTransitOverview())),
  );
}

export function clearTransitOverviewCache(): void {
  transitOverviewCache.clear();
  transitRealtimeOverviewCache.clear();
}

export async function readMaterialTransitOverview(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (!publishedSnapshot) {
    return { ...(await readLegacyTransitOverview()), modeProfiles };
  }
  return {
    ...buildTransitOverview(
      publishedSnapshot,
      createApiMeta(
        'ready',
        `物料目录包含 ${publishedSnapshot.lines.length} 条已发布线路（含规划及关闭对象）。`,
      ),
    ),
    modeProfiles,
  };
}

async function readTransitOverviewUncached(): Promise<TransitOverview> {
  const modeProfiles = await readTransitModeProfiles();
  const publishedSnapshot = await readPublishedTransitEntitySnapshot();
  if (publishedSnapshot) {
    const publicSnapshot = filterPublicOperatingTransitSnapshot(publishedSnapshot);
    return attachTransitTripLabels({
      ...buildTransitOverview(
        {
          summary: publicSnapshot.summary,
          lines: publicSnapshot.lines,
          stations: publicSnapshot.stations,
          stationDetails: publicSnapshot.stationDetails,
        },
        createApiMeta(
          'ready',
          `公开 ${publicSnapshot.lines.length} 条已运营线路，来源批次 ${publicSnapshot.sourceRevisionIds.length} 个。`,
        ),
      ),
      modeProfiles,
    });
  }

  return attachTransitTripLabels({
    ...(await readLegacyTransitOverview()),
    modeProfiles,
  });
}

/**
 * 依据全局标签池与当天日期补齐班次标签；手动标签在算法里优先且占用时间窗。
 * 有班次实例时按每班实际首末站计算，小交路折返后停在中途折返站。
 */
async function attachTransitTripLabels(overview: TransitOverview): Promise<TransitOverview> {
  if (overview.lines.length === 0) {
    return overview;
  }
  const pools = await readTransitTripLabelPools();
  if (pools.length === 0) {
    return overview;
  }
  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  // 已保存标签里属于池内的是自动抽取结果，需要每天重新参与计算；
  // 只有池外的自定义标签才是真正的手动标签，必须固定占用车辆。
  const collectManualLabels = (line: TransitOverview['lines'][number]) => {
    const manual: { down?: Record<string, string>; up?: Record<string, string> } = {};
    for (const direction of ['down', 'up'] as const) {
      const saved = line.tripLabelsByDirection?.[direction];
      if (!saved) {
        continue;
      }
      const poolIds = line.tripLabelConfigByDirection?.[direction]?.poolIds ?? [];
      const automaticLabels = new Set(
        poolIds.flatMap((poolId) => poolById.get(poolId)?.labels ?? []),
      );
      const entries = Object.entries(saved).filter(
        ([, label]) => label.trim() && !automaticLabels.has(label.trim()),
      );
      if (entries.length > 0) {
        manual[direction] = Object.fromEntries(entries);
      }
    }
    return manual;
  };

  const labels = resolveTransitTripLabels({
    dateKey: getTransitTripLabelServiceDateKey(),
    lines: overview.lines.map((line) => {
      const stationStops = [...(line.stationStops ?? [])].sort(
        (left, right) => left.sequence - right.sequence,
      );
      return {
        ...line,
        stationSourceIds: stationStops
          .map((stop) => stop.stationSourceId)
          .filter((stationSourceId): stationSourceId is string => Boolean(stationSourceId)),
        stopTravelTimes: collectStopTravelTimes(stationStops),
        tripDurationMinutes: measureTransitTripDuration(line.tripInstances),
        tripsByDirection: buildTripLabelSources(line),
        tripLabelsByDirection: collectManualLabels(line),
      };
    }),
    pools,
  });
  if (labels.size === 0) {
    return overview;
  }

  return {
    ...overview,
    lines: overview.lines.map((line) => {
      const tripLabels = labels.get(line.id);
      return tripLabels ? { ...line, tripLabelsByDirection: tripLabels } : line;
    }),
  };
}

/**
 * 把已发布班次实例附加到同名线路；班次首末站必须落在该线路上，
 * 避免同名不同线路（如客运与公交）之间互相串数据。
 */
async function attachTransitTripInstances(overview: TransitOverview): Promise<TransitOverview> {
  if (overview.lines.length === 0) {
    return overview;
  }
  const published = await readPublishedTravelScheduleEntitySnapshot().catch(() => undefined);
  if (!published || published.trips.length === 0) {
    return overview;
  }

  const lineByKey = new Map<string, TransitLineSummary>();
  for (const line of overview.lines) {
    const key = normalizeTransitName(line.name);
    if (key && !lineByKey.has(key)) {
      lineByKey.set(key, line);
    }
  }

  const tripsByLineId = new Map<string, TransitTripInstance[]>();
  for (const trip of published.trips) {
    const line = lineByKey.get(normalizeTransitName(trip.lineName));
    if (!line) {
      continue;
    }
    const instance = buildRealtimeTripInstance(trip);
    if (!instance) {
      continue;
    }
    const lineStationKeys = new Set(
      line.stationNames.flatMap((stationName) => getTransitStationNameMatchKeys(stationName)),
    );
    const servesLine = [instance.stationNames[0], instance.stationNames.at(-1)].every(
      (stationName) =>
        stationName !== undefined &&
        getTransitStationNameMatchKeys(stationName).some((key) => lineStationKeys.has(key)),
    );
    if (!servesLine) {
      continue;
    }
    const trips = tripsByLineId.get(line.id) ?? [];
    trips.push(instance);
    tripsByLineId.set(line.id, trips);
  }

  if (tripsByLineId.size === 0) {
    return overview;
  }

  return {
    ...overview,
    lines: overview.lines.map((line) => {
      const trips = tripsByLineId.get(line.id);
      return trips ? { ...line, tripInstances: trips } : line;
    }),
  };
}

/** 精简班次实例字段，去掉实时公交不需要的售票与审批信息。 */
function buildRealtimeTripInstance(trip: TravelTripInstance): TransitTripInstance | undefined {
  const stationNames = (trip.stationNames ?? []).filter(Boolean);
  if (stationNames.length < 2 || !trip.departureTime) {
    return undefined;
  }
  const stopTimes = (trip.stopTimes ?? [])
    .filter((stopTime) => Boolean(stopTime.stationName))
    .map((stopTime): TransitTripStopTime => ({
      stationName: stopTime.stationName,
      isStop: stopTime.isStop,
      arrivalTime: stopTime.arrivalTime,
      departureTime: stopTime.departureTime,
      arrivalDayOffset: stopTime.arrivalDayOffset,
      departureDayOffset: stopTime.departureDayOffset,
      dwellMinutes: stopTime.dwellMinutes,
    }));

  return {
    tripCode: trip.tripCode,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    arrivalDayOffset: trip.arrivalDayOffset,
    serviceNature: trip.serviceNature,
    routeNote: trip.routeNote,
    stationNames,
    stopTimes: stopTimes.length > 0 ? stopTimes : undefined,
    originStationName: trip.originStationName,
    destinationStationName: trip.destinationStationName,
  };
}

function normalizeTransitName(value: string | undefined): string {
  return (value ?? '')
    .replace(/[\s\u3000|｜]+/gu, '')
    .trim()
    .toLocaleLowerCase('zh-CN');
}

/**
 * 从已发布班次实例提取每班实际起终点与时长，按方向分组。
 * 小交路（区间车）靠这份数据参与车辆接续，避免被当成跑完整条大交路。
 */
function buildTripLabelSources(
  line: TransitOverview['lines'][number],
): TransitTripLabelLineSource['tripsByDirection'] {
  const trips = line.tripInstances;
  if (!trips || trips.length === 0) {
    return undefined;
  }
  const stationOrder = new Map<string, number>();
  line.stationNames.forEach((stationName, index) => {
    for (const key of getTransitStationNameMatchKeys(stationName)) {
      if (!stationOrder.has(key)) {
        stationOrder.set(key, index);
      }
    }
  });
  const resolveIndex = (stationName: string | undefined): number | undefined => {
    if (!stationName) {
      return undefined;
    }
    for (const key of getTransitStationNameMatchKeys(stationName)) {
      const index = stationOrder.get(key);
      if (index !== undefined) {
        return index;
      }
    }
    return undefined;
  };

  const down: TransitTripLabelTripSource[] = [];
  const up: TransitTripLabelTripSource[] = [];
  for (const trip of trips) {
    const originStationName = trip.originStationName ?? trip.stationNames[0];
    const destinationStationName = trip.destinationStationName ?? trip.stationNames.at(-1);
    const originIndex = resolveIndex(originStationName);
    const destinationIndex = resolveIndex(destinationStationName);
    if (
      originIndex === undefined ||
      destinationIndex === undefined ||
      originIndex === destinationIndex
    ) {
      continue;
    }
    const source: TransitTripLabelTripSource = {
      departureTime: trip.departureTime,
      originStationName,
      destinationStationName,
      durationMinutes: measureTripInstanceDuration(trip),
    };
    (originIndex < destinationIndex ? down : up).push(source);
  }
  if (down.length === 0 && up.length === 0) {
    return undefined;
  }
  return { down, up };
}

/** 单个班次实例的实测运行时长（分钟）。 */
function measureTripInstanceDuration(trip: TransitTripInstance): number | undefined {
  const start = parseClockMinutes(trip.departureTime);
  const end = parseClockMinutes(trip.arrivalTime ?? trip.stopTimes?.at(-1)?.arrivalTime);
  const endDayOffset = trip.arrivalDayOffset ?? trip.stopTimes?.at(-1)?.arrivalDayOffset ?? 0;
  if (start === undefined || end === undefined) {
    return undefined;
  }
  const duration = end + endDayOffset * 24 * 60 - start;
  return duration > 0 && duration <= 12 * 60 ? duration : undefined;
}

/** 用已发布班次实例实测单班运行时长，供标签算法判断车辆何时可用。 */
function measureTransitTripDuration(
  trips: readonly TransitTripInstance[] | undefined,
): number | undefined {
  if (!trips || trips.length === 0) {
    return undefined;
  }
  const durations = trips
    .map((trip) => measureTripInstanceDuration(trip))
    .filter((duration): duration is number => duration !== undefined)
    .sort((left, right) => left - right);
  return durations.length > 0 ? durations[Math.floor(durations.length / 2)] : undefined;
}

function parseClockMinutes(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/u);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours > 23 || minutes > 59 ? undefined : hours * 60 + minutes;
}
