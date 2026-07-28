import type {
  TransitNetworkHealthOperatorRanks,
  TransitNetworkHealthOperatorStats,
  TransitNetworkHealthReport,
  TransitNetworkHealthSuggestion,
} from '@yct/contracts';
import type { TransitOverview } from './legacy-transit';
import { readTransitOverview } from './transit-data';

const unassignedOperatorLabel = '未标注运营方';

interface NetworkStation {
  key: string;
  name: string;
  operators: Set<string>;
  lineIds: Set<string>;
  neighborKeys: Set<string>;
  segmentKeys: Set<string>;
}

interface NetworkSegment {
  key: string;
  stationKeys: [string, string];
  lineIds: Set<string>;
}

interface OperatorTopology {
  operator: string;
  lineIds: Set<string>;
  stationKeys: Set<string>;
  segmentKeys: Set<string>;
}

interface OperatorComponents {
  count: number;
  stations: string[][];
}

export async function readTransitNetworkHealthReport(): Promise<TransitNetworkHealthReport> {
  return buildTransitNetworkHealthReport(await readTransitOverview());
}

export function buildTransitNetworkHealthReport(
  overview: TransitOverview,
): TransitNetworkHealthReport {
  const stations = new Map<string, NetworkStation>();
  const segments = new Map<string, NetworkSegment>();
  const operators = new Map<string, OperatorTopology>();
  let topologyLineCount = 0;
  let incompleteLineCount = 0;
  let stationIdentityFallbackCount = 0;

  for (const line of overview.lines) {
    const operator = normalizeOperator(line.operator);
    const operatorTopology = getOrCreateOperatorTopology(operators, operator);
    operatorTopology.lineIds.add(line.id);

    const lineStationKeys = new Set<string>();
    const lineSegmentKeys = new Set<string>();
    let previousStationKey: string | undefined;

    for (const stop of line.stationStops) {
      const stationIdentity = resolveStationIdentity({
        mode: line.mode,
        sourceId: stop.stationSourceId,
        name: stop.stationName,
      });
      if (stationIdentity.fallback) {
        stationIdentityFallbackCount += 1;
      }

      const station = getOrCreateStation(stations, stationIdentity.key, stop.stationName);
      station.operators.add(operator);
      station.lineIds.add(line.id);
      lineStationKeys.add(station.key);
      operatorTopology.stationKeys.add(station.key);

      if (previousStationKey && previousStationKey !== station.key) {
        const segment = getOrCreateSegment(segments, previousStationKey, station.key);
        segment.lineIds.add(line.id);
        lineSegmentKeys.add(segment.key);
      }
      previousStationKey = station.key;
    }

    for (const segmentKey of lineSegmentKeys) {
      operatorTopology.segmentKeys.add(segmentKey);
    }
    if (lineSegmentKeys.size > 0) {
      topologyLineCount += 1;
    } else {
      incompleteLineCount += 1;
    }
  }

  for (const segment of segments.values()) {
    const [leftStationKey, rightStationKey] = segment.stationKeys;
    const leftStation = stations.get(leftStationKey);
    const rightStation = stations.get(rightStationKey);
    if (!leftStation || !rightStation) {
      continue;
    }
    leftStation.neighborKeys.add(rightStationKey);
    rightStation.neighborKeys.add(leftStationKey);
    leftStation.segmentKeys.add(segment.key);
    rightStation.segmentKeys.add(segment.key);
  }

  const operatorComponents = new Map<string, OperatorComponents>();
  const operatorStats = Array.from(operators.values()).map((operatorTopology) => {
    const components = findOperatorComponents(operatorTopology, segments);
    operatorComponents.set(operatorTopology.operator, components);
    return buildOperatorStats({
      topology: operatorTopology,
      stations,
      segments,
      components,
    });
  });
  const rankedOperators = assignRanks(operatorStats).sort(compareOperators);
  const transferStationCount = Array.from(stations.values()).filter(
    (station) => station.operators.size > 1,
  ).length;
  const sharedSegmentCount = Array.from(segments.values()).filter(
    (segment) => segment.lineIds.size > 1,
  ).length;
  const suggestions = buildSuggestions({
    operators: rankedOperators,
    operatorComponents,
    stations,
    sharedSegmentCount,
    stationIdentityFallbackCount,
    incompleteLineCount,
  });

  return {
    analyzedAt: new Date().toISOString(),
    sourceMessage: overview.meta.message,
    lineCount: overview.lines.length,
    topologyLineCount,
    stationCount: stations.size,
    topologySegmentCount: segments.size,
    sharedSegmentCount,
    transferStationCount,
    stationIdentityFallbackCount,
    incompleteLineCount,
    operators: rankedOperators,
    suggestions,
  };
}

