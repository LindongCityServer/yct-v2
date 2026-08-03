import type {
  MaterialTransitNetworkSnapshot,
  MaterialTemplateField,
  TransitLineRouteMode,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
  TransitOperationStatus,
} from '@yct/contracts';
import { toUppercaseRoadPinyin } from './chinese-pinyin';
import {
  findMaterialRoadAtCoordinate,
  listMaterialMapMarkers,
  listMaterialLocations,
  type MaterialLocationOption,
} from './material-location-source';
import { findMaterialTransitLineNumber } from './entity-translation-store';
import { readMapSpatialProfile } from './map-spatial-profile-store';
import { readMaterialTransitOverview } from './transit-data';
import {
  findMaterialTransitNetworkLine,
  findMaterialTransitNetworkNodeByName,
  findMaterialTransitNetworkPath,
  getMaterialTransitNetworkEdgePoints,
  resolveMaterialTransitNetworkRoute,
  type MaterialTransitNetworkLineMatch,
  type MaterialTransitNetworkRoute,
} from './rmp-transit-network';
import {
  buildVisualRoadGraph,
  resolveVisualRoute,
  type VisualRoadGraph,
} from './transit-line-visual-routing';
import type { TransitLineStopSummary, TransitLineSummary } from './legacy-transit';
import { getTransitStopLocationMarkerIdsForDirection } from './transit-stop-location';

export type MaterialTransitDirection = 'east' | 'west' | 'north' | 'south';
export type MaterialTransitTerminalRole = 'origin' | 'terminal';
export type MaterialTransitTravelDirection = 'forward' | 'reverse';
type MaterialTransitLineDirection = MaterialTransitDirection | 'unknown';

export interface MaterialTransitLineOption {
  id: string;
  name: string;
  mode: string;
  operationStatus: TransitOperationStatus;
  color?: string;
  operator?: string;
  stationCount: number;
  stations: Array<{
    stationSourceId: string;
    stationName: string;
  }>;
}

export interface MaterialTransitStationLineOption {
  id: string;
  lineId: string;
  travelDirection: MaterialTransitTravelDirection;
  name: string;
  operator?: string;
  firstLastBus: string;
  firstBus?: string;
  lastBus?: string;
  destinationName: string;
  stationNames: string[];
  currentStationIndex: number;
  nextStationName?: string;
  direction: MaterialTransitLineDirection;
  isOriginAtStation: boolean;
  isTerminalAtStation: boolean;
}

export interface MaterialTransitStationOption {
  markerId: string;
  stationSourceId: string;
  stationName: string;
  coordinate?: [number, number];
  directionOptions: Array<{ value: MaterialTransitDirection; label: string }>;
  lines: MaterialTransitStationLineOption[];
}

interface TransitStationLineCandidate extends Omit<MaterialTransitStationLineOption, 'direction'> {
  stationStopIndex: number;
}

