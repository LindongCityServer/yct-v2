import type {
  TransitNetworkHealthAnalysisSource,
  TransitNetworkHealthModeStats,
  TransitNetworkHealthOperatingStats,
  TransitNetworkHealthOperatorRanks,
  TransitNetworkHealthOperatorStats,
  TransitNetworkHealthPlaceCategory,
  TransitNetworkHealthPlanningStats,
  TransitNetworkHealthReport,
  TransitNetworkHealthScopeStats,
  TransitNetworkHealthSpatialStats,
  TransitNetworkHealthSuggestion,
  TransitNetworkHealthSuggestionTarget,
  TransportMode,
} from '@yct/contracts';
import type { TransitLineSummary, TransitOverview } from './legacy-transit';
import { readTransitOverview } from './transit-data';
import {
  readTransitNetworkPlanningData,
  resolveTransitStationCoordinate,
  type TransitNetworkPlanningData,
  type TransitNetworkPlanningPoint,
} from './transit-network-planning-data';

type TransitMode = Exclude<TransportMode, 'walk'>;

const unassignedOperatorLabel = '未标注运营方';
const catchmentRadius = 600;
const earlyServiceThreshold = 6 * 60;
const lateServiceThreshold = 22 * 60;

interface NetworkStation {
  key: string;
  name: string;
  modes: Set<TransitMode>;
  operators: Set<string>;
  lineIds: Set<string>;
  neighborKeys: Set<string>;
  segmentKeys: Set<string>;
  coordinates?: [number, number];
}

interface NetworkSegment {
  key: string;
  stationKeys: [string, string];
  lineIds: Set<string>;
  distance?: number;
}

interface OperatorTopology {
  operator: string;
  modes: Set<TransitMode>;
  lineIds: Set<string>;
  stationKeys: Set<string>;
  segmentKeys: Set<string>;
}

interface OperatorComponents {
  count: number;
  stations: string[][];
}

interface LineServiceWindow {
  firstMinute: number;
  lastMinute: number;
  spanMinutes: number;
}

interface PlaceCategoryDefinition {
  category: TransitNetworkHealthPlaceCategory;
  label: string;
  sourceCategoryIds: string[];
  demandWeight: number;
}

interface ScopeBuildContext {
  mode?: TransitMode;
  lines: TransitLineSummary[];
  planningData: TransitNetworkPlanningData;
}

const placeCategoryDefinitions: PlaceCategoryDefinition[] = [
  {
    category: 'residence',
    label: '居住',
    sourceCategoryIds: ['residence'],
    demandWeight: 1.2,
  },
  {
    category: 'employment',
    label: '就业与商业',
    sourceCategoryIds: ['commerce', 'industry', 'public-service'],
    demandWeight: 1.1,
  },
  {
    category: 'education',
    label: '教育',
    sourceCategoryIds: ['education'],
    demandWeight: 1,
  },
  {
    category: 'medical',
    label: '医疗',
    sourceCategoryIds: ['medical'],
    demandWeight: 1.1,
  },
  {
    category: 'daily_life',
    label: '生活服务',
    sourceCategoryIds: ['dining', 'facility'],
    demandWeight: 0.8,
  },
  {
    category: 'leisure',
    label: '文体与旅游',
    sourceCategoryIds: ['park', 'scenery', 'museum', 'sports'],
    demandWeight: 0.8,
  },
  {
    category: 'transport',
    label: '对外交通',
    sourceCategoryIds: ['railway-station', 'coach-station', 'ferry-port', 'airport', 'parking'],
    demandWeight: 1.2,
  },
];

const emptyPlanningData: TransitNetworkPlanningData = {
  points: [],
  sourceMessage: '地点数据不可用',
  staticSourceAvailable: false,
};

export async function readTransitNetworkHealthReport(): Promise<TransitNetworkHealthReport> {
  const [overview, planningData] = await Promise.all([
    readTransitOverview(),
    readTransitNetworkPlanningData().catch(() => emptyPlanningData),
  ]);
  return buildTransitNetworkHealthReport(overview, planningData);
}

export function buildTransitNetworkHealthReport(
  overview: TransitOverview,
  planningData: TransitNetworkPlanningData = emptyPlanningData,
): TransitNetworkHealthReport {
  const allStats = buildScopeStats({ lines: overview.lines, planningData });
  const modes = buildModeStats(overview, planningData);
  return {
    ...allStats,
    analyzedAt: new Date().toISOString(),
    sourceMessage: overview.meta.message,
    planningSourceMessage: planningData.sourceMessage,
    analysisSources: buildAnalysisSources(allStats, planningData),
    modes,
  };
}

function buildModeStats(
  overview: TransitOverview,
  planningData: TransitNetworkPlanningData,
): TransitNetworkHealthModeStats[] {
  const profileByMode = new Map(overview.modeProfiles?.map((profile) => [profile.mode, profile]));
  const summaryByMode = new Map(overview.summary.map((summary) => [summary.mode, summary]));
  const modes = Array.from(new Set(overview.lines.map((line) => line.mode))).sort((left, right) => {
    const leftOrder = profileByMode.get(left)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = profileByMode.get(right)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right);
  });

  return modes.map((mode) => {
    const profile = profileByMode.get(mode);
    const defaults = defaultModePresentation(mode);
    return {
      ...buildScopeStats({
        mode,
        lines: overview.lines.filter((line) => line.mode === mode),
        planningData,
      }),
      mode,
      label: profile?.label ?? summaryByMode.get(mode)?.label ?? defaults.label,
      color: profile?.color ?? defaults.color,
      icon: profile?.icon ?? defaults.icon,
    };
  });
}