function buildOperatorStats(input: {
  topology: OperatorTopology;
  stations: Map<string, NetworkStation>;
  segments: Map<string, NetworkSegment>;
  components: OperatorComponents;
}): TransitNetworkHealthOperatorStats {
  const stationNodes = Array.from(input.topology.stationKeys)
    .map((stationKey) => input.stations.get(stationKey))
    .filter((station): station is NetworkStation => Boolean(station));
  const operatorSegments = Array.from(input.topology.segmentKeys)
    .map((segmentKey) => input.segments.get(segmentKey))
    .filter((segment): segment is NetworkSegment => Boolean(segment));
  const stationCount = stationNodes.length;
  const topologySegmentCount = operatorSegments.length;
  const sharedSegmentCount = operatorSegments.filter((segment) => segment.lineIds.size > 1).length;

  return {
    operator: input.topology.operator,
    lineCount: input.topology.lineIds.size,
    stationCount,
    topologySegmentCount,
    sharedSegmentCount,
    averageConnectivity: roundMetric(
      average(stationNodes.map((station) => station.neighborKeys.size)),
    ),
    connectivityWeight: roundMetric(
      average(
        stationNodes.map((station) =>
          Array.from(station.segmentKeys).reduce(
            (total, segmentKey) => total + (input.segments.get(segmentKey)?.lineIds.size ?? 0),
            0,
          ),
        ),
      ),
    ),
    averageLinesPerSegment: roundMetric(
      average(operatorSegments.map((segment) => segment.lineIds.size)),
    ),
    transferStationCount: stationNodes.filter((station) => station.operators.size > 1).length,
    componentCount: input.components.count,
    ranks: emptyRanks(),
  };
}

