import type { TransitTripLabelMode, TransitTripLabelPool } from '@yct/contracts';
import {
  resolveLegacySegmentMinutes,
  resolveLineSegmentMinutes,
  resolveLineTotalMinutes,
  type TransitSegmentPathLike,
} from './transit-segment-minutes';
import { getTransitStationNameMatchKeys } from './transit-station-detail-match';

/** 单班实际起终点与运行时长；小交路（区间车）依赖它判断折返位置。 */
export interface TransitTripLabelTripSource {
  /** 首站发车时刻，同时作为标签映射的键。 */
  departureTime: string;
  originStationName?: string;
  destinationStationName?: string;
  /** 实测运行时长（分钟）；缺失时按线路区间用时切片累计。 */
  durationMinutes?: number;
}

/** 无班次实例时的短交路标注，键为首站发车时刻。 */
export interface TransitTripLabelSpecialTripSource {
  /** 短交路经停站名（按本方向站序）；缺省表示整条线路。 */
  stationNames?: string[];
}

export interface TransitTripLabelLineSource {
  id: string;
  /** 线路大交路站序；用于判断车辆在终点站的就近接续。 */
  stationNames?: string[];
  /** 与 stationNames 同序的站点 ID，用于匹配 segmentPaths。 */
  stationSourceIds?: string[];
  /** 与 stationNames 同序的旧数据 travelTime，供区间用时兜底。 */
  stopTravelTimes?: Array<number | undefined>;
  /** 实测单班运行时长（分钟），优先于区间配置与兜底值。 */
  tripDurationMinutes?: number;
  /** 每班实际起终点；有班次实例时优先使用，避免把小交路当成全线班次。 */
  tripsByDirection?: {
    down?: TransitTripLabelTripSource[];
    up?: TransitTripLabelTripSource[];
  };
  /** 无班次实例时的短交路经停站标注，键为首站发车时刻。 */
  specialTripsByDirection?: {
    down?: Record<string, TransitTripLabelSpecialTripSource>;
    up?: Record<string, TransitTripLabelSpecialTripSource>;
  };
  departureTimesByDirection?: {
    down?: string[];
    up?: string[];
  };
  tripLabelConfigByDirection?: {
    down?: { poolIds: string[]; mode: TransitTripLabelMode };
    up?: { poolIds: string[]; mode: TransitTripLabelMode };
  };
  tripLabelsByDirection?: {
    down?: Record<string, string>;
    up?: Record<string, string>;
  };
  segmentPaths?: TransitSegmentPathLike[];
}

export interface TransitTripLabelsByDirection {
  down?: Record<string, string>;
  up?: Record<string, string>;
}

export interface ResolveTransitTripLabelsInput {
  /** 北京时间服务日，例如 2026-10-27；随机抽取同一天对所有人稳定一致。 */
  dateKey: string;
  lines: readonly TransitTripLabelLineSource[];
  pools: readonly TransitTripLabelPool[];
  /** 无法从区间用时推算时使用的单程时长，用于判断标签占用窗口。 */
  defaultTripDurationMinutes?: number;
  /** 终点折返作业的最短时间（分钟），用于判断同车能否接续下一班。 */
  turnaroundMinutes?: number;
}

type Direction = 'down' | 'up';

interface CandidateLabel {
  label: string;
  /** 最大连续班次数；undefined 表示不限制。 */
  maxConsecutiveTrips?: number;
  /** 最大连续值乘时长（分钟），累计运行与终点短等待，0 表示不限制。 */
  maxContinuousWorkMinutes: number;
  /** 达到上限后的强制休息时长（分钟）。 */
  mandatoryRestMinutes: number;
}

interface TransitTripLabelAllocation {
  lineId: string;
  direction: Direction;
  departureTime: string;
  ordinal: number;
  startMinutes: number;
  endMinutes: number;
  /** 本班次首站，用于判断车辆是否正好在该站等待。 */
  originStationName?: string;
  /** 本方向的大交路终点，执行完班次后车辆固定停在这里。 */
  destinationStationName?: string;
  manualLabel?: string;
  mode: TransitTripLabelMode;
  candidates: CandidateLabel[];
}

interface TransitTripLabelRuntime {
  /** 车辆当前所在的大交路终点。 */
  location?: string;
  availableAt: number;
  consecutiveTrips: number;
  continuousWorkMinutes: number;
  /** 上一段连续值乘是否以强制休息收尾；休息结束后的额外等待不计入值乘。 */
  resting: boolean;
  maxConsecutiveTrips?: number;
  maxContinuousWorkMinutes: number;
  mandatoryRestMinutes: number;
}