function buildScopeStats(input: ScopeBuildContext): TransitNetworkHealthScopeStats {
  const stations = new Map<string, NetworkStation>();
  const segments = new Map<string, NetworkSegment>();
  const operators = new Map<string, OperatorTopology>();
  const serviceWindows = new Map<string, LineServiceWindow>();
  let topologyLineCount = 0;
  let incompleteLineCount = 0;
  let stationIdentityFallbackCount = 0;

  for (const line of input.lines) {
    const operator = normalizeOperator(line.operator);
    const operatorTopology = getOrCreateOperatorTopology(operators, operator);
    operatorTopology.modes.add(line.mode);
    operatorTopology.lineIds.add(line.id);
    const serviceWindow = resolveLineServiceWindow(line);
    if (serviceWindow) {
      serviceWindows.set(line.id, serviceWindow);
    }

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
      station.modes.add(line.mode);
      station.operators.add(operator);
      station.lineIds.add(line.id);
      station.coordinates ??= resolveTransitStationCoordinate(input.planningData, {
        mode: line.mode,
        stop,
      });
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

  connectNetwork(stations, segments);
  const operatorComponents = new Map<string, OperatorComponents>();
  const operatorStats = Array.from(operators.values()).map((operatorTopology) => {
    const components = findOperatorComponents(operatorTopology, segments);
    operatorComponents.set(operatorTopology.operator, components);
    return buildOperatorStats({
      topology: operatorTopology,
      stations,
      segments,
      components,
      serviceWindows,
    });
  });
  const rankedOperators = assignRanks(operatorStats).sort(compareOperators);
  const transferStationCount = Array.from(stations.values()).filter(
    (station) => station.operators.size > 1,
  ).length;
  const sharedSegmentCount = Array.from(segments.values()).filter(
    (segment) => segment.lineIds.size > 1,
  ).length;
  const operating = buildOperatingStats(input.lines, serviceWindows);
  const spatial = buildSpatialStats(stations, segments, input.planningData.points);
  const planning = buildPlanningStats(stations, input.planningData.points);

  return {
    lineCount: input.lines.length,
    topologyLineCount,
    stationCount: stations.size,
    topologySegmentCount: segments.size,
    sharedSegmentCount,
    transferStationCount,
    stationIdentityFallbackCount,
    incompleteLineCount,
    operating,
    spatial,
    planning,
    operators: rankedOperators,
    suggestions: buildSuggestions({
      mode: input.mode,
      lines: input.lines,
      operators: rankedOperators,
      operatorComponents,
      stations,
      segments,
      serviceWindows,
      planningPoints: input.planningData.points,
      sharedSegmentCount,
      stationIdentityFallbackCount,
      incompleteLineCount,
      operating,
      spatial,
      planning,
    }),
  };
}

function connectNetwork(
  stations: Map<string, NetworkStation>,
  segments: Map<string, NetworkSegment>,
): void {
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
    if (leftStation.coordinates && rightStation.coordinates) {
      segment.distance = coordinateDistance(leftStation.coordinates, rightStation.coordinates);
    }
  }
}

function buildOperatorStats(input: {
  topology: OperatorTopology;
  stations: Map<string, NetworkStation>;
  segments: Map<string, NetworkSegment>;
  components: OperatorComponents;
  serviceWindows: Map<string, LineServiceWindow>;
}): TransitNetworkHealthOperatorStats {
  const stationNodes = Array.from(input.topology.stationKeys)
    .map((stationKey) => input.stations.get(stationKey))
    .filter((station): station is NetworkStation => Boolean(station));
  const operatorSegments = Array.from(input.topology.segmentKeys)
    .map((segmentKey) => input.segments.get(segmentKey))
    .filter((segment): segment is NetworkSegment => Boolean(segment));
  const lineWindows = Array.from(input.topology.lineIds)
    .map((lineId) => input.serviceWindows.get(lineId))
    .filter((window): window is LineServiceWindow => Boolean(window));
  const stationCount = stationNodes.length;
  const topologySegmentCount = operatorSegments.length;
  const sharedSegmentCount = operatorSegments.filter((segment) => segment.lineIds.size > 1).length;

  return {
    operator: input.topology.operator,
    modes: Array.from(input.topology.modes),
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
    scheduledLineCount: lineWindows.length,
    scheduleCoverageRate: roundMetric(safeRatio(lineWindows.length, input.topology.lineIds.size)),
    averageServiceSpanMinutes: roundMetric(
      average(lineWindows.map((window) => window.spanMinutes)),
    ),
    earlyStartLineCount: lineWindows.filter((window) => window.firstMinute <= earlyServiceThreshold)
      .length,
    lateEndLineCount: lineWindows.filter((window) => window.lastMinute >= lateServiceThreshold)
      .length,
    ranks: emptyRanks(),
  };
}

function buildOperatingStats(
  lines: TransitLineSummary[],
  serviceWindows: Map<string, LineServiceWindow>,
): TransitNetworkHealthOperatingStats {
  const windows = lines
    .map((line) => serviceWindows.get(line.id))
    .filter((window): window is LineServiceWindow => Boolean(window));
  const spans = windows.map((window) => window.spanMinutes);
  return {
    scheduledLineCount: windows.length,
    scheduleCoverageRate: roundMetric(safeRatio(windows.length, lines.length)),
    averageServiceSpanMinutes: roundMetric(average(spans)),
    shortestServiceSpanMinutes: spans.length > 0 ? Math.min(...spans) : 0,
    longestServiceSpanMinutes: spans.length > 0 ? Math.max(...spans) : 0,
    earlyStartLineCount: windows.filter((window) => window.firstMinute <= earlyServiceThreshold)
      .length,
    lateEndLineCount: windows.filter((window) => window.lastMinute >= lateServiceThreshold).length,
  };
}

function buildSpatialStats(
  stations: Map<string, NetworkStation>,
  segments: Map<string, NetworkSegment>,
  points: TransitNetworkPlanningPoint[],
): TransitNetworkHealthSpatialStats {
  const locatedStations = Array.from(stations.values()).filter((station) => station.coordinates);
  const locatedSegments = Array.from(segments.values()).filter(
    (segment): segment is NetworkSegment & { distance: number } => segment.distance !== undefined,
  );
  const roadPoints = points.filter((point) => point.categoryId === 'road');
  const coveredRoadNodeCount = roadPoints.filter((point) =>
    locatedStations.some(
      (station) =>
        station.coordinates &&
        coordinateDistance(station.coordinates, point.coordinates) <= catchmentRadius,
    ),
  ).length;
  const coordinates = locatedStations
    .map((station) => station.coordinates)
    .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

  return {
    locatedStationCount: locatedStations.length,
    stationLocationCoverageRate: roundMetric(safeRatio(locatedStations.length, stations.size)),
    locatedSegmentCount: locatedSegments.length,
    approximateRouteLength: roundMetric(
      locatedSegments.reduce((total, segment) => total + segment.distance, 0),
    ),
    averageStationSpacing: roundMetric(average(locatedSegments.map((segment) => segment.distance))),
    networkSpanArea: roundMetric(boundingBoxArea(coordinates)),
    roadCount: new Set(roadPoints.map((point) => normalizeStationName(point.label))).size,
    roadNodeCount: roadPoints.length,
    coveredRoadNodeCount,
    roadNodeCoverageRate: roundMetric(safeRatio(coveredRoadNodeCount, roadPoints.length)),
    catchmentRadius,
  };
}

