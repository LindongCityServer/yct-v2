import type {
  MapMarkerSnapshot,
  MapSpatialProfile,
  TransitDataRevision,
  TravelTripInstance,
  TravelTripStopTime,
} from '@yct/contracts';
import { formatAbsoluteMinutes, toAbsoluteMinutes } from './travel-schedule-timing';
import {
  buildVisualRoadGraph,
  resolveVisualRoute,
  type VisualRoadGraph,
} from './transit-line-visual-routing';

export interface CoachRoadTimingContext {
  graph?: VisualRoadGraph;
  roadTiming?: MapSpatialProfile['roadTiming'];
}

export function createCoachRoadTimingContext(
  markers: MapMarkerSnapshot['markers'],
  spatialProfile: MapSpatialProfile | null,
): CoachRoadTimingContext {
  if (!spatialProfile) {
    return {};
  }
  return {
    graph: buildVisualRoadGraph(markers, spatialProfile.roadTiming.junctionSnapTolerance, {
      defaultY: spatialProfile.defaultY,
      defaultTravelMode: 'coach',
      verticalTolerance: spatialProfile.verticalTolerance,
      worldId: spatialProfile.worldId,
    }),
    roadTiming: spatialProfile.roadTiming,
  };
}

export type CoachRoadTimingResult =
  | {
      ok: true;
      stopTimes: TravelTripStopTime[];
      totalTravelMinutes: number;
      transitLineSourceId: string;
      transitRevisionId: string;
    }
  | {
      ok: false;
      reason: 'not_coach' | 'invalid_departure_time' | 'line_not_found' | 'road_time_incomplete';
      message: string;
    };

export function deriveCoachRoadStopTimes(input: {
  departureTime: string;
  lineName: string;
  serviceKind: TravelTripInstance['serviceKind'];
  stationNames: string[];
  stopTimes?: TravelTripStopTime[];
  timingContext?: CoachRoadTimingContext;
  transitRevisions: TransitDataRevision[];
}): CoachRoadTimingResult {
  if (input.serviceKind !== 'coach') {
    return { ok: false, reason: 'not_coach', message: '仅客运大巴班次支持道路用时排点。' };
  }
  const departureMinutes = toAbsoluteMinutes(input.departureTime, 0);
  if (departureMinutes === undefined) {
    return { ok: false, reason: 'invalid_departure_time', message: '请先填写有效的始发时间。' };
  }

  let matchedLine:
    | {
        line: TransitDataRevision['lines'][number];
        revision: TransitDataRevision;
        stationIds: string[];
      }
    | undefined;
  for (const revision of input.transitRevisions) {
    if (revision.status === 'archived' || revision.status === 'superseded') {
      continue;
    }
    const stationNameById = new Map(
      revision.stations.map((station) => [station.sourceId, station.name] as const),
    );
    const line = revision.lines.find((candidate) => {
      if (
        candidate.mode !== 'coach' ||
        (candidate.operationStatus ?? 'operating') === 'closed' ||
        normalizeName(candidate.name) !== normalizeName(input.lineName)
      ) {
        return false;
      }
      const lineStationNames = candidate.stationSourceIds.map(
        (stationSourceId) => stationNameById.get(stationSourceId) ?? '',
      );
      return (
        sameStationSequence(lineStationNames, input.stationNames) ||
        sameStationSequence([...lineStationNames].reverse(), input.stationNames)
      );
    });
    if (line) {
      const lineStationNames = line.stationSourceIds.map(
        (stationSourceId) => stationNameById.get(stationSourceId) ?? '',
      );
      matchedLine = {
        line,
        revision,
        stationIds: sameStationSequence(lineStationNames, input.stationNames)
          ? line.stationSourceIds
          : [...line.stationSourceIds].reverse(),
      };
      break;
    }
  }

  if (!matchedLine) {
    return {
      ok: false,
      reason: 'line_not_found',
      message: '没有找到线路名称和站序完全匹配的客运道路线路。',
    };
  }

  const segmentTravelMinutes: number[] = [];
  for (let index = 0; index < matchedLine.stationIds.length - 1; index += 1) {
    const fromStationSourceId = matchedLine.stationIds[index];
    const toStationSourceId = matchedLine.stationIds[index + 1];
    const segment = matchedLine.line.segmentPaths?.find(
      (path) =>
        ((path.fromStationSourceId === fromStationSourceId &&
          path.toStationSourceId === toStationSourceId) ||
          (path.fromStationSourceId === toStationSourceId &&
            path.toStationSourceId === fromStationSourceId)) &&
        path.mode === 'road' &&
        (path.operationStatus ?? 'operating') === 'operating',
    );
    const estimatedTravelMinutes = estimateRoadSegmentTravelMinutes({
      fromStationSourceId,
      revision: matchedLine.revision,
      segment,
      timingContext: input.timingContext,
      toStationSourceId,
    });
    const travelMinutes = segment?.travelMinutes ?? estimatedTravelMinutes;
    if (!travelMinutes) {
      return {
        ok: false,
        reason: 'road_time_incomplete',
        message: `道路线路 ${matchedLine.line.name} 仍有区间既未配置运行分钟数，也无法通过当前路网估算。`,
      };
    }
    segmentTravelMinutes.push(travelMinutes);
  }

  const existingByStation = new Map(
    (input.stopTimes ?? []).map((stopTime) => [normalizeName(stopTime.stationName), stopTime]),
  );
  let cursorMinutes = departureMinutes;
  const stopTimes = input.stationNames.map((stationName, index) => {
    const existing = existingByStation.get(normalizeName(stationName));
    if (index === 0) {
      const departure = formatAbsoluteMinutes(cursorMinutes);
      return {
        stationName,
        isStop: existing?.isStop ?? true,
        departureTime: departure.time,
        departureDayOffset: departure.dayOffset,
        dwellMinutes: existing?.dwellMinutes ?? 0,
      };
    }

    cursorMinutes += segmentTravelMinutes[index - 1] ?? 0;
    const arrival = formatAbsoluteMinutes(cursorMinutes);
    const isFinalStop = index === input.stationNames.length - 1;
    const isStop = existing?.isStop ?? true;
    const dwellMinutes = isFinalStop || !isStop ? 0 : (existing?.dwellMinutes ?? 0);
    const result: TravelTripStopTime = {
      stationName,
      isStop,
      arrivalTime: arrival.time,
      arrivalDayOffset: arrival.dayOffset,
      dwellMinutes,
    };
    if (!isFinalStop) {
      cursorMinutes += dwellMinutes;
      const departure = formatAbsoluteMinutes(cursorMinutes);
      result.departureTime = departure.time;
      result.departureDayOffset = departure.dayOffset;
    }
    return result;
  });

  return {
    ok: true,
    stopTimes,
    totalTravelMinutes: segmentTravelMinutes.reduce((total, minutes) => total + minutes, 0),
    transitLineSourceId: matchedLine.line.sourceId,
    transitRevisionId: matchedLine.revision.revisionId,
  };
}

