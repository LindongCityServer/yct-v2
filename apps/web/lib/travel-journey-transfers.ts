import type {
  MapMarkerSnapshot,
  MapSpatialProfile,
  MapTravelMode,
  TravelJourneyTransferOption,
} from '@yct/contracts';
import { readPublicMapMarkerSnapshot } from './map-marker-public-snapshot-store';
import { readMapSpatialProfile } from './map-spatial-profile-store';
import { readPublishedTransitEntitySnapshot } from './published-transit-read-model';
import { buildVisualRoadGraph, resolveVisualRoute } from './transit-line-visual-routing';

const stationTransferBufferMinutes = 5;
const walkSpeedBlocksPerMinute = 80;
const maximumTransferStationCount = 80;

interface StationLocation {
  coordinate: [number, number];
  name: string;
}

/**
 * 把地图路由能力适配成班次规划器可消费的换乘边。
 * 班次规划器不关心地图如何找路，只使用这里返回的方式、距离和用时。
 */
export async function readTravelJourneyTransferOptions(
  stationNames: string[],
): Promise<TravelJourneyTransferOption[]> {
  const names = uniqueStationNames(stationNames).slice(0, maximumTransferStationCount);
  if (names.length < 2) {
    return [];
  }

  const [mapSnapshot, spatialProfile, publishedTransit] = await Promise.all([
    readPublicMapMarkerSnapshot(),
    readMapSpatialProfile(),
    readPublishedTransitEntitySnapshot(),
  ]);
  const locations = buildStationLocations(names, mapSnapshot?.snapshot, publishedTransit);
  if (locations.size < 2) {
    return [];
  }

  const graph = mapSnapshot?.snapshot
    ? buildVisualRoadGraph(mapSnapshot.snapshot.markers, spatialProfile.roadTiming.junctionSnapTolerance, {
        defaultY: spatialProfile.defaultY,
        defaultTravelMode: 'walk',
        verticalTolerance: spatialProfile.verticalTolerance,
        worldId: spatialProfile.worldId,
      })
    : undefined;
  if (!graph) {
    return [];
  }

  const options: TravelJourneyTransferOption[] = [];
  for (const from of locations.values()) {
    for (const to of locations.values()) {
      if (normalizeStationName(from.name) === normalizeStationName(to.name)) {
        continue;
      }
      const walk = buildMapTransferOption({
        from,
        graph,
        mode: 'walk',
        spatialProfile,
        to,
      });
      const taxi = buildMapTransferOption({
        from,
        graph,
        mode: 'taxi',
        spatialProfile,
        to,
      });
      if (walk) options.push(walk);
      if (taxi && (!walk || taxi.totalMinutes < walk.totalMinutes * 2)) options.push(taxi);
    }
  }
  return options;
}

function buildMapTransferOption(input: {
  from: StationLocation;
  graph: NonNullable<ReturnType<typeof buildVisualRoadGraph>>;
  mode: Extract<MapTravelMode, 'walk' | 'taxi'>;
  spatialProfile: MapSpatialProfile;
  to: StationLocation;
}): TravelJourneyTransferOption | undefined {
  const route = resolveVisualRoute(
    [input.from.coordinate, input.to.coordinate],
    'road',
    input.graph,
    input.mode,
  );
  if (route.unresolvedSegmentCount > 0 || route.coordinates.length < 2) {
    return undefined;
  }
  const routeDistanceBlocks = route.coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = route.coordinates[index];
    return previous
      ? total + Math.hypot(coordinate[0] - previous[0], coordinate[1] - previous[1])
      : total;
  }, 0);
  if (routeDistanceBlocks <= 0) {
    return undefined;
  }

  const movingMinutes =
    input.mode === 'walk'
      ? routeDistanceBlocks / walkSpeedBlocksPerMinute
      : routeDistanceBlocks /
        Math.max(1, (input.spatialProfile.defaultDrivingSpeedKmh * 1000) / 60);
  const junctionCount = countJunctions(route.coordinates, input.graph);
  const junctionDelayMinutes =
    input.mode === 'taxi'
      ? (junctionCount * input.spatialProfile.roadTiming.taxiJunctionDelaySeconds) / 60
      : 0;
  const bufferMinutes = stationTransferBufferMinutes;
  const totalMinutes = Math.max(1, Math.ceil(movingMinutes + junctionDelayMinutes + bufferMinutes));
  return {
    fromStationName: input.from.name,
    toStationName: input.to.name,
    mode: input.mode,
    modeLabel: input.mode === 'walk' ? '步行换乘' : '出租车换乘',
    routeDistanceBlocks: Math.round(routeDistanceBlocks),
    bufferMinutes,
    totalMinutes,
  };
}

function buildStationLocations(
  names: string[],
  mapSnapshot: MapMarkerSnapshot | undefined,
  publishedTransit:
    | Awaited<ReturnType<typeof readPublishedTransitEntitySnapshot>>
    | undefined,
): Map<string, StationLocation> {
  const coordinatesByName = new Map<string, StationLocation>();
  for (const station of publishedTransit?.stations ?? []) {
    if (station.x === undefined || station.z === undefined) continue;
    const location = {
      name: station.name,
      coordinate: [station.x, station.z],
    } satisfies StationLocation;
    coordinatesByName.set(normalizeStationName(station.name), location);
    for (const alias of station.aliases ?? []) {
      const normalizedAlias = normalizeStationName(alias);
      if (normalizedAlias && !coordinatesByName.has(normalizedAlias)) {
        coordinatesByName.set(normalizedAlias, location);
      }
    }
  }
  for (const marker of mapSnapshot?.markers ?? []) {
    if (marker.geometry.type !== 'Point') continue;
    const markerName = marker.label?.trim();
    if (!markerName) continue;
    const key = normalizeStationName(markerName);
    if (!coordinatesByName.has(key)) {
      coordinatesByName.set(key, {
        name: markerName,
        coordinate: marker.geometry.coordinates,
      });
    }
  }

  const result = new Map<string, StationLocation>();
  for (const name of names) {
    const normalized = normalizeStationName(name);
    const location = coordinatesByName.get(normalized);
    // 当前地图数据源就是临东主世界；能在该地图解析到坐标的站点视为同城站点。
    if (!location) continue;
    result.set(normalized, { ...location, name });
  }
  return result;
}

function countJunctions(
  coordinates: Array<[number, number]>,
  graph: NonNullable<ReturnType<typeof buildVisualRoadGraph>>,
): number {
  const junctions = new Set(
    graph.nodes
      .filter((node) => (graph.adjacency.get(node.id)?.length ?? 0) > 2)
      .map((node) => roadCoordinateKey(node.coordinate)),
  );
  return new Set(
    coordinates.slice(1, -1).map(roadCoordinateKey).filter((key) => junctions.has(key)),
  ).size;
}

function uniqueStationNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const normalized = normalizeStationName(name);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [name.trim()];
  });
}

function normalizeStationName(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase('zh-Hans-CN');
}

function roadCoordinateKey(coordinate: [number, number]): string {
  return `${coordinate[0].toFixed(3)}:${coordinate[1].toFixed(3)}`;
}
