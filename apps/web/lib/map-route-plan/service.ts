import type { LocaleCode, MapMarkerSnapshot, TransitFareQuote } from '@yct/contracts';
import { readPublicMapMarkerSnapshot } from '../map-marker-public-snapshot-store';
import { readMapSpatialProfile } from '../map-spatial-profile-store';
import { getMapRoadMarkerKind } from '../map-road-geometry';
import { readTransitOverview } from '../transit-data';
import { buildMapPlaceRelationIndex } from '../map-place-relations';
import { createTranslator } from '../i18n-catalog';
import { buildMarkerRoadAccessIndex, buildRoadRouteGraph, buildRoutePlanOptions } from './engine';
import { buildSecondaryPoiIndex, buildSecondaryPoiParentIndex } from './place-index';
import { formatMarkerDisplayName, getMarkerCenter, resolveLocalizedLabel } from './helpers';
import type {
  CenterableMarker,
  EnabledRouteTransportModes,
  EndpointGroupMarker,
  LocalizedMapMarker,
  PointMarker,
  RegionGeometry,
  RoutePlanDraft,
  RoutePlanOption,
  RouteTransportMode,
  RouteTraversalBarrier,
  TransitLineStopForMap,
  TransitModeProfileForMap,
  TransitOverviewLine,
} from './types';

export interface MapRouteEndpointInput {
  markerId?: string;
  name?: string;
}

export interface MapRoutePlanRequest {
  origin: MapRouteEndpointInput;
  destination: MapRouteEndpointInput;
  modes?: RouteTransportMode[];
  locale?: LocaleCode;
  limit?: number;
}

export interface MapRoutePlanEndpoint {
  id?: string;
  label: string;
  coordinate: [number, number];
  categoryId?: string;
}

export interface MapRoutePlanStepSummary {
  kind: string;
  label: string;
  role?: string;
  details?: Array<{ icon: string; label: string; meta?: string }>;
}

export interface MapRoutePlanOptionSummary {
  id: string;
  title: string;
  summary: string;
  modes: RouteTransportMode[];
  estimatedMinutes: number;
  estimatedDistance: number;
  walkingDistance: number;
  transferCount: number;
  serviceLabels?: string[];
  fare?: TransitFareQuote;
  note: string;
  steps: MapRoutePlanStepSummary[];
  /** 打开地图并自动重建该方案的深链。 */
  mapUrl: string;
}

export interface MapRoutePlanResult {
  origin: MapRoutePlanEndpoint;
  destination: MapRoutePlanEndpoint;
  options: MapRoutePlanOptionSummary[];
  searchedMarkerCount: number;
  asOf?: string;
  sourceStatus: 'ready' | 'unavailable';
  /** 最佳方案对应的地图深链。 */
  mapUrl: string;
}

export class MapRoutePlanError extends Error {
  readonly candidates: MapRoutePlanEndpoint[];
  readonly kind: 'unavailable' | 'not_found' | 'ambiguous';

  constructor(
    message: string,
    candidates: MapRoutePlanEndpoint[] = [],
    kind: 'unavailable' | 'not_found' | 'ambiguous' = 'not_found',
  ) {
    super(message);
    this.name = 'MapRoutePlanError';
    this.candidates = candidates;
    this.kind = kind;
  }
}

const defaultRoutePlanModes: RouteTransportMode[] = ['walk', 'bus', 'metro', 'tram'];

/**
 * 服务端路线规划入口。
 * 数据读取、端点解析和结果裁剪都在这里完成，算法本身复用地图前端的共享引擎。
 */