function buildSuggestions(input: {
  operators: TransitNetworkHealthOperatorStats[];
  operatorComponents: Map<string, OperatorComponents>;
  stations: Map<string, NetworkStation>;
  sharedSegmentCount: number;
  stationIdentityFallbackCount: number;
  incompleteLineCount: number;
}): TransitNetworkHealthSuggestion[] {
  const suggestions: TransitNetworkHealthSuggestion[] = [];

  if (input.incompleteLineCount > 0) {
    suggestions.push({
      id: 'data-quality-incomplete-lines',
      kind: 'data_quality',
      priority: 'attention',
      title: '补全缺少连续站序的线路数据',
      detail: `当前有 ${input.incompleteLineCount} 条线路未形成可计算的连续站段，因此未参与路段与连接度计算。`,
      evidence: '依据：线路停靠点序列不足两个不同站点。',
    });
  }
  if (input.stationIdentityFallbackCount > 0) {
    suggestions.push({
      id: 'data-quality-station-identities',
      kind: 'data_quality',
      priority: 'info',
      title: '为缺少来源 ID 的站点补充稳定标识',
      detail: `有 ${input.stationIdentityFallbackCount} 个停靠点只能按线路方式和站名归并；它们不会与其他方式的同名站自动判定为换乘。`,
      evidence: '依据：停靠点缺少 stationSourceId。',
    });
  }

  for (const operator of input.operators) {
    const components = input.operatorComponents.get(operator.operator);
    if (operator.stationCount === 0) {
      suggestions.push({
        id: `data-quality-empty-${operator.operator}`,
        kind: 'data_quality',
        priority: 'attention',
        operator: operator.operator,
        title: '补充线路停靠站数据',
        detail: '该运营方已有线路记录，但没有可识别的停靠站，无法生成拓扑指标。',
        evidence: `依据：${operator.lineCount} 条线路均未解析出站点。`,
      });
      continue;
    }

    if (operator.componentCount > 1 && components) {
      const referenceStations = components.stations
        .slice(0, 2)
        .map((stationKeys) => describeComponent(stationKeys, input.stations))
        .filter(Boolean)
        .join('、');
      suggestions.push({
        id: `connect-components-${operator.operator}`,
        kind: 'connect_components',
        priority: 'attention',
        operator: operator.operator,
        title: '评估片区之间的接驳或联络线路',
        detail: `该运营方线网分为 ${operator.componentCount} 个不连通片区，可优先核验片区间是否需要新增接驳、延长既有线或设置换乘点。`,
        evidence: `依据：按连续站序形成的连通片区；参考站点 ${referenceStations || '待补充'}。`,
      });
    }

    if (operator.transferStationCount === 0 && operator.stationCount >= 4) {
      suggestions.push({
        id: `improve-transfer-${operator.operator}`,
        kind: 'improve_transfer',
        priority: 'info',
        operator: operator.operator,
        title: '核验跨运营方换乘衔接',
        detail:
          '当前拓扑中未发现该运营方与其他运营方共享同一稳定站点 ID 的换乘点，可结合站点绑定和实际换乘条件复核。',
        evidence: `依据：${operator.stationCount} 个站点中，跨运营方共享站点为 0。`,
      });
    }

    if (operator.topologySegmentCount >= 3 && operator.averageConnectivity <= 1.25) {
      suggestions.push({
        id: `improve-cross-connection-${operator.operator}`,
        kind: 'improve_cross_connection',
        priority: 'info',
        operator: operator.operator,
        title: '评估横向连接或末端接驳',
        detail:
          '该运营方的站点拓扑接近枝状结构。可结合客流、道路条件和运营成本，评估横向连接、区间接驳或末端延伸。',
        evidence: `依据：平均连接度 ${formatMetric(operator.averageConnectivity)}，共 ${operator.topologySegmentCount} 个站间路段。`,
      });
    }

    if (operator.sharedSegmentCount > 0 && operator.averageLinesPerSegment >= 2) {
      suggestions.push({
        id: `reduce-corridor-overlap-${operator.operator}`,
        kind: 'reduce_corridor_overlap',
        priority: 'info',
        operator: operator.operator,
        title: '复核高复用走廊的线路分工',
        detail:
          '同一站间路段承载多条线路时，可结合客流和班次检查快慢线、区间车、停站分工或绕行段是否需要优化。',
        evidence: `依据：${operator.sharedSegmentCount} 个路段由多条线路共用，平均每段 ${formatMetric(operator.averageLinesPerSegment)} 条线路。`,
      });
    }
  }

  if (input.operators.length > 0 && input.sharedSegmentCount === 0) {
    suggestions.push({
      id: 'network-no-shared-segments',
      kind: 'improve_transfer',
      priority: 'info',
      title: '复核跨线换乘数据完整性',
      detail:
        '全网没有检测到共用的连续站间路段。该结果可能反映线路分工，也可能说明站点或线路来源 ID 尚未对齐。',
      evidence: '依据：共享线路数大于 1 的站间路段为 0。',
    });
  }

  return suggestions;
}

function assignRanks(
  operators: TransitNetworkHealthOperatorStats[],
): TransitNetworkHealthOperatorStats[] {
  const ranksByOperator = new Map<string, TransitNetworkHealthOperatorRanks>();
  for (const operator of operators) {
    ranksByOperator.set(operator.operator, emptyRanks());
  }

  const metrics: Array<keyof TransitNetworkHealthOperatorRanks> = [
    'stationCount',
    'lineCount',
    'averageConnectivity',
    'connectivityWeight',
    'averageLinesPerSegment',
  ];
  for (const metric of metrics) {
    const sorted = [...operators].sort(
      (left, right) =>
        right[metric] - left[metric] || left.operator.localeCompare(right.operator, 'zh-CN'),
    );
    let previousValue: number | undefined;
    let rank = 0;
    for (const [index, operator] of sorted.entries()) {
      if (operator[metric] !== previousValue) {
        rank = index + 1;
        previousValue = operator[metric];
      }
      const ranks = ranksByOperator.get(operator.operator);
      if (ranks) {
        ranks[metric] = rank;
      }
    }
  }

  return operators.map((operator) => ({
    ...operator,
    ranks: ranksByOperator.get(operator.operator) ?? emptyRanks(),
  }));
}

