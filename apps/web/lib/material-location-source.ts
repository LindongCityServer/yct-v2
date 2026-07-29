import { UnminedCustomMarkerProvider } from '@yct/adapters';
import type { MapGeometry, MapMarkerSnapshot, MaterialTemplateField } from '@yct/contracts';
import {
  getMapRoadMarkerKind,
  orderMapRoadCoordinates,
  projectPointOntoMapRoad,
  shouldUseVerticalMapRoadLabel,
} from './map-road-geometry';
import { toUppercaseRoadPinyin } from './chinese-pinyin';
import { applyLegacyMapMarkerOverrides } from './legacy-map-marker-override-store';
import { listPublishedPublicPoiSubmissions } from './poi-submission-store';
import { readRuntimeConfig } from './runtime-config';
import { createTimedCache } from './server-cache';

export interface MaterialLocationOption {
  id: string;
  label: string;
  categoryId: string;
  address?: string;
  coordinate?: [number, number];
}

interface MaterialLocationEntry extends MaterialLocationOption {
  geometry: MapGeometry;
  addressRoadMarkerId?: string;
  iconFileName?: string;
  description?: string;
}

interface MatchedRoad {
  entry: MaterialLocationEntry;
  coordinates: Array<[number, number]>;
  projection: NonNullable<ReturnType<typeof projectPointOntoMapRoad>>;
}

const endpointCircleDistance = 80;
const materialLocationCache = createTimedCache<MaterialLocationEntry[]>(60 * 1000);

export async function listMaterialLocations(): Promise<MaterialLocationOption[]> {
  const locations = await readMaterialLocations();
  return locations.map(({ id, label, categoryId, address, geometry }) => ({
    id,
    label,
    categoryId,
    address,
    coordinate: getRepresentativeCoordinate(geometry),
  }));
}

export async function resolveMaterialLocationInput(input: {
  locationId: string;
  fields: MaterialTemplateField[];
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const locations = await readMaterialLocations();
  const location = locations.find((item) => item.id === input.locationId);
  if (!location) {
    throw new Error('所选服务器地点不存在或已下线。');
  }

  const address = resolveAddressInformation(location, locations);
  const candidates: Record<string, string> = {
    roadName: address.roadName,
    roadNamePinyin: toUppercaseRoadPinyin(address.roadName),
    postalCode: '120000',
    buildingNumber: address.buildingNumber,
    buildingSuffix: address.buildingSuffix,
    roadNameEn: toUppercaseRoadPinyin(address.roadName),
    direction: '',
    lineName: location.label,
    stationName: location.label,
    destinationName: location.description ?? location.address ?? '',
    operator: '',
  };
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: `map_location:${location.id}`,
  };
}

export async function resolveRoadCoordinateMaterialInput(input: {
  coordinate: [number, number];
  fields: MaterialTemplateField[];
}): Promise<{ values: Record<string, string>; sourceRef: string }> {
  const road = findNearestRoad(input.coordinate, await readMaterialLocations());
  if (!road) {
    throw new Error('当前服务器数据中没有可用于匹配的道路几何。');
  }
  const vertical = shouldUseVerticalMapRoadLabel(road.coordinates, road.projection.coordinate);
  const directionMode = deriveRoadDirectionMode(road.projection, vertical);
  const arrowMode = deriveRoadArrowMode(road.coordinates, road.projection.coordinate);
  const candidates: Record<string, string> = {
    roadName: road.entry.label,
    roadNamePinyin: toUppercaseRoadPinyin(road.entry.label),
    signColor: vertical ? '#1E892C' : '#004796',
    directionMode,
    arrowMode,
  };
  return {
    values: mapTemplateFields(input.fields, candidates),
    sourceRef: [
      `road_coordinate:${road.entry.id}`,
      `source=${formatCoordinate(input.coordinate)}`,
      `install=${formatCoordinate(road.projection.coordinate)}`,
    ].join(';'),
  };
}