export async function planMapRoute(input: MapRoutePlanRequest): Promise<MapRoutePlanResult> {
  const snapshotRecord = await readPublicMapMarkerSnapshot();
  if (!snapshotRecord) {
    throw new MapRoutePlanError(
      '地图地点快照暂不可用，无法规划路线。请等待后台刷新地图快照后重试。',
      [],
      'unavailable',
    );
  }

  const locale = input.locale ?? 'zh-CN';
  const markers = snapshotRecord.snapshot.markers.map((marker) => localizeMarker(marker, locale));
  const originMarker = resolveEndpoint(input.origin, markers);
  const destinationMarker = resolveEndpoint(input.destination, markers);
  const origin = describeEndpoint(originMarker);
  const destination = describeEndpoint(destinationMarker);

  const [spatialProfile, transitOverview] = await Promise.all([
    readMapSpatialProfile(),
    readTransitOverview().catch(() => undefined),
  ]);
  const pointMarkers = markers.filter(isPointMarker).filter(shouldRenderAsPointPoi);
  const shapeMarkers = markers.filter(isShapeMarker);
  const parentMarkers: CenterableMarker[] = [...pointMarkers, ...shapeMarkers];
  const placeRelationIndex = buildMapPlaceRelationIndex(markers);
  const secondaryPoiIndex = buildSecondaryPoiIndex(pointMarkers, parentMarkers, placeRelationIndex);
  const secondaryPoiParentIndex = buildSecondaryPoiParentIndex(
    pointMarkers,
    parentMarkers,
    placeRelationIndex,
  );
  const roadMarkers = markers.filter(isEndpointGroupMarker).filter(isRoutableNetworkMarker);
  const graph = buildRoadRouteGraph(
    roadMarkers,
    spatialProfile.roadTiming.junctionSnapTolerance,
    spatialProfile.defaultY,
    spatialProfile.verticalTolerance,
    spatialProfile.worldId,
  );
  const markerRoadAccessIndex = graph ? buildMarkerRoadAccessIndex(pointMarkers, graph) : new Map();
  const traversalBarriers = buildTraversalBarriers(markers);
  const transitLines = buildTransitLines(transitOverview, locale);
  const enabledModes = buildEnabledModes(input.modes);

  const draft: RoutePlanDraft = {
    originId: originMarker.id,
    destinationId: destinationMarker.id,
    originLabel: origin.label,
    destinationLabel: destination.label,
    origin: origin.coordinate,
    destination: destination.coordinate,
  };

  const plannedOptions = buildRoutePlanOptions({
    defaultDrivingSpeedKmh: spatialProfile.defaultDrivingSpeedKmh,
    draft,
    enabledModes,
    markerRoadAccessIndex,
    pointMarkers,
    roadGraph: graph,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
    t: createTranslator(locale),
    transitLines,
    modeProfiles: buildModeProfiles(transitOverview?.modeProfiles),
    roadTiming: spatialProfile.roadTiming,
    taxiFare: spatialProfile.taxiFare,
    transitFare: spatialProfile.transitFare,
    traversalBarriers,
  });

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 10);
  const selectedModes = listEnabledModes(enabledModes);
  const options = plannedOptions.slice(0, limit).map((option) => ({
    ...summarizeOption(option),
    mapUrl: buildMapRouteUrl(origin, destination, selectedModes, option.id),
  }));
  return {
    origin,
    destination,
    options,
    searchedMarkerCount: markers.length,
    asOf: snapshotRecord.snapshot.fetchedAt,
    sourceStatus: 'ready',
    mapUrl: options[0]?.mapUrl ?? buildMapRouteUrl(origin, destination, selectedModes),
  };
}

/** 把结构化结果压成适合模型直接回答的文本。 */
export function formatMapRoutePlanSummary(result: MapRoutePlanResult): string {
  const header = `${result.origin.label} → ${result.destination.label}`;
  if (result.options.length === 0) {
    return `${header}：当前道路与班次数据下没有找到可行方案。`;
  }

  const lines = [`${header}，共 ${result.options.length} 个方案：`];
  result.options.forEach((option, index) => {
    lines.push(
      `${index + 1}. ${option.title}：${option.summary}，约 ${option.estimatedMinutes} 分钟，换乘 ${option.transferCount} 次${formatFareText(option.fare)}。`,
    );
    if (option.steps.length > 0) {
      lines.push(`   步骤：${option.steps.map((step) => step.label).join(' → ')}`);
    }
  });
  return lines.join('\n');
}

