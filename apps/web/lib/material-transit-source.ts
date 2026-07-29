import type { MaterialTemplateField } from '@yct/contracts';
import { toUppercaseRoadPinyin } from './chinese-pinyin';
import {
  findMaterialRoadAtCoordinate,
  listMaterialLocations,
  type MaterialLocationOption,
} from './material-location-source';
import { findMaterialTransitLineNumber } from './entity-translation-store';
import { readTransitOverview } from './transit-data';
import type { TransitLineStopSummary, TransitLineSummary } from './legacy-transit';

export type MaterialTransitDirection = 'east' | 'west' | 'north' | 'south';
export type MaterialTransitTerminalRole = 'origin' | 'terminal';
export type MaterialTransitTravelDirection = 'forward' | 'reverse';
type MaterialTransitLineDirection = MaterialTransitDirection | 'unknown';

export interface MaterialTransitLineOption {
  id: string;
  name: string;
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

interface TransitStationLineCandidate
  extends Omit<MaterialTransitStationLineOption, 'direction'> {
  stationStopIndex: number;
}

export async function listMaterialTransitLines(): Promise<MaterialTransitLineOption[]> {
  const overview = await readTransitOverview();
  return overview.lines
    .map((line) => ({
      id: line.id,
      name: line.name,
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
  const [overview, locations] = await Promise.all([readTransitOverview(), listMaterialLocations()]);
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
      const location = findBusStopLocation(stop, locationByMarkerId, locationByName);
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
      const location = findBusStopLocation(stop, locationByMarkerId, locationByName);
      if (!location) {
        return;
      }
      const markerId = getMarkerId(location.id);
      const current = candidateByMarkerId.get(markerId) ?? {
        marker: location,
        stationSourceId: stop.stationSourceId,
        stationName: stop.stationName,
        candidates: [],
      };
      for (const lineCandidate of createTransitStationLineCandidates(line, stationStopIndex)) {
        if (!current.candidates.some((candidate) => candidate.id === lineCandidate.id)) {
          current.candidates.push(lineCandidate);
        }
      }
      candidateByMarkerId.set(markerId, current);
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
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const overview = await readTransitOverview();
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
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: `transit_line:${line.id}${selectedStop?.stationSourceId ? `:${selectedStop.stationSourceId}` : ''}`,
  };
}

export async function resolveTransitStationMaterialInput(input: {
  stationMarkerId: string;
  direction: MaterialTransitDirection;
  lineIds: string[];
  terminalRole?: MaterialTransitTerminalRole;
  fields: MaterialTemplateField[];
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const station = (await listMaterialTransitStations()).find(
    (item) => item.markerId === input.stationMarkerId,
  );
  if (!station) {
    throw new Error('所选公交站标记点不存在或未关联已发布的公交线路。');
  }
  const selectableLines = station.lines.filter(
    (line) => line.direction === input.direction,
  );
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
      input.terminalRole === 'origin'
        ? '所选线路并非在当前站始发。'
        : '所选线路并非在当前站终到。',
    );
  }

  const candidates: Record<string, string> = {
    stationName: station.stationName,
    stationNamePinyin: toUppercaseRoadPinyin(station.stationName),
  };
  const lineNumbers = await Promise.all(
    selectedLines.map((line) => resolveMaterialTransitLineNumber(line.lineId, line.name)),
  );
  selectedLines.forEach((line, index) => {
    const slot = index + 1;
    const lineNumber = lineNumbers[index];
    candidates[`route${slot}Number`] = lineNumber;
    candidates[`route${slot}FirstLast`] = line.firstLastBus;
    if (index === 0) {
      candidates.routeNumber = lineNumber;
      candidates.routeFirstLast = line.firstLastBus;
      candidates.nextStation = line.nextStationName ?? '';
      candidates.routeOrigin = line.stationNames[0] ?? '';
      candidates.routeTerminal = line.destinationName;
      candidates.routeStations = line.stationNames.join('\n');
      candidates.currentStationIndex = String(line.currentStationIndex);
    }
  });
  if (input.terminalRole) {
    candidates.terminalRole = input.terminalRole === 'origin' ? '始发站' : '终点站';
  }
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: `transit_station:${station.markerId};direction=${input.direction};lines=${input.lineIds.join(',')}${input.terminalRole ? `;terminal=${input.terminalRole}` : ''}`,
  };
}

function findBusStopLocation(
  stop: TransitLineStopSummary,
  locationByMarkerId: Map<string, MaterialLocationOption>,
  locationByName: Map<string, MaterialLocationOption>,
): MaterialLocationOption | undefined {
  for (const markerId of stop.stationMarkerIds ?? []) {
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
  return directions.map((travelDirection) => {
    const orderedStationNames =
      travelDirection === 'forward' ? stationNames : [...stationNames].reverse();
    const currentStationIndex =
      travelDirection === 'forward'
        ? stationStopIndex
        : orderedStationNames.length - stationStopIndex - 1;
    return {
      id: `${line.id}:${travelDirection}`,
      lineId: line.id,
      travelDirection,
      name: line.name,
      operator: line.operator,
      firstLastBus: formatFirstLastBus(line),
      destinationName: orderedStationNames.at(-1) ?? '',
      stationNames: orderedStationNames,
      currentStationIndex,
      nextStationName: orderedStationNames[currentStationIndex + 1],
      isOriginAtStation: currentStationIndex === 0,
      isTerminalAtStation: currentStationIndex === orderedStationNames.length - 1,
      stationStopIndex,
    };
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
  return '首末班时间待维护';
}

async function resolveMaterialTransitLineNumber(lineId: string, lineName: string): Promise<string> {
  const override = await findMaterialTransitLineNumber(lineId);
  if (override) {
    return override;
  }
  const defaultNumber = lineName.trim().replace(/路$/u, '').trim();
  return defaultNumber || lineName.trim();
}

function getMarkerId(locationId: string): string {
  return locationId.startsWith('marker:') ? locationId.slice('marker:'.length) : locationId;
}

function normalizeStationName(value: string): string {
  return value.replace(/[\s\u3000]+/g, '').trim().toLocaleLowerCase();
}

function mapTemplateFields(
  fields: MaterialTemplateField[],
  candidates: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, candidates[field.key] ?? '']));
}