async function readMaterialLocations(): Promise<MaterialLocationEntry[]> {
  const config = readRuntimeConfig();
  const cacheKey = [config.unminedMapBaseUrl, config.markerBdslmTimeoutMs].join('|');
  return materialLocationCache.read(cacheKey, async () => {
    const [staticMarkers, publishedPois] = await Promise.all([
      readStaticLocationMarkers().catch(() => []),
      listPublishedPublicPoiSubmissions(),
    ]);
    const staticEntries: MaterialLocationEntry[] = staticMarkers.map((marker) => ({
      id: `marker:${marker.id}`,
      label: marker.label,
      categoryId: marker.categoryId ?? 'map-marker',
      address: marker.address,
      addressRoadMarkerId: marker.addressRoadMarkerId,
      geometry: marker.geometry,
      iconFileName: marker.iconFileName,
      description: marker.description,
    }));
    const entries = [
      ...staticEntries,
      ...createRoadEndpointEntries(staticEntries),
      ...publishedPois.map((poi) => ({
        id: `poi:${poi.id}`,
        label: poi.title,
        categoryId: poi.categoryId,
        address: poi.address,
        addressRoadMarkerId: poi.addressRoadMarkerId,
        geometry: poi.geometry,
        iconFileName: poi.iconFileName,
        description: poi.description,
      })),
    ]
      .filter((entry) => Boolean(entry.label.trim()))
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id),
      );
    return entries;
  });
}

async function readStaticLocationMarkers(): Promise<MapMarkerSnapshot['markers']> {
  const config = readRuntimeConfig();
  const provider = new UnminedCustomMarkerProvider({
    id: 'material-location-markers',
    name: '物料地点来源',
    baseUrl: config.unminedMapBaseUrl,
    fetchTimeoutMs: config.markerBdslmTimeoutMs,
  });
  const snapshot = await provider.fetchMarkers('default');
  return (await applyLegacyMapMarkerOverrides(snapshot)).markers.filter(
    (marker) => marker.categoryId !== 'player',
  );
}

function createRoadEndpointEntries(
  entries: MaterialLocationEntry[],
): MaterialLocationEntry[] {
  const groups = new Map<string, Array<[number, number]>>();
  for (const entry of entries) {
    if (
      entry.geometry.type !== 'Point' ||
      !getMapRoadMarkerKind(entry) ||
      !entry.label.trim()
    ) {
      continue;
    }
    const coordinates = groups.get(entry.label) ?? [];
    coordinates.push(entry.geometry.coordinates);
    groups.set(entry.label, coordinates);
  }
  const roads: MaterialLocationEntry[] = [];
  for (const [label, coordinates] of groups) {
    const orderedCoordinates = orderMapRoadCoordinates(coordinates);
    if (orderedCoordinates.length < 2) {
      continue;
    }
    roads.push({
      id: `road-endpoints:${encodeURIComponent(label)}`,
      label,
      categoryId: 'road',
      geometry: { type: 'MultiPoint', coordinates: orderedCoordinates },
    });
  }
  return roads;
}

function findNearestRoad(
  coordinate: [number, number],
  entries: MaterialLocationEntry[],
): MatchedRoad | undefined {
  let nearest: MatchedRoad | undefined;
  for (const entry of entries) {
    const coordinates = getRoadCoordinates(entry);
    if (!coordinates) {
      continue;
    }
    const projection = projectPointOntoMapRoad(coordinate, coordinates);
    if (!projection || (nearest && projection.distance >= nearest.projection.distance)) {
      continue;
    }
    nearest = { entry, coordinates, projection };
  }
  return nearest;
}

function getRoadCoordinates(entry: MaterialLocationEntry): Array<[number, number]> | undefined {
  if (
    !getMapRoadMarkerKind(entry) ||
    (entry.geometry.type !== 'LineString' && entry.geometry.type !== 'MultiPoint')
  ) {
    return undefined;
  }
  const coordinates = orderMapRoadCoordinates(entry.geometry.coordinates);
  return coordinates.length >= 2 ? coordinates : undefined;
}

