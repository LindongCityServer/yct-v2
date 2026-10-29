import type { TransitTripLabelMode, TransitTripLabelPool } from '@yct/contracts';
import {
  resolveLegacySegmentMinutes,
  resolveLineTotalMinutes,
  type TransitSegmentPathLike,
} from './transit-segment-minutes';

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
 * - 顺序模式按池内顺序轮转，随机模式按“日期 + 线路 + 方向”确定性洗牌，保证所有用户结果一致；
 * - 车辆执行完班次后停在该方向的大交路终点，下一班优先由“已在该首站等待”的车辆接续；
 * - 连续值乘累计运行时间与终点短等待，达到班次数或时长上限后强制休息一段时间再重新开始。
 */
export function resolveTransitTripLabels(
  input: ResolveTransitTripLabelsInput,
): Map<string, TransitTripLabelsByDirection> {
  const poolById = new Map(input.pools.map((pool) => [pool.id, pool]));
  const allocations: TransitTripLabelAllocation[] = [];
  const fallbackDuration = Math.max(
    1,
    input.defaultTripDurationMinutes ?? defaultTripDurationMinutes,
  );

  for (const line of input.lines) {
    const duration = resolveLineTripDuration(line, fallbackDuration);
    const stationNames = line.stationNames ?? [];
    for (const direction of directionOrder) {
      const departureTimes = line.departureTimesByDirection?.[direction] ?? [];
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
      const originStationName =
        direction === 'down' ? stationNames[0] : stationNames[stationNames.length - 1];
      const destinationStationName =
        direction === 'down' ? stationNames[stationNames.length - 1] : stationNames[0];

      departureTimes.forEach((departureTime, index) => {
        const startMinutes = toServiceMinutes(departureTime);
        if (startMinutes === undefined) {
          return;
        }
        allocations.push({
          lineId: line.id,
          direction,
          departureTime,
          ordinal: index + 1,
          startMinutes,
          endMinutes: startMinutes + duration,
          originStationName,
          destinationStationName,
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
    const manualCandidate =
      allocation.candidates.find((candidate) => candidate.label === allocation.manualLabel) ?? {
        label: allocation.manualLabel,
        maxContinuousWorkMinutes: defaultMaxContinuousWorkMinutes,
        mandatoryRestMinutes: defaultMandatoryRestMinutes,
      };
    applyAllocation(runtimeByLabel, manualCandidate, allocation);
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
    applyAllocation(runtimeByLabel, picked.candidate, allocation);
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
    if (allocation.originStationName && runtime?.location === allocation.originStationName) {
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
  runtime.continuousWorkMinutes += allocation.endMinutes - allocation.startMinutes;
  runtime.location = allocation.destinationStationName;
  runtime.availableAt = allocation.endMinutes;

  const reachedTripLimit =
    runtime.maxConsecutiveTrips !== undefined &&
    runtime.consecutiveTrips >= runtime.maxConsecutiveTrips;
  const reachedWorkLimit =
    runtime.maxContinuousWorkMinutes > 0 &&
    runtime.continuousWorkMinutes >= runtime.maxContinuousWorkMinutes;
  if (!reachedTripLimit && !reachedWorkLimit) {
    return;
  }

  runtime.availableAt = allocation.endMinutes + runtime.mandatoryRestMinutes;
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