const directionOrder: Direction[] = ['down', 'up'];
const serviceDayBoundaryMinutes = 3 * 60;
const defaultTripDurationMinutes = 60;
const defaultMaxContinuousWorkMinutes = 240;
const defaultMandatoryRestMinutes = 120;
/** 到站后至少需要的折返作业时间，含换端与司机交接。 */
const defaultTurnaroundMinutes = 2;

/** 抽取结果按北京时间自然日变化，跨日自动换一批。 */
export function getTransitTripLabelServiceDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 依据线路标签配置、标签池与当天日期，计算每个班次的标签。
 *
 * 规则：
 * - 手动标签优先，直接占用对应时间窗且不参与抽取；
 * - 多个池按配置顺序合并去重后统一抽取，标签继承所属池的排班约束；
 * - 有班次实例时按每班实际首末站计算，小交路（区间车）折返后停在折返站；
 * - 无实例时用短交路经停站标注修正，仍缺失才回退到整条线路首末站；
 * - 车辆执行完班次后停在班次终点，下一班优先由“已在该首站等待且满足折返时间”的车辆接续；
 * - 连续值乘累计运行时间、折返作业与终点短等待，达到班次数或时长上限后强制休息一段时间再重新开始。
 */
export function resolveTransitTripLabels(
  input: ResolveTransitTripLabelsInput,
): Map<string, TransitTripLabelsByDirection> {
  const poolById = new Map(input.pools.map((pool) => [pool.id, pool]));
  const allocations: TransitTripLabelAllocation[] = [];
  const turnaroundMinutes = Math.max(0, input.turnaroundMinutes ?? defaultTurnaroundMinutes);
  const fallbackDuration = Math.max(
    1,
    input.defaultTripDurationMinutes ?? defaultTripDurationMinutes,
  );

  for (const line of input.lines) {
    const duration = resolveLineTripDuration(line, fallbackDuration);
    const stationNames = line.stationNames ?? [];
    const stationOrder = buildStationOrder(stationNames);
    const segmentMinutes = resolveSpanSegmentMinutes(line, stationNames);
    for (const direction of directionOrder) {
      const tripSources = line.tripsByDirection?.[direction];
      const departureTimes =
        tripSources && tripSources.length > 0
          ? tripSources.map((trip) => trip.departureTime)
          : (line.departureTimesByDirection?.[direction] ?? []);
      if (departureTimes.length === 0) {
        continue;
      }
      const manualLabels = line.tripLabelsByDirection?.[direction] ?? {};
      const candidates = collectCandidateLabels(
        line.tripLabelConfigByDirection?.[direction]?.poolIds,
        poolById,
      );
      if (candidates.length === 0 && Object.keys(manualLabels).length === 0) {
        continue;
      }
      const mode =
        line.tripLabelConfigByDirection?.[direction]?.mode === 'random' ? 'random' : 'sequential';
      const fullOriginStationName =
        direction === 'down' ? stationNames[0] : stationNames[stationNames.length - 1];
      const fullDestinationStationName =
        direction === 'down' ? stationNames[stationNames.length - 1] : stationNames[0];
      const specialTrips = line.specialTripsByDirection?.[direction] ?? {};
      const tripByDepartureTime = new Map(
        (tripSources ?? []).map((trip) => [trip.departureTime, trip]),
      );

      departureTimes.forEach((departureTime, index) => {
        const startMinutes = toServiceMinutes(departureTime);
        if (startMinutes === undefined) {
          return;
        }
        const span = resolveTripSpan({
          trip: tripByDepartureTime.get(departureTime),
          special: specialTrips[departureTime],
          fullOriginStationName,
          fullDestinationStationName,
          fullDurationMinutes: duration,
          stationOrder,
          segmentMinutes,
        });
        allocations.push({
          lineId: line.id,
          direction,
          departureTime,
          ordinal: index + 1,
          startMinutes,
          endMinutes: startMinutes + span.durationMinutes,
          originStationName: span.originStationName,
          destinationStationName: span.destinationStationName,
          manualLabel: manualLabels[departureTime]?.trim() || undefined,
          mode,
          candidates,
        });
      });
    }
  }

  allocations.sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.lineId.localeCompare(right.lineId) ||
      directionOrder.indexOf(left.direction) - directionOrder.indexOf(right.direction) ||
      left.ordinal - right.ordinal,
  );

  const runtimeByLabel = new Map<string, TransitTripLabelRuntime>();
  const candidatesByLineDirection = new Map<string, CandidateLabel[]>();
  const cursorByLineDirection = new Map<string, number>();
  const result = new Map<string, TransitTripLabelsByDirection>();

  for (const allocation of allocations) {
    if (!allocation.manualLabel) {
      continue;
    }
    // 手动标签固定给该班次，同时占用对应车辆的运行时，
    // 让其它线路的自动抽取避开同一时间窗，避免跨线路同车冲突。
    const manualCandidate = allocation.candidates.find(
      (candidate) => candidate.label === allocation.manualLabel,
    ) ?? {
      label: allocation.manualLabel,
      maxContinuousWorkMinutes: defaultMaxContinuousWorkMinutes,
      mandatoryRestMinutes: defaultMandatoryRestMinutes,
    };
    applyAllocation(runtimeByLabel, manualCandidate, allocation, turnaroundMinutes);
    writeLabel(result, allocation, allocation.manualLabel);
  }

  for (const allocation of allocations) {
    if (allocation.manualLabel) {
      continue;
    }
    const key = `${allocation.lineId}|${allocation.direction}`;
    if (!candidatesByLineDirection.has(key)) {
      candidatesByLineDirection.set(
        key,
        allocation.mode === 'random'
          ? shuffleDeterministically(allocation.candidates, `${input.dateKey}|${key}`)
          : allocation.candidates,
      );
    }
    const candidates = candidatesByLineDirection.get(key)!;
    if (candidates.length === 0) {
      continue;
    }

    const cursor = cursorByLineDirection.get(key) ?? 0;
    const picked = pickCandidate(candidates, cursor, allocation, runtimeByLabel);
    if (!picked) {
      continue;
    }

    cursorByLineDirection.set(key, (picked.index + 1) % candidates.length);
    applyAllocation(runtimeByLabel, picked.candidate, allocation, turnaroundMinutes);
    writeLabel(result, allocation, picked.candidate.label);
  }

  return result;
}