function sameStationSequence(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((stationName, index) => normalizeName(stationName) === normalizeName(right[index] ?? ''))
  );
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase('zh-Hans-CN');
}

function estimateRoadSegmentTravelMinutes(input: {
  fromStationSourceId: string;
  revision: TransitDataRevision;
  segment: NonNullable<TransitDataRevision['lines'][number]['segmentPaths']>[number] | undefined;
  timingContext: CoachRoadTimingContext | undefined;
  toStationSourceId: string;
}): number | undefined {
  const graph = input.timingContext?.graph;
  const roadTiming = input.timingContext?.roadTiming;
  if (!graph || !roadTiming) {
    return undefined;
  }
  const stationById = new Map(
    input.revision.stations.map((station) => [station.sourceId, station] as const),
  );
  const fromStation = stationById.get(input.fromStationSourceId);
  const toStation = stationById.get(input.toStationSourceId);
  if (
    fromStation?.x === undefined ||
    fromStation.z === undefined ||
    toStation?.x === undefined ||
    toStation.z === undefined
  ) {
    return undefined;
  }
  const segmentIsForward =
    input.segment?.fromStationSourceId === input.fromStationSourceId &&
    input.segment.toStationSourceId === input.toStationSourceId;
  const waypoints = segmentIsForward
    ? (input.segment?.waypoints ?? [])
    : [...(input.segment?.waypoints ?? [])].reverse();
  const controlPoints: Array<[number, number]> = [
    [fromStation.x, fromStation.z],
    ...waypoints.map((point) => [point.x, point.z] as [number, number]),
    [toStation.x, toStation.z],
  ];
  const route = resolveVisualRoute(controlPoints, 'road', graph, 'coach');
  if (route.unresolvedSegmentCount > 0 || route.coordinates.length < 2) {
    return undefined;
  }
  const distance = route.coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = route.coordinates[index];
    return previous ? total + Math.hypot(coordinate[0] - previous[0], coordinate[1] - previous[1]) : total;
  }, 0);
  if (distance <= 0) {
    return undefined;
  }
  const junctionCoordinates = new Set(
    graph.nodes
      .filter((node) => (graph.adjacency.get(node.id)?.length ?? 0) > 2)
      .map((node) => roadCoordinateKey(node.coordinate)),
  );
  const junctionCount = new Set(
    route.coordinates
      .slice(1, -1)
      .map(roadCoordinateKey)
      .filter((key) => junctionCoordinates.has(key)),
  ).size;
  const speedBlocksPerMinute = Math.max(1, (roadTiming.defaultBusSpeedKmh * 1000) / 60);
  const movingMinutes = distance / speedBlocksPerMinute;
  const junctionMinutes = (junctionCount * roadTiming.busJunctionDelaySeconds) / 60;
  return Math.max(1, Math.round(movingMinutes + junctionMinutes));
}

function roadCoordinateKey(coordinate: [number, number]): string {
  return `${coordinate[0].toFixed(3)}:${coordinate[1].toFixed(3)}`;
}