function findOperatorComponents(
  topology: OperatorTopology,
  segments: Map<string, NetworkSegment>,
): OperatorComponents {
  const neighbors = new Map<string, Set<string>>();
  for (const stationKey of topology.stationKeys) {
    neighbors.set(stationKey, new Set());
  }
  for (const segmentKey of topology.segmentKeys) {
    const segment = segments.get(segmentKey);
    if (!segment) {
      continue;
    }
    const [leftStationKey, rightStationKey] = segment.stationKeys;
    neighbors.get(leftStationKey)?.add(rightStationKey);
    neighbors.get(rightStationKey)?.add(leftStationKey);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const stationKey of topology.stationKeys) {
    if (visited.has(stationKey)) {
      continue;
    }
    const component: string[] = [];
    const pending = [stationKey];
    visited.add(stationKey);
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) {
        continue;
      }
      component.push(current);
      for (const neighbor of neighbors.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return {
    count: components.length,
    stations: components.sort((left, right) => right.length - left.length),
  };
}

function getOrCreateOperatorTopology(
  operators: Map<string, OperatorTopology>,
  operator: string,
): OperatorTopology {
  const existing = operators.get(operator);
  if (existing) {
    return existing;
  }
  const topology: OperatorTopology = {
    operator,
    lineIds: new Set(),
    stationKeys: new Set(),
    segmentKeys: new Set(),
  };
  operators.set(operator, topology);
  return topology;
}

function getOrCreateStation(
  stations: Map<string, NetworkStation>,
  key: string,
  name: string,
): NetworkStation {
  const existing = stations.get(key);
  if (existing) {
    return existing;
  }
  const station: NetworkStation = {
    key,
    name,
    operators: new Set(),
    lineIds: new Set(),
    neighborKeys: new Set(),
    segmentKeys: new Set(),
  };
  stations.set(key, station);
  return station;
}

function getOrCreateSegment(
  segments: Map<string, NetworkSegment>,
  leftStationKey: string,
  rightStationKey: string,
): NetworkSegment {
  const stationKeys = [leftStationKey, rightStationKey].sort() as [string, string];
  const key = stationKeys.join('\u0000');
  const existing = segments.get(key);
  if (existing) {
    return existing;
  }
  const segment: NetworkSegment = {
    key,
    stationKeys,
    lineIds: new Set(),
  };
  segments.set(key, segment);
  return segment;
}

function resolveStationIdentity(input: { mode: string; sourceId?: string; name: string }): {
  key: string;
  fallback: boolean;
} {
  const sourceId = input.sourceId?.trim();
  if (sourceId) {
    return { key: `source:${sourceId}`, fallback: false };
  }
  return {
    key: `fallback:${input.mode}:${normalizeStationName(input.name)}`,
    fallback: true,
  };
}

function normalizeStationName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function normalizeOperator(operator: string | undefined): string {
  return operator?.trim() || unassignedOperatorLabel;
}

function emptyRanks(): TransitNetworkHealthOperatorRanks {
  return {
    stationCount: 0,
    lineCount: 0,
    averageConnectivity: 0,
    connectivityWeight: 0,
    averageLinesPerSegment: 0,
  };
}

function compareOperators(
  left: TransitNetworkHealthOperatorStats,
  right: TransitNetworkHealthOperatorStats,
): number {
  return (
    right.lineCount - left.lineCount ||
    right.stationCount - left.stationCount ||
    left.operator.localeCompare(right.operator, 'zh-CN')
  );
}

function describeComponent(stationKeys: string[], stations: Map<string, NetworkStation>): string {
  return stationKeys
    .map((stationKey) => stations.get(stationKey)?.name)
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .slice(0, 2)
    .join('、');
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}