/**
 * 优先选择正好停在班次首站的车辆，其次才考虑调其他可用车辆；
 * 两种情况都按候选顺序取第一辆，保证顺序/随机模式的轮转语义不变。
 */
function pickCandidate(
  candidates: readonly CandidateLabel[],
  cursor: number,
  allocation: TransitTripLabelAllocation,
  runtimeByLabel: ReadonlyMap<string, TransitTripLabelRuntime>,
): { candidate: CandidateLabel; index: number } | undefined {
  let fallback: { candidate: CandidateLabel; index: number } | undefined;
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const index = (cursor + offset) % candidates.length;
    const candidate = candidates[index]!;
    const runtime = runtimeByLabel.get(candidate.label);
    const availableAt = runtime?.availableAt ?? Number.NEGATIVE_INFINITY;
    if (availableAt > allocation.startMinutes) {
      continue;
    }
    if (
      allocation.originStationName &&
      isSameStation(runtime?.location, allocation.originStationName)
    ) {
      return { candidate, index };
    }
    if (!fallback) {
      fallback = { candidate, index };
    }
  }
  return fallback;
}

function applyAllocation(
  runtimeByLabel: Map<string, TransitTripLabelRuntime>,
  candidate: CandidateLabel,
  allocation: TransitTripLabelAllocation,
  turnaroundMinutes: number,
): void {
  const runtime = ensureRuntime(runtimeByLabel, candidate);
  const waitMinutes = Number.isFinite(runtime.availableAt)
    ? Math.max(0, allocation.startMinutes - runtime.availableAt)
    : 0;
  // 强制休息期间的等待不计入连续值乘，其他终点短等待计入。
  if (!runtime.resting) {
    runtime.continuousWorkMinutes += waitMinutes;
  }
  runtime.resting = false;
  runtime.consecutiveTrips += 1;
  // 折返作业仍属于司机在岗时间，计入连续值乘，同时推迟车辆可接续时刻。
  runtime.continuousWorkMinutes +=
    allocation.endMinutes - allocation.startMinutes + turnaroundMinutes;
  runtime.location = allocation.destinationStationName;
  runtime.availableAt = allocation.endMinutes + turnaroundMinutes;

  const reachedTripLimit =
    runtime.maxConsecutiveTrips !== undefined &&
    runtime.consecutiveTrips >= runtime.maxConsecutiveTrips;
  const reachedWorkLimit =
    runtime.maxContinuousWorkMinutes > 0 &&
    runtime.continuousWorkMinutes >= runtime.maxContinuousWorkMinutes;
  if (!reachedTripLimit && !reachedWorkLimit) {
    return;
  }

  runtime.availableAt = allocation.endMinutes + turnaroundMinutes + runtime.mandatoryRestMinutes;
  runtime.consecutiveTrips = 0;
  runtime.continuousWorkMinutes = 0;
  runtime.resting = true;
}