export async function listMaterialTransitLines(): Promise<MaterialTransitLineOption[]> {
  const overview = await readMaterialTransitOverview();
  return overview.lines
    .map((line) => ({
      id: line.id,
      name: line.name,
      mode: line.mode,
      operationStatus: line.operationStatus,
      color: line.color,
      operator: line.operator,
      stationCount: line.stationCount,
      stations: line.stationStops.flatMap((stop) =>
        stop.stationSourceId
          ? [{ stationSourceId: stop.stationSourceId, stationName: stop.stationName }]
          : [],
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

/**
 * 以公交站标记点为入口组织可用线路。方向按道路主走向归为东西或南北；
 * 无法获得相邻站点或道路坐标时保留为 unknown，不与已识别方向混选。
 */
export async function listMaterialTransitStations(): Promise<MaterialTransitStationOption[]> {
  const [overview, locations] = await Promise.all([
    readMaterialTransitOverview(),
    listMaterialLocations(),
  ]);
  const busStopLocations = locations.filter(
    (location) => location.categoryId.trim().toLowerCase() === 'bus-stop',
  );
  const locationByMarkerId = new Map(
    busStopLocations.map((location) => [getMarkerId(location.id), location] as const),
  );
  const locationByName = new Map(
    busStopLocations.map((location) => [normalizeStationName(location.label), location] as const),
  );
  const coordinateByStationSourceId = new Map<string, [number, number]>();

  for (const line of overview.lines) {
    if (line.mode !== 'bus') {
      continue;
    }
    for (const stop of line.stationStops) {
      if (!stop.stationSourceId || coordinateByStationSourceId.has(stop.stationSourceId)) {
        continue;
      }
      const location = findBusStopLocation(stop, 'forward', locationByMarkerId, locationByName);
      if (location?.coordinate) {
        coordinateByStationSourceId.set(stop.stationSourceId, location.coordinate);
      }
    }
  }

  const candidateByMarkerId = new Map<
    string,
    {
      marker: MaterialLocationOption;
      stationSourceId: string;
      stationName: string;
      candidates: TransitStationLineCandidate[];
    }
  >();

  for (const line of overview.lines) {
    if (line.mode !== 'bus') {
      continue;
    }
    line.stationStops.forEach((stop, stationStopIndex) => {
      if (!stop.stationSourceId) {
        return;
      }
      for (const lineCandidate of createTransitStationLineCandidates(line, stationStopIndex)) {
        const location = findBusStopLocation(
          stop,
          lineCandidate.travelDirection,
          locationByMarkerId,
          locationByName,
        );
        if (!location) {
          continue;
        }
        const markerId = getMarkerId(location.id);
        const current = candidateByMarkerId.get(markerId) ?? {
          marker: location,
          stationSourceId: stop.stationSourceId,
          stationName: stop.stationName,
          candidates: [],
        };
        if (!current.candidates.some((candidate) => candidate.id === lineCandidate.id)) {
          current.candidates.push(lineCandidate);
        }
        candidateByMarkerId.set(markerId, current);
      }
    });
  }

  const stations = await Promise.all(
    Array.from(candidateByMarkerId.entries()).map(async ([markerId, candidate]) => {
      const road = candidate.marker.coordinate
        ? await findMaterialRoadAtCoordinate(candidate.marker.coordinate)
        : undefined;
      const lines = candidate.candidates
        .map(({ stationStopIndex, travelDirection, ...line }) => ({
          ...line,
          travelDirection,
          direction: resolveTransitLineDirection({
            line: overview.lines.find((item) => item.id === line.lineId),
            stationStopIndex,
            travelDirection,
            stationCoordinate: candidate.marker.coordinate,
            coordinateByStationSourceId,
            road,
          }),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      return {
        markerId,
        stationSourceId: candidate.stationSourceId,
        stationName: candidate.stationName,
        coordinate: candidate.marker.coordinate,
        directionOptions: resolveMaterialTransitDirectionOptions(road),
        lines,
      };
    }),
  );

  return stations.sort(
    (left, right) =>
      left.stationName.localeCompare(right.stationName, 'zh-CN') ||
      left.markerId.localeCompare(right.markerId),
  );
}

export async function resolveTransitLineMaterialInput(input: {
  lineId: string;
  stationSourceId?: string;
  fields: MaterialTemplateField[];
  networkGeometry?: MaterialTransitNetworkSnapshot;
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const overview = await readMaterialTransitOverview();
  const line = overview.lines.find((item) => item.id === input.lineId);
  if (!line) {
    throw new Error('所选线路不存在或尚未发布。');
  }
  const selectedStop = input.stationSourceId
    ? line.stationStops.find((item) => item.stationSourceId === input.stationSourceId)
    : line.stationStops[0];
  if (input.stationSourceId && !selectedStop) {
    throw new Error('所选站点不属于当前线路或尚未发布。');
  }
  const destination = line.lastStationName ?? line.stationNames.at(-1) ?? '';
  const candidates: Record<string, string> = {
    lineName: line.name,
    stationName: selectedStop?.stationName ?? line.firstStationName ?? '',
    destinationName: destination,
    operator: line.operator ?? '',
    roadName: line.name,
    roadNameEn: '',
    direction: `${line.firstStationName ?? ''} - ${destination}`.trim(),
  };
  const networkLineMatch = input.networkGeometry
    ? findMaterialTransitNetworkLine(input.networkGeometry, {
        name: line.name,
        color: line.color,
        stationNames: line.stationNames,
      })
    : undefined;
  candidates.accentColor = networkLineMatch?.color ?? line.color ?? '';
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: appendTransitNetworkSourceRef(
      `transit_line:${line.id}${selectedStop?.stationSourceId ? `:${selectedStop.stationSourceId}` : ''}`,
      input.networkGeometry,
      Boolean(networkLineMatch),
    ),
  };
}

export async function resolveTransitStationMaterialInput(
  input: {
    terminalRole?: MaterialTransitTerminalRole;
    fields: MaterialTemplateField[];
    networkGeometry?: MaterialTransitNetworkSnapshot;
  } & (
    | {
        stationMarkerId: string;
        direction: MaterialTransitDirection;
        lineIds: string[];
      }
    | {
        networkNodeId: string;
        lineSelections: Array<{
          lineKey: string;
          direction: MaterialTransitDirection;
        }>;
      }
  ),
): Promise<{ values: Record<string, string>; sourceRef: string }> {
  if ('networkNodeId' in input) {
    return resolveTransitNetworkStationMaterialInput(input);
  }
  const [stations, overview] = await Promise.all([
    listMaterialTransitStations(),
    readMaterialTransitOverview(),
  ]);
  const station = stations.find((item) => item.markerId === input.stationMarkerId);
  if (!station) {
    throw new Error('所选公交站标记点不存在或未关联已发布的公交线路。');
  }
  const selectableLines = station.lines.filter((line) => line.direction === input.direction);
  const selectedLines = input.lineIds.map((lineId) => {
    const line = selectableLines.find((candidate) => candidate.id === lineId);
    if (!line) {
      throw new Error('所选线路不经过当前站点，或与选择的道路方向不符。');
    }
    return line;
  });
  if (new Set(input.lineIds).size !== input.lineIds.length) {
    throw new Error('公交线路不能重复选择。');
  }
  const sourceSelectionRef = `marker=${station.markerId};direction=${input.direction};lines=${input.lineIds.join(',')}`;
  const maximumLineCount = resolveTemplateLineCapacity(input.fields);
  if (selectedLines.length > maximumLineCount) {
    throw new Error(`当前模板最多支持 ${maximumLineCount} 条公交线路。`);
  }
  const requiresTerminalRole = input.fields.some((field) => field.key === 'terminalRole');
  if (requiresTerminalRole && !input.terminalRole) {
    throw new Error('始发终点模板必须选择始发站或终点站。');
  }
  if (
    input.terminalRole &&
    selectedLines.some((line) =>
      input.terminalRole === 'origin' ? !line.isOriginAtStation : !line.isTerminalAtStation,
    )
  ) {
    throw new Error(
      input.terminalRole === 'origin' ? '所选线路并非在当前站始发。' : '所选线路并非在当前站终到。',
    );
  }

  const candidates: Record<string, string> = {
    stationName: station.stationName,
    stationNamePinyin: toUppercaseRoadPinyin(station.stationName),
  };
  const lineDisplays = await Promise.all(
    selectedLines.map((line) => resolveMaterialTransitLineDisplay(line.lineId, line.name)),
  );
  const primaryLine = selectedLines[0];
  const primaryOverviewLine = primaryLine
    ? overview.lines.find((line) => line.id === primaryLine.lineId)
    : undefined;
  const usesRouteMapData = input.fields.some((field) => field.key === 'routeMapData');
  const routeMap =
    primaryLine && usesRouteMapData
      ? await createTransitRouteMapData({
          line: primaryOverviewLine,
          travelDirection: primaryLine.travelDirection,
          currentStationIndex: primaryLine.currentStationIndex,
          networkGeometry: input.networkGeometry,
        })
      : { data: '', usedImportedGeometry: false };
  const networkLineMatch =
    input.networkGeometry && primaryOverviewLine
      ? findMaterialTransitNetworkLine(input.networkGeometry, {
          name: primaryOverviewLine.name,
          color: primaryOverviewLine.color,
          stationNames: primaryOverviewLine.stationNames,
        })
      : undefined;
  candidates.accentColor = networkLineMatch?.color ?? primaryOverviewLine?.color ?? '';
  selectedLines.forEach((line, index) => {
    const slot = index + 1;
    const lineDisplay = lineDisplays[index];
    const lineNumber = lineDisplay?.number ?? '';
    candidates[`route${slot}Number`] = lineNumber;
    candidates[`route${slot}FirstLast`] = line.firstLastBus;
    if (index === 0) {
      candidates.routeNumber = lineNumber;
      candidates.routeSuffix = lineDisplay?.suffix ?? '路';
      candidates.routeFirstLast = line.firstLastBus;
      candidates.nextStation = line.isTerminalAtStation ? '终 点 站' : (line.nextStationName ?? '');
      candidates.routeStationState = line.isTerminalAtStation ? 'terminal_station' : 'next_station';
      candidates.routeOrigin = line.stationNames[0] ?? '';
      candidates.routeTerminal = line.destinationName;
      candidates.routeStations = line.stationNames.join('\n');
      candidates.currentStationIndex = String(line.currentStationIndex);
      candidates.routeServiceTime = formatServiceTimeRange(line.firstBus, line.lastBus);
      candidates.operator = line.operator ?? '';
      candidates.footerText = line.destinationName ? `开往 ${line.destinationName}` : '';
      candidates.routeMapData = routeMap.data;
    }
  });
  if (input.terminalRole) {
    candidates.terminalRole = input.terminalRole === 'origin' ? '始发站' : '终点站';
  }
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: appendTransitNetworkSourceRef(
      `transit_station:${sourceSelectionRef}${input.terminalRole ? `;terminal=${input.terminalRole}` : ''}`,
      input.networkGeometry,
      usesRouteMapData ? routeMap.usedImportedGeometry : Boolean(networkLineMatch),
    ),
  };
}

function resolveTransitNetworkStationMaterialInput(input: {
  networkNodeId: string;
  lineSelections: Array<{
    lineKey: string;
    direction: MaterialTransitDirection;
  }>;
  terminalRole?: MaterialTransitTerminalRole;
  fields: MaterialTemplateField[];
  networkGeometry?: MaterialTransitNetworkSnapshot;
}): { values: Record<string, string>; sourceRef: string } {
  const snapshot = input.networkGeometry;
  if (!snapshot) {
    throw new Error('项目站点选择缺少导入的线网数据。');
  }
  const station = snapshot.nodes.find(
    (node) => node.id === input.networkNodeId && node.kind === 'station' && node.names.length,
  );
  if (!station) {
    throw new Error('所选项目站点不存在。');
  }
  if (
    new Set(input.lineSelections.map((selection) => selection.lineKey)).size !==
    input.lineSelections.length
  ) {
    throw new Error('项目线路不能重复选择。');
  }
  const maximumLineCount = resolveTemplateLineCapacity(input.fields);
  if (input.lineSelections.length > maximumLineCount) {
    throw new Error(`当前模板最多支持 ${maximumLineCount} 条公交线路。`);
  }

  const routes = input.lineSelections.map((selection) => {
    const route = resolveMaterialTransitNetworkRoute(snapshot, {
      nodeId: station.id,
      lineKey: selection.lineKey,
      direction: selection.direction,
    });
    if (!route) {
      throw new Error('所选项目线路不经过当前站点，或与选择的图上方向不符。');
    }
    const orderedStations = route.nodeIds.flatMap((nodeId) => {
      const node = snapshot.nodes.find((candidate) => candidate.id === nodeId);
      return node?.kind === 'station' && node.names.length ? [node] : [];
    });
    const currentStationIndex = orderedStations.findIndex((node) => node.id === station.id);
    if (currentStationIndex < 0) {
      throw new Error('无法在项目线路中定位当前站点。');
    }
    return { route, orderedStations, currentStationIndex };
  });

  const candidates: Record<string, string> = {
    stationName: station.names[0] ?? '',
    stationNamePinyin: station.names[1] ?? toUppercaseRoadPinyin(station.names[0] ?? ''),
  };
  routes.forEach(({ route, orderedStations, currentStationIndex }, index) => {
    const slot = index + 1;
    const lineName =
      route.line.lineName ?? route.line.lineKey.split(':').at(-1) ?? route.line.lineKey;
    const lineDisplay = parseMaterialTransitLineDisplay(lineName);
    candidates[`route${slot}Number`] = lineDisplay.number;
    candidates[`route${slot}FirstLast`] = '';
    if (index !== 0) return;

    const destinationName = orderedStations.at(-1)?.names[0] ?? '';
    const nextStationName = orderedStations[currentStationIndex + 1]?.names[0] ?? '';
    const isTerminal = currentStationIndex === orderedStations.length - 1;
    candidates.accentColor = route.line.color;
    candidates.routeNumber = lineDisplay.number;
    candidates.routeSuffix = lineDisplay.suffix;
    candidates.routeFirstLast = '';
    candidates.nextStation = isTerminal ? '终 点 站' : nextStationName;
    candidates.routeStationState = isTerminal ? 'terminal_station' : 'next_station';
    candidates.routeOrigin = orderedStations[0]?.names[0] ?? '';
    candidates.routeTerminal = destinationName;
    candidates.routeStations = orderedStations.map((node) => node.names[0] ?? '').join('\n');
    candidates.currentStationIndex = String(currentStationIndex);
    candidates.routeServiceTime = '';
    candidates.operator = '';
    candidates.footerText = destinationName ? `开往 ${destinationName}` : '';
    candidates.routeMapData = createProjectTransitRouteMapData({
      snapshot,
      route,
      orderedStations,
      currentStationIndex,
    });
  });
  if (input.terminalRole) {
    candidates.terminalRole = input.terminalRole === 'origin' ? '始发站' : '终点站';
  }
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: `transit_network_project:v${snapshot.version};station=${station.id};lines=${input.lineSelections
      .map((selection) => `${selection.lineKey}@${selection.direction}`)
      .join(',')}`,
  };
}

function createProjectTransitRouteMapData(input: {
  snapshot: MaterialTransitNetworkSnapshot;
  route: MaterialTransitNetworkRoute;
  orderedStations: MaterialTransitNetworkSnapshot['nodes'];
  currentStationIndex: number;
}): string {
  const routeCoordinates: Array<[number, number]> = [];
  for (const step of input.route.steps) {
    appendRouteCoordinates(
      routeCoordinates,
      getMaterialTransitNetworkEdgePoints(input.snapshot, step.edge, step.reverse),
    );
  }
  const transfers = input.orderedStations.flatMap((node, index) => {
    const colors = Array.from(
      new Set(node.lineColors.filter((color) => color !== input.route.line.color)),
    ).slice(0, 8);
    return colors.length
      ? [
          [roundMapNumber(node.x), roundMapNumber(node.y), index, colors] as [
            number,
            number,
            number,
            string[],
          ],
        ]
      : [];
  });
  const payload: TransitRouteMapPayload = {
    route: sampleRouteCoordinates(routeCoordinates, 120).map(roundCoordinate),
    roads: createImportedNetworkContextSegments(input.snapshot, input.route.line, 160),
    stations: input.orderedStations.map((node, index) => [
      roundMapNumber(node.x),
      roundMapNumber(node.y),
      index,
    ]),
    transfers,
    currentStationIndex: input.currentStationIndex,
  };
  return JSON.stringify(payload);
}

interface TransitRouteMapPayload {
  route: Array<[number, number]>;
  roads: Array<[number, number, number, number]>;
  stations: Array<[number, number, number]>;
  transfers?: Array<[number, number, number, string[]]>;
  currentStationIndex: number;
}

async function createTransitRouteMapData(input: {
  line: TransitLineSummary | undefined;
  travelDirection: MaterialTransitTravelDirection;
  currentStationIndex: number;
  networkGeometry?: MaterialTransitNetworkSnapshot;
}): Promise<{ data: string; usedImportedGeometry: boolean }> {
  if (!input.line) {
    return { data: '', usedImportedGeometry: false };
  }
  if (input.networkGeometry) {
    const imported = createImportedTransitRouteMapData({
      line: input.line,
      travelDirection: input.travelDirection,
      currentStationIndex: input.currentStationIndex,
      networkGeometry: input.networkGeometry,
    });
    if (imported) {
      return { data: imported, usedImportedGeometry: true };
    }
  }
  const [locations, markers, mapSpatialProfile] = await Promise.all([
    listMaterialLocations(),
    listMaterialMapMarkers(),
    readMapSpatialProfile(),
  ]);
  const locationByMarkerId = new Map(
    locations.map((location) => [getMarkerId(location.id), location] as const),
  );
  const locationByName = new Map(
    locations.map((location) => [normalizeStationName(location.label), location] as const),
  );
  const orderedStops =
    input.travelDirection === 'forward'
      ? input.line.stationStops
      : [...input.line.stationStops].reverse();
  const locatedStops = orderedStops.map((stop, index) => ({
    coordinate: findBusStopLocation(stop, input.travelDirection, locationByMarkerId, locationByName)
      ?.coordinate,
    index,
    stop,
  }));
  const graph = buildVisualRoadGraph(markers, mapSpatialProfile.roadTiming.junctionSnapTolerance, {
    defaultY: mapSpatialProfile.defaultY,
    verticalTolerance: mapSpatialProfile.verticalTolerance,
    worldId: mapSpatialProfile.worldId,
  });
  const route: Array<[number, number]> = [];
  for (let index = 1; index < locatedStops.length; index += 1) {
    const previous = locatedStops[index - 1];
    const current = locatedStops[index];
    if (!previous?.coordinate || !current?.coordinate) {
      continue;
    }
    const configuredSegment = getConfiguredTransitSegment(
      input.line,
      previous.stop,
      current.stop,
      input.travelDirection,
    );
    const controlCoordinates = [
      previous.coordinate,
      ...(configuredSegment?.waypoints ?? []),
      current.coordinate,
    ];
    const followsRoad =
      configuredSegment?.mode === 'road' ||
      (!configuredSegment &&
        (input.line.routeMode === 'road' ||
          input.line.mode === 'bus' ||
          input.line.mode === 'coach'));
    appendRouteCoordinates(
      route,
      followsRoad
        ? resolveVisualRoute(
            controlCoordinates,
            'road',
            graph,
            input.line.mode === 'coach' ? 'coach' : 'bus',
          ).coordinates
        : controlCoordinates,
    );
  }
  if (route.length < 2) {
    appendRouteCoordinates(
      route,
      locatedStops.flatMap((stop) => (stop.coordinate ? [stop.coordinate] : [])),
    );
  }
  if (route.length < 2) {
    return { data: '', usedImportedGeometry: false };
  }

  const sampledRoute = sampleRouteCoordinates(route, 120).map(roundCoordinate);
  const bounds = getRouteBounds(sampledRoute);
  const roads = graph ? selectRouteContextRoads(graph, bounds, 160) : [];
  const payload: TransitRouteMapPayload = {
    route: sampledRoute,
    roads,
    stations: locatedStops.flatMap((stop) =>
      stop.coordinate
        ? [[roundMapNumber(stop.coordinate[0]), roundMapNumber(stop.coordinate[1]), stop.index]]
        : [],
    ),
    currentStationIndex: input.currentStationIndex,
  };
  return { data: JSON.stringify(payload), usedImportedGeometry: false };
}

function createImportedTransitRouteMapData(input: {
  line: TransitLineSummary;
  travelDirection: MaterialTransitTravelDirection;
  currentStationIndex: number;
  networkGeometry: MaterialTransitNetworkSnapshot;
}): string | undefined {
  const lineMatch = findMaterialTransitNetworkLine(input.networkGeometry, {
    name: input.line.name,
    color: input.line.color,
    stationNames: input.line.stationNames,
  });
  if (!lineMatch) return undefined;
  const orderedStops =
    input.travelDirection === 'forward'
      ? input.line.stationStops
      : [...input.line.stationStops].reverse();
  const locatedStops = orderedStops.map((stop, index) => ({
    index,
    node: findMaterialTransitNetworkNodeByName(
      input.networkGeometry,
      stop.stationName,
      lineMatch.nodeIds,
    ),
  }));
  if (locatedStops.filter((stop) => stop.node).length < 2) return undefined;

  const route: Array<[number, number]> = [];
  for (let index = 1; index < locatedStops.length; index += 1) {
    const previous = locatedStops[index - 1]?.node;
    const current = locatedStops[index]?.node;
    if (!previous || !current) return undefined;
    const path = findMaterialTransitNetworkPath(
      input.networkGeometry,
      lineMatch.edgeIds,
      previous.id,
      current.id,
    );
    if (!path) return undefined;
    for (const step of path) {
      appendRouteCoordinates(
        route,
        getMaterialTransitNetworkEdgePoints(input.networkGeometry, step.edge, step.reverse),
      );
    }
  }
  if (route.length < 2) return undefined;

  const roads = createImportedNetworkContextSegments(input.networkGeometry, lineMatch, 160);
  const transfers = locatedStops.flatMap((stop) => {
    if (!stop.node) return [];
    const colors = stop.node.lineColors.filter((color) => color !== lineMatch.color);
    return colors.length
      ? [
          [
            roundMapNumber(stop.node.x),
            roundMapNumber(stop.node.y),
            stop.index,
            Array.from(new Set(colors)).slice(0, 8),
          ] as [number, number, number, string[]],
        ]
      : [];
  });
  const payload: TransitRouteMapPayload = {
    route: sampleRouteCoordinates(route, 120).map(roundCoordinate),
    roads,
    stations: locatedStops.flatMap((stop) =>
      stop.node ? [[roundMapNumber(stop.node.x), roundMapNumber(stop.node.y), stop.index]] : [],
    ),
    transfers,
    currentStationIndex: input.currentStationIndex,
  };
  return JSON.stringify(payload);
}

function createImportedNetworkContextSegments(
  snapshot: MaterialTransitNetworkSnapshot,
  selectedLine: MaterialTransitNetworkLineMatch,
  maximumCount: number,
): Array<[number, number, number, number]> {
  const segments: Array<[number, number, number, number]> = [];
  for (const edge of snapshot.edges) {
    if (selectedLine.edgeIds.has(edge.id)) continue;
    const points = getMaterialTransitNetworkEdgePoints(snapshot, edge);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) continue;
      segments.push([
        roundMapNumber(previous[0]),
        roundMapNumber(previous[1]),
        roundMapNumber(current[0]),
        roundMapNumber(current[1]),
      ]);
      if (segments.length >= maximumCount) return segments;
    }
  }
  return segments;
}

function appendTransitNetworkSourceRef(
  sourceRef: string,
  snapshot: MaterialTransitNetworkSnapshot | undefined,
  matched: boolean,
): string {
  if (!snapshot) return sourceRef;
  return `${sourceRef};network=rmp:v${snapshot.version}:${matched ? 'matched' : 'fallback'}`;
}

function getConfiguredTransitSegment(
  line: TransitLineSummary,
  previous: TransitLineStopSummary,
  current: TransitLineStopSummary,
  direction: MaterialTransitTravelDirection,
): { mode: TransitLineRouteMode; waypoints: Array<[number, number]> } | undefined {
  const fromStationSourceId = previous.stationSourceId;
  const toStationSourceId = current.stationSourceId;
  if (!fromStationSourceId || !toStationSourceId) {
    return undefined;
  }

  let segmentStartId: string | undefined;
  let pendingWaypoints: TransitLineRouteNodeSnapshot[] = [];
  for (const node of line.routeNodes ?? []) {
    if (node.kind === 'waypoint') {
      pendingWaypoints.push(node);
      continue;
    }
    if (segmentStartId === fromStationSourceId && node.stationSourceId === toStationSourceId) {
      return {
        mode: line.routeMode ?? 'straight',
        waypoints: filterRouteNodeWaypoints(pendingWaypoints, direction),
      };
    }
    if (segmentStartId === toStationSourceId && node.stationSourceId === fromStationSourceId) {
      return {
        mode: line.routeMode ?? 'straight',
        waypoints: filterRouteNodeWaypoints(pendingWaypoints, direction).reverse(),
      };
    }
    segmentStartId = node.stationSourceId;
    pendingWaypoints = [];
  }

  const directPath = (line.segmentPaths ?? []).find(
    (path) =>
      path.fromStationSourceId === fromStationSourceId &&
      path.toStationSourceId === toStationSourceId,
  );
  const reversePath = directPath
    ? undefined
    : (line.segmentPaths ?? []).find(
        (path) =>
          path.fromStationSourceId === toStationSourceId &&
          path.toStationSourceId === fromStationSourceId,
      );
  const configuredPath = directPath ?? reversePath;
  if (!configuredPath) {
    return undefined;
  }
  const waypoints = filterSegmentWaypoints(configuredPath.waypoints, direction).map(
    (waypoint) => [waypoint.x, waypoint.z] as [number, number],
  );
  return { mode: configuredPath.mode, waypoints: reversePath ? waypoints.reverse() : waypoints };
}

function filterSegmentWaypoints(
  waypoints: TransitLineSegmentPathSnapshot['waypoints'],
  direction: MaterialTransitTravelDirection,
): TransitLineSegmentPathSnapshot['waypoints'] {
  return waypoints.filter((waypoint) =>
    isMaterialRouteDirectionIncluded(waypoint.direction, direction),
  );
}

function filterRouteNodeWaypoints(
  nodes: TransitLineRouteNodeSnapshot[],
  direction: MaterialTransitTravelDirection,
): Array<[number, number]> {
  return nodes.flatMap((node) =>
    node.kind === 'waypoint' && isMaterialRouteDirectionIncluded(node.direction, direction)
      ? [[node.x, node.z] as [number, number]]
      : [],
  );
}

function isMaterialRouteDirectionIncluded(
  scope: 'both' | 'up' | 'down' | undefined,
  direction: MaterialTransitTravelDirection,
): boolean {
  return !scope || scope === 'both' || scope === (direction === 'forward' ? 'down' : 'up');
}

function appendRouteCoordinates(
  target: Array<[number, number]>,
  coordinates: Array<[number, number]>,
): void {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      target.push(coordinate);
    }
  }
}

function sampleRouteCoordinates(
  coordinates: Array<[number, number]>,
  maximumCount: number,
): Array<[number, number]> {
  if (coordinates.length <= maximumCount) {
    return coordinates;
  }
  const sampled: Array<[number, number]> = [];
  for (let index = 0; index < maximumCount; index += 1) {
    const sourceIndex = Math.round((index / (maximumCount - 1)) * (coordinates.length - 1));
    const coordinate = coordinates[sourceIndex];
    if (coordinate) {
      appendRouteCoordinates(sampled, [coordinate]);
    }
  }
  return sampled;
}

function getRouteBounds(coordinates: Array<[number, number]>): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return coordinates.reduce(
    (bounds, coordinate) => ({
      minX: Math.min(bounds.minX, coordinate[0]),
      maxX: Math.max(bounds.maxX, coordinate[0]),
      minZ: Math.min(bounds.minZ, coordinate[1]),
      maxZ: Math.max(bounds.maxZ, coordinate[1]),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function selectRouteContextRoads(
  graph: VisualRoadGraph,
  bounds: ReturnType<typeof getRouteBounds>,
  maximumCount: number,
): Array<[number, number, number, number]> {
  const spanX = Math.max(bounds.maxX - bounds.minX, 1);
  const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1);
  const padding = Math.max(Math.max(spanX, spanZ) * 0.12, 32);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  return graph.roadSegments
    .filter(
      (segment) =>
        Math.max(segment.start[0], segment.end[0]) >= bounds.minX - padding &&
        Math.min(segment.start[0], segment.end[0]) <= bounds.maxX + padding &&
        Math.max(segment.start[1], segment.end[1]) >= bounds.minZ - padding &&
        Math.min(segment.start[1], segment.end[1]) <= bounds.maxZ + padding,
    )
    .sort((left, right) => {
      const leftDistance =
        Math.abs((left.start[0] + left.end[0]) / 2 - centerX) +
        Math.abs((left.start[1] + left.end[1]) / 2 - centerZ);
      const rightDistance =
        Math.abs((right.start[0] + right.end[0]) / 2 - centerX) +
        Math.abs((right.start[1] + right.end[1]) / 2 - centerZ);
      return leftDistance - rightDistance;
    })
    .slice(0, maximumCount)
    .map((segment) => [
      roundMapNumber(segment.start[0]),
      roundMapNumber(segment.start[1]),
      roundMapNumber(segment.end[0]),
      roundMapNumber(segment.end[1]),
    ]);
}

function roundCoordinate(coordinate: [number, number]): [number, number] {
  return [roundMapNumber(coordinate[0]), roundMapNumber(coordinate[1])];
}

function roundMapNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

function findBusStopLocation(
  stop: TransitLineStopSummary,
  direction: MaterialTransitTravelDirection,
  locationByMarkerId: Map<string, MaterialLocationOption>,
  locationByName: Map<string, MaterialLocationOption>,
): MaterialLocationOption | undefined {
  const configuredLocationMarkerIds = new Set(
    (stop.stopLocationRefs ?? []).map((ref) => ref.markerId),
  );
  const markerIds = [
    ...getTransitStopLocationMarkerIdsForDirection(stop.stopLocationRefs, direction),
    ...(stop.stationMarkerIds ?? []).filter(
      (markerId) => !configuredLocationMarkerIds.has(markerId),
    ),
  ];
  for (const markerId of markerIds) {
    const location = locationByMarkerId.get(markerId);
    if (location) {
      return location;
    }
  }
  return locationByName.get(normalizeStationName(stop.stationName));
}

function createTransitStationLineCandidates(
  line: TransitLineSummary,
  stationStopIndex: number,
): TransitStationLineCandidate[] {
  const stationNames = line.stationStops.map((stop) => stop.stationName);
  const directions: MaterialTransitTravelDirection[] =
    stationNames.length > 1 ? ['forward', 'reverse'] : ['forward'];
  return directions.flatMap((travelDirection) => {
    const stop = line.stationStops[stationStopIndex];
    if (stop && !isMaterialRouteDirectionIncluded(stop.oneWay, travelDirection)) {
      return [];
    }
    const orderedStationNames =
      travelDirection === 'forward' ? stationNames : [...stationNames].reverse();
    const currentStationIndex =
      travelDirection === 'forward'
        ? stationStopIndex
        : orderedStationNames.length - stationStopIndex - 1;
    return [
      {
        id: `${line.id}:${travelDirection}`,
        lineId: line.id,
        travelDirection,
        name: line.name,
        operator: line.operator,
        firstLastBus: formatFirstLastBus(line),
        firstBus: line.firstLastBus?.first?.trim(),
        lastBus: line.firstLastBus?.last?.trim(),
        destinationName: orderedStationNames.at(-1) ?? '',
        stationNames: orderedStationNames,
        currentStationIndex,
        nextStationName: orderedStationNames[currentStationIndex + 1],
        isOriginAtStation: currentStationIndex === 0,
        isTerminalAtStation: currentStationIndex === orderedStationNames.length - 1,
        stationStopIndex,
      },
    ];
  });
}

function resolveTransitLineDirection(input: {
  line: TransitLineSummary | undefined;
  stationStopIndex: number;
  travelDirection: MaterialTransitTravelDirection;
  stationCoordinate: [number, number] | undefined;
  coordinateByStationSourceId: Map<string, [number, number]>;
  road: Awaited<ReturnType<typeof findMaterialRoadAtCoordinate>>;
}): MaterialTransitLineDirection {
  if (!input.line || !input.stationCoordinate || !input.road) {
    return 'unknown';
  }
  const step = input.travelDirection === 'forward' ? 1 : -1;
  const nextStop = input.line.stationStops[input.stationStopIndex + step];
  const previousStop = input.line.stationStops[input.stationStopIndex - step];
  const nextCoordinate = nextStop?.stationSourceId
    ? input.coordinateByStationSourceId.get(nextStop.stationSourceId)
    : undefined;
  const previousCoordinate = previousStop?.stationSourceId
    ? input.coordinateByStationSourceId.get(previousStop.stationSourceId)
    : undefined;
  const lineVectorX = nextCoordinate
    ? nextCoordinate[0] - input.stationCoordinate[0]
    : previousCoordinate
      ? input.stationCoordinate[0] - previousCoordinate[0]
      : 0;
  const lineVectorZ = nextCoordinate
    ? nextCoordinate[1] - input.stationCoordinate[1]
    : previousCoordinate
      ? input.stationCoordinate[1] - previousCoordinate[1]
      : 0;
  if (!nextCoordinate && !previousCoordinate) {
    return 'unknown';
  }
  const roadVectorX = input.road.projection.segmentEnd[0] - input.road.projection.segmentStart[0];
  const roadVectorZ = input.road.projection.segmentEnd[1] - input.road.projection.segmentStart[1];
  const roadRunsNorthSouth = Math.abs(roadVectorZ) > Math.abs(roadVectorX);
  const axisDelta = roadRunsNorthSouth ? lineVectorZ : lineVectorX;
  if (Math.abs(axisDelta) < 0.001) {
    return 'unknown';
  }
  if (roadRunsNorthSouth) {
    // 地图坐标的 Z 轴向南递增。
    return axisDelta < 0 ? 'north' : 'south';
  }
  return axisDelta < 0 ? 'west' : 'east';
}

function resolveMaterialTransitDirectionOptions(
  road: Awaited<ReturnType<typeof findMaterialRoadAtCoordinate>>,
): Array<{ value: MaterialTransitDirection; label: string }> {
  if (!road) {
    return [];
  }
  const deltaX = road.projection.segmentEnd[0] - road.projection.segmentStart[0];
  const deltaZ = road.projection.segmentEnd[1] - road.projection.segmentStart[1];
  return Math.abs(deltaZ) > Math.abs(deltaX)
    ? [
        { value: 'north', label: '向北' },
        { value: 'south', label: '向南' },
      ]
    : [
        { value: 'east', label: '向东' },
        { value: 'west', label: '向西' },
      ];
}

function resolveTemplateLineCapacity(fields: MaterialTemplateField[]): number {
  const numberedSlots = fields
    .map((field) => field.key.match(/^route(\d+)Number$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  if (numberedSlots.length > 0) {
    return Math.max(...numberedSlots);
  }
  return fields.some((field) => field.key === 'routeNumber') ? 1 : 1;
}

function formatFirstLastBus(line: TransitLineSummary): string {
  const first = line.firstLastBus?.first?.trim();
  const last = line.firstLastBus?.last?.trim();
  if (first && last) {
    return `首 ${first} 末 ${last}`;
  }
  if (first) {
    return `首 ${first}`;
  }
  if (last) {
    return `末 ${last}`;
  }
  return '';
}

function formatServiceTimeRange(first: string | undefined, last: string | undefined): string {
  if (!first && !last) {
    return '';
  }
  if (!first) {
    return `末 ${last}`;
  }
  if (!last) {
    return `首 ${first}`;
  }
  const firstMinutes = parseClockMinutes(first);
  const lastMinutes = parseClockMinutes(last);
  const nextDay =
    firstMinutes !== undefined && lastMinutes !== undefined && lastMinutes < firstMinutes;
  return `${first}-${nextDay ? '次日' : ''}${last}`;
}

function parseClockMinutes(value: string): number | undefined {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

async function resolveMaterialTransitLineDisplay(
  lineId: string,
  lineName: string,
): Promise<{ number: string; suffix: string }> {
  const override = await findMaterialTransitLineNumber(lineId);
  if (override) {
    const normalizedOverride = override.trim();
    return /^[0-9０-９]+$/u.test(normalizedOverride)
      ? { number: normalizedOverride, suffix: getTransitLineSuffix(lineName) }
      : parseMaterialTransitLineDisplay(normalizedOverride);
  }
  return parseMaterialTransitLineDisplay(lineName);
}

function parseMaterialTransitLineDisplay(lineName: string): { number: string; suffix: string } {
  const normalizedName = lineName.trim();
  const numericPrefixMatch = normalizedName.match(/^([0-9０-９]+)(.+)$/u);
  if (numericPrefixMatch) {
    return { number: numericPrefixMatch[1], suffix: numericPrefixMatch[2] };
  }
  const roadSuffixMatch = normalizedName.match(/^(.*?)(路.*)$/u);
  if (roadSuffixMatch?.[1]?.trim() && roadSuffixMatch[2]) {
    return { number: roadSuffixMatch[1].trim(), suffix: roadSuffixMatch[2] };
  }
  return { number: normalizedName, suffix: '路' };
}

function getTransitLineSuffix(lineName: string): string {
  return parseMaterialTransitLineDisplay(lineName).suffix;
}

function getMarkerId(locationId: string): string {
  return locationId.startsWith('marker:') ? locationId.slice('marker:'.length) : locationId;
}

function normalizeStationName(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .trim()
    .toLocaleLowerCase();
}

function mapTemplateFields(
  fields: MaterialTemplateField[],
  candidates: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, candidates[field.key] ?? '']));
}