function buildPlanningStats(
  stations: Map<string, NetworkStation>,
  points: TransitNetworkPlanningPoint[],
): TransitNetworkHealthPlanningStats {
  const locatedStations = Array.from(stations.values()).filter(
    (station): station is NetworkStation & { coordinates: [number, number] } =>
      Boolean(station.coordinates),
  );
  const definitionBySourceCategory = new Map(
    placeCategoryDefinitions.flatMap((definition) =>
      definition.sourceCategoryIds.map((categoryId) => [categoryId, definition] as const),
    ),
  );
  const analyzedPoints = points.filter((point) =>
    point.categoryId ? definitionBySourceCategory.has(point.categoryId) : false,
  );
  const demandWeightByPointId = new Map(
    analyzedPoints.map((point) => [
      point.id,
      point.categoryId ? (definitionBySourceCategory.get(point.categoryId)?.demandWeight ?? 0) : 0,
    ]),
  );
  const coveredPointIds = new Set(
    analyzedPoints
      .filter((point) =>
        locatedStations.some(
          (station) =>
            coordinateDistance(station.coordinates, point.coordinates) <= catchmentRadius,
        ),
      )
      .map((point) => point.id),
  );
  const stationDemand = locatedStations.map((station) => {
    const nearbyPoints = analyzedPoints.filter(
      (point) => coordinateDistance(station.coordinates, point.coordinates) <= catchmentRadius,
    );
    const counts = new Map<TransitNetworkHealthPlaceCategory, number>();
    let score = 0;
    for (const point of nearbyPoints) {
      const definition = point.categoryId
        ? definitionBySourceCategory.get(point.categoryId)
        : undefined;
      if (!definition) {
        continue;
      }
      counts.set(definition.category, (counts.get(definition.category) ?? 0) + 1);
      score += definition.demandWeight;
    }
    return {
      station,
      nearbyPlaceCount: nearbyPoints.length,
      demandProxyScore: roundMetric(score),
      leadingCategories: Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 2)
        .map(
          ([category]) =>
            placeCategoryDefinitions.find((definition) => definition.category === category)?.label,
        )
        .filter((label): label is string => Boolean(label)),
    };
  });
  const potentialDemandHotspots = selectPotentialDemandHotspots(
    analyzedPoints.map((centerPoint) => {
      const nearbyPoints = analyzedPoints.filter(
        (point) =>
          coordinateDistance(centerPoint.coordinates, point.coordinates) <= catchmentRadius,
      );
      const counts = new Map<TransitNetworkHealthPlaceCategory, number>();
      let score = 0;
      for (const point of nearbyPoints) {
        const definition = point.categoryId
          ? definitionBySourceCategory.get(point.categoryId)
          : undefined;
        if (!definition) {
          continue;
        }
        score += definition.demandWeight;
        counts.set(definition.category, (counts.get(definition.category) ?? 0) + 1);
      }
      return {
        point: centerPoint,
        nearbyPlaceCount: nearbyPoints.length,
        demandProxyScore: roundMetric(score),
        leadingCategories: Array.from(counts.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 2)
          .map(
            ([category]) =>
              placeCategoryDefinitions.find((definition) => definition.category === category)
                ?.label,
          )
          .filter((label): label is string => Boolean(label)),
        servedByNetwork: coveredPointIds.has(centerPoint.id),
      };
    }),
  );
  const totalDemandProxyScore = Array.from(demandWeightByPointId.values()).reduce(
    (total, score) => total + score,
    0,
  );
  const attainedDemandProxyScore = Array.from(coveredPointIds).reduce(
    (total, pointId) => total + (demandWeightByPointId.get(pointId) ?? 0),
    0,
  );

  return {
    sourcePlaceCount: points.length,
    analyzedPlaceCount: analyzedPoints.length,
    coveredPlaceCount: coveredPointIds.size,
    placeCoverageRate: roundMetric(safeRatio(coveredPointIds.size, analyzedPoints.length)),
    totalDemandProxyScore: roundMetric(totalDemandProxyScore),
    attainedDemandProxyScore: roundMetric(attainedDemandProxyScore),
    demandAttainmentRate: roundMetric(safeRatio(attainedDemandProxyScore, totalDemandProxyScore)),
    averageDemandProxyScore: roundMetric(
      average(stationDemand.map((station) => station.demandProxyScore)),
    ),
    placeCategories: placeCategoryDefinitions.map((definition) => {
      const categoryPoints = analyzedPoints.filter((point) =>
        point.categoryId ? definition.sourceCategoryIds.includes(point.categoryId) : false,
      );
      const coveredPlaceCount = categoryPoints.filter((point) =>
        coveredPointIds.has(point.id),
      ).length;
      const nearbyCount = stationDemand.reduce((total, station) => {
        const nearbyCategoryCount = analyzedPoints.filter(
          (point) =>
            Boolean(point.categoryId && definition.sourceCategoryIds.includes(point.categoryId)) &&
            station.station.coordinates &&
            coordinateDistance(station.station.coordinates, point.coordinates) <= catchmentRadius,
        ).length;
        return total + nearbyCategoryCount;
      }, 0);
      return {
        category: definition.category,
        label: definition.label,
        placeCount: categoryPoints.length,
        coveredPlaceCount,
        coverageRate: roundMetric(safeRatio(coveredPlaceCount, categoryPoints.length)),
        nearbyPlacesPerStation: roundMetric(safeRatio(nearbyCount, locatedStations.length)),
      };
    }),
    demandHotspots: stationDemand
      .filter((station) => station.nearbyPlaceCount > 0)
      .sort(
        (left, right) =>
          right.demandProxyScore - left.demandProxyScore ||
          left.station.name.localeCompare(right.station.name, 'zh-CN'),
      )
      .slice(0, 8)
      .map((item) => ({
        stationName: item.station.name,
        mode: Array.from(item.station.modes)[0] ?? 'custom',
        nearbyPlaceCount: item.nearbyPlaceCount,
        demandProxyScore: item.demandProxyScore,
        leadingCategories: item.leadingCategories,
      })),
    potentialDemandHotspots: potentialDemandHotspots.map((item) => ({
      placeName: item.point.label,
      nearbyPlaceCount: item.nearbyPlaceCount,
      demandProxyScore: item.demandProxyScore,
      leadingCategories: item.leadingCategories,
      servedByNetwork: item.servedByNetwork,
    })),
  };
}