function ensureRuntime(
  runtimeByLabel: Map<string, TransitTripLabelRuntime>,
  candidate: CandidateLabel,
): TransitTripLabelRuntime {
  let runtime = runtimeByLabel.get(candidate.label);
  if (!runtime) {
    runtime = {
      availableAt: Number.NEGATIVE_INFINITY,
      consecutiveTrips: 0,
      continuousWorkMinutes: 0,
      resting: false,
      maxConsecutiveTrips: candidate.maxConsecutiveTrips,
      maxContinuousWorkMinutes: candidate.maxContinuousWorkMinutes,
      mandatoryRestMinutes: candidate.mandatoryRestMinutes,
    };
    runtimeByLabel.set(candidate.label, runtime);
  }
  return runtime;
}

function collectCandidateLabels(
  poolIds: readonly string[] | undefined,
  poolById: ReadonlyMap<string, TransitTripLabelPool>,
): CandidateLabel[] {
  const candidates: CandidateLabel[] = [];
  const seen = new Set<string>();
  for (const poolId of poolIds ?? []) {
    const pool = poolById.get(poolId);
    if (!pool) {
      continue;
    }
    const limits = resolvePoolLimits(pool);
    for (const label of pool.labels) {
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      candidates.push({ label: trimmed, ...limits });
    }
  }
  return candidates;
}

function resolvePoolLimits(pool: TransitTripLabelPool): Omit<CandidateLabel, 'label'> {
  return {
    maxConsecutiveTrips:
      pool.maxConsecutiveTrips !== undefined && pool.maxConsecutiveTrips > 0
        ? Math.floor(pool.maxConsecutiveTrips)
        : undefined,
    maxContinuousWorkMinutes:
      pool.maxContinuousWorkMinutes === undefined
        ? defaultMaxContinuousWorkMinutes
        : Math.max(0, pool.maxContinuousWorkMinutes),
    mandatoryRestMinutes:
      pool.mandatoryRestMinutes === undefined
        ? defaultMandatoryRestMinutes
        : Math.max(0, pool.mandatoryRestMinutes),
  };
}

/** 站名匹配键到线路正序站序的索引；同名不同写法也能落到同一站。 */
function buildStationOrder(stationNames: readonly string[]): Map<string, number> {
  const order = new Map<string, number>();
  stationNames.forEach((stationName, index) => {
    for (const key of getTransitStationNameMatchKeys(stationName)) {
      if (!order.has(key)) {
        order.set(key, index);
      }
    }
  });
  return order;
}

/** 与线路正序站名对齐的逐段用时；站名被过滤过时无法对齐，宁可不切片也不能错算区间。 */
function resolveSpanSegmentMinutes(
  line: TransitTripLabelLineSource,
  stationNames: readonly string[],
): Array<number | undefined> {
  const stationSourceIds = line.stationSourceIds ?? [];
  if (stationSourceIds.length < 2 || stationSourceIds.length !== stationNames.length) {
    return [];
  }
  return resolveLineSegmentMinutes({
    segmentPaths: line.segmentPaths,
    stationSourceIds,
    stopTravelTimes: line.stopTravelTimes,
  });
}

/**
 * 解析单班实际起终点与时长。
 * 优先级：班次实例首末站 > 短交路经停站首末 > 整条线路首末；
 * 时长优先级：班次实测 > 区间切片累计 > 全线兜底。
 */
