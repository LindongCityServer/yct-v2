import type { TransitLineSnapshot } from '@yct/contracts';

type DepartureSchedule = Pick<
  TransitLineSnapshot,
  'departureTimes' | 'departureRules' | 'departureTimesByDirection' | 'departureRulesByDirection'
>;

export interface DirectionalDepartureTimes {
  down: string[];
  up: string[];
}

/**
 * 存在分方向配置（时刻或规则）时以其为准，缺失的一侧视为空；
 * 完全缺少分方向字段的旧数据只兼容到正向，不推断反向。
 */
export function resolveDirectionalDepartureTimes(
  line: DepartureSchedule | undefined,
): DirectionalDepartureTimes {
  if (line?.departureTimesByDirection || line?.departureRulesByDirection) {
    return {
      down: line.departureTimesByDirection?.down ?? [],
      up: line.departureTimesByDirection?.up ?? [],
    };
  }

  return { down: line?.departureTimes ?? [], up: [] };
}

/** Directional schedules are authoritative, including an empty or missing side. */
export function formatTransitDepartureRulesForEditor(
  line: DepartureSchedule | undefined,
  direction: 'down' | 'up',
): string {
  if (line?.departureRulesByDirection || line?.departureTimesByDirection) {
    const rules = line.departureRulesByDirection?.[direction];
    if (rules?.length) {
      return rules.map((rule) => rule.sourceText).join('\n');
    }
    return (line.departureTimesByDirection?.[direction] ?? []).join('\n');
  }

  // Legacy undirected fields represent departures in station order only.
  if (direction === 'up') {
    return '';
  }
  if (line?.departureRules?.length) {
    return line.departureRules.map((rule) => rule.sourceText).join('\n');
  }
  return (line?.departureTimes ?? []).join('\n');
}