function selectPotentialDemandHotspots<
  T extends { point: TransitNetworkPlanningPoint; demandProxyScore: number },
>(candidates: T[]): T[] {
  const selected: T[] = [];
  for (const candidate of [...candidates].sort(
    (left, right) =>
      right.demandProxyScore - left.demandProxyScore ||
      left.point.label.localeCompare(right.point.label, 'zh-CN'),
  )) {
    if (
      selected.some(
        (item) =>
          coordinateDistance(item.point.coordinates, candidate.point.coordinates) < catchmentRadius,
      )
    ) {
      continue;
    }
    selected.push(candidate);
    if (selected.length >= 8) {
      break;
    }
  }
  return selected;
}

function buildSuggestions(input: {
  mode?: TransitMode;
  lines: TransitLineSummary[];
  operators: TransitNetworkHealthOperatorStats[];
  operatorComponents: Map<string, OperatorComponents>;
  stations: Map<string, NetworkStation>;
  segments: Map<string, NetworkSegment>;
  serviceWindows: Map<string, LineServiceWindow>;
  planningPoints: TransitNetworkPlanningPoint[];
  sharedSegmentCount: number;
  stationIdentityFallbackCount: number;
  incompleteLineCount: number;
  operating: TransitNetworkHealthOperatingStats;
  spatial: TransitNetworkHealthSpatialStats;
  planning: TransitNetworkHealthPlanningStats;
}): TransitNetworkHealthSuggestion[] {
  const suggestions: TransitNetworkHealthSuggestion[] = [];
  const lineById = new Map(input.lines.map((line) => [line.id, line]));
  const locatedStations = Array.from(input.stations.values()).filter(
    (station): station is NetworkStation & { coordinates: [number, number] } =>
      Boolean(station.coordinates),
  );
  const incompleteLines = input.lines.filter((line) => countLineSegments(line) === 0);
  const fallbackStations = Array.from(
    new Map(
      input.lines.flatMap((line) =>
        line.stationStops
          .filter((stop) => !stop.stationSourceId?.trim())
          .map(
            (stop) =>
              [`${line.mode}:${normalizeStationName(stop.stationName)}`, { stop, line }] as const,
          ),
      ),
    ).values(),
  );
  const missingScheduleLines = input.lines.filter((line) => !input.serviceWindows.has(line.id));
  const unlocatedStations = Array.from(input.stations.values()).filter(
    (station) => !station.coordinates,
  );

  if (input.incompleteLineCount > 0) {
    suggestions.push({
      id: 'data-quality-incomplete-lines',
      kind: 'data_quality',
      dimension: 'data_quality',
      priority: 'attention',
      title: '补全缺少连续站序的线路数据',
      detail: `当前有 ${input.incompleteLineCount} 条线路未形成可计算的连续站段，因此未参与路段与连接度计算。`,
      evidence: '依据：线路停靠点序列不足两个不同站点。',
      targetLabel: '缺少连续站序的线路',
      targets: incompleteLines.map((line) => ({
        kind: 'line',
        label: line.name,
        detail: describeLineContext(line),
      })),
      targetCount: incompleteLines.length,
    });
  }
  if (input.stationIdentityFallbackCount > 0) {
    suggestions.push({
      id: 'data-quality-station-identities',
      kind: 'data_quality',
      dimension: 'data_quality',
      priority: 'info',
      title: '为缺少来源 ID 的站点补充稳定标识',
      detail: `有 ${input.stationIdentityFallbackCount} 个停靠点只能按交通方式和站名归并，跨方式换乘关系可能被低估。`,
      evidence: '依据：停靠点缺少 stationSourceId。',
      targetLabel: '缺少稳定 ID 的站点',
      targets: fallbackStations.map(({ stop, line }) => ({
        kind: 'station',
        label: stop.stationName,
        detail: `${line.name} · ${describeLineContext(line)}`,
      })),
      targetCount: fallbackStations.length,
    });
  }
  if (input.operating.scheduleCoverageRate < 1) {
    suggestions.push({
      id: 'data-quality-service-hours',
      kind: 'data_quality',
      dimension: 'data_quality',
      priority: input.operating.scheduleCoverageRate < 0.5 ? 'attention' : 'info',
      title: '补全首末班与运营日期数据',
      detail: `当前仅 ${formatPercent(input.operating.scheduleCoverageRate)} 的线路可计算服务时长。缺失时刻的线路不参与早晚服务覆盖判断。`,
      evidence: `依据：${input.operating.scheduledLineCount} 条线路具有可解析的首末服务时刻。`,
      targetLabel: '缺少可解析时刻的线路',
      targets: missingScheduleLines.map((line) => ({
        kind: 'line',
        label: line.name,
        detail: describeLineContext(line),
      })),
      targetCount: missingScheduleLines.length,
    });
  }
  if (input.spatial.stationLocationCoverageRate < 1 && input.stations.size > 0) {
    suggestions.push({
      id: 'data-quality-station-locations',
      kind: 'data_quality',
      dimension: 'data_quality',
      priority: input.spatial.stationLocationCoverageRate < 0.5 ? 'attention' : 'info',
      title: '补齐站点与地图坐标的绑定',
      detail: `当前 ${formatPercent(input.spatial.stationLocationCoverageRate)} 的站点可关联地图坐标。距离、地点覆盖与潜在需求指标仅使用已定位样本。`,
      evidence: `依据：${input.spatial.locatedStationCount}/${input.stations.size} 个站点已定位。`,
      targetLabel: '尚未定位的站点',
      targets: unlocatedStations
        .sort((left, right) => right.lineIds.size - left.lineIds.size)
        .map((station) => ({
          kind: 'station',
          label: station.name,
          detail: `${station.lineIds.size} 条线路经过`,
        })),
      targetCount: unlocatedStations.length,
    });
  }

  const componentCandidates = input.operators.filter((operator) => {
    const onlyBus = operator.modes.length > 0 && operator.modes.every((mode) => mode === 'bus');
    return !onlyBus && operator.stationCount > 0 && operator.componentCount > 1;
  });
  pushGroupedOperatorSuggestion(suggestions, {
    id: 'connect-components',
    candidates: componentCandidates,
    kind: 'connect_components',
    dimension: 'topology',
    priority: 'attention',
    title: '评估非公交线网片区间的接驳',
    detail:
      '这些运营方的非公交线网存在多个不连通片区，可核验联络线、延伸段或换乘节点。公交线路按统一分配管理，不使用运营商分片触发此建议。',
    evidence: `依据：连通片区数范围 ${rangeText(componentCandidates.map((item) => item.componentCount))}。`,
    targetLabel: '存在多个片区的运营方',
    targets: componentCandidates.map((operator) => ({
      kind: 'operator',
      label: operator.operator,
      detail: describeOperatorComponents(
        input.operatorComponents.get(operator.operator),
        input.stations,
      ),
    })),
    targetCount: componentCandidates.length,
  });

  const transferCandidates = input.operators.filter(
    (operator) => operator.transferStationCount === 0 && operator.stationCount >= 4,
  );
  pushGroupedOperatorSuggestion(suggestions, {
    id: 'improve-transfer',
    candidates: transferCandidates,
    kind: 'improve_transfer',
    dimension: 'topology',
    priority: 'info',
    title: '核验跨运营方换乘衔接',
    detail: '这些运营方尚未识别到共享稳定站点 ID 的换乘点，可结合站点绑定和实际步行换乘条件复核。',
    evidence: `依据：涉及 ${transferCandidates.reduce((total, item) => total + item.stationCount, 0)} 个运营方站点样本。`,
    targetLabel: '尚未识别换乘点的运营方',
    targets: transferCandidates.map((operator) => ({
      kind: 'operator',
      label: operator.operator,
      detail: `${operator.lineCount} 条线路 · ${operator.stationCount} 个站点`,
    })),
    targetCount: transferCandidates.length,
  });

  const crossConnectionCandidates = input.operators.filter(
    (operator) =>
      !operator.modes.every((mode) => mode === 'bus') &&
      operator.topologySegmentCount >= 3 &&
      operator.averageConnectivity <= 1.25,
  );
  pushGroupedOperatorSuggestion(suggestions, {
    id: 'improve-cross-connection',
    candidates: crossConnectionCandidates,
    kind: 'improve_cross_connection',
    dimension: 'topology',
    priority: 'info',
    title: '评估横向连接或末端接驳',
    detail:
      '这些非公交线网站点接近枝状结构，可结合需求热点、道路条件与运营成本评估横向连接或末端延伸。',
    evidence: `依据：平均连接度范围 ${rangeText(crossConnectionCandidates.map((item) => item.averageConnectivity))}。`,
    targetLabel: '枝状结构运营方',
    targets: crossConnectionCandidates.map((operator) => ({
      kind: 'operator',
      label: operator.operator,
      detail: `平均连接度 ${formatMetric(operator.averageConnectivity)} · ${operator.topologySegmentCount} 个站间路段`,
    })),
    targetCount: crossConnectionCandidates.length,
  });

  const overlapCandidates = input.operators.filter(
    (operator) => operator.sharedSegmentCount > 0 && operator.averageLinesPerSegment >= 2,
  );
  const overlapOperatorNames = new Set(overlapCandidates.map((operator) => operator.operator));
  const overlapSegments = Array.from(input.segments.values())
    .filter(
      (segment) =>
        segment.lineIds.size > 1 &&
        Array.from(segment.lineIds).some((lineId) =>
          overlapOperatorNames.has(normalizeOperator(lineById.get(lineId)?.operator)),
        ),
    )
    .sort((left, right) => right.lineIds.size - left.lineIds.size);
  pushGroupedOperatorSuggestion(suggestions, {
    id: 'reduce-corridor-overlap',
    candidates: overlapCandidates,
    kind: 'reduce_corridor_overlap',
    dimension: 'topology',
    priority: 'info',
    title: '复核高复用走廊的线路分工',
    detail: '这些运营方经过的部分走廊承载多条线路，可统一评估快慢线、区间车、停站分工和班次协调。',
    evidence: `依据：运营方共线路段数范围 ${rangeText(overlapCandidates.map((item) => item.sharedSegmentCount))}。`,
    targetLabel: '高复用站间路段',
    targets: overlapSegments.map((segment) =>
      segmentSuggestionTarget(segment, input.stations, lineById),
    ),
    targetCount: overlapSegments.length,
  });

  const shortServiceCandidates = input.operators.filter(
    (operator) =>
      operator.scheduleCoverageRate >= 0.8 &&
      operator.averageServiceSpanMinutes > 0 &&
      operator.averageServiceSpanMinutes < 12 * 60,
  );
  const shortServiceOperatorNames = new Set(
    shortServiceCandidates.map((operator) => operator.operator),
  );
  const shortServiceLines = input.lines
    .map((line) => ({ line, window: input.serviceWindows.get(line.id) }))
    .filter((item): item is { line: TransitLineSummary; window: LineServiceWindow } =>
      Boolean(
        item.window &&
        item.window.spanMinutes < 12 * 60 &&
        shortServiceOperatorNames.has(normalizeOperator(item.line.operator)),
      ),
    )
    .sort((left, right) => left.window.spanMinutes - right.window.spanMinutes);
  pushGroupedOperatorSuggestion(suggestions, {
    id: 'improve-service-hours',
    candidates: shortServiceCandidates,
    kind: 'improve_service_hours',
    dimension: 'operations',
    priority: 'info',
    title: '复核短运营时长线路的早晚服务',
    detail:
      '这些运营方的平均服务时长不足 12 小时，可结合通勤、夜间活动与末班换乘需求复核首末班安排。',
    evidence: `依据：平均服务时长范围 ${formatDurationRange(shortServiceCandidates.map((item) => item.averageServiceSpanMinutes))}。`,
    targetLabel: '运营时长不足 12 小时的线路',
    targets: shortServiceLines.map(({ line, window }) => ({
      kind: 'line',
      label: line.name,
      detail: `${formatServiceWindow(window)} · ${normalizeOperator(line.operator)}`,
    })),
    targetCount: shortServiceLines.length,
  });

  if (
    input.operating.scheduledLineCount >= 4 &&
    input.operating.lateEndLineCount / input.operating.scheduledLineCount < 0.25
  ) {
    const earlyEndingLines = input.lines
      .map((line) => ({ line, window: input.serviceWindows.get(line.id) }))
      .filter((item): item is { line: TransitLineSummary; window: LineServiceWindow } =>
        Boolean(item.window && item.window.lastMinute < lateServiceThreshold),
      )
      .sort((left, right) => left.window.lastMinute - right.window.lastMinute);
    suggestions.push({
      id: 'network-late-service',
      kind: 'improve_service_hours',
      dimension: 'operations',
      priority: 'info',
      title: '评估夜间服务覆盖',
      detail:
        '可解析时刻的线路中，22:00 后仍提供服务的比例偏低；建议结合夜间就业、商业与对外交通到达时刻复核末班衔接。',
      evidence: `依据：${input.operating.lateEndLineCount}/${input.operating.scheduledLineCount} 条线路服务至 22:00 后。`,
      targetLabel: '22:00 前结束服务的线路',
      targets: earlyEndingLines.map(({ line, window }) => ({
        kind: 'line',
        label: line.name,
        detail: `${formatServiceWindow(window)} · ${normalizeOperator(line.operator)}`,
      })),
      targetCount: earlyEndingLines.length,
    });
  }

  const locatedSegments = Array.from(input.segments.values())
    .filter(
      (segment): segment is NetworkSegment & { distance: number } => segment.distance !== undefined,
    )
    .sort((left, right) => left.distance - right.distance);
  const locatedDistances = locatedSegments.map((segment) => segment.distance);
  const medianDistance = percentile(locatedDistances, 0.5);
  const widestDistance = locatedDistances.at(-1) ?? 0;
  if (
    input.spatial.stationLocationCoverageRate >= 0.5 &&
    locatedDistances.length >= 5 &&
    medianDistance > 0 &&
    widestDistance >= medianDistance * 2.5
  ) {
    const wideSegments = locatedSegments
      .filter((segment) => segment.distance >= medianDistance * 2.5)
      .sort((left, right) => right.distance - left.distance);
    suggestions.push({
      id: 'network-station-spacing',
      kind: 'improve_station_spacing',
      dimension: 'scale',
      priority: 'info',
      title: '核验大站距区间的覆盖缺口',
      detail:
        '已定位站段中存在明显高于典型站距的区间，可结合沿线地点密度判断增设站点、接驳线或保留快速直达是否更合适。',
      evidence: `依据：最大站距 ${formatMetric(widestDistance)}，中位站距 ${formatMetric(medianDistance)} 个地图单位。`,
      targetLabel: '超过中位站距 2.5 倍的区间',
      targets: wideSegments.map((segment) =>
        segmentSuggestionTarget(segment, input.stations, lineById, true),
      ),
      targetCount: wideSegments.length,
    });
  }

  if (
    input.spatial.stationLocationCoverageRate >= 0.5 &&
    input.planning.analyzedPlaceCount >= 20 &&
    (input.planning.placeCoverageRate < 0.65 || input.planning.demandAttainmentRate < 0.65)
  ) {
    const weakestCategories = input.planning.placeCategories
      .filter((category) => category.placeCount >= 3)
      .sort((left, right) => left.coverageRate - right.coverageRate)
      .slice(0, 2)
      .map((category) => category.label)
      .join('、');
    const uncoveredPlaces = input.planningPoints
      .map((point) => ({ point, definition: findPlaceCategoryDefinition(point.categoryId) }))
      .filter(
        (
          item,
        ): item is {
          point: TransitNetworkPlanningPoint;
          definition: PlaceCategoryDefinition;
        } =>
          Boolean(item.definition) &&
          !locatedStations.some(
            (station) =>
              coordinateDistance(station.coordinates, item.point.coordinates) <= catchmentRadius,
          ),
      )
      .sort((left, right) => right.definition.demandWeight - left.definition.demandWeight);
    suggestions.push({
      id: 'network-place-coverage',
      kind: 'improve_place_coverage',
      dimension: 'places',
      priority: 'attention',
      title: '优先核验活动地点覆盖薄弱区',
      detail: `可将未进入 ${input.spatial.catchmentRadius} 地图单位站点服务圈的地点聚类，优先检查${weakestCategories || '低覆盖类别'}周边的新线、支线或接驳需求。`,
      evidence: `依据：${input.planning.coveredPlaceCount}/${input.planning.analyzedPlaceCount} 个规划地点进入服务圈，需求达成率 ${formatPercent(input.planning.demandAttainmentRate)}。`,
      targetLabel: '未进入站点服务圈的地点',
      targets: uncoveredPlaces.map(({ point, definition }) => ({
        kind: 'place',
        label: normalizeTargetLabel(point.label),
        detail: `${definition.label} · 需求权重 ${formatMetric(definition.demandWeight)}`,
      })),
      targetCount: uncoveredPlaces.length,
    });
  }

  if (
    input.spatial.stationLocationCoverageRate >= 0.5 &&
    input.spatial.roadNodeCount >= 20 &&
    input.spatial.roadNodeCoverageRate < 0.65
  ) {
    const uncoveredRoads = Array.from(
      input.planningPoints
        .filter(
          (point) =>
            point.categoryId === 'road' &&
            !locatedStations.some(
              (station) =>
                coordinateDistance(station.coordinates, point.coordinates) <= catchmentRadius,
            ),
        )
        .reduce((groups, point) => {
          const key = normalizeStationName(point.label);
          const group = groups.get(key) ?? { label: point.label, count: 0 };
          group.count += 1;
          groups.set(key, group);
          return groups;
        }, new Map<string, { label: string; count: number }>())
        .values(),
    ).sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'),
    );
    suggestions.push({
      id: 'network-road-coverage',
      kind: 'improve_road_coverage',
      dimension: 'scale',
      priority: 'info',
      title: '结合道路骨架复核线网覆盖边界',
      detail:
        '较多道路节点位于现有站点服务圈之外，可将未覆盖道路节点与居住、就业地点叠加，识别适合公交延伸或接驳的走廊。',
      evidence: `依据：道路节点覆盖率 ${formatPercent(input.spatial.roadNodeCoverageRate)}，道路样本 ${input.spatial.roadCount} 条。`,
      targetLabel: '存在未覆盖节点的道路',
      targets: uncoveredRoads.map((road) => ({
        kind: 'road',
        label: normalizeTargetLabel(road.label),
        detail: `${road.count} 个道路节点未进入服务圈`,
      })),
      targetCount: uncoveredRoads.length,
    });
  }

  const topHotspot = input.planning.demandHotspots[0];
  if (
    topHotspot &&
    input.spatial.stationLocationCoverageRate >= 0.5 &&
    topHotspot.demandProxyScore >= Math.max(5, input.planning.averageDemandProxyScore * 1.7)
  ) {
    const demandTargetThreshold = Math.max(5, input.planning.averageDemandProxyScore * 1.7);
    const demandTargets = buildDemandSuggestionTargets(
      input.stations,
      input.planningPoints,
      demandTargetThreshold,
    );
    suggestions.push({
      id: 'network-demand-hotspots',
      kind: 'serve_demand_hotspots',
      dimension: 'demand',
      priority: 'info',
      title: '复核高需求代理站点的运力配置',
      detail: `以地点密度加权后，${topHotspot.stationName} 等站点形成较高的潜在需求代理值。可进一步叠加班次、车辆容量与实际客流，判断是否需要加密服务。`,
      evidence: `依据：${topHotspot.stationName} 周边 ${topHotspot.nearbyPlaceCount} 个规划地点，需求代理值 ${formatMetric(topHotspot.demandProxyScore)}。`,
      targetLabel: '高需求代理站点',
      targets: demandTargets,
      targetCount: demandTargets.length,
    });
  }

  if (input.operators.length > 0 && input.sharedSegmentCount === 0) {
    suggestions.push({
      id: 'network-no-shared-segments',
      kind: 'improve_transfer',
      dimension: 'data_quality',
      priority: 'info',
      title: '复核跨线站点数据完整性',
      detail:
        '当前切片没有检测到共用连续站间路段，可能反映线路分工，也可能说明站点来源 ID 尚未对齐。',
      evidence: '依据：共享线路数大于 1 的站间路段为 0。',
      targetLabel: '待复核线路',
      targets: input.lines.map((line) => ({
        kind: 'line',
        label: line.name,
        detail: `${line.stationCount} 个站点 · ${describeLineContext(line)}`,
      })),
      targetCount: input.lines.length,
    });
  }

  return suggestions;
}

