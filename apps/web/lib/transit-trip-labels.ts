import type { TransitTripLabelMode, TransitTripLabelPool } from '@yct/contracts';

export interface TransitTripLabelLineSource {
  id: string;
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
  segmentPaths?: Array<{ travelMinutes?: number }>;
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

interface TransitTripLabelAllocation {
  lineId: string;
  direction: Direction;
  departureTime: string;
  ordinal: number;
  startMinutes: number;
  endMinutes: number;
  manualLabel?: string;
  mode: TransitTripLabelMode;
  candidates: string[];
}

const directionOrder: Direction[] = ['down', 'up'];
const serviceDayBoundaryMinutes = 3 * 60;
const defaultTripDurationMinutes = 60;

/** 抽取结果按北京时间自然日变化，跨日自动换一批。 */
export function getTransitTripLabelServiceDateKey(date: Date = new Date()): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 依据线路标签配置、标签池与当天日期，计算每个班次的标签。
 *
 * 规则：
 * - 手动标签优先，直接占用对应时间窗且不参与抽取；
 * - 多个池按配置顺序合并去重后统一抽取；
 * - 顺序模式按池内顺序轮转，随机模式按“日期 + 线路 + 方向”确定性洗牌，保证所有用户结果一致；
 * - 同一标签在时间窗重叠时只分配给一个班次（跨线路共享同一份占用表）。
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
    const duration = resolveLineTripDuration(line.segmentPaths, fallbackDuration);
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

  const labelFreeAt = new Map<string, number>();
  const autoExcludedLabels = new Set<string>();
  const candidatesByLineDirection = new Map<string, string[]>();
  const cursorByLineDirection = new Map<string, number>();
  const result = new Map<string, TransitTripLabelsByDirection>();

  for (const allocation of allocations) {
    if (!allocation.manualLabel) {
      continue;
    }
    // 手动标签固定给该班次，且当天不再参与任何自动抽取。
    autoExcludedLabels.add(allocation.manualLabel);
    reserveLabel(labelFreeAt, allocation.manualLabel, allocation.endMinutes);
    writeLabel(result, allocation, allocation.manualLabel);
  }

  for (const allocation of allocations) {
    if (allocation.manualLabel) {
      continue;
    }
    const key = `${allocation.lineId}|${allocation.direction}`;
    let candidates = candidatesByLineDirection.get(key);
    if (!candidates) {
      const poolLabels = allocation.candidates.filter((label) => !autoExcludedLabels.has(label));
      candidates =
        allocation.mode === 'random'
          ? shuffleDeterministically(poolLabels, `${input.dateKey}|${key}`)
          : poolLabels;
      candidatesByLineDirection.set(key, candidates);
    }
    if (candidates.length === 0) {
      continue;
    }

    const cursor = cursorByLineDirection.get(key) ?? 0;
    let picked: string | undefined;
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (cursor + offset) % candidates.length;
      const label = candidates[index]!;
      if ((labelFreeAt.get(label) ?? 0) <= allocation.startMinutes) {
        picked = label;
        cursorByLineDirection.set(key, (index + 1) % candidates.length);
        break;
      }
    }
    if (!picked) {
      continue;
    }

    reserveLabel(labelFreeAt, picked, allocation.endMinutes);
    writeLabel(result, allocation, picked);
  }

  return result;
}

function collectCandidateLabels(
  poolIds: readonly string[] | undefined,
  poolById: ReadonlyMap<string, TransitTripLabelPool>,
): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const poolId of poolIds ?? []) {
    const pool = poolById.get(poolId);
    if (!pool) {
      continue;
    }
    for (const label of pool.labels) {
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      seen.add(trimmed);
      labels.push(trimmed);
    }
  }
  return labels;
}

function resolveLineTripDuration(
  segmentPaths: Array<{ travelMinutes?: number }> | undefined,
  fallback: number,
): number {
  const total = (segmentPaths ?? []).reduce((sum, segment) => {
    const minutes = segment.travelMinutes;
    return minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? sum + minutes : sum;
  }, 0);
  return total > 0 ? total : fallback;
}

function reserveLabel(labelFreeAt: Map<string, number>, label: string, endMinutes: number): void {
  labelFreeAt.set(label, Math.max(labelFreeAt.get(label) ?? 0, endMinutes));
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
