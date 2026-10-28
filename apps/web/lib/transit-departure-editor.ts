import type { TransitLineSnapshot } from '@yct/contracts';

type DepartureSchedule = Pick<
  TransitLineSnapshot,
  'departureTimes' | 'departureRules' | 'departureTimesByDirection' | 'departureRulesByDirection'
>;

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