function pushGroupedOperatorSuggestion(
  suggestions: TransitNetworkHealthSuggestion[],
  input: Omit<TransitNetworkHealthSuggestion, 'operators' | 'id'> & {
    id: string;
    candidates: TransitNetworkHealthOperatorStats[];
  },
): void {
  if (input.candidates.length === 0) {
    return;
  }
  suggestions.push({
    id: input.id,
    kind: input.kind,
    dimension: input.dimension,
    priority: input.priority,
    operators: input.candidates.map((candidate) => candidate.operator),
    title: input.title,
    detail: input.detail,
    evidence: input.evidence,
    targetLabel: input.targetLabel,
    targets: input.targets,
    targetCount: input.targetCount,
  });
}

function countLineSegments(line: TransitLineSummary): number {
  let count = 0;
  let previousStationKey: string | undefined;
  for (const stop of line.stationStops) {
    const stationKey = resolveStationIdentity({
      mode: line.mode,
      sourceId: stop.stationSourceId,
      name: stop.stationName,
    }).key;
    if (previousStationKey && previousStationKey !== stationKey) {
      count += 1;
    }
    previousStationKey = stationKey;
  }
  return count;
}

function describeLineContext(line: TransitLineSummary): string {
  const endpoints =
    line.firstStationName && line.lastStationName
      ? ` · ${line.firstStationName}→${line.lastStationName}`
      : '';
  return `${defaultModePresentation(line.mode).label} · ${normalizeOperator(line.operator)}${endpoints}`;
}