function resolveAddressInformation(
  location: MaterialLocationEntry,
  entries: MaterialLocationEntry[],
): { roadName: string; buildingNumber: string; buildingSuffix: string } {
  const linkedRoad = location.addressRoadMarkerId
    ? entries.find(
        (entry) =>
          entry.id === `marker:${location.addressRoadMarkerId}` ||
          entry.id === `poi:${location.addressRoadMarkerId}`,
      )
    : undefined;
  const parsed = parseAddress(location.address ?? '');
  const roadName = linkedRoad?.label ?? parsed.roadName;
  if (!roadName) {
    throw new Error('所选地点的地址中缺少可识别的道路名称。');
  }
  if (!parsed.buildingNumber) {
    throw new Error('所选地点的地址中缺少门牌号。');
  }
  return { roadName, buildingNumber: parsed.buildingNumber, buildingSuffix: parsed.buildingSuffix };
}

function parseAddress(value: string): {
  roadName: string;
  buildingNumber: string;
  buildingSuffix: string;
} {
  const normalized = value.replace(/[\s\u3000]+/g, '').trim();
  const numberMatch = normalized.match(/(\d+)((?:-\d+)|[甲乙丙丁戊己庚辛壬癸A-Za-z])?号?$/u);
  if (!numberMatch || numberMatch.index === undefined) {
    return { roadName: extractRoadName(normalized), buildingNumber: '', buildingSuffix: '' };
  }
  return {
    roadName: extractRoadName(normalized.slice(0, numberMatch.index)),
    buildingNumber: numberMatch[1] ?? '',
    buildingSuffix: numberMatch[2] ?? '',
  };
}

function extractRoadName(value: string): string {
  const matches = value.match(/[\u3400-\u9fffA-Za-z0-9]+(?:环城高速公路|高速公路|快速路|高架路|立交桥|环路|大道|大街|北路|南路|东路|西路|胡同|隧道|街|路|巷|弄|道)/gu);
  return matches?.at(-1) ?? '';
}

function deriveRoadDirectionMode(
  projection: MatchedRoad['projection'],
  vertical: boolean,
): 'west_east' | 'east_west' | 'south_north' | 'north_south' {
  const deltaX = projection.segmentEnd[0] - projection.segmentStart[0];
  const deltaZ = projection.segmentEnd[1] - projection.segmentStart[1];
  if (vertical) {
    return deltaZ >= 0 ? 'north_south' : 'south_north';
  }
  return deltaX >= 0 ? 'west_east' : 'east_west';
}

function deriveRoadArrowMode(
  coordinates: Array<[number, number]>,
  installation: [number, number],
): 'dual_arrow' | 'left_circle_right_arrow' | 'left_arrow_right_circle' {
  const start = coordinates[0];
  const end = coordinates.at(-1);
  if (!start || !end) {
    return 'dual_arrow';
  }
  const startDistance = coordinateDistance(installation, start);
  const endDistance = coordinateDistance(installation, end);
  if (startDistance <= endpointCircleDistance && startDistance <= endDistance) {
    return 'left_circle_right_arrow';
  }
  if (endDistance <= endpointCircleDistance) {
    return 'left_arrow_right_circle';
  }
  return 'dual_arrow';
}

function mapTemplateFields(
  fields: MaterialTemplateField[],
  candidates: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, candidates[field.key] ?? '']));
}

function getRepresentativeCoordinate(geometry: MapGeometry): [number, number] | undefined {
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
    return geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
  }
  if (geometry.type === 'Rectangle') {
    return [(geometry.bounds.minX + geometry.bounds.maxX) / 2, (geometry.bounds.minZ + geometry.bounds.maxZ) / 2];
  }
  if (geometry.type === 'MultiRectangle') {
    const bounds = geometry.rectangles[0];
    return bounds ? [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2] : undefined;
  }
  const coordinates = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  return coordinates?.[0];
}

function coordinateDistance(left: [number, number], right: [number, number]): number {
  return Math.sqrt((left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2);
}

function formatCoordinate([x, z]: [number, number]): string {
  return `${Math.round(x * 100) / 100},${Math.round(z * 100) / 100}`;
}