function summarizeOption(option: RoutePlanOption): Omit<MapRoutePlanOptionSummary, 'mapUrl'> {
  return {
    id: option.id,
    title: option.title,
    summary: option.summary,
    modes: option.modes,
    estimatedMinutes: option.estimatedMinutes,
    estimatedDistance: option.estimatedDistance,
    walkingDistance: option.walkingDistance,
    transferCount: option.transferCount,
    serviceLabels: option.serviceLabels,
    fare: option.fare,
    note: option.note,
    steps: option.steps.slice(0, 30).map((step) => ({
      kind: step.kind,
      label: step.label,
      role: step.role,
      details: step.details?.slice(0, 20).map((detail) => ({
        icon: detail.icon,
        label: detail.label,
        meta: detail.meta,
      })),
    })),
  };
}

function formatFareText(fare: TransitFareQuote | undefined): string {
  if (!fare) {
    return '';
  }
  const amount = fare.totalAmount ?? fare.knownSubtotal;
  if (amount === undefined) {
    return '';
  }
  const prefix = fare.status === 'exact' ? '¥' : '约¥';
  return `，${prefix}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

function localizeMarker(
  marker: MapMarkerSnapshot['markers'][number],
  locale: LocaleCode,
): LocalizedMapMarker {
  return {
    ...marker,
    label: resolveLocalizedLabel(marker.label, marker.localizedLabels, locale),
    sourceLabel: marker.label,
  };
}

function resolveEndpoint(
  input: MapRouteEndpointInput,
  markers: LocalizedMapMarker[],
): LocalizedMapMarker {
  const markerId = input.markerId?.trim();
  if (markerId) {
    const matched = markers.find((marker) => marker.id === markerId);
    if (!matched) {
      throw new MapRoutePlanError(`地图中没有找到 ID 为“${markerId}”的地点。`);
    }
    return matched;
  }

  const query = input.name?.trim();
  if (!query) {
    throw new MapRoutePlanError('起点和终点需要提供地点名称或地点 ID。');
  }

  const normalizedQuery = normalizeSearchText(query);
  const scored = markers
    .filter((marker) => marker.categoryId !== 'player')
    .flatMap((marker) => {
      const score = scoreMarker(marker, normalizedQuery);
      return score > 0 ? [{ marker, score }] : [];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.marker.label.length - right.marker.label.length ||
        left.marker.id.localeCompare(right.marker.id),
    );

  if (scored.length === 0) {
    throw new MapRoutePlanError(`地图中没有找到与“${query}”匹配的地点。`);
  }

  const bestScore = scored[0]!.score;
  const bestMatches = scored.filter((entry) => entry.score === bestScore);
  const first = bestMatches[0]!.marker;
  const firstCenter = getMarkerCenter(first);
  const sameLocality = bestMatches.every((entry) => {
    const center = getMarkerCenter(entry.marker);
    return Boolean(
      firstCenter &&
      center &&
      Math.hypot(center[0] - firstCenter[0], center[1] - firstCenter[1]) <= 300,
    );
  });
  if (bestMatches.length > 1 && !sameLocality) {
    const candidates = bestMatches.slice(0, 5).map((entry) => describeEndpoint(entry.marker));
    throw new MapRoutePlanError(
      `“${query}”匹配到多个地点，请改用更完整的名称或地点 ID。`,
      candidates,
      'ambiguous',
    );
  }

  return first;
}

/**
 * 同名地点在雨城通里很常见（例如火车站、地铁站和公交站共用一个名字）。
 * 精确名称优先，其次按地点类别排序，让“临东站”优先落到火车站而不是公交站。
 */
function getCategoryRank(categoryId: string | undefined): number {
  switch (categoryId) {
    case 'railway-station':
    case 'airport':
      return 6;
    case 'metro-station':
    case 'coach-station':
    case 'ferry-port':
    case 'tram-station':
      return 5;
    case 'park':
    case 'scenery':
    case 'museum':
    case 'commerce':
    case 'dining':
    case 'medical':
    case 'education':
    case 'sports':
    case 'residence':
    case 'industry':
    case 'public-service':
    case 'facility':
    case 'parking':
      return 3;
    case 'bus-stop':
      return 2;
    case 'metro-entrance':
    case 'ordinary-entrance':
      return 1;
    default:
      return 0;
  }
}

function scoreMarker(marker: LocalizedMapMarker, normalizedQuery: string): number {
  const names = [
    marker.label,
    marker.sourceLabel,
    ...Object.values(marker.localizedLabels ?? {}),
  ].map(normalizeSearchText);
  const categoryRank = getCategoryRank(marker.categoryId);
  if (names.some((name) => name === normalizedQuery)) {
    return 100 + categoryRank;
  }
  if (names.some((name) => name.includes(normalizedQuery))) {
    return 60 + categoryRank;
  }
  if (names.some((name) => normalizedQuery.includes(name) && name.length >= 2)) {
    return 40 + categoryRank;
  }
  return 0;
}

function describeEndpoint(marker: LocalizedMapMarker): MapRoutePlanEndpoint {
  const coordinate = getMarkerCenter(marker);
  if (!coordinate) {
    throw new MapRoutePlanError(`地点“${marker.label}”缺少可用坐标，无法参与路线规划。`);
  }
  return {
    id: marker.id,
    label: formatMarkerDisplayName(marker.label),
    coordinate,
    categoryId: marker.categoryId,
  };
}

function isPointMarker(marker: MapMarkerSnapshot['markers'][number]): marker is PointMarker {
  return 'sourceLabel' in marker && marker.geometry.type === 'Point';
}

function shouldRenderAsPointPoi(marker: PointMarker): boolean {
  return marker.categoryId !== 'road' || Boolean(marker.spatial?.hideMarkerIcon);
}

function isEndpointGroupMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is EndpointGroupMarker {
  return (
    'sourceLabel' in marker &&
    marker.categoryId !== 'transit-line' &&
    (marker.geometry.type === 'MultiPoint' ||
      (marker.geometry.type === 'LineString' &&
        (getMapRoadMarkerKind(marker) !== undefined || Boolean(marker.spatial?.networkKind))))
  );
}

function isRoutableNetworkMarker(marker: EndpointGroupMarker): boolean {
  return getMapRoadMarkerKind(marker) !== undefined || Boolean(marker.spatial?.networkKind);
}

function isShapeMarker(marker: MapMarkerSnapshot['markers'][number]): marker is CenterableMarker {
  return (
    'sourceLabel' in marker &&
    marker.geometry.type !== 'Point' &&
    marker.geometry.type !== 'MultiPoint' &&
    !isEndpointGroupMarker(marker)
  );
}

function buildTraversalBarriers(markers: LocalizedMapMarker[]): RouteTraversalBarrier[] {
  return markers.flatMap((marker): RouteTraversalBarrier[] => {
    if (!isRegionGeometry(marker.geometry)) {
      return [];
    }
    const explicitBarrier = marker.spatial?.traversalBarrier;
    const waterCategory = marker.categoryId?.trim().toLowerCase() === 'water';
    if (!waterCategory && explicitBarrier?.kind !== 'blocked_area') {
      return [];
    }
    return [
      {
        blockedModes: explicitBarrier?.blockedModes?.length
          ? explicitBarrier.blockedModes
          : ['walk', 'taxi', 'bus', 'coach'],
        geometry: marker.geometry,
        id: marker.id,
      },
    ];
  });
}

function isRegionGeometry(
  geometry: MapMarkerSnapshot['markers'][number]['geometry'],
): geometry is RegionGeometry {
  return (
    geometry.type === 'Rectangle' ||
    geometry.type === 'MultiRectangle' ||
    geometry.type === 'Polygon' ||
    geometry.type === 'MultiPolygon'
  );
}

function buildTransitLines(
  overview: Awaited<ReturnType<typeof readTransitOverview>> | undefined,
  locale: LocaleCode,
): TransitOverviewLine[] {
  if (!overview) {
    return [];
  }
  return overview.lines.map((line) => {
    const stationNameMap = new Map(
      (line.stationStops ?? []).map((stop) => [
        stop.stationName,
        resolveLocalizedLabel(stop.stationName, stop.localizedStationName, locale),
      ]),
    );
    const stationStops: TransitLineStopForMap[] | undefined = line.stationStops?.map((stop) => ({
      ...stop,
      displayStationName: resolveLocalizedLabel(
        stop.stationName,
        stop.localizedStationName,
        locale,
      ),
    }));
    return {
      ...line,
      name: resolveLocalizedLabel(line.name, line.localizedName, locale),
      displayStationNames: line.stationNames.map((name) => stationNameMap.get(name) ?? name),
      stationStops,
      displayFirstStationName: line.firstStationName
        ? (stationNameMap.get(line.firstStationName) ?? line.firstStationName)
        : undefined,
      displayLastStationName: line.lastStationName
        ? (stationNameMap.get(line.lastStationName) ?? line.lastStationName)
        : undefined,
    };
  });
}

function buildModeProfiles(
  profiles:
    | Array<{
        mode: string;
        label: string;
        color: string;
        icon: string;
        sortOrder: number;
        showPlannedSegments?: boolean;
      }>
    | undefined,
): TransitModeProfileForMap[] {
  return (profiles ?? []).map((profile) => ({
    mode: profile.mode,
    label: profile.label,
    color: profile.color,
    icon: profile.icon,
    sortOrder: profile.sortOrder,
    showPlannedSegments: profile.showPlannedSegments,
  }));
}

function buildEnabledModes(modes: RouteTransportMode[] | undefined): EnabledRouteTransportModes {
  const selected = new Set(modes && modes.length > 0 ? modes : defaultRoutePlanModes);
  return {
    walk: selected.has('walk'),
    taxi: selected.has('taxi'),
    bus: selected.has('bus'),
    metro: selected.has('metro'),
    tram: selected.has('tram'),
    coach: selected.has('coach'),
    ferry: selected.has('ferry'),
    railway: selected.has('railway'),
  };
}

function listEnabledModes(enabledModes: EnabledRouteTransportModes): RouteTransportMode[] {
  return (Object.keys(enabledModes) as RouteTransportMode[]).filter((mode) => enabledModes[mode]);
}

/** 复用地图已经支持的 r=1 分享参数，生成可直接打开并自动重建方案的深链。 */
function buildMapRouteUrl(
  origin: MapRoutePlanEndpoint,
  destination: MapRoutePlanEndpoint,
  modes: RouteTransportMode[],
  optionId?: string,
): string {
  const params = new URLSearchParams({
    r: '1',
    o: formatCoordinateForUrl(origin.coordinate),
    d: formatCoordinateForUrl(destination.coordinate),
    ol: origin.label,
    dl: destination.label,
    tm: modes.join(','),
  });
  if (origin.id) {
    params.set('oi', origin.id);
  }
  if (destination.id) {
    params.set('di', destination.id);
  }
  if (optionId) {
    params.set('op', optionId);
  }
  return `/map?${params.toString()}`;
}

function formatCoordinateForUrl([x, z]: [number, number]): string {
  return `${Number.isInteger(x) ? x : x.toFixed(2)},${Number.isInteger(z) ? z : z.toFixed(2)}`;
}

function normalizeSearchText(value: string): string {
  return value.replace(/[|｜\s\u3000]+/g, '').toLowerCase();
}