function describeOperatorComponents(
  components: OperatorComponents | undefined,
  stations: Map<string, NetworkStation>,
): string {
  if (!components || components.stations.length === 0) {
    return '缺少片区代表站点';
  }
  const componentDescriptions = components.stations.map((stationKeys, index) => {
    const names = stationKeys
      .map((stationKey) => stations.get(stationKey)?.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 2);
    return `片区 ${index + 1}：${names.join('、') || '待补充站点'}`;
  });
  return `${components.count} 个片区 · ${componentDescriptions.join('；')}`;
}

function segmentSuggestionTarget(
  segment: NetworkSegment,
  stations: Map<string, NetworkStation>,
  lineById: Map<string, TransitLineSummary>,
  includeDistance = false,
): TransitNetworkHealthSuggestionTarget {
  const stationNames = segment.stationKeys.map(
    (stationKey) => stations.get(stationKey)?.name ?? '未知站点',
  );
  const lineNames = Array.from(segment.lineIds)
    .map((lineId) => lineById.get(lineId))
    .filter((line): line is TransitLineSummary => Boolean(line));
  const lineNameCounts = new Map<string, number>();
  for (const line of lineNames) {
    lineNameCounts.set(line.name, (lineNameCounts.get(line.name) ?? 0) + 1);
  }
  const lineLabels = lineNames.map((line) => {
    if ((lineNameCounts.get(line.name) ?? 0) <= 1) {
      return line.name;
    }
    return line.firstStationName && line.lastStationName
      ? `${line.name}（${line.firstStationName}→${line.lastStationName}）`
      : line.name;
  });
  const detailParts = [
    includeDistance && segment.distance !== undefined
      ? `站距 ${formatMetric(segment.distance)} 地图单位`
      : undefined,
    `${lineLabels.length} 条线路：${formatNameList(lineLabels)}`,
  ].filter((part): part is string => Boolean(part));
  return {
    kind: 'segment',
    label: stationNames.join('—'),
    detail: detailParts.join(' · '),
  };
}