function resolveTripSpan(input: {
  trip?: TransitTripLabelTripSource;
  special?: TransitTripLabelSpecialTripSource;
  fullOriginStationName?: string;
  fullDestinationStationName?: string;
  fullDurationMinutes: number;
  stationOrder: ReadonlyMap<string, number>;
  segmentMinutes: readonly (number | undefined)[];
}): Pick<TransitTripLabelAllocation, 'originStationName' | 'destinationStationName'> & {
  durationMinutes: number;
} {
  const specialStationNames = (input.special?.stationNames ?? []).filter(Boolean);
  const originStationName =
    input.trip?.originStationName ??
    (specialStationNames.length >= 2 ? specialStationNames[0] : undefined) ??
    input.fullOriginStationName;
  const destinationStationName =
    input.trip?.destinationStationName ??
    (specialStationNames.length >= 2
      ? specialStationNames[specialStationNames.length - 1]
      : undefined) ??
    input.fullDestinationStationName;
  const measured = input.trip?.durationMinutes;
  if (measured !== undefined && Number.isFinite(measured) && measured > 0) {
    return { originStationName, destinationStationName, durationMinutes: measured };
  }
  const sliced = resolveStationSpanMinutes(
    originStationName,
    destinationStationName,
    input.stationOrder,
    input.segmentMinutes,
  );
  return {
    originStationName,
    destinationStationName,
    durationMinutes: sliced ?? input.fullDurationMinutes,
  };
}

/** 按线路正序切片累计区间用时；缺段时返回 undefined，交由调用方回退。 */
function resolveStationSpanMinutes(
  originStationName: string | undefined,
  destinationStationName: string | undefined,
  stationOrder: ReadonlyMap<string, number>,
  segmentMinutes: readonly (number | undefined)[],
): number | undefined {
  const originIndex = resolveStationIndex(originStationName, stationOrder);
  const destinationIndex = resolveStationIndex(destinationStationName, stationOrder);
  if (
    originIndex === undefined ||
    destinationIndex === undefined ||
    originIndex === destinationIndex
  ) {
    return undefined;
  }
  const start = Math.min(originIndex, destinationIndex);
  const end = Math.max(originIndex, destinationIndex);
  const span = segmentMinutes.slice(start, end);
  if (span.length !== end - start || span.some((value) => value === undefined)) {
    return undefined;
  }
  return span.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function resolveStationIndex(
  stationName: string | undefined,
  stationOrder: ReadonlyMap<string, number>,
): number | undefined {
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
}

function isSameStation(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const rightKeys = new Set(getTransitStationNameMatchKeys(right));
  return getTransitStationNameMatchKeys(left).some((key) => rightKeys.has(key));
}

function resolveLineTripDuration(line: TransitTripLabelLineSource, fallback: number): number {
  // 实测时长优先：区间配置缺失时，班次实例的首末时刻比固定 60 分钟更可靠。
  if (
    line.tripDurationMinutes !== undefined &&
    Number.isFinite(line.tripDurationMinutes) &&
    line.tripDurationMinutes > 0
  ) {
    return line.tripDurationMinutes;
  }

  // 逐段优先：后台区间用时优先，缺失段用旧数据 travelTime 兜底。
  const stationSourceIds = line.stationSourceIds ?? [];
  const merged =
    stationSourceIds.length >= 2
      ? resolveLineTotalMinutes({
          segmentPaths: line.segmentPaths,
          stationSourceIds,
          stopTravelTimes: line.stopTravelTimes,
        })
      : undefined;
  if (merged !== undefined) {
    return merged;
  }

  const configured = (line.segmentPaths ?? []).reduce((sum, segment) => {
    const minutes = segment.travelMinutes;
    return minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? sum + minutes : sum;
  }, 0);
  if (configured > 0) {
    return configured;
  }
  if (line.stopTravelTimes?.length) {
    return resolveLegacySegmentMinutes(line.stopTravelTimes).totalMinutes ?? fallback;
  }
  return fallback;
}

function writeLabel(
  result: Map<string, TransitTripLabelsByDirection>,
  allocation: TransitTripLabelAllocation,
  label: string,
): void {
  const entry = result.get(allocation.lineId) ?? {};
  const directionLabels = entry[allocation.direction] ?? {};
  directionLabels[allocation.departureTime] = label;
  entry[allocation.direction] = directionLabels;
  result.set(allocation.lineId, entry);
}

function toServiceMinutes(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) {
    return undefined;
  }
  const total = hours * 60 + minutes;
  return total < serviceDayBoundaryMinutes ? total + 24 * 60 : total;
}

function shuffleDeterministically<T>(items: readonly T[], seed: string): T[] {
  const next = mulberry32(hashSeed(seed));
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[target]!;
    shuffled[target] = current;
  }
  return shuffled;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