function formatServiceWindow(window: LineServiceWindow): string {
  return `${formatServiceMinute(window.firstMinute)}–${formatServiceMinute(window.lastMinute)} · ${formatMetric(window.spanMinutes / 60)} 小时`;
}

function formatServiceMinute(value: number): string {
  const dayOffset = Math.floor(value / (24 * 60));
  const normalized = value % (24 * 60);
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (normalized % 60).toString().padStart(2, '0');
  return `${dayOffset > 0 ? '次日 ' : ''}${hours}:${minutes}`;
}

function findPlaceCategoryDefinition(
  categoryId: string | undefined,
): PlaceCategoryDefinition | undefined {
  return placeCategoryDefinitions.find((definition) =>
    categoryId ? definition.sourceCategoryIds.includes(categoryId) : false,
  );
}

function buildDemandSuggestionTargets(
  stations: Map<string, NetworkStation>,
  points: TransitNetworkPlanningPoint[],
  threshold: number,
): TransitNetworkHealthSuggestionTarget[] {
  const analyzedPoints = points
    .map((point) => ({ point, definition: findPlaceCategoryDefinition(point.categoryId) }))
    .filter(
      (
        item,
      ): item is {
        point: TransitNetworkPlanningPoint;
        definition: PlaceCategoryDefinition;
      } => Boolean(item.definition),
    );
  return Array.from(stations.values())
    .filter((station): station is NetworkStation & { coordinates: [number, number] } =>
      Boolean(station.coordinates),
    )
    .map((station) => {
      const nearbyPoints = analyzedPoints.filter(
        ({ point }) =>
          coordinateDistance(station.coordinates, point.coordinates) <= catchmentRadius,
      );
      const categoryCounts = new Map<string, number>();
      let score = 0;
      for (const { definition } of nearbyPoints) {
        score += definition.demandWeight;
        categoryCounts.set(definition.label, (categoryCounts.get(definition.label) ?? 0) + 1);
      }
      const leadingCategories = Array.from(categoryCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 2)
        .map(([label]) => label);
      return {
        station,
        score: roundMetric(score),
        nearbyPlaceCount: nearbyPoints.length,
        leadingCategories,
      };
    })
    .filter((item) => item.score >= threshold)
    .sort(
      (left, right) =>
        right.score - left.score || left.station.name.localeCompare(right.station.name, 'zh-CN'),
    )
    .map((item) => ({
      kind: 'station',
      label: item.station.name,
      detail: `需求代理值 ${formatMetric(item.score)} · ${item.nearbyPlaceCount} 个周边地点 · ${item.leadingCategories.join('、')}`,
    }));
}

function normalizeTargetLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatNameList(names: string[]): string {
  if (names.length <= 6) {
    return names.join('、');
  }
  return `${names.slice(0, 6).join('、')} 等 ${names.length} 条`;
}

function buildAnalysisSources(
  stats: TransitNetworkHealthScopeStats,
  planningData: TransitNetworkPlanningData,
): TransitNetworkHealthAnalysisSource[] {
  return [
    {
      id: 'topology',
      label: '线路拓扑',
      detail: `${stats.topologyLineCount}/${stats.lineCount} 条线路形成连续站段，按稳定站点 ID 归并。`,
      status:
        stats.lineCount === 0
          ? 'unavailable'
          : stats.topologyLineCount === stats.lineCount
            ? 'ready'
            : 'partial',
    },
    {
      id: 'operations',
      label: '运营时间',
      detail: `${stats.operating.scheduledLineCount}/${stats.lineCount} 条线路具有可解析首末服务时刻。`,
      status:
        stats.operating.scheduledLineCount === 0
          ? 'unavailable'
          : stats.operating.scheduledLineCount === stats.lineCount
            ? 'ready'
            : 'partial',
    },
    {
      id: 'places',
      label: '地点密度',
      detail: `${stats.planning.analyzedPlaceCount} 个居住、就业、教育、医疗、生活、文体和对外交通地点参与覆盖分析。`,
      status:
        stats.planning.analyzedPlaceCount === 0
          ? 'unavailable'
          : planningData.staticSourceAvailable
            ? 'ready'
            : 'partial',
    },
    {
      id: 'roads',
      label: '道路规模',
      detail: `${stats.spatial.roadCount} 条道路、${stats.spatial.roadNodeCount} 个道路节点参与服务圈覆盖分析。`,
      status:
        stats.spatial.roadNodeCount === 0
          ? 'unavailable'
          : planningData.staticSourceAvailable
            ? 'ready'
            : 'partial',
    },
  ];
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
    'scheduleCoverageRate',
    'averageServiceSpanMinutes',
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
    modes: new Set(),
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
    modes: new Set(),
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

function resolveLineServiceWindow(line: TransitLineSummary): LineServiceWindow | undefined {
  let firstMinute = parseServiceMinute(line.firstLastBus?.first);
  let lastMinute = parseServiceMinute(line.firstLastBus?.last);
  const departureMinutes = (line.departureTimes ?? [])
    .map(parseServiceMinute)
    .filter((minute): minute is number => minute !== undefined)
    .sort((left, right) => left - right);
  firstMinute ??= departureMinutes[0];
  lastMinute ??= departureMinutes.at(-1);
  if (firstMinute === undefined || lastMinute === undefined) {
    return undefined;
  }
  if (lastMinute < firstMinute) {
    lastMinute += 24 * 60;
  }
  return {
    firstMinute,
    lastMinute,
    spanMinutes: Math.max(0, lastMinute - firstMinute),
  };
}

function parseServiceMinute(value: string | undefined): number | undefined {
  const match = value?.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 47 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
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

function defaultModePresentation(mode: TransitMode): {
  label: string;
  color: string;
  icon: string;
} {
  const defaults: Record<TransitMode, { label: string; color: string; icon: string }> = {
    metro: { label: '地铁', color: '#2584e8', icon: 'subway' },
    tram: { label: '有轨电车', color: '#c64255', icon: 'tram' },
    bus: { label: '公交', color: '#d47a14', icon: 'directions_bus' },
    coach: { label: '客运', color: '#639326', icon: 'airport_shuttle' },
    ferry: { label: '轮渡', color: '#168aa5', icon: 'directions_boat' },
    railway: { label: '地方铁路', color: '#76543c', icon: 'train' },
    custom: { label: '其他线路', color: '#168f78', icon: 'route' },
  };
  return defaults[mode];
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
    scheduleCoverageRate: 0,
    averageServiceSpanMinutes: 0,
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

function boundingBoxArea(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 2) {
    return 0;
  }
  const xValues = coordinates.map(([x]) => x);
  const zValues = coordinates.map(([, z]) => z);
  return (
    (Math.max(...xValues) - Math.min(...xValues)) * (Math.max(...zValues) - Math.min(...zValues))
  );
}

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function percentile(values: number[], proportion: number): number {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * proportion))] ?? 0;
}

function rangeText(values: number[]): string {
  if (values.length === 0) {
    return '无样本';
  }
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return minimum === maximum
    ? formatMetric(minimum)
    : `${formatMetric(minimum)}–${formatMetric(maximum)}`;
}

function formatDurationRange(values: number[]): string {
  if (values.length === 0) {
    return '无样本';
  }
  const minimum = Math.min(...values) / 60;
  const maximum = Math.max(...values) / 60;
  return minimum === maximum
    ? `${formatMetric(minimum)} 小时`
    : `${formatMetric(minimum)}–${formatMetric(maximum)} 小时`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}
