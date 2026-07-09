'use client';

import type {
  ApiListResponse,
  ApiMeta,
  LocaleCode,
  MapMarkerSnapshot,
  PoiCategory,
  TileProviderDescriptor,
} from '@yct/contracts';
import { useSearchParams } from 'next/navigation';
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFontEmbedCSS, toBlob } from 'html-to-image';
import LZString from 'lz-string';
import { appPath } from '../lib/app-paths';
import { readMapFavoriteMarkerIds, writeMapFavoriteMarkerIds } from '../lib/client-map-favorites';
import {
  readSelectedMapTileProviderId,
  writeSelectedMapTileProviderId,
} from '../lib/client-map-settings';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';

interface MarkerResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl?: string;
}

interface MapView {
  centerX: number;
  centerZ: number;
  zoom: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  centerX: number;
  centerZ: number;
}

interface ActivePointer {
  x: number;
  y: number;
}

interface GesturePoint extends ActivePointer {
  id: number;
}

interface PinchState {
  pointerIds: [number, number];
  startDistance: number;
  startZoom: number;
  anchorWorld: {
    x: number;
    z: number;
  };
}

interface TapState {
  pointerId: number;
  startX: number;
  startY: number;
}

interface VisibleTile {
  id: string;
  url: string;
  left: number;
  top: number;
  displaySize: number;
}

interface TileLayer {
  zoom: number;
  tiles: VisibleTile[];
}

interface UnminedMapPropertiesSnapshot {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  imageFormat: string;
  minRegionX: number;
  minRegionZ: number;
  maxRegionX: number;
  maxRegionZ: number;
  centerX: number;
  centerZ: number;
}

interface UnminedRegionGroupSnapshot {
  x: number;
  z: number;
  m: number[];
}

interface UnminedRegionResponse {
  meta: ApiMeta;
  properties: UnminedMapPropertiesSnapshot | null;
  regions: UnminedRegionGroupSnapshot[];
}

interface UnminedRegionIndex {
  properties: UnminedMapPropertiesSnapshot;
  groups: Map<string, UnminedRegionGroupSnapshot>;
}

interface ProjectedMarker {
  id: string;
  label: string;
  categoryId?: string;
  x: number;
  z: number;
  left: number;
  top: number;
  iconUrl?: string;
  symbolIcon?: string;
  showLabel: boolean;
  priority: number;
  roadKind?: RoadMarkerKind;
}

interface ProjectedLinearPoi {
  id: string;
  label: string;
  left: number;
  top: number;
  endpointCount: number;
  accentColor?: string;
  iconUrl?: string;
  roadKind?: RoadMarkerKind;
  showCenter: boolean;
  showTextLabel: boolean;
  isVerticalLabel: boolean;
  symbolIcon?: string;
  endpoints: Array<{
    id: string;
    left: number;
    top: number;
  }>;
}

interface ProjectedGuideMarker {
  id: string;
  label: string;
  left: number;
  top: number;
  kind: 'default-anchor' | 'route-origin' | 'route-destination' | 'shared-coordinate';
}

interface ProjectedRoadTrace {
  id: string;
  label: string;
  labels?: ProjectedRouteRoadLabel[];
  path: string;
  segments?: ProjectedRouteTraceSegment[];
  viewBox: string;
  accentColor?: string;
  pointCount: number;
  pathLength: number;
  bounds: TraceBounds;
  left: number;
  top: number;
  width: number;
  height: number;
  roadKind?: RoadMarkerKind;
  isSelected: boolean;
  isMuted?: boolean;
}

interface ProjectedRouteTraceSegment {
  color: string;
  path: string;
}

interface ProjectedRouteRoadLabel {
  color?: string;
  id: string;
  label: string;
  left: number;
  top: number;
}

interface TraceBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

interface TransitOverviewResponse {
  lines: TransitOverviewLine[];
  modeProfiles?: TransitModeProfileForMap[];
}

interface TransitOverviewLine {
  id: string;
  mode: string;
  name: string;
  color?: string;
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  stationCount?: number;
  stationNames: string[];
  stationStops?: TransitLineStopForMap[];
  firstStationName?: string;
  lastStationName?: string;
  sourcePath?: string;
}

interface TransitLineStopForMap {
  stationName: string;
  sequence: number;
  oneWay?: 'up' | 'down';
  status?: string;
  travelTime?: number;
}

interface TransitModeProfileForMap {
  mode: string;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
}

interface TransitLineConnection {
  id: string;
  mode: string;
  modeLabel: string;
  name: string;
  color?: string;
  sortOrder: number;
}

interface RoutePlanDraft {
  destinationId?: string;
  originId?: string;
  destinationAccessId?: string;
  originAccessId?: string;
  destinationAccessLabel?: string;
  originAccessLabel?: string;
  originLabel: string;
  destinationLabel: string;
  destination: [number, number];
  origin: [number, number];
  destinationRaw?: [number, number];
  originRaw?: [number, number];
}

type RouteEndpointKind = 'origin' | 'destination';

type RouteTransportMode = 'walk' | 'bus' | 'metro' | 'tram' | 'coach' | 'ferry' | 'railway';

interface RouteTransportModeOption {
  mode: RouteTransportMode;
  icon: string;
  color: string;
}

type EnabledRouteTransportModes = Record<RouteTransportMode, boolean>;

interface RoutePlanOption {
  id: string;
  title: string;
  summary: string;
  icon: string;
  color: string;
  coordinates: Array<[number, number]>;
  traceSegments?: RoutePlanTraceSegment[];
  markerIds: string[];
  labelMarkerIds?: string[];
  estimatedDistance: number;
  estimatedMinutes: number;
  transferCount: number;
  walkingDistance: number;
  steps: RoutePlanStep[];
  note: string;
  roadLabels?: RoutePlanRoadLabel[];
  suppressLabelMarkerIds?: string[];
}

interface RoutePlanRoadLabel {
  color?: string;
  coordinates: Array<[number, number]>;
  id: string;
  label: string;
}

interface RoutePlanStep {
  kind: 'place' | 'walk' | 'transit' | 'transfer';
  color?: string;
  details?: RoutePlanStepDetail[];
  label: string;
  icon?: string;
  role?: 'origin' | 'destination' | 'boarding' | 'alighting' | 'transfer';
}

interface RoutePlanStepDetail {
  icon: string;
  kind?: 'process' | 'place_origin' | 'place_pass' | 'place_destination';
  label: string;
  meta?: string;
}

interface RoutePlanTraceSegment {
  color: string;
  coordinates: Array<[number, number]>;
  kind: 'walk' | 'transit' | 'transfer';
}

interface RoadRouteNode {
  id: string;
  coordinate: [number, number];
  roadId: string;
  roadLabel: string;
}

interface RoadRouteEdge {
  coordinates: Array<[number, number]>;
  distance: number;
  kind: 'connection' | 'road';
  label: string;
  to: string;
}

interface RoadRouteSegment {
  end: [number, number];
  endIsRoadTerminus: boolean;
  endNodeId: string;
  id: string;
  roadId: string;
  roadLabel: string;
  start: [number, number];
  startIsRoadTerminus: boolean;
  startNodeId: string;
}

interface RoadRouteGraph {
  adjacency: Map<string, RoadRouteEdge[]>;
  nodes: RoadRouteNode[];
  nodesById: Map<string, RoadRouteNode>;
  roadSegments: RoadRouteSegment[];
}

interface RoadRoutePath {
  coordinates: Array<[number, number]>;
  distance: number;
  nodes: RoadRouteNode[];
  segments: RoadRouteInstructionSegment[];
}

interface RoadRouteInstructionSegment {
  coordinates: Array<[number, number]>;
  kind: 'approach' | 'connection' | 'depart' | 'road';
  label: string;
}

interface RoadConnectionCandidate {
  distance: number;
  leftCoordinate: [number, number];
  leftRoadLabel: string;
  leftSegmentId: string;
  rightCoordinate: [number, number];
  rightRoadLabel: string;
  rightSegmentId: string;
}

interface RoadAccessCandidate {
  coordinate: [number, number];
  distanceToPoint: number;
  endDistance: number;
  endNodeId: string;
  roadId: string;
  roadLabel: string;
  startDistance: number;
  startNodeId: string;
}

interface RoutePlanningCache {
  accessCandidatesByPair: Map<string, RoadAccessCandidate[]>;
  pathByNodePair: Map<string, RoadRoutePath | undefined>;
  roadRouteByPair: Map<string, ResolvedRoadRoute | null>;
}

interface RoadRoutingSnapshot {
  graph?: RoadRouteGraph;
  markerRoadAccessIndex: Map<string, RoadAccessCandidate[]>;
}

type RoadRoutingStatus = 'loading' | 'ready';

type RoadRouteStrategy = 'shortest' | 'fewer-turns';

type MapShareMode = 'link' | 'text' | 'image';

type MapShareTarget =
  | {
      kind: 'marker';
      marker: CenterableMarker;
    }
  | {
      draft: RoutePlanDraft;
      enabledModes: EnabledRouteTransportModes;
      kind: 'route';
      option?: RoutePlanOption;
    };

interface MapSharePayload {
  color: string;
  eyebrow: string;
  icon: string;
  meta: string[];
  steps: MapShareStep[];
  text: string;
  title: string;
  url: string;
}

interface MapShareStep {
  color?: string;
  details?: RoutePlanStepDetail[];
  icon?: string;
  kind: RoutePlanStep['kind'];
  label: string;
  role?: RoutePlanStep['role'];
}

interface ResolvedRoadRoute {
  coordinates: Array<[number, number]>;
  details: RoutePlanStepDetail[];
  distance: number;
  roadSegments: RoadRouteInstructionSegment[];
}

interface RoadRouteAccessOptions {
  destinationAccessCandidates?: RoadAccessCandidate[];
  originAccessCandidates?: RoadAccessCandidate[];
}

interface ResolvedWalkRoute {
  coordinates: Array<[number, number]>;
  details: RoutePlanStepDetail[];
  distance: number;
  markerIds?: string[];
  roadSegments?: RoadRouteInstructionSegment[];
  usesRoadGraph: boolean;
}

interface SecondaryPoiLink {
  childLabel: string;
  marker: PointMarker;
  parent: PointMarker;
}

interface SecondaryPoiGroup {
  id: string;
  label: string;
  items: SecondaryPoiLink[];
}

interface SecondaryPoiParentLink {
  childLabel: string;
  marker: PointMarker;
  parent: PointMarker;
}

interface NearbySearchCenter {
  markerId: string;
  label: string;
  coordinates: [number, number];
}

interface SharedRoutePlanState {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  key: string;
  selectedOptionId?: string;
}

type CompactRoutePlanShareState = [
  origin: string,
  destination: string,
  originLabel: string,
  destinationLabel: string,
  originId: string,
  destinationId: string,
  modes: string,
  selectedOptionId: string,
];

interface SharedCoordinateFocusState {
  coordinate: [number, number];
  key: string;
  label?: string;
}

interface ScaleBarInfo {
  distance: number;
  pixelWidth: number;
  label: string;
}

type LoadStatus = 'loading' | 'ready' | 'unavailable';
type RoadMarkerKind = 'road' | 'highway';
type MapBrowseMode = 'satellite' | 'road-network' | 'traffic';
type RoutePlanStatus = 'idle' | 'loading' | 'ready';

const mapBrowseModes: Array<{ value: MapBrowseMode; labelKey: CommonMessageKey; icon: string }> = [
  { value: 'satellite', labelKey: 'map.layer.mode.satellite', icon: 'satellite_alt' },
  { value: 'road-network', labelKey: 'map.layer.mode.roadNetwork', icon: 'conversion_path' },
  { value: 'traffic', labelKey: 'map.layer.mode.traffic', icon: 'commute' },
];

const defaultRouteTransportModes: EnabledRouteTransportModes = {
  walk: true,
  bus: true,
  metro: true,
  tram: true,
  coach: false,
  ferry: false,
  railway: false,
};

const favoriteMarkerCategoryId = 'favorites';
type Translate = ReturnType<typeof useI18n>['t'];

const mapShareModes: MapShareMode[] = ['link', 'text', 'image'];

const mapShareModeIcons: Record<MapShareMode, string> = {
  image: 'image',
  link: 'link',
  text: 'article',
};

const mapShareModeLabelKeys: Record<MapShareMode, CommonMessageKey> = {
  image: 'map.share.image',
  link: 'map.share.link',
  text: 'map.share.text',
};

const markerCategoryFallbackNames: Record<string, string> = {
  airport: '机场',
  'bus-stop': '公交站',
  'coach-station': '客运站',
  commerce: '商业',
  dining: '餐饮',
  education: '教育',
  facility: '设施',
  'ferry-port': '轮渡码头',
  industry: '产业设施',
  'map-marker': '地图标记',
  medical: '医疗',
  'metro-entrance': '地铁出入口',
  'metro-station': '地铁站',
  museum: '展馆',
  park: '公园绿地',
  parking: '停车',
  player: '在线玩家',
  'public-service': '公共服务',
  railway: '铁路',
  'railway-station': '铁路车站',
  residence: '居住区',
  road: '道路',
  scenery: '景点',
  sports: '体育',
  'tram-station': '有轨电车站',
  'transit-line': '线路',
};

const markerCategoryMessageKeys: Record<string, CommonMessageKey> = {
  airport: 'map.categoryName.airport',
  'bus-stop': 'map.categoryName.busStop',
  'coach-station': 'map.categoryName.coachStation',
  commerce: 'map.categoryName.commerce',
  dining: 'map.categoryName.dining',
  education: 'map.categoryName.education',
  facility: 'map.categoryName.facility',
  'ferry-port': 'map.categoryName.ferryPort',
  industry: 'map.categoryName.industry',
  'map-marker': 'map.categoryName.mapMarker',
  medical: 'map.categoryName.medical',
  'metro-entrance': 'map.categoryName.metroEntrance',
  'metro-station': 'map.categoryName.metroStation',
  museum: 'map.categoryName.museum',
  park: 'map.categoryName.park',
  parking: 'map.categoryName.parking',
  player: 'map.categoryName.player',
  'public-service': 'map.categoryName.publicService',
  railway: 'map.categoryName.railway',
  'railway-station': 'map.categoryName.railwayStation',
  residence: 'map.categoryName.residence',
  road: 'map.categoryName.road',
  scenery: 'map.categoryName.scenery',
  sports: 'map.categoryName.sports',
  'tram-station': 'map.categoryName.tramStation',
  'transit-line': 'map.categoryName.transitLine',
};

const routeTransportModeOptions: RouteTransportModeOption[] = [
  { mode: 'walk', icon: 'directions_walk', color: 'var(--yct-color-text-secondary)' },
  { mode: 'bus', icon: 'directions_bus', color: 'var(--yct-color-tertiary)' },
  { mode: 'metro', icon: 'subway', color: 'var(--yct-color-secondary)' },
  { mode: 'tram', icon: 'tram', color: 'var(--yct-color-tram)' },
  { mode: 'coach', icon: 'airport_shuttle', color: 'var(--yct-color-coach)' },
  { mode: 'ferry', icon: 'directions_boat', color: 'var(--yct-color-ferry)' },
  { mode: 'railway', icon: 'train', color: 'var(--yct-color-railway)' },
];

const routeWalkTraceColor = 'var(--yct-color-primary)';
const routePlanRecalculateDelayMs = 260;

const tileProviderNameKeys: Partial<Record<TileProviderDescriptor['id'], CommonMessageKey>> = {
  'lindong-fresh-http': 'map.source.provider.lindongFreshHttp',
  'lindong-safe-https-static': 'map.source.provider.lindongSafeHttpsStatic',
  'lindong-unmined-static': 'map.source.provider.lindongUnminedStatic',
};

const tileProviderNoteKeys: Partial<Record<TileProviderDescriptor['id'], CommonMessageKey>> = {
  'lindong-fresh-http': 'map.source.providerNote.lindongFreshHttp',
  'lindong-safe-https-static': 'map.source.providerNote.lindongSafeHttpsStatic',
  'lindong-unmined-static': 'map.source.providerNote.lindongUnminedStatic',
};

function getRouteTransportModeLabel(mode: RouteTransportMode, t: Translate): string {
  return t(`map.route.mode.${mode}` as Parameters<Translate>[0]);
}

function getLocalizedTileProviderName(provider: TileProviderDescriptor, t: Translate): string {
  const messageKey = tileProviderNameKeys[provider.id];
  return messageKey ? t(messageKey) : provider.name;
}

function getLocalizedTileProviderNote(provider: TileProviderDescriptor, t: Translate): string | undefined {
  const messageKey = tileProviderNoteKeys[provider.id];
  if (messageKey) {
    return t(messageKey);
  }
  return provider.freshness?.note;
}

function getTransitModeDisplayLabel(mode: string, fallback: string, t: Translate): string {
  return isRouteTransportMode(mode) ? getRouteTransportModeLabel(mode, t) : fallback;
}

function isRouteTransportMode(mode: string): mode is RouteTransportMode {
  return routeTransportModeOptions.some((option) => option.mode === mode);
}

const highPriorityTransitCategoryIds = new Set([
  'metro-station',
  'tram-station',
  'railway-station',
  'coach-station',
  'ferry-port',
  'airport',
]);

const lowPriorityTrafficCategoryIds = new Set(['bus-stop', 'residence', 'industry', 'facility']);

const tileSize = 256;
const representativePoiPriorityBoost = 24;
const markerRoadAccessProjectionRange = 50;
const mapDefaults = {
  minZoom: -7,
  maxZoom: 3,
  defaultZoom: 0,
  centerX: -945,
  centerZ: -876,
};

type PoiDetailTab = 'summary' | 'facilities';

export function MapStage() {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activePointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const tapRef = useRef<TapState | null>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [markerQuery, setMarkerQuery] = useState('');
  const [tileResponse, setTileResponse] = useState<ApiListResponse<TileProviderDescriptor> | null>(
    null,
  );
  const [selectedTileProviderId, setSelectedTileProviderId] = useState('');
  const [markerResponse, setMarkerResponse] = useState<MarkerResponse | null>(null);
  const [transitOverview, setTransitOverview] = useState<TransitOverviewResponse | null>(null);
  const [categoryResponse, setCategoryResponse] = useState<ApiListResponse<PoiCategory> | null>(
    null,
  );
  const [regionResponse, setRegionResponse] = useState<UnminedRegionResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [mapView, setMapView] = useState<MapView>({
    centerX: mapDefaults.centerX,
    centerZ: mapDefaults.centerZ,
    zoom: mapDefaults.defaultZoom,
  });
  const mapViewRef = useRef<MapView>(mapView);
  const viewportSizeRef = useRef<ViewportSize>(viewportSize);
  const [poiTitle, setPoiTitle] = useState('');
  const [poiCategoryId, setPoiCategoryId] = useState('');
  const [poiDescription, setPoiDescription] = useState('');
  const [poiHref, setPoiHref] = useState('');
  const [poiImageUrl, setPoiImageUrl] = useState('');
  const [poiImageFile, setPoiImageFile] = useState<File | null>(null);
  const [poiImageFileInputKey, setPoiImageFileInputKey] = useState(0);
  const [poiX, setPoiX] = useState('');
  const [poiZ, setPoiZ] = useState('');
  const [poiSubmitStatus, setPoiSubmitStatus] = useState('');
  const [poiSubmitBusy, setPoiSubmitBusy] = useState(false);
  const [poiSubmitDialogOpen, setPoiSubmitDialogOpen] = useState(false);
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [poiDetailTab, setPoiDetailTab] = useState<PoiDetailTab>('summary');
  const [markerListCategoryId, setMarkerListCategoryId] = useState('all');
  const [markerCategoryExpanded, setMarkerCategoryExpanded] = useState(false);
  const [browseMode, setBrowseMode] = useState<MapBrowseMode>('satellite');
  const [markersVisible, setMarkersVisible] = useState(true);
  const [linearFeaturesVisible, setLinearFeaturesVisible] = useState(true);
  const [markerListExpanded, setMarkerListExpanded] = useState(true);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; z: number } | null>(null);
  const [routePlanDraft, setRoutePlanDraft] = useState<RoutePlanDraft | null>(null);
  const [routePlanCollapsed, setRoutePlanCollapsed] = useState(false);
  const [routeTransportModes, setRouteTransportModes] = useState<EnabledRouteTransportModes>(
    defaultRouteTransportModes,
  );
  const [routePlanOptions, setRoutePlanOptions] = useState<RoutePlanOption[]>([]);
  const [routePlanStatus, setRoutePlanStatus] = useState<RoutePlanStatus>('idle');
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string | null>(null);
  const [editingRouteEndpoint, setEditingRouteEndpoint] = useState<RouteEndpointKind | null>(null);
  const [routeEndpointQuery, setRouteEndpointQuery] = useState('');
  const [shareTarget, setShareTarget] = useState<MapShareTarget | null>(null);
  const [shareActionStatus, setShareActionStatus] = useState('');
  const [roadRoutingStatus, setRoadRoutingStatus] = useState<RoadRoutingStatus>('ready');
  const [roadRoutingSnapshot, setRoadRoutingSnapshot] = useState<RoadRoutingSnapshot>(() => ({
    markerRoadAccessIndex: new Map(),
  }));
  const [poiCoordinatePickMode, setPoiCoordinatePickMode] = useState(false);
  const [nearbySearchCenter, setNearbySearchCenter] = useState<NearbySearchCenter | null>(null);
  const [poiDetailCollapsed, setPoiDetailCollapsed] = useState(false);
  const [favoriteMarkerIds, setFavoriteMarkerIds] = useState<Set<string>>(() => new Set());
  const [poiActionStatus, setPoiActionStatus] = useState('');
  const [appliedSharedMarkerFocusKey, setAppliedSharedMarkerFocusKey] = useState<string | null>(
    null,
  );
  const [appliedSharedRoutePlanKey, setAppliedSharedRoutePlanKey] = useState<string | null>(null);
  const [appliedSharedCoordinateFocusKey, setAppliedSharedCoordinateFocusKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    mapViewRef.current = mapView;
  }, [mapView]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return undefined;
    }

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const currentView = mapViewRef.current;
      const currentSize = viewportSizeRef.current;
      const zoomDelta = clamp(-event.deltaY / 320, -0.5, 0.5);
      const nextZoom = clampZoom(currentView.zoom + zoomDelta);
      if (nextZoom === currentView.zoom) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const before = screenToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
        currentView,
        currentSize,
      );
      const nextScale = getScale(nextZoom);
      setMapView({
        zoom: nextZoom,
        centerX: before.x - (event.clientX - rect.left - currentSize.width / 2) / nextScale,
        centerZ: before.z - (event.clientY - rect.top - currentSize.height / 2) / nextScale,
      });
    };

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  useEffect(() => {
    setFavoriteMarkerIds(new Set(readMapFavoriteMarkerIds()));
  }, []);

  useEffect(() => {
    const storedTileProviderId = readSelectedMapTileProviderId();
    if (storedTileProviderId) {
      setSelectedTileProviderId(storedTileProviderId);
    }
  }, []);

  useEffect(() => {
    setPoiActionStatus('');
  }, [focusedMarkerId]);

  useEffect(() => {
    if (!poiActionStatus) {
      return;
    }

    const timer = window.setTimeout(() => setPoiActionStatus(''), 3200);
    return () => window.clearTimeout(timer);
  }, [poiActionStatus]);

  useEffect(() => {
    let cancelled = false;

    async function loadMapData() {
      setLoadStatus('loading');

      try {
        const [tileResult, markerResult, categoryResult] = await Promise.all([
          fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }),
          fetch(appPath('/api/map/markers'), { cache: 'no-store' }),
          fetch(appPath('/api/map/poi-categories'), { cache: 'no-store' }),
        ]);

        const tileData = (await tileResult.json()) as ApiListResponse<TileProviderDescriptor>;
        const markerData = (await markerResult.json()) as MarkerResponse;
        const categoryData = (await categoryResult.json()) as ApiListResponse<PoiCategory>;

        if (!cancelled) {
          setTileResponse(tileData);
          setMarkerResponse(markerData);
          setCategoryResponse(categoryData);
          setLoadStatus(
            tileResult.ok && markerResult.ok && categoryResult.ok ? 'ready' : 'unavailable',
          );
        }
      } catch {
        if (!cancelled) {
          setLoadStatus('unavailable');
        }
      }
    }

    void loadMapData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTransitOverview() {
      try {
        const response = await fetch(appPath('/api/transit/overview'), { cache: 'no-store' });
        const data = (await response.json()) as TransitOverviewResponse;
        if (!cancelled && response.ok) {
          setTransitOverview(data);
        }
      } catch {
        if (!cancelled) {
          setTransitOverview(null);
        }
      }
    }

    void loadTransitOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  const tileProviders = useMemo(() => tileResponse?.items ?? [], [tileResponse]);
  useEffect(() => {
    if (tileProviders.length === 0) {
      if (selectedTileProviderId) {
        setSelectedTileProviderId('');
        writeSelectedMapTileProviderId('');
      }
      return;
    }

    if (!tileProviders.some((provider) => provider.id === selectedTileProviderId)) {
      const fallbackProviderId = tileProviders[0].id;
      setSelectedTileProviderId(fallbackProviderId);
      writeSelectedMapTileProviderId(fallbackProviderId);
    }
  }, [selectedTileProviderId, tileProviders]);

  const activeTileProvider =
    tileProviders.find((provider) => provider.id === selectedTileProviderId) ?? tileProviders[0];
  const tileTemplate = activeTileProvider?.tileTemplate;
  const tileBaseUrl = tileTemplate ? getTileBaseUrl(tileTemplate) : '';
  const markerIconBaseUrl = markerResponse?.iconBaseUrl ?? tileBaseUrl;
  const tilesVisible = browseMode === 'satellite';
  const activeTileZoom = getTileZoom(mapView.zoom);
  const lastTileZoomRef = useRef(activeTileZoom);
  const [fadingTileZoom, setFadingTileZoom] = useState<number | null>(null);
  const regionIndex = useMemo(() => buildUnminedRegionIndex(regionResponse), [regionResponse]);
  const markerSnapshot = useMemo(() => markerResponse?.snapshot.markers ?? [], [markerResponse]);
  const rawPointMarkers = useMemo(() => markerSnapshot.filter(isPointMarker), [markerSnapshot]);
  const pointMarkers = useMemo(
    () => rawPointMarkers.filter(shouldRenderAsPointPoi),
    [rawPointMarkers],
  );
  const endpointGroupMarkers = useMemo(
    () => markerSnapshot.filter(isEndpointGroupMarker),
    [markerSnapshot],
  );
  const transitLineMarkers = useMemo(
    () => markerSnapshot.filter(isTransitLineMarker),
    [markerSnapshot],
  );
  const sharedMarkerFocusKey = useMemo(
    () => readMapSharedFocusKey(searchParams),
    [searchParams],
  );
  const sharedRoutePlan = useMemo(() => readMapSharedRoutePlan(searchParams), [searchParams]);
  const sharedCoordinateFocus = useMemo(
    () => readMapSharedCoordinateFocus(searchParams),
    [searchParams],
  );
  const centerableMarkers = useMemo(
    () => markerSnapshot.filter(isCenterableMarker),
    [markerSnapshot],
  );
  const routeEndpointCandidates = useMemo(() => {
    if (!editingRouteEndpoint) {
      return [];
    }

    const query = routeEndpointQuery.trim();
    const source = query
      ? filterMarkers(centerableMarkers, query)
      : [...centerableMarkers].sort(
          (left, right) =>
            getMarkerDistanceToCoordinates(left, [mapView.centerX, mapView.centerZ]) -
            getMarkerDistanceToCoordinates(right, [mapView.centerX, mapView.centerZ]),
        );

    return source.slice(0, 8);
  }, [
    centerableMarkers,
    editingRouteEndpoint,
    mapView.centerX,
    mapView.centerZ,
    routeEndpointQuery,
  ]);
  const filteredPointMarkers = useMemo(
    () => filterMarkers(pointMarkers, markerQuery),
    [markerQuery, pointMarkers],
  );
  const filteredEndpointGroupMarkers = useMemo(
    () => filterMarkers(endpointGroupMarkers, markerQuery),
    [endpointGroupMarkers, markerQuery],
  );
  const filteredTransitLineMarkers = useMemo(
    () => filterMarkers(transitLineMarkers, markerQuery),
    [markerQuery, transitLineMarkers],
  );
  const focusedMarker = useMemo(
    () => markerSnapshot.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, markerSnapshot],
  );
  const focusedTransitLineMarker = useMemo(
    () => transitLineMarkers.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, transitLineMarkers],
  );
  const transitLineLookup = useMemo(
    () => buildTransitLineLookup(transitOverview),
    [transitOverview],
  );
  const metroTransitLineMarkers = useMemo(
    () =>
      transitLineMarkers.filter(
        (marker) => findTransitLineByMarker(marker, transitLineLookup)?.mode === 'metro',
      ),
    [transitLineLookup, transitLineMarkers],
  );
  const focusedPointMarker = useMemo(
    () => pointMarkers.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, pointMarkers],
  );
  const secondaryPoiIndex = useMemo(() => buildSecondaryPoiIndex(pointMarkers), [pointMarkers]);
  const secondaryPoiParentIndex = useMemo(
    () => buildSecondaryPoiParentIndex(pointMarkers),
    [pointMarkers],
  );
  const representativePoiIds = useMemo(() => new Set(secondaryPoiIndex.keys()), [secondaryPoiIndex]);
  const focusedSecondaryPois = focusedPointMarker
    ? (secondaryPoiIndex.get(focusedPointMarker.id) ?? [])
    : [];
  const focusedParentPoi = focusedPointMarker
    ? secondaryPoiParentIndex.get(focusedPointMarker.id)
    : undefined;
  const focusedSecondaryPoiGroups = useMemo(
    () => groupSecondaryPois(focusedSecondaryPois),
    [focusedSecondaryPois],
  );
  const pointOverlaySource = useMemo(
    () =>
      focusedPointMarker
        ? dedupeMarkersById([focusedPointMarker, ...filteredPointMarkers])
        : filteredPointMarkers,
    [filteredPointMarkers, focusedPointMarker],
  );
  const markerListCategoryOptions = useMemo(() => {
    const availableCategoryIds = new Set(
      [...pointMarkers, ...endpointGroupMarkers, ...transitLineMarkers]
        .map((marker) => marker.categoryId)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    );
  const configuredCategories =
    categoryResponse?.items
      .filter((category) => availableCategoryIds.has(category.id))
      .map((category) => ({
        ...category,
        name: getMarkerCategoryDisplayName(category.id, t, category.name),
      }))
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'),
        ) ?? [];
    const configuredCategoryIds = new Set(configuredCategories.map((category) => category.id));
    const inferredCategories = Array.from(availableCategoryIds)
      .filter((categoryId) => !configuredCategoryIds.has(categoryId))
      .map((categoryId) => ({
        id: categoryId,
        name: getMarkerCategoryDisplayName(categoryId, t),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

    return [
      { id: 'all', name: t('map.category.all') },
      { id: favoriteMarkerCategoryId, name: t('map.category.favorites') },
      ...configuredCategories,
      ...inferredCategories,
    ];
  }, [categoryResponse, endpointGroupMarkers, pointMarkers, t, transitLineMarkers]);
  const sidebarMarkers = useMemo(() => {
    const queryMode = Boolean(markerQuery.trim());
    const nearbyMode = !queryMode && nearbySearchCenter;
    const source = queryMode
      ? [...filteredTransitLineMarkers, ...filteredEndpointGroupMarkers, ...filteredPointMarkers]
      : nearbyMode
        ? [...endpointGroupMarkers, ...pointMarkers].filter(
            (marker) => marker.id !== nearbySearchCenter.markerId,
          )
        : [...endpointGroupMarkers, ...pointMarkers];
    const categoryFiltered =
      markerListCategoryId === 'all'
        ? source
        : markerListCategoryId === favoriteMarkerCategoryId
          ? source.filter((marker) => favoriteMarkerIds.has(marker.id))
          : source.filter((marker) => marker.categoryId === markerListCategoryId);

    if (queryMode) {
      return categoryFiltered.slice(0, 12);
    }

    if (nearbyMode) {
      return categoryFiltered
        .map((marker) => ({
          marker,
          distance: getMarkerDistanceToCoordinates(marker, nearbySearchCenter.coordinates),
        }))
        .sort((left, right) => left.distance - right.distance)
        .map(({ marker }) => marker)
        .slice(0, 12);
    }

    return categoryFiltered
      .map((marker) => ({
        marker,
        distance: getMarkerDistanceToMapCenter(marker, mapView),
      }))
      .sort((left, right) => left.distance - right.distance)
      .map(({ marker }) => marker)
      .slice(0, 8);
  }, [
    endpointGroupMarkers,
    filteredEndpointGroupMarkers,
    filteredPointMarkers,
    filteredTransitLineMarkers,
    favoriteMarkerIds,
    mapView,
    markerListCategoryId,
    markerQuery,
    nearbySearchCenter,
    pointMarkers,
  ]);

  useEffect(() => {
    const categoryStillAvailable = markerListCategoryOptions.some(
      (category) => category.id === markerListCategoryId,
    );
    if (!categoryStillAvailable) {
      setMarkerListCategoryId('all');
    }
  }, [markerListCategoryId, markerListCategoryOptions]);

  const selectedRouteOption =
    routePlanOptions.find((option) => option.id === selectedRouteOptionId) ?? routePlanOptions[0];
  const routeResultActive = Boolean(routePlanDraft && selectedRouteOption && !editingRouteEndpoint);
  const routeResultMarkerIds = useMemo(
    () => (routeResultActive ? new Set(selectedRouteOption?.markerIds ?? []) : undefined),
    [routeResultActive, selectedRouteOption],
  );
  const routeLabelMarkerIds = useMemo(
    () => (routeResultActive ? new Set(selectedRouteOption?.labelMarkerIds ?? []) : undefined),
    [routeResultActive, selectedRouteOption],
  );
  const routeSuppressLabelMarkerIds = useMemo(
    () =>
      routeResultActive ? new Set(selectedRouteOption?.suppressLabelMarkerIds ?? []) : undefined,
    [routeResultActive, selectedRouteOption],
  );
  const pointProjectionSource = useMemo(() => {
    const baseSource = markersVisible ? pointOverlaySource : [];
    if (!routeResultMarkerIds) {
      return baseSource;
    }

    const routeMarkers = pointMarkers.filter((marker) => routeResultMarkerIds.has(marker.id));
    return dedupeMarkersById([...baseSource, ...routeMarkers]);
  }, [markersVisible, pointMarkers, pointOverlaySource, routeResultMarkerIds]);
  const rawProjectedMarkers = useMemo(
    () => {
      const projected = projectPointMarkers(
        pointProjectionSource,
        mapView,
        viewportSize,
        markerIconBaseUrl,
        focusedMarkerId,
        browseMode,
        representativePoiIds,
        {
          forceLabelMarkerIds: routeLabelMarkerIds,
          suppressLabelMarkerIds: routeSuppressLabelMarkerIds,
        },
      );
      return routeResultMarkerIds ? projected : projected.slice(0, 220);
    },
    [
      browseMode,
      focusedMarkerId,
      markerQuery,
      markersVisible,
      pointProjectionSource,
      representativePoiIds,
      mapView,
      markerIconBaseUrl,
      routeResultMarkerIds,
      routeLabelMarkerIds,
      routeSuppressLabelMarkerIds,
      viewportSize,
    ],
  );
  const linearOverlaySource = useMemo(() => {
    if (!linearFeaturesVisible) {
      return [];
    }

    const queryMatched = markerQuery.trim()
      ? [...filteredEndpointGroupMarkers, ...filteredTransitLineMarkers]
      : [];
    const focusedMarker = focusedMarkerId
      ? [...endpointGroupMarkers, ...transitLineMarkers].find(
          (marker) => marker.id === focusedMarkerId,
        )
      : undefined;
    const roadLabelSource =
      browseMode === 'traffic'
        ? []
        : endpointGroupMarkers
            .filter((marker) => {
              const roadKind = getRoadMarkerKind(marker);
              return Boolean(roadKind);
            })
            .slice(0, browseMode === 'satellite' ? 80 : 80);
    const combined = focusedMarker
      ? [focusedMarker, ...queryMatched, ...roadLabelSource]
      : [...queryMatched, ...roadLabelSource];

    return dedupeMarkersById(combined)
      .filter((marker) => marker.geometry.coordinates.length > 0)
      .slice(0, 40);
  }, [
    browseMode,
    endpointGroupMarkers,
    filteredEndpointGroupMarkers,
    filteredTransitLineMarkers,
    focusedMarkerId,
    linearFeaturesVisible,
    markerQuery,
    transitLineMarkers,
  ]);
  const rawProjectedLinearPois = useMemo(
    () =>
      projectLinearPoiMarkers(linearOverlaySource, mapView, viewportSize, {
        focusedMarkerId,
        hideRoadEndpoints: true,
        iconBaseUrl: markerIconBaseUrl,
      }),
    [focusedMarkerId, linearOverlaySource, mapView, markerIconBaseUrl, viewportSize],
  );
  const { markers: projectedMarkers, linearPois: projectedLinearPois } = useMemo(
    () =>
      applyMapOverlayCollisionVisibility(
        rawProjectedMarkers,
        rawProjectedLinearPois,
        viewportSize,
        focusedMarkerId,
        Boolean(markerQuery.trim()),
      ),
    [focusedMarkerId, markerQuery, rawProjectedLinearPois, rawProjectedMarkers, viewportSize],
  );
  const roadTraceSource = useMemo(
    () => endpointGroupMarkers.filter((marker) => getRoadMarkerKind(marker)),
    [endpointGroupMarkers],
  );
  useEffect(() => {
    let cancelled = false;

    if (loadStatus !== 'ready') {
      setRoadRoutingStatus('ready');
      setRoadRoutingSnapshot({ markerRoadAccessIndex: new Map() });
      return undefined;
    }

    setRoadRoutingStatus('loading');

    const timer = window.setTimeout(() => {
      const graph = buildRoadRouteGraph(roadTraceSource);
      const markerRoadAccessIndex = graph
        ? buildMarkerRoadAccessIndex(pointMarkers, graph)
        : new Map<string, RoadAccessCandidate[]>();

      if (cancelled) {
        return;
      }

      startTransition(() => {
        if (cancelled) {
          return;
        }

        setRoadRoutingSnapshot({ graph, markerRoadAccessIndex });
        setRoadRoutingStatus('ready');
      });
    }, 16);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loadStatus, pointMarkers, roadTraceSource]);
  const roadRoutingGraph = roadRoutingSnapshot.graph;
  const markerRoadAccessIndex = roadRoutingSnapshot.markerRoadAccessIndex;
  const selectedRoadTraceSource = useMemo(() => {
    const selectedRoadTrace = focusedMarkerId
      ? roadTraceSource.find((marker) => marker.id === focusedMarkerId)
      : undefined;
    return selectedRoadTrace ? [selectedRoadTrace] : [];
  }, [focusedMarkerId, roadTraceSource]);
  const browseModeRoadTraceSource = useMemo(() => {
    const shouldForceRoadReference =
      browseMode === 'road-network' || browseMode === 'traffic';
    if (!linearFeaturesVisible && !shouldForceRoadReference) {
      return [];
    }

    const baseSource = roadTraceSource;

    return dedupeMarkersById([...selectedRoadTraceSource, ...baseSource]);
  }, [browseMode, linearFeaturesVisible, roadTraceSource, selectedRoadTraceSource]);
  const projectedRoadTraces = useMemo(
    () => {
      const traces = projectRoadTraceMarkers(
        browseModeRoadTraceSource,
        mapView,
        viewportSize,
        focusedMarkerId,
        {
          isMuted: browseMode === 'traffic' || browseMode === 'satellite',
          suppressLargeOverlap: false,
        },
      );
      return browseMode === 'satellite' ? traces.slice(0, 160) : traces;
    },
    [browseMode, browseModeRoadTraceSource, focusedMarkerId, mapView, viewportSize],
  );
  const projectedTransitTraces = useMemo(
    () => {
      if (!linearFeaturesVisible) {
        return [];
      }

      const traceSource = focusedTransitLineMarker
        ? dedupeMarkersById([...metroTransitLineMarkers, focusedTransitLineMarker])
        : metroTransitLineMarkers;

      return projectTransitLineTraces(traceSource, mapView, viewportSize, focusedMarkerId).slice(
        0,
        48,
      );
    },
    [
      focusedMarkerId,
      focusedTransitLineMarker,
      linearFeaturesVisible,
      mapView,
      metroTransitLineMarkers,
      viewportSize,
    ],
  );
  const publicPoiCategories = useMemo(
    () => categoryResponse?.items.filter((category) => category.acceptsPublicSubmissions) ?? [],
    [categoryResponse],
  );
  const activeTileProviderName = activeTileProvider
    ? getLocalizedTileProviderName(activeTileProvider, t)
    : undefined;
  const activeTileProviderNote = activeTileProvider
    ? getLocalizedTileProviderNote(activeTileProvider, t)
    : undefined;
  const tileSourceText = activeTileProvider
    ? [
        t('map.source.tileProvider', { name: activeTileProviderName ?? activeTileProvider.name }),
        activeTileProviderNote,
      ]
        .filter(Boolean)
        .join('。')
    : undefined;
  const dataSourceText =
    [markerResponse?.meta.message, tileSourceText].filter(Boolean).join('\n') ||
    t('map.source.tooltipLoading');
  const updateSelectedTileProviderId = (providerId: string) => {
    setSelectedTileProviderId(providerId);
    writeSelectedMapTileProviderId(providerId);
  };
  const categoryById = useMemo(
    () =>
      new Map(
        (categoryResponse?.items ?? []).map((category) => [
          category.id,
          getMarkerCategoryDisplayName(category.id, t, category.name),
        ]),
      ),
    [categoryResponse, t],
  );
  const stationConnectionIndex = useMemo(
    () => buildStationConnectionIndex(transitOverview, t),
    [transitOverview, t],
  );
  const routePlanRequest = useMemo(
    () =>
      routePlanDraft
        ? {
            draft: routePlanDraft,
            enabledModes: routeTransportModes,
            markerRoadAccessIndex,
            pointMarkers,
            secondaryPoiIndex,
            secondaryPoiParentIndex,
            transitLines: transitOverview?.lines ?? [],
            modeProfiles: transitOverview?.modeProfiles ?? [],
          }
        : null,
    [
      markerRoadAccessIndex,
      pointMarkers,
      routePlanDraft,
      routeTransportModes,
      secondaryPoiIndex,
      secondaryPoiParentIndex,
      transitOverview,
    ],
  );
  useEffect(() => {
    if (!routePlanDraft || !routePlanRequest) {
      setRoutePlanOptions([]);
      setRoutePlanStatus('idle');
      return;
    }

    let cancelled = false;
    setRoutePlanStatus('loading');
    setRoutePlanOptions([]);

    if (roadRoutingStatus === 'loading') {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      const nextOptions = buildRoutePlanOptions({
        ...routePlanRequest,
        roadGraph: roadRoutingGraph,
        t,
      });
      if (cancelled) {
        return;
      }

      startTransition(() => {
        if (cancelled) {
          return;
        }
        setRoutePlanOptions(nextOptions);
        setRoutePlanStatus('ready');
      });
    }, routePlanRecalculateDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roadRoutingGraph, roadRoutingStatus, routePlanDraft, routePlanRequest, t]);
  useEffect(() => {
    if (!shareActionStatus) {
      return undefined;
    }

    const timer = window.setTimeout(() => setShareActionStatus(''), 3200);
    return () => window.clearTimeout(timer);
  }, [shareActionStatus]);
  const selectedRouteTrace = useMemo(
    () =>
      selectedRouteOption
        ? projectRoutePlanTrace(selectedRouteOption, mapView, viewportSize)
        : undefined,
    [mapView, selectedRouteOption, viewportSize],
  );
  const visibleProjectedMarkers = useMemo(
    () =>
      routeResultMarkerIds
        ? rawProjectedMarkers.filter((marker) => routeResultMarkerIds.has(marker.id))
        : projectedMarkers,
    [projectedMarkers, rawProjectedMarkers, routeResultMarkerIds],
  );
  const visibleProjectedLinearPois = routeResultActive ? [] : projectedLinearPois;
  const visibleProjectedRoadTraces = projectedRoadTraces;
  const visibleProjectedTransitTraces = projectedTransitTraces;
  const focusedMarkerCenter =
    focusedMarker && isCenterableMarker(focusedMarker) ? getMarkerCenter(focusedMarker) : undefined;
  const focusedMarkerCategoryName = focusedMarker?.categoryId
    ? (categoryById.get(focusedMarker.categoryId) ??
      getMarkerCategoryDisplayName(focusedMarker.categoryId, t))
    : undefined;
  const focusedMarkerConnections =
    focusedMarker && isTransitStationPoi(focusedMarker)
      ? findStationConnections(focusedMarker, stationConnectionIndex)
      : [];
  const focusedTransitLine =
    focusedMarker && isTransitLineMarker(focusedMarker)
      ? findTransitLineByMarker(focusedMarker, transitLineLookup)
      : undefined;
  const scaleBarInfo = useMemo(
    () => buildScaleBarInfo(mapView, viewportSize, t),
    [mapView, t, viewportSize],
  );
  const visibleTiles = useMemo<TileLayer | null>(
    () =>
      tilesVisible && tileTemplate
        ? {
            zoom: activeTileZoom,
            tiles: buildVisibleTiles(mapView, viewportSize, tileTemplate, regionIndex, {
              tileZoom: activeTileZoom,
            }),
          }
        : null,
    [activeTileZoom, mapView, regionIndex, tileTemplate, tilesVisible, viewportSize],
  );
  const fadingTiles = useMemo<TileLayer | null>(
    () =>
      tilesVisible && tileTemplate && fadingTileZoom !== null && fadingTileZoom !== activeTileZoom
        ? {
            zoom: fadingTileZoom,
            tiles: buildVisibleTiles(mapView, viewportSize, tileTemplate, regionIndex, {
              tileZoom: fadingTileZoom,
            }),
          }
        : null,
    [
      activeTileZoom,
      fadingTileZoom,
      mapView,
      regionIndex,
      tileTemplate,
      tilesVisible,
      viewportSize,
    ],
  );

  useEffect(() => {
    if (!poiCategoryId && publicPoiCategories.length > 0) {
      setPoiCategoryId(publicPoiCategories[0].id);
    }
  }, [poiCategoryId, publicPoiCategories]);

  useEffect(() => {
    if (!routePlanDraft) {
      setSelectedRouteOptionId(null);
      return;
    }

    if (
      routePlanOptions.length > 0 &&
      !routePlanOptions.some((option) => option.id === selectedRouteOptionId)
    ) {
      setSelectedRouteOptionId(routePlanOptions[0].id);
    }
  }, [routePlanDraft, routePlanOptions, selectedRouteOptionId]);

  useEffect(() => {
    if (!tilesVisible || !tileTemplate) {
      lastTileZoomRef.current = activeTileZoom;
      setFadingTileZoom(null);
      return;
    }

    const previousTileZoom = lastTileZoomRef.current;
    if (previousTileZoom === activeTileZoom) {
      return;
    }

    lastTileZoomRef.current = activeTileZoom;
    setFadingTileZoom(previousTileZoom);

    const timeoutId = window.setTimeout(() => {
      setFadingTileZoom((current) => (current === previousTileZoom ? null : current));
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [activeTileZoom, tileTemplate, tilesVisible]);

  useEffect(() => {
    if (!activeTileProvider || !tileTemplate?.includes('tiles/zoom.{z}')) {
      setRegionResponse(null);
      return;
    }

    let cancelled = false;

    async function loadUnminedRegions() {
      try {
        const response = await fetch(appPath('/api/map/unmined-regions'), {
          cache: 'force-cache',
        });
        const data = (await response.json()) as UnminedRegionResponse;
        if (!cancelled) {
          setRegionResponse(response.ok ? data : null);
        }
      } catch {
        if (!cancelled) {
          setRegionResponse(null);
        }
      }
    }

    void loadUnminedRegions();

    return () => {
      cancelled = true;
    };
  }, [activeTileProvider, tileTemplate]);

  const zoomBy = (delta: number) => {
    setMapView((current) => ({
      ...current,
      zoom: clampZoom(current.zoom + delta),
    }));
  };

  const resetView = () => {
    setMapView({
      centerX: mapDefaults.centerX,
      centerZ: mapDefaults.centerZ,
      zoom: mapDefaults.defaultZoom,
    });
  };

  const focusMapMarker = useCallback((marker: CenterableMarker) => {
    setMapView((current) => fitMarkerToMapView(marker, current, viewportSize));
    setFocusedMarkerId(marker.id);
    setPoiDetailTab('summary');
    setPoiDetailCollapsed(false);
    setNearbySearchCenter(null);
  }, [viewportSize]);

  useEffect(() => {
    if (!sharedMarkerFocusKey) {
      if (appliedSharedMarkerFocusKey) {
        setAppliedSharedMarkerFocusKey(null);
      }
      return;
    }

    if (appliedSharedMarkerFocusKey === sharedMarkerFocusKey || markerSnapshot.length === 0) {
      return;
    }

    const marker = findMapMarkerBySharedFocusKey(markerSnapshot, sharedMarkerFocusKey);
    if (marker && isCenterableMarker(marker)) {
      focusMapMarker(marker);
    }
    setAppliedSharedMarkerFocusKey(sharedMarkerFocusKey);
  }, [
    appliedSharedMarkerFocusKey,
    focusMapMarker,
    markerSnapshot,
    sharedMarkerFocusKey,
  ]);

  useEffect(() => {
    if (!sharedRoutePlan) {
      if (appliedSharedRoutePlanKey) {
        setAppliedSharedRoutePlanKey(null);
      }
      return;
    }

    if (appliedSharedRoutePlanKey === sharedRoutePlan.key) {
      return;
    }

    setRoutePlanDraft(sharedRoutePlan.draft);
    setRouteTransportModes(sharedRoutePlan.enabledModes);
    setSelectedRouteOptionId(sharedRoutePlan.selectedOptionId ?? null);
    setRoutePlanCollapsed(false);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setNearbySearchCenter(null);
    setFocusedMarkerId(null);
    setMapView((current) =>
      fitRouteDraftToMapView(sharedRoutePlan.draft, current, viewportSize),
    );
    setAppliedSharedRoutePlanKey(sharedRoutePlan.key);
  }, [appliedSharedRoutePlanKey, sharedRoutePlan, viewportSize]);

  useEffect(() => {
    if (!sharedCoordinateFocus) {
      if (appliedSharedCoordinateFocusKey) {
        setAppliedSharedCoordinateFocusKey(null);
      }
      return;
    }

    if (appliedSharedCoordinateFocusKey === sharedCoordinateFocus.key) {
      return;
    }

    setFocusedMarkerId(null);
    setRoutePlanDraft(null);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setNearbySearchCenter(null);
    setMapView((current) => ({
      ...current,
      centerX: sharedCoordinateFocus.coordinate[0],
      centerZ: sharedCoordinateFocus.coordinate[1],
      zoom: Math.max(current.zoom, mapDefaults.defaultZoom),
    }));
    setAppliedSharedCoordinateFocusKey(sharedCoordinateFocus.key);
  }, [appliedSharedCoordinateFocusKey, sharedCoordinateFocus]);

  const toggleFavoriteMarker = (marker: CenterableMarker) => {
    const label = formatMarkerDisplayName(marker.label);
    const next = new Set(favoriteMarkerIds);

    if (next.has(marker.id)) {
      next.delete(marker.id);
      setPoiActionStatus(t('map.poi.unfavoriteStatus', { name: label }));
    } else {
      next.add(marker.id);
      setPoiActionStatus(t('map.poi.favoriteStatus', { name: label }));
    }

    setFavoriteMarkerIds(next);
    writeMapFavoriteMarkerIds([...next]);
  };

  const shareMarker = (marker: CenterableMarker) => {
    setShareTarget({ kind: 'marker', marker });
  };

  const shareRoutePlan = () => {
    if (!routePlanDraft) {
      return;
    }

    setShareTarget({
      draft: routePlanDraft,
      enabledModes: routeTransportModes,
      kind: 'route',
      option: selectedRouteOption,
    });
  };

  const focusTransitLineById = (lineId: string) => {
    const lineMarker = transitLineMarkers.find(
      (marker) => marker.id === `transit-line-${lineId}` || marker.id === lineId,
    );
    if (!lineMarker) {
      return;
    }

    focusMapMarker(lineMarker);
  };

  const startDragGesture = (pointerId: number, clientX: number, clientY: number, view: MapView) => {
    dragRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      centerX: view.centerX,
      centerZ: view.centerZ,
    };
  };

  const startPinchGesture = (target: HTMLDivElement) => {
    const points = getPinchPoints(activePointersRef.current);
    if (!points) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const midpoint = getMidpoint(points.left, points.right);
    const screenX = midpoint.x - rect.left;
    const screenY = midpoint.y - rect.top;
    const currentView = mapViewRef.current;
    pinchRef.current = {
      pointerIds: [points.left.id, points.right.id],
      startDistance: Math.max(1, getPointerDistance(points.left, points.right)),
      startZoom: currentView.zoom,
      anchorWorld: screenToWorld(screenX, screenY, currentView, viewportSize),
    };
  };

  const updatePinchGesture = (target: HTMLDivElement) => {
    const pinch = pinchRef.current;
    if (!pinch) {
      return;
    }

    const left = activePointersRef.current.get(pinch.pointerIds[0]);
    const right = activePointersRef.current.get(pinch.pointerIds[1]);
    if (!left || !right) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const midpoint = getMidpoint(left, right);
    const distance = Math.max(1, getPointerDistance(left, right));
    const nextZoom = clampZoom(pinch.startZoom + Math.log2(distance / pinch.startDistance));
    const nextScale = getScale(nextZoom);
    const screenX = midpoint.x - rect.left;
    const screenY = midpoint.y - rect.top;
    setMapView({
      zoom: nextZoom,
      centerX: pinch.anchorWorld.x - (screenX - viewportSize.width / 2) / nextScale,
      centerZ: pinch.anchorWorld.z - (screenY - viewportSize.height / 2) / nextScale,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    updateCursorWorld(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    tapRef.current = editingRouteEndpoint || poiCoordinatePickMode
      ? {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        }
      : null;

    if (activePointersRef.current.size >= 2) {
      dragRef.current = null;
      tapRef.current = null;
      startPinchGesture(event.currentTarget);
      return;
    }

    startDragGesture(event.pointerId, event.clientX, event.clientY, mapViewRef.current);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorWorld(event);
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (
      tapRef.current?.pointerId === event.pointerId &&
      getPointerDistance(
        { x: tapRef.current.startX, y: tapRef.current.startY },
        { x: event.clientX, y: event.clientY },
      ) > 8
    ) {
      tapRef.current = null;
    }

    if (pinchRef.current && activePointersRef.current.size >= 2) {
      tapRef.current = null;
      updatePinchGesture(event.currentTarget);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const scale = getScale(mapView.zoom);
    setMapView((current) => ({
      ...current,
      centerX: drag.centerX - (event.clientX - drag.startX) / scale,
      centerZ: drag.centerZ - (event.clientY - drag.startY) / scale,
    }));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wasPinching = pinchRef.current?.pointerIds.includes(event.pointerId) ?? false;
    const tap = tapRef.current;
    if (tap?.pointerId === event.pointerId) {
      tapRef.current = null;
      if (!wasPinching && (editingRouteEndpoint || poiCoordinatePickMode)) {
        const rect = event.currentTarget.getBoundingClientRect();
        const coordinates = toCoordinatePair(
          screenToWorld(
            event.clientX - rect.left,
            event.clientY - rect.top,
            mapViewRef.current,
            viewportSize,
          ),
        );
        if (editingRouteEndpoint) {
          applyRouteEndpointCoordinate(editingRouteEndpoint, coordinates);
        } else {
          applyPoiCoordinateFromMap(coordinates);
        }
      }
    }

    activePointersRef.current.delete(event.pointerId);
    if (wasPinching) {
      pinchRef.current = null;
      const remaining = Array.from(activePointersRef.current.entries())[0];
      if (remaining) {
        startDragGesture(remaining[0], remaining[1].x, remaining[1].y, mapViewRef.current);
      }
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handlePointerLeave = () => {
    if (!dragRef.current) {
      setCursorWorld(null);
    }
  };

  const updateCursorWorld = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursorWorld(
      screenToWorld(event.clientX - rect.left, event.clientY - rect.top, mapView, viewportSize),
    );
  };

  const beginPoiCoordinatePick = () => {
    setPoiCoordinatePickMode(true);
    setPoiSubmitDialogOpen(false);
    setPoiSubmitStatus(t('map.poiSubmit.pickPrompt'));
  };

  const applyPoiCoordinateFromMap = (coordinates: [number, number]) => {
    setPoiX(String(Math.round(coordinates[0])));
    setPoiZ(String(Math.round(coordinates[1])));
    setPoiCoordinatePickMode(false);
    setPoiSubmitDialogOpen(true);
    setPoiSubmitStatus(t('map.poiSubmit.pickDone', { point: formatPoint(coordinates) }));
  };

  const submitPoi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPoiSubmitStatus('');
    const x = Number(poiX);
    const z = Number(poiZ);

    if (!poiTitle.trim() || !poiCategoryId || !Number.isFinite(x) || !Number.isFinite(z)) {
      setPoiSubmitStatus(t('map.poiSubmit.invalid'));
      return;
    }

    setPoiSubmitBusy(true);
    try {
      let imageUrl = poiImageUrl.trim() || undefined;
      if (poiImageFile) {
        const imageBody = new FormData();
        imageBody.append('file', poiImageFile);
        const imageResponse = await fetch(appPath('/api/map/poi-submission-images/upload'), {
          method: 'POST',
          body: imageBody,
        });
        const imageData = (await imageResponse.json()) as {
          imageUrl?: string;
          message?: string;
        };
        if (!imageResponse.ok || !imageData.imageUrl) {
          setPoiSubmitStatus(imageData.message ?? t('map.poiSubmit.imageUploadFailed'));
          return;
        }

        imageUrl = imageData.imageUrl;
      }

      const response = await fetch(appPath('/api/map/poi-submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: poiTitle,
          categoryId: poiCategoryId,
          description: poiDescription.trim() || undefined,
          href: poiHref.trim() || undefined,
          imageUrl,
          visibility: 'public_pending_review',
          geometry: {
            type: 'Point',
            coordinates: [x, z],
          },
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setPoiSubmitStatus(data.message ?? t('map.poiSubmit.submitFailed'));
        return;
      }

      setPoiTitle('');
      setPoiDescription('');
      setPoiHref('');
      setPoiImageUrl('');
      setPoiImageFile(null);
      setPoiImageFileInputKey((current) => current + 1);
      setPoiX('');
      setPoiZ('');
      setPoiSubmitStatus(t('map.poiSubmit.success'));
      setPoiSubmitDialogOpen(false);
    } finally {
      setPoiSubmitBusy(false);
    }
  };

  const createRoutePlanDraft = (marker: CenterableMarker) => {
    const destination = getMarkerCenter(marker);
    if (!destination) {
      return;
    }
    const origin: [number, number] = [mapDefaults.centerX, mapDefaults.centerZ];

    setRoutePlanDraft({
      destinationId: marker.id,
      originLabel: t('map.route.currentLocation'),
      destinationLabel: formatMarkerDisplayName(marker.label),
      destination,
      origin,
    });
    setRoutePlanCollapsed(false);
    setSelectedRouteOptionId(null);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
  };

  const updateRoutePlanOriginToMapCenter = () => {
    setRoutePlanDraft((current) =>
      current
        ? {
            ...current,
            originId: undefined,
            origin: [mapView.centerX, mapView.centerZ],
            originLabel: formatPoint([mapView.centerX, mapView.centerZ]),
          }
        : current,
    );
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setSelectedRouteOptionId(null);
  };

  const swapRoutePlanEndpoints = () => {
    setRoutePlanDraft((current) =>
      current
        ? {
            ...current,
            destinationId: current.originId,
            originId: current.destinationId,
            origin: current.destination,
            originLabel: current.destinationLabel,
            destination: current.origin,
            destinationLabel: current.originLabel,
          }
        : current,
    );
    setSelectedRouteOptionId(null);
  };

  const beginRouteEndpointEdit = (endpoint: RouteEndpointKind) => {
    setEditingRouteEndpoint(endpoint);
    setRouteEndpointQuery('');
    setRoutePlanCollapsed(false);
  };

  const applyRouteEndpointMarker = (endpoint: RouteEndpointKind, marker: CenterableMarker) => {
    const center = getMarkerCenter(marker);
    if (!center) {
      return;
    }

    const label = formatMarkerDisplayName(marker.label);
    setRoutePlanDraft((current) => {
      if (!current) {
        return current;
      }

      return endpoint === 'origin'
        ? {
            ...current,
            originId: marker.id,
            origin: center,
            originLabel: label,
          }
        : {
            ...current,
            destinationId: marker.id,
            destination: center,
            destinationLabel: label,
          };
    });
    setFocusedMarkerId(marker.id);
    setPoiDetailCollapsed(true);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setSelectedRouteOptionId(null);
  };

  const applyRouteEndpointCoordinate = (
    endpoint: RouteEndpointKind,
    coordinates: [number, number],
  ) => {
    const label = formatPoint(coordinates);
    setRoutePlanDraft((current) => {
      if (!current) {
        return current;
      }

      return endpoint === 'origin'
        ? {
            ...current,
            originId: undefined,
            origin: coordinates,
            originLabel: label,
          }
        : {
            ...current,
            destinationId: undefined,
            destination: coordinates,
            destinationLabel: label,
          };
    });
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setSelectedRouteOptionId(null);
  };

  const handleMapMarkerActivate = (marker: CenterableMarker) => {
    if (editingRouteEndpoint) {
      applyRouteEndpointMarker(editingRouteEndpoint, marker);
      return;
    }

    focusMapMarker(marker);
  };

  const updateMarkerQuery = (value: string) => {
    setMarkerQuery(value);
    if (value.trim()) {
      setNearbySearchCenter(null);
    }
  };

  const startNearbySearch = (marker: CenterableMarker) => {
    const center = getMarkerCenter(marker);
    if (!center) {
      return;
    }

    setNearbySearchCenter({
      markerId: marker.id,
      label: formatMarkerDisplayName(marker.label),
      coordinates: center,
    });
    setMarkerQuery('');
    setFocusedMarkerId(null);
    setRoutePlanDraft(null);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setMarkerListExpanded(true);
  };

  const projectedGuideMarkers = useMemo(() => {
    const markers: ProjectedGuideMarker[] = [];
    const defaultAnchor = projectCoordinateMarker(
      'default-anchor',
      t('map.route.defaultView'),
      [mapDefaults.centerX, mapDefaults.centerZ],
      mapView,
      viewportSize,
      32,
    );
    if (routePlanDraft) {
      const routeOrigin = projectCoordinateMarker(
        'route-origin',
        t('map.route.origin'),
        routePlanDraft.origin,
        mapView,
        viewportSize,
        40,
      );
      const routeDestination = projectCoordinateMarker(
        'route-destination',
        t('map.route.destination'),
        routePlanDraft.destination,
        mapView,
        viewportSize,
        40,
      );
      if (routeOrigin) {
        markers.push(routeOrigin);
      }
      if (routeDestination) {
        markers.push(routeDestination);
      }
    } else if (sharedCoordinateFocus) {
      const sharedMarker = projectCoordinateMarker(
        'shared-coordinate',
        sharedCoordinateFocus.label ?? formatPoint(sharedCoordinateFocus.coordinate),
        sharedCoordinateFocus.coordinate,
        mapView,
        viewportSize,
        40,
      );
      if (sharedMarker) {
        markers.push(sharedMarker);
      }
    }
    if (defaultAnchor) {
      markers.push(defaultAnchor);
    }

    return markers;
  }, [mapView, routePlanDraft, sharedCoordinateFocus, t, viewportSize]);

  const hasMapOverlay =
    projectedGuideMarkers.length > 0 ||
    Boolean(selectedRouteTrace) ||
    visibleProjectedMarkers.length > 0 ||
    visibleProjectedLinearPois.length > 0 ||
    visibleProjectedRoadTraces.length > 0 ||
    visibleProjectedTransitTraces.length > 0;

  return (
    <section className={`map-stage is-mode-${browseMode}`} aria-labelledby="map-title">
      <h1 id="map-title" className="sr-only">
        {t('map.title')}
      </h1>

      <aside className="map-control-stack map-sidebar-stack" aria-label={t('map.title')}>
        <div className="map-panel-section">
          <div className="search-box map-search-box">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              aria-label={t('map.search.aria')}
              value={markerQuery}
              onChange={(event) => updateMarkerQuery(event.currentTarget.value)}
              placeholder={t('map.search.placeholder')}
            />
            {markerQuery ? (
              <button
                className="search-clear-button"
                type="button"
                aria-label={t('map.search.clear')}
                onClick={() => updateMarkerQuery('')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            ) : null}
          </div>
          {routePlanDraft ? (
            <RoutePlanDraftCard
              draft={routePlanDraft}
              t={t}
              collapsed={routePlanCollapsed}
              editingEndpoint={editingRouteEndpoint}
              enabledModes={routeTransportModes}
              endpointCandidates={routeEndpointCandidates}
              endpointQuery={routeEndpointQuery}
              options={routePlanOptions}
              status={routePlanStatus}
              selectedOptionId={selectedRouteOption?.id}
              iconBaseUrl={markerIconBaseUrl}
              onBeginEndpointEdit={beginRouteEndpointEdit}
              onClear={() => {
                setRoutePlanDraft(null);
                setEditingRouteEndpoint(null);
                setRouteEndpointQuery('');
              }}
              onEndpointQueryChange={setRouteEndpointQuery}
              onSetAllModes={(enabled) =>
                setRouteTransportModes(
                  Object.fromEntries(
                    routeTransportModeOptions.map((mode) => [mode.mode, enabled]),
                  ) as EnabledRouteTransportModes,
                )
              }
              onSelectOption={setSelectedRouteOptionId}
              onSelectEndpointCandidate={applyRouteEndpointMarker}
              onShare={() => void shareRoutePlan()}
              onSwapEndpoints={swapRoutePlanEndpoints}
              onToggleCollapsed={() => setRoutePlanCollapsed((current) => !current)}
              onToggleMode={(mode) =>
                setRouteTransportModes((current) => ({ ...current, [mode]: !current[mode] }))
              }
              onUseMapCenter={updateRoutePlanOriginToMapCenter}
            />
          ) : null}
          {routePlanDraft || (focusedMarker && isCenterableMarker(focusedMarker)) ? null : (
            <div
              className={markerListExpanded ? 'map-marker-list' : 'map-marker-list is-collapsed'}
            >
              <button
                className="map-marker-list-toggle"
                type="button"
                aria-expanded={markerListExpanded}
                onClick={() => setMarkerListExpanded((current) => !current)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {markerListExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                </span>
                <span>
                  {markerQuery.trim()
                    ? t('map.markerList.results')
                    : nearbySearchCenter
                      ? t('map.markerList.nearby', { name: nearbySearchCenter.label })
                      : t('map.markerList.default')}
                </span>
                <span className="muted">
                  {t('map.markerList.count', { count: sidebarMarkers.length })}
                </span>
              </button>
              {markerListExpanded ? (
                <>
                  {nearbySearchCenter ? (
                    <div className="map-nearby-search-note">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        travel_explore
                      </span>
                      <span>{t('map.nearby.note', { name: nearbySearchCenter.label })}</span>
                      <button type="button" onClick={() => setNearbySearchCenter(null)}>
                        {t('map.nearby.exit')}
                      </button>
                    </div>
                  ) : null}
                  <div
                    className={
                      markerCategoryExpanded
                        ? 'map-category-filter is-expanded'
                        : 'map-category-filter'
                    }
                  >
                    <div className="map-category-strip" aria-label={t('map.categoryFilter.aria')}>
                      {markerListCategoryOptions.map((category) => (
                        <button
                          className={
                            markerListCategoryId === category.id
                              ? 'map-category-pill is-active'
                              : 'map-category-pill'
                          }
                          type="button"
                          key={category.id}
                          onClick={() => setMarkerListCategoryId(category.id)}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                    {markerListCategoryOptions.length > 4 ? (
                      <button
                        className="map-category-toggle"
                        type="button"
                        aria-expanded={markerCategoryExpanded}
                        aria-label={
                          markerCategoryExpanded
                            ? t('map.categoryFilter.collapse')
                            : t('map.categoryFilter.expand')
                        }
                        onClick={() => setMarkerCategoryExpanded((current) => !current)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {markerCategoryExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                        </span>
                      </button>
                    ) : null}
                  </div>
                  <div className="map-marker-list-items">
                    {sidebarMarkers.length > 0 ? (
                      sidebarMarkers.map((marker) => {
                        const center = getMarkerCenter(marker);
                        const content = (
                          <>
                            <MarkerListIcon marker={marker} iconBaseUrl={markerIconBaseUrl} />
                            <span>{formatMarkerDisplayName(marker.label)}</span>
                            <span className="muted">{formatMarkerDetail(marker, t)}</span>
                          </>
                        );

                        if (marker.href && !editingRouteEndpoint) {
                          return (
                            <a
                              className={
                                marker.id === focusedMarkerId
                                  ? 'map-marker-list-item is-active'
                                  : 'map-marker-list-item'
                              }
                              href={marker.href}
                              key={marker.id}
                            >
                              {content}
                            </a>
                          );
                        }

                        return (
                          <button
                            className={
                              marker.id === focusedMarkerId
                                ? 'map-marker-list-item is-active'
                                : 'map-marker-list-item'
                            }
                            type="button"
                            key={marker.id}
                            disabled={!center}
                            onClick={() => handleMapMarkerActivate(marker)}
                          >
                            {content}
                          </button>
                        );
                      })
                    ) : (
                      <p className="map-marker-list-empty">
                        {getMapMarkerListEmptyText({
                          loadStatus,
                          markerListCategoryId,
                          nearbySearchCenter,
                          t,
                        })}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
        {focusedMarker && isCenterableMarker(focusedMarker) ? (
          <aside
            className={
              poiDetailCollapsed ? 'map-poi-detail-panel is-collapsed' : 'map-poi-detail-panel'
            }
            aria-labelledby="map-poi-detail-title"
          >
            <div className="map-poi-detail-header">
              <MarkerListIcon marker={focusedMarker} iconBaseUrl={markerIconBaseUrl} />
              <div>
                <h2 id="map-poi-detail-title">{formatMarkerDisplayName(focusedMarker.label)}</h2>
                <span>
                  {focusedMarkerCategoryName ??
                    focusedMarker.categoryId ??
                    t('map.poi.objectFallback')}
                </span>
              </div>
              <button
                className="icon-action-button"
                type="button"
                aria-label={poiDetailCollapsed ? t('map.poi.expand') : t('map.poi.collapse')}
                aria-expanded={!poiDetailCollapsed}
                onClick={() => setPoiDetailCollapsed((current) => !current)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {poiDetailCollapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                </span>
              </button>
              <button
                className="icon-action-button"
                type="button"
                aria-label={t('map.poi.close')}
                onClick={() => setFocusedMarkerId(null)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            {!poiDetailCollapsed ? (
              <>
                {!isLinearDetailMarker(focusedMarker) ? (
                  <div className="map-poi-detail-tabs" aria-label={t('map.poi.tabsAria')}>
                    {[
                      ['summary', t('map.poi.summary')],
                      ['facilities', t('map.poi.facilities')],
                    ].map(([tab, label]) => (
                      <button
                        className={poiDetailTab === tab ? 'is-active' : ''}
                        type="button"
                        aria-pressed={poiDetailTab === tab}
                        key={tab}
                        onClick={() => setPoiDetailTab(tab as PoiDetailTab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="map-poi-detail-body">
                  {focusedTransitLine ? (
                    <TransitLineMapDetail
                      line={focusedTransitLine}
                      lineColor={focusedMarker.accentColor}
                      t={t}
                    />
                  ) : isRoadEndpointGroupMarker(focusedMarker) ? (
                    <RoadMapDetail marker={focusedMarker} t={t} />
                  ) : poiDetailTab === 'summary' ? (
                    <>
                      {focusedMarker.imageUrl ? (
                        <img
                          className="map-poi-detail-image"
                          src={appPath(focusedMarker.imageUrl)}
                          alt={t('map.poi.imageAlt', {
                            name: formatMarkerDisplayName(focusedMarker.label),
                          })}
                        />
                      ) : null}
                      {focusedMarker.description ? <p>{focusedMarker.description}</p> : null}
                      <dl>
                        {focusedMarkerCenter ? (
                          <div>
                            <dt>{t('map.poi.coordinate')}</dt>
                            <dd>{formatPoint(focusedMarkerCenter)}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>{t('map.poi.type')}</dt>
                          <dd>{formatGeometryDetail(focusedMarker, t)}</dd>
                        </div>
                        {focusedParentPoi ? (
                          <div>
                            <dt>{t('map.poi.parent')}</dt>
                            <dd>
                              <button
                                className="map-transfer-line-chip"
                                type="button"
                                onClick={() => focusMapMarker(focusedParentPoi.parent)}
                              >
                                {formatMarkerDisplayName(focusedParentPoi.parent.label)}
                              </button>
                            </dd>
                          </div>
                        ) : null}
                        {isTransitStationPoi(focusedMarker) ? (
                          <div>
                            <dt>{t('map.poi.connections')}</dt>
                            <dd>
                              {focusedMarkerConnections.length > 0 ? (
                                <span className="map-transfer-line-list">
                                  {focusedMarkerConnections.map((connection) => (
                                    <button
                                      className="map-transfer-line-chip"
                                      type="button"
                                      key={connection.id}
                                      onClick={() => focusTransitLineById(connection.id)}
                                      style={
                                        {
                                          '--transfer-line-color': connection.color,
                                        } as CSSProperties
                                      }
                                      title={`${connection.modeLabel} · ${connection.name}`}
                                    >
                                      {connection.name}
                                    </button>
                                  ))}
                                </span>
                              ) : (
                                t('map.poi.noConnections')
                              )}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {focusedMarker.href ? (
                        <a className="secondary-action-button" href={focusedMarker.href}>
                          <span className="material-symbols-outlined" aria-hidden="true">
                            open_in_new
                          </span>
                          <span>{t('map.poi.openDetail')}</span>
                        </a>
                      ) : null}
                      <PoiActionBar
                        isFavorite={favoriteMarkerIds.has(focusedMarker.id)}
                        marker={focusedMarker}
                        onPlanRoute={() => createRoutePlanDraft(focusedMarker)}
                        onSearchNearby={() => startNearbySearch(focusedMarker)}
                        onShare={() => void shareMarker(focusedMarker)}
                        onToggleFavorite={() => toggleFavoriteMarker(focusedMarker)}
                        status={poiActionStatus}
                        t={t}
                      />
                    </>
                  ) : null}
                  {isLinearDetailMarker(focusedMarker) ? (
                    <PoiActionBar
                      isFavorite={favoriteMarkerIds.has(focusedMarker.id)}
                      marker={focusedMarker}
                      onPlanRoute={() => createRoutePlanDraft(focusedMarker)}
                      onSearchNearby={() => startNearbySearch(focusedMarker)}
                      onShare={() => void shareMarker(focusedMarker)}
                      onToggleFavorite={() => toggleFavoriteMarker(focusedMarker)}
                      status={poiActionStatus}
                      t={t}
                    />
                  ) : null}
                  {!isLinearDetailMarker(focusedMarker) && poiDetailTab === 'facilities' ? (
                    focusedSecondaryPois.length > 0 ? (
                      <div className="map-poi-related-list" aria-label={t('map.poi.relatedPlaces')}>
                        {focusedSecondaryPoiGroups.map((group) => (
                          <section className="map-poi-related-group" key={group.id}>
                            <h4>
                              <span>{formatSecondaryPoiGroupLabel(group.id, group.label, t)}</span>
                              <small>{t('map.poi.count', { count: group.items.length })}</small>
                            </h4>
                            <div className="map-poi-related-group-items">
                              {group.items.map((item) => (
                                <button
                                  className="map-poi-related-item"
                                  type="button"
                                  key={item.marker.id}
                                  onClick={() => focusMapMarker(item.marker)}
                                >
                                  <MarkerListIcon
                                    marker={item.marker}
                                    iconBaseUrl={markerIconBaseUrl}
                                  />
                                  <span>
                                    <strong>{item.childLabel}</strong>
                                    <small>
                                      {item.marker.categoryId
                                        ? (categoryById.get(item.marker.categoryId) ??
                                          getMarkerCategoryDisplayName(item.marker.categoryId, t))
                                        : t('map.poi.relatedPlaceFallback')}
                                    </small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : focusedParentPoi ? (
                      <div className="map-poi-related-list" aria-label={t('map.poi.parent')}>
                        <section className="map-poi-related-group">
                          <h4>
                            <span>{t('map.poi.parent')}</span>
                            <small>{t('map.poi.count', { count: 1 })}</small>
                          </h4>
                          <div className="map-poi-related-group-items">
                            <button
                              className="map-poi-related-item"
                              type="button"
                              onClick={() => focusMapMarker(focusedParentPoi.parent)}
                            >
                              <MarkerListIcon
                                marker={focusedParentPoi.parent}
                                iconBaseUrl={markerIconBaseUrl}
                              />
                              <span>
                                <strong>{formatMarkerDisplayName(focusedParentPoi.parent.label)}</strong>
                                <small>
                                  {focusedParentPoi.parent.categoryId
                                    ? (categoryById.get(focusedParentPoi.parent.categoryId) ??
                                      getMarkerCategoryDisplayName(
                                        focusedParentPoi.parent.categoryId,
                                        t,
                                      ))
                                    : t('map.poi.parentFallback')}
                                </small>
                              </span>
                            </button>
                          </div>
                        </section>
                      </div>
                    ) : (
                      <p>{focusedMarker.description ?? t('map.poi.noFacilities')}</p>
                    )
                  ) : null}
                </div>
              </>
            ) : null}
          </aside>
        ) : null}
      </aside>

      <div
        className="map-viewport"
        ref={viewportRef}
        aria-live="polite"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {visibleTiles ? (
          <div className="unmined-tile-stack" aria-hidden="true">
            {fadingTiles ? (
              <TileLayerView
                layer={fadingTiles}
                className="unmined-tile-layer is-fading"
                key={`tile-fading-${fadingTiles.zoom}`}
              />
            ) : null}
            <TileLayerView
              layer={visibleTiles}
              className="unmined-tile-layer is-active"
              key={`tile-active-${visibleTiles.zoom}`}
            />
          </div>
        ) : null}

        <div className="map-source-chip" title={dataSourceText}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {loadStatus === 'loading'
              ? 'progress_activity'
              : loadStatus === 'ready'
                ? 'map'
                : 'warning'}
          </span>
          <span>
            {loadStatus === 'loading'
              ? t('map.source.loading')
              : loadStatus === 'ready'
                ? t('map.source.objectCount', {
                    count: pointMarkers.length + endpointGroupMarkers.length + transitLineMarkers.length,
                  })
                : t('map.source.unavailable')}
          </span>
        </div>

        {loadStatus === 'ready' && roadRoutingStatus === 'loading' ? (
          <div className="map-routing-status" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              route
            </span>
            <span>{t('map.routingStatus.projecting')}</span>
          </div>
        ) : null}

        {poiCoordinatePickMode ? (
          <div className="map-coordinate-pick-hint" role="status">
            <span className="material-symbols-outlined" aria-hidden="true">
              add_location_alt
            </span>
            <span>{t('map.poiSubmit.pickHint')}</span>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setPoiCoordinatePickMode(false);
                setPoiSubmitDialogOpen(true);
                setPoiSubmitStatus('');
              }}
            >
              {t('map.poiSubmit.pickCancel')}
            </button>
          </div>
        ) : null}

        <div className="map-hud" aria-label={t('map.hud.aria')}>
          <div className="map-scale-control">
            <span
              className="map-scale-track"
              style={{ '--map-scale-width': `${scaleBarInfo.pixelWidth}px` } as CSSProperties}
              aria-hidden="true"
            />
            <span>{scaleBarInfo.label}</span>
          </div>
          <div className="map-coordinate-chip">
            <span className="material-symbols-outlined" aria-hidden="true">
              near_me
            </span>
            <span>
              {cursorWorld
                ? `X ${formatMapCoordinate(cursorWorld.x)} / Z ${formatMapCoordinate(cursorWorld.z)}`
                : t('map.hud.cursor')}
            </span>
          </div>
        </div>

        {hasMapOverlay ? (
          <div className="map-marker-layer" aria-label={t('map.overlay.aria')}>
            {visibleProjectedRoadTraces.length ? (
              <div className="map-road-trace-layer" aria-hidden="true">
                {visibleProjectedRoadTraces.map((trace) => (
                  <TraceLayerView
                    trace={trace}
                    kind="road"
                    key={trace.id}
                    title={t('map.overlay.roadTraceTitle', {
                      count: trace.pointCount,
                      name: trace.label,
                    })}
                  />
                ))}
              </div>
            ) : null}
            {visibleProjectedTransitTraces.length ? (
              <div className="map-transit-trace-layer" aria-hidden="true">
                {visibleProjectedTransitTraces.map((trace) => (
                  <TraceLayerView
                    trace={trace}
                    kind="transit"
                    key={trace.id}
                    title={t('map.overlay.transitTraceTitle', {
                      count: trace.pointCount,
                      name: trace.label,
                    })}
                  />
                ))}
              </div>
            ) : null}
            {selectedRouteTrace ? (
              <div className="map-route-trace-layer" aria-hidden="true">
                <TraceLayerView
                  trace={selectedRouteTrace}
                  kind="route"
                  title={t('map.route.traceTitle', {
                    title: selectedRouteOption?.title ?? t('map.route.optionFallback'),
                  })}
                />
                {selectedRouteTrace.labels?.map((label) => (
                  <span
                    className="map-route-road-label"
                    key={label.id}
                    style={
                      {
                        '--label-left': `${label.left}px`,
                        '--label-top': `${label.top}px`,
                        '--route-road-label-color': label.color ?? routeWalkTraceColor,
                      } as CSSProperties
                    }
                  >
                    {label.label}
                  </span>
                ))}
              </div>
            ) : null}
            {projectedGuideMarkers.map((marker) => (
              <div
                className={`map-guide-marker is-${marker.kind}`}
                key={marker.id}
                style={
                  {
                    '--marker-left': `${marker.left}px`,
                    '--marker-top': `${marker.top}px`,
                  } as CSSProperties
                }
                title={marker.label}
                aria-hidden="true"
              >
                {marker.kind === 'default-anchor' ? (
                  <span className="map-guide-marker-dot" />
                ) : (
                  <span className="map-guide-marker-pin">
                    <span className="material-symbols-outlined map-guide-marker-icon">
                      {marker.kind === 'route-destination' ? 'flag' : 'location_on'}
                    </span>
                  </span>
                )}
              </div>
            ))}
            {visibleProjectedLinearPois.map((marker) => {
              const sourceMarker = linearOverlaySource.find((item) => item.id === marker.id);
              const focusLinearMarker = () => {
                if (sourceMarker) {
                  handleMapMarkerActivate(sourceMarker);
                }
              };

              return (
                <div className="map-linear-poi" key={marker.id}>
                  {marker.endpoints.map((endpoint) => (
                    <button
                      className="map-linear-poi-endpoint"
                      type="button"
                      aria-label={t('map.overlay.viewMarker', { name: marker.label })}
                      key={endpoint.id}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={focusLinearMarker}
                      style={
                        {
                          '--linear-poi-left': `${endpoint.left}px`,
                          '--linear-poi-top': `${endpoint.top}px`,
                          '--linear-poi-color': marker.accentColor,
                        } as CSSProperties
                      }
                    />
                  ))}
                  {marker.showCenter ? (
                    <button
                      className={[
                        'map-linear-poi-center',
                        marker.showTextLabel ? 'has-label' : '',
                        marker.roadKind && marker.showTextLabel && !marker.iconUrl
                          ? 'is-road-label'
                          : '',
                        marker.isVerticalLabel ? 'is-vertical' : '',
                        marker.iconUrl || marker.symbolIcon ? 'has-icon' : '',
                        marker.id === focusedMarkerId ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={focusLinearMarker}
                      style={
                        {
                          '--linear-poi-left': `${marker.left}px`,
                          '--linear-poi-top': `${marker.top}px`,
                          '--linear-poi-color': marker.accentColor,
                        } as CSSProperties
                      }
                      title={t('map.overlay.linearPoiTitle', {
                        count: marker.endpointCount,
                        name: marker.label,
                      })}
                    >
                      {marker.iconUrl ? (
                        <img src={marker.iconUrl} alt="" draggable={false} />
                      ) : marker.symbolIcon ? (
                        <span
                          className="material-symbols-outlined map-linear-poi-symbol"
                          aria-hidden="true"
                        >
                          {marker.symbolIcon}
                        </span>
                      ) : null}
                      {marker.showTextLabel ? (
                        <span className="map-marker-label">{marker.label}</span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {visibleProjectedMarkers.map((marker) => (
              <button
                className={[
                  'map-marker-dot',
                  marker.showLabel || marker.id === focusedMarkerId ? 'has-label' : '',
                  !marker.iconUrl ? 'has-fallback-icon' : '',
                  marker.id === focusedMarkerId ? 'is-selected' : '',
                  marker.roadKind ? `is-${marker.roadKind}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                aria-label={t('map.overlay.viewMarker', { name: marker.label })}
                key={marker.id}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  const source = pointMarkers.find((item) => item.id === marker.id);
                  if (source) {
                    handleMapMarkerActivate(source);
                  }
                }}
                style={
                  {
                    '--marker-left': `${marker.left}px`,
                    '--marker-top': `${marker.top}px`,
                  } as CSSProperties
                }
                title={t('map.overlay.markerTitle', {
                  name: marker.label,
                  x: marker.x,
                  z: marker.z,
                })}
              >
                {marker.iconUrl ? <img src={marker.iconUrl} alt="" draggable={false} /> : null}
                <span className="material-symbols-outlined" aria-hidden="true">
                  {marker.symbolIcon ?? 'location_on'}
                </span>
                {marker.showLabel || marker.id === focusedMarkerId ? (
                  <span className="map-marker-label">{marker.label}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state map-empty">
            <span className="material-symbols-outlined" aria-hidden="true">
              map
            </span>
            <p>
              {loadStatus === 'loading'
                ? t('map.empty.loading')
                : t('map.empty.unavailable')}
            </p>
          </div>
        )}
      </div>

      <div className="map-toolbar">
        <button
          className="icon-button"
          type="button"
          aria-label={t('map.toolbar.zoomIn')}
          onClick={() => zoomBy(0.5)}
        >
          <span className="material-symbols-outlined">add</span>
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={t('map.toolbar.zoomOut')}
          onClick={() => zoomBy(-0.5)}
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={t('map.toolbar.reset')}
          onClick={resetView}
        >
          <span className="material-symbols-outlined">my_location</span>
        </button>
        <button
          className={layerPanelOpen ? 'icon-button is-active' : 'icon-button'}
          type="button"
          aria-label={t('map.layer.open')}
          aria-expanded={layerPanelOpen}
          aria-controls="map-layer-panel"
          onClick={() => setLayerPanelOpen((current) => !current)}
        >
          <span className="material-symbols-outlined">layers</span>
        </button>
      </div>

      {layerPanelOpen ? (
        <aside className="map-layer-panel" id="map-layer-panel" aria-label={t('map.layer.aria')}>
          <div className="map-browse-mode-control" role="tablist" aria-label={t('map.layer.modeAria')}>
            {mapBrowseModes.map((mode) => (
              <button
                className={browseMode === mode.value ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={browseMode === mode.value}
                key={mode.value}
                onClick={() => setBrowseMode(mode.value)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {mode.icon}
                </span>
                <span>{t(mode.labelKey)}</span>
              </button>
            ))}
          </div>
          {browseMode === 'satellite' && tileProviders.length > 1 ? (
            <label className="map-tile-provider-select">
              <span className="material-symbols-outlined" aria-hidden="true">
                map
              </span>
              <span>
                <strong>{t('map.layer.tileProvider')}</strong>
                <select
                  value={activeTileProvider?.id ?? ''}
                  onChange={(event) => updateSelectedTileProviderId(event.currentTarget.value)}
                  aria-label={t('map.layer.tileProviderAria')}
                >
                  {tileProviders.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {getLocalizedTileProviderName(provider, t)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          ) : null}
          <p className="map-layer-note">
            {browseMode === 'satellite'
              ? t('map.layer.noteSatellite', {
                  name: activeTileProviderName ?? activeTileProvider?.name ?? t('map.source.tileFallback'),
                })
              : browseMode === 'road-network'
                ? t('map.layer.noteRoadNetwork')
                : t('map.layer.noteTraffic')}
          </p>
          <div className="map-layer-option-list">
            <label className="map-layer-toggle">
              <span className="material-symbols-outlined" aria-hidden="true">
                location_on
              </span>
              <span>
                <strong>{t('map.layer.markers')}</strong>
                <small>
                  {markersVisible ? t('map.layer.markersVisible') : t('map.layer.markersHidden')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={markersVisible}
                onChange={(event) => setMarkersVisible(event.currentTarget.checked)}
              />
            </label>
            <label className="map-layer-toggle">
              <span className="material-symbols-outlined" aria-hidden="true">
                route
              </span>
              <span>
                <strong>{t('map.layer.linearFeatures')}</strong>
                <small>
                  {linearFeaturesVisible
                    ? t('map.layer.linearFeaturesVisible')
                    : t('map.layer.linearFeaturesHidden')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={linearFeaturesVisible}
                onChange={(event) => setLinearFeaturesVisible(event.currentTarget.checked)}
              />
            </label>
          </div>
          <button
            className="secondary-action-button is-primary"
            type="button"
            disabled={publicPoiCategories.length === 0}
            onClick={() => setPoiSubmitDialogOpen(true)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              add_location_alt
            </span>
            <span>{t('map.layer.submitPoi')}</span>
          </button>
          {poiSubmitStatus ? <p className="map-source-note">{poiSubmitStatus}</p> : null}
        </aside>
      ) : null}
      {poiSubmitDialogOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setPoiSubmitDialogOpen(false)}
        >
          <section
            className="modal-panel map-poi-submit-modal"
            aria-labelledby="map-poi-submit-title"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h2 id="map-poi-submit-title">{t('map.poiSubmit.title')}</h2>
              <button
                className="icon-action-button"
                type="button"
                onClick={() => setPoiSubmitDialogOpen(false)}
                aria-label={t('map.poiSubmit.close')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <form className="map-poi-submit-form" onSubmit={submitPoi}>
              <label>
                <span>{t('map.poiSubmit.name')}</span>
                <input
                  autoFocus
                  value={poiTitle}
                  onChange={(event) => setPoiTitle(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.namePlaceholder')}
                  aria-label={t('map.poiSubmit.name')}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.category')}</span>
                <select
                  value={poiCategoryId}
                  onChange={(event) => setPoiCategoryId(event.currentTarget.value)}
                  aria-label={t('map.poiSubmit.category')}
                >
                  {publicPoiCategories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('map.poiSubmit.description')}</span>
                <textarea
                  value={poiDescription}
                  onChange={(event) => setPoiDescription(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.descriptionPlaceholder')}
                  aria-label={t('map.poiSubmit.description')}
                  maxLength={1000}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.href')}</span>
                <input
                  type="url"
                  value={poiHref}
                  onChange={(event) => setPoiHref(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.hrefPlaceholder')}
                  aria-label={t('map.poiSubmit.href')}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.imageFile')}</span>
                <input
                  key={poiImageFileInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                  onChange={(event) => setPoiImageFile(event.currentTarget.files?.[0] ?? null)}
                  aria-label={t('map.poiSubmit.imageFile')}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.imageUrl')}</span>
                <input
                  type="url"
                  value={poiImageUrl}
                  onChange={(event) => setPoiImageUrl(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.imageUrlPlaceholder')}
                  aria-label={t('map.poiSubmit.imageUrl')}
                />
              </label>
              <div className="map-poi-coordinate-row">
                <label>
                  <span>{t('map.poiSubmit.x')}</span>
                  <input
                    type="number"
                    value={poiX}
                    onChange={(event) => setPoiX(event.currentTarget.value)}
                    placeholder="X"
                    aria-label={t('map.poiSubmit.x')}
                  />
                </label>
                <label>
                  <span>{t('map.poiSubmit.z')}</span>
                  <input
                    type="number"
                    value={poiZ}
                    onChange={(event) => setPoiZ(event.currentTarget.value)}
                    placeholder="Z"
                    aria-label={t('map.poiSubmit.z')}
                  />
                </label>
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={beginPoiCoordinatePick}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    add_location_alt
                  </span>
                  <span>{t('map.poiSubmit.pickOnMap')}</span>
                </button>
              </div>
              <button
                className="secondary-action-button is-primary"
                type="submit"
                disabled={poiSubmitBusy || publicPoiCategories.length === 0}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload
                </span>
                <span>{poiSubmitBusy ? t('map.poiSubmit.submitting') : t('map.poiSubmit.submit')}</span>
              </button>
            </form>
            {poiSubmitStatus ? <p className="map-source-note">{poiSubmitStatus}</p> : null}
          </section>
        </div>
      ) : null}
      {shareTarget ? (
        <MapShareDialog
          locale={locale}
          target={shareTarget}
          t={t}
          onClose={() => setShareTarget(null)}
          onComplete={setShareActionStatus}
        />
      ) : null}
      {shareActionStatus ? (
        <div className="map-toast" role="status">
          {shareActionStatus}
        </div>
      ) : null}
      <MapStageLegal />
    </section>
  );
}

function MapShareDialog({
  locale,
  target,
  t,
  onClose,
  onComplete,
}: Readonly<{
  locale: LocaleCode;
  target: MapShareTarget;
  t: Translate;
  onClose: () => void;
  onComplete: (status: string) => void;
}>) {
  const previewRef = useRef<HTMLElement | null>(null);
  const [busyMode, setBusyMode] = useState<MapShareMode | null>(null);
  const payload = useMemo(() => buildMapSharePayload(target, t), [target, t]);
  const useWordmarkLogo = locale !== 'en';

  const performShare = async (mode: MapShareMode) => {
    setBusyMode(mode);

    try {
      const status = await runMapShareAction({
        mode,
        payload,
        previewElement: previewRef.current,
        t,
      });
      onComplete(status);
      onClose();
    } catch {
      onComplete(t('map.share.unavailable'));
    } finally {
      setBusyMode(null);
    }
  };

  return (
    <div className="modal-backdrop map-share-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-panel map-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-share-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="map-share-title">{t('map.share.title')}</h2>
          <button
            className="icon-action-button"
            type="button"
            onClick={onClose}
            aria-label={t('map.share.close')}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <article
          className="map-share-preview"
          ref={previewRef}
          style={{ '--map-share-color': payload.color } as CSSProperties}
        >
          <div className="map-share-preview-heading">
            <span className="material-symbols-outlined map-share-preview-icon" aria-hidden="true">
              {payload.icon}
            </span>
            <span>
              <small>{payload.eyebrow}</small>
              <strong>{payload.title}</strong>
            </span>
          </div>
          {payload.meta.length > 0 ? (
            <div className="map-share-preview-meta">
              {payload.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          ) : null}
          {payload.steps.length > 0 ? (
            <ol className="map-route-step-timeline map-share-preview-steps">
              {payload.steps.map((step, index) => {
                const markerIcon = getRouteShareStepMarkerIcon(step);

                return (
                  <li
                    className={`is-${step.kind}${step.role ? ` is-${step.role}` : ''}`}
                    key={`${step.kind}-${step.label}-${index}`}
                    style={{ '--route-step-color': step.color ?? payload.color } as CSSProperties}
                  >
                    <span className="map-route-step-marker" aria-hidden="true">
                      {markerIcon ? (
                        <span className="material-symbols-outlined">{markerIcon}</span>
                      ) : (
                        getRouteStepMarkerText(step, t)
                      )}
                    </span>
                    <span className="map-route-step-content">
                      <span className="map-route-step-main">
                        <span className="map-route-step-label">{step.label}</span>
                      </span>
                      {step.kind === 'walk' && step.details?.length ? (
                        <ul className="map-route-step-detail-list">
                          {step.details.map((detail, detailIndex) => (
                            <li key={`${step.kind}-${step.label}-detail-${detailIndex}`}>
                              <span
                                className="material-symbols-outlined map-share-detail-symbol"
                                aria-hidden="true"
                              >
                                {detail.icon}
                              </span>
                              <span
                                className={
                                  detail.kind
                                    ? `map-route-step-detail-label is-${detail.kind}`
                                    : 'map-route-step-detail-label'
                                }
                              >
                                {formatShareRouteDetailLabel(detail, t)}
                              </span>
                              {detail.meta ? <small>{detail.meta}</small> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <footer className="map-share-preview-footer">
            <span>{t('map.share.footerPrefix')}</span>
            {useWordmarkLogo ? (
              <img src={appPath('/icons/yct-logo-wordmark.svg')} alt="雨城通" />
            ) : (
              <span className="map-share-preview-footer-brand">
                <img src={appPath('/icons/yct-logo.svg')} alt="" aria-hidden="true" />
                <strong>Yuchengtong</strong>
              </span>
            )}
            <small>{t('map.share.footerDisclaimer')}</small>
          </footer>
          <p className="map-share-preview-url">{payload.url}</p>
        </article>
        <div className="map-share-actions" aria-label={t('map.share.actions')}>
          {mapShareModes.map((mode) => (
            <button
              className={mode === 'image' ? 'secondary-action-button is-primary' : 'secondary-action-button'}
              type="button"
              key={mode}
              disabled={busyMode !== null}
              onClick={() => void performShare(mode)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {mapShareModeIcons[mode]}
              </span>
              <span>{busyMode === mode ? t('map.share.processing') : t(mapShareModeLabelKeys[mode])}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

type PointMarker = MapMarkerSnapshot['markers'][number] & {
  geometry: Extract<MapMarkerSnapshot['markers'][number]['geometry'], { type: 'Point' }>;
};

type EndpointGroupMarker = MapMarkerSnapshot['markers'][number] & {
  geometry: Extract<MapMarkerSnapshot['markers'][number]['geometry'], { type: 'MultiPoint' }>;
};

type TransitLineMarker = EndpointGroupMarker & {
  categoryId: 'transit-line';
};

type SidebarMarker = PointMarker | EndpointGroupMarker;

type CenterableMarker = PointMarker | EndpointGroupMarker | TransitLineMarker;

function isCenterableMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is CenterableMarker {
  return marker.geometry.type === 'Point' || marker.geometry.type === 'MultiPoint';
}

function MapStageLegal() {
  const { t } = useI18n();

  return (
    <footer className="map-legal" aria-label={t('siteLegal.aria')}>
      <p>{t('siteLegal.disclaimer')}</p>
      <p>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          {t('siteLegal.icp')}
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=21100502000117"
          target="_blank"
          rel="noreferrer"
        >
          {t('siteLegal.police')}
        </a>
      </p>
    </footer>
  );
}

function TileLayerView({ layer, className }: Readonly<{ layer: TileLayer; className: string }>) {
  return (
    <div className={className}>
      {layer.tiles.map((tile) => (
        <img
          className="unmined-tile"
          src={tile.url}
          alt=""
          draggable={false}
          key={tile.id}
          style={
            {
              '--tile-left': `${tile.left}px`,
              '--tile-top': `${tile.top}px`,
              '--tile-display-size': `${tile.displaySize}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function TraceLayerView({
  trace,
  kind,
  title,
}: Readonly<{ trace: ProjectedRoadTrace; kind: 'road' | 'transit' | 'route'; title: string }>) {
  const pathClassName =
    kind === 'road'
      ? [
          'map-road-trace',
          trace.roadKind === 'highway' ? 'is-highway' : '',
          trace.isSelected ? 'is-selected' : '',
          trace.isMuted ? 'is-muted' : '',
        ]
          .filter(Boolean)
          .join(' ')
      : kind === 'route'
        ? 'map-route-trace is-selected'
        : ['map-transit-trace', trace.isSelected ? 'is-selected' : '']
            .filter(Boolean)
            .join(' ');

  return (
    <svg
      className="map-trace-block"
      viewBox={trace.viewBox}
      preserveAspectRatio="none"
      style={
        {
          '--trace-left': `${trace.left}px`,
          '--trace-top': `${trace.top}px`,
          '--trace-width': `${trace.width}px`,
          '--trace-height': `${trace.height}px`,
          '--road-trace-color': trace.accentColor,
          '--transit-trace-color': trace.accentColor,
          '--route-trace-color': trace.accentColor,
        } as CSSProperties
      }
    >
      {kind === 'route' && trace.segments?.length ? (
        trace.segments.map((segment, index) => (
          <path
            className={pathClassName}
            d={segment.path}
            key={`${trace.id}-segment-${index}`}
            style={{ stroke: segment.color }}
          >
            <title>{title}</title>
          </path>
        ))
      ) : (
        <path className={pathClassName} d={trace.path} style={{ stroke: trace.accentColor }}>
          <title>{title}</title>
        </path>
      )}
    </svg>
  );
}

function TransitLineMapDetail({
  line,
  lineColor,
  t,
}: Readonly<{ line: TransitOverviewLine; lineColor?: string; t: Translate }>) {
  const [direction, setDirection] = useState<'forward' | 'reverse'>('forward');
  const stationStops = getDirectionalLineStops(line, direction);
  const firstStationName = stationStops[0]?.stationName ?? line.firstStationName;
  const lastStationName =
    stationStops[stationStops.length - 1]?.stationName ?? line.lastStationName;
  const forwardDirectionName =
    line.lastStationName ?? line.stationNames.at(-1) ?? t('lineDetail.lastStation');
  const reverseDirectionName =
    line.firstStationName ?? line.stationNames[0] ?? t('lineDetail.firstStation');

  return (
    <div
      className="map-linear-detail"
      style={
        {
          '--map-line-detail-color': lineColor ?? line.color ?? 'var(--yct-color-primary)',
        } as CSSProperties
      }
    >
      <dl>
        <div>
          <dt>{t('lineDetail.firstLast')}</dt>
          <dd>{formatTransitLineTime(line, t)}</dd>
        </div>
        <div>
          <dt>{t('lineDetail.operator')}</dt>
          <dd>{line.operator ?? t('lineDetail.toBeAdded')}</dd>
        </div>
        <div>
          <dt>{t('map.lineDetail.fare')}</dt>
          <dd>{line.fare ?? t('lineDetail.toBeAdded')}</dd>
        </div>
        <div>
          <dt>{t('map.lineDetail.stations')}</dt>
          <dd>
            {firstStationName && lastStationName
              ? `${firstStationName} → ${lastStationName}`
              : t('lineDetail.extra.stations', { count: stationStops.length })}
          </dd>
        </div>
      </dl>
      <div
        className="map-line-direction-switch"
        role="tablist"
        aria-label={t('lineDetail.directionAria')}
      >
        <button
          className={direction === 'forward' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          onClick={() => setDirection('forward')}
        >
          {t('lineDetail.directionTo', {
            station: formatMarkerDisplayName(forwardDirectionName),
          })}
        </button>
        <button
          className={direction === 'reverse' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={direction === 'reverse'}
          onClick={() => setDirection('reverse')}
        >
          {t('lineDetail.directionTo', {
            station: formatMarkerDisplayName(reverseDirectionName),
          })}
        </button>
      </div>
      {stationStops.length > 0 ? (
        <ol className="map-line-station-list">
          {stationStops.map((stop, index) => (
            <li key={`${stop.stationName}-${stop.sequence}-${index}`}>
              <span className="map-line-station-node" aria-hidden="true" />
              <span>
                {formatMarkerDisplayName(stop.stationName)}
                {stop.oneWay ? (
                  <small>{formatTransitStopOneWayLabel(stop.oneWay, t)}</small>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('lineDetail.stationListEmpty')}</p>
      )}
    </div>
  );
}

function RoadMapDetail({ marker, t }: Readonly<{ marker: EndpointGroupMarker; t: Translate }>) {
  return (
    <div className="map-linear-detail">
      <p>{t('map.roadDetail.description')}</p>
      <dl>
        <div>
          <dt>{t('map.roadDetail.endpointCount')}</dt>
          <dd>
            {t('map.roadDetail.endpointCountValue', {
              count: marker.geometry.coordinates.length,
            })}
          </dd>
        </div>
        <div>
          <dt>{t('map.roadDetail.traceStatus')}</dt>
          <dd>{t('map.roadDetail.traceHighlighted')}</dd>
        </div>
      </dl>
    </div>
  );
}

function RoutePlanDraftCard({
  draft,
  t,
  collapsed,
  editingEndpoint,
  enabledModes,
  endpointCandidates,
  endpointQuery,
  options,
  status,
  selectedOptionId,
  iconBaseUrl,
  onBeginEndpointEdit,
  onClear,
  onEndpointQueryChange,
  onSetAllModes,
  onSelectOption,
  onSelectEndpointCandidate,
  onShare,
  onSwapEndpoints,
  onToggleCollapsed,
  onToggleMode,
  onUseMapCenter,
}: Readonly<{
  draft: RoutePlanDraft;
  t: Translate;
  collapsed: boolean;
  editingEndpoint: RouteEndpointKind | null;
  enabledModes: EnabledRouteTransportModes;
  endpointCandidates: CenterableMarker[];
  endpointQuery: string;
  options: RoutePlanOption[];
  status: RoutePlanStatus;
  selectedOptionId?: string;
  iconBaseUrl: string;
  onBeginEndpointEdit: (endpoint: RouteEndpointKind) => void;
  onClear: () => void;
  onEndpointQueryChange: (value: string) => void;
  onSetAllModes: (enabled: boolean) => void;
  onSelectOption: (optionId: string) => void;
  onSelectEndpointCandidate: (endpoint: RouteEndpointKind, marker: CenterableMarker) => void;
  onShare: () => void;
  onSwapEndpoints: () => void;
  onToggleCollapsed: () => void;
  onToggleMode: (mode: RouteTransportMode) => void;
  onUseMapCenter: () => void;
}>) {
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? options[0];
  const hasEnabledModes = routeTransportModeOptions.some((mode) => enabledModes[mode.mode]);
  const allModesEnabled = routeTransportModeOptions.every((mode) => enabledModes[mode.mode]);
  const isPlanning = status === 'loading' && !editingEndpoint;
  const cardClassName = [
    'map-route-plan-card',
    collapsed ? 'is-collapsed' : '',
    isPlanning ? 'is-loading' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const [modeListExpanded, setModeListExpanded] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => new Set());
  const visibleRouteTransportModes = modeListExpanded
    ? routeTransportModeOptions
    : routeTransportModeOptions.slice(0, 3);
  const collapsibleModeCount = Math.max(routeTransportModeOptions.length - 3, 0);
  const collapsedModesHaveEnabled = routeTransportModeOptions
    .slice(3)
    .some((mode) => enabledModes[mode.mode]);

  useEffect(() => {
    setExpandedStepIds(new Set());
  }, [selectedOption?.id]);

  const toggleRouteStepDetails = (stepId: string) => {
    setExpandedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <section
      className={cardClassName}
      aria-label={t('map.route.aria')}
      aria-busy={isPlanning}
    >
      <div className="map-route-plan-top">
        <div className="map-route-endpoint-list">
          <div className="map-route-endpoint-row">
            <span className="material-symbols-outlined map-route-endpoint-icon is-origin" aria-hidden="true">
              location_on
            </span>
            {editingEndpoint === 'origin' ? (
              <input
                autoFocus
                value={endpointQuery}
                onChange={(event) => onEndpointQueryChange(event.currentTarget.value)}
                placeholder={draft.originLabel}
                aria-label={t('map.route.input.origin')}
              />
            ) : (
              <button
                className="map-route-endpoint-value"
                type="button"
                onClick={() => onBeginEndpointEdit('origin')}
              >
                {draft.originLabel}
              </button>
            )}
            <button type="button" onClick={() => onBeginEndpointEdit('origin')}>
              {t('map.route.edit')}
            </button>
          </div>
          <div className="map-route-endpoint-row">
            <span
              className="material-symbols-outlined map-route-endpoint-icon is-destination"
              aria-hidden="true"
            >
              flag
            </span>
            {editingEndpoint === 'destination' ? (
              <input
                autoFocus
                value={endpointQuery}
                onChange={(event) => onEndpointQueryChange(event.currentTarget.value)}
                placeholder={draft.destinationLabel}
                aria-label={t('map.route.input.destination')}
              />
            ) : (
              <button
                className="map-route-endpoint-value"
                type="button"
                onClick={() => onBeginEndpointEdit('destination')}
              >
                {draft.destinationLabel}
              </button>
            )}
            <button type="button" onClick={() => onBeginEndpointEdit('destination')}>
              {t('map.route.edit')}
            </button>
          </div>
        </div>
        <div className="map-route-plan-header-actions">
          <button
            type="button"
            aria-label={collapsed ? t('map.route.expand') : t('map.route.collapse')}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {collapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
            </span>
          </button>
          <button type="button" aria-label={t('map.route.close')} onClick={onClear}>
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
          <button type="button" aria-label={t('map.route.swap')} onClick={onSwapEndpoints}>
            <span className="material-symbols-outlined" aria-hidden="true">
              swap_vert
            </span>
          </button>
          <button type="button" aria-label={t('map.route.share')} onClick={onShare}>
            <span className="material-symbols-outlined" aria-hidden="true">
              share
            </span>
          </button>
        </div>
      </div>
      {!collapsed ? (
        <>
          {isPlanning ? (
            <div className="map-route-plan-loading" role="status">
              <span className="material-symbols-outlined" aria-hidden="true">
                progress_activity
              </span>
              <span>{t('map.route.loadingTitle')}</span>
              <small>{t('map.route.loadingDetail')}</small>
            </div>
          ) : null}
          {editingEndpoint ? (
            <div className="map-route-endpoint-candidates" aria-label={t('map.route.endpointCandidatesAria')}>
              <div className="map-route-endpoint-candidate-heading">
                <span>
                  {editingEndpoint === 'origin'
                    ? t('map.route.selectOrigin')
                    : t('map.route.selectDestination')}
                </span>
                {editingEndpoint === 'origin' ? (
                  <button type="button" onClick={onUseMapCenter}>
                    {t('map.route.useMapCenter')}
                  </button>
                ) : null}
              </div>
              <div className="map-route-endpoint-candidate-list">
                {endpointCandidates.length > 0 ? (
                  endpointCandidates.map((marker) => (
                    <button
                      className="map-route-endpoint-candidate"
                      type="button"
                      key={marker.id}
                      onClick={() => onSelectEndpointCandidate(editingEndpoint, marker)}
                    >
                      <MarkerListIcon marker={marker} iconBaseUrl={iconBaseUrl} />
                      <span>{formatMarkerDisplayName(marker.label)}</span>
                      <small>{formatMarkerDetail(marker, t)}</small>
                    </button>
                  ))
                ) : (
                  <p className="map-route-plan-note">{t('map.route.noEndpointCandidates')}</p>
                )}
              </div>
            </div>
          ) : null}
          {!editingEndpoint ? (
            <>
              <div
                className={
                  modeListExpanded
                    ? 'map-route-mode-toggle-list is-expanded'
                    : 'map-route-mode-toggle-list is-collapsed'
                }
                aria-label={t('map.route.modeAria')}
              >
                <button
                  className={allModesEnabled ? 'is-active' : ''}
                  type="button"
                  aria-pressed={allModesEnabled}
                  onClick={() => onSetAllModes(!allModesEnabled)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {allModesEnabled ? 'check_box' : 'select_check_box'}
                  </span>
                  <span>{t('map.route.mode.all')}</span>
                </button>
                {visibleRouteTransportModes.map((mode) => (
                  <button
                    className={enabledModes[mode.mode] ? 'is-active' : ''}
                    type="button"
                    key={mode.mode}
                    aria-pressed={enabledModes[mode.mode]}
                    onClick={() => onToggleMode(mode.mode)}
                    style={{ '--route-mode-color': mode.color } as CSSProperties}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {mode.icon}
                    </span>
                    <span>{getRouteTransportModeLabel(mode.mode, t)}</span>
                  </button>
                ))}
                {collapsibleModeCount > 0 ? (
                  <button
                    className={
                      collapsedModesHaveEnabled
                        ? 'map-route-mode-toggle-more is-active'
                        : 'map-route-mode-toggle-more'
                    }
                    type="button"
                    aria-expanded={modeListExpanded}
                    onClick={() => setModeListExpanded((value) => !value)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {modeListExpanded ? 'keyboard_arrow_up' : 'more_horiz'}
                    </span>
                    <span>
                      {modeListExpanded
                        ? t('map.route.mode.collapse')
                        : t('map.route.mode.more', { count: collapsibleModeCount })}
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="map-route-option-list" aria-label={t('map.route.optionsAria')}>
                {status === 'loading' ? (
                  <p className="map-route-plan-note">{t('map.route.planning')}</p>
                ) : options.length > 0 ? (
                  options.map((option, index) => {
                    const isSelected = option.id === selectedOption?.id;
                    const optionBadges = getRouteOptionBadges(option, options, index, t);
                    return (
                      <article
                        className={
                          isSelected ? 'map-route-option-card is-selected' : 'map-route-option-card'
                        }
                        key={option.id}
                        style={{ '--route-option-color': option.color } as CSSProperties}
                      >
                        <button
                          className="map-route-option-summary"
                          type="button"
                          onClick={() => onSelectOption(option.id)}
                          aria-expanded={isSelected}
                        >
                          <span
                            className="material-symbols-outlined map-route-option-icon"
                            aria-hidden="true"
                          >
                            schedule
                          </span>
                          <strong>{formatRoutePlanMinutes(option.estimatedMinutes, t)}</strong>
                          <span className="map-route-option-distance">
                            <span className="material-symbols-outlined" aria-hidden="true">
                              directions_walk
                            </span>
                            {formatRoutePlanDistance(option.walkingDistance, t)}
                          </span>
                          <span className="map-route-option-badges" aria-label={t('map.route.featuresAria')}>
                            {optionBadges.map((badge) => (
                              <span className="map-route-option-badge" key={badge}>
                                {badge}
                              </span>
                            ))}
                          </span>
                          <span
                            className="material-symbols-outlined map-route-option-expand"
                            aria-hidden="true"
                          >
                            {isSelected ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                          </span>
                        </button>
                        <p className="map-route-option-copy">
                          <span
                            className="material-symbols-outlined map-route-option-type-icon"
                            aria-hidden="true"
                          >
                            {option.icon}
                          </span>
                          <span>
                            {option.title} · {option.summary}
                          </span>
                        </p>
                        {isSelected ? (
                          <ol className="map-route-step-timeline" aria-label={t('map.route.stepsAria')}>
                            {option.steps.map((step, stepIndex) => {
                              const stepId = `${option.id}-${stepIndex}`;
                              const stepClassName = [
                                `is-${step.kind}`,
                                step.role ? `is-${step.role}` : '',
                              ]
                                .filter(Boolean)
                                .join(' ');
                              const canExpand =
                                (step.kind === 'walk' ||
                                  step.kind === 'transit' ||
                                  step.kind === 'transfer') &&
                                Boolean(step.details?.length);
                              const isExpanded = expandedStepIds.has(stepId);
                              return (
                                <li
                                  className={stepClassName}
                                  key={stepId}
                                  style={
                                    {
                                      '--route-step-color': step.color ?? option.color,
                                    } as CSSProperties
                                  }
                                >
                                  <span className="map-route-step-marker" aria-hidden="true">
                                    {step.icon ? (
                                      <span className="material-symbols-outlined">{step.icon}</span>
                                    ) : (
                                      getRouteStepMarkerText(step, t)
                                    )}
                                  </span>
                                  <span className="map-route-step-content">
                                    <span className="map-route-step-main">
                                      <span className="map-route-step-label">{step.label}</span>
                                      {canExpand ? (
                                        <button
                                          className="map-route-step-expand"
                                          type="button"
                                          aria-expanded={isExpanded}
                                          aria-label={
                                            isExpanded
                                              ? t('map.route.stepDetails.collapse')
                                              : t('map.route.stepDetails.expand')
                                          }
                                          onClick={() => toggleRouteStepDetails(stepId)}
                                        >
                                          <span className="material-symbols-outlined" aria-hidden="true">
                                            {isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                                          </span>
                                        </button>
                                      ) : null}
                                    </span>
                                    {canExpand && isExpanded ? (
                                      <ul className="map-route-step-detail-list">
                                        {step.details?.map((detail, detailIndex) => (
                                          <li key={`${stepId}-detail-${detailIndex}`}>
                                            <span className="material-symbols-outlined" aria-hidden="true">
                                              {detail.icon}
                                            </span>
                                            <span
                                              className={
                                                detail.kind
                                                  ? `map-route-step-detail-label is-${detail.kind}`
                                                  : 'map-route-step-detail-label'
                                              }
                                            >
                                              {detail.label}
                                            </span>
                                            {detail.meta ? <small>{detail.meta}</small> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        ) : null}
                      </article>
                    );
                  })
                ) : (
                  <p className="map-route-plan-note">
                    {hasEnabledModes ? t('map.route.noOptions') : t('map.route.noModes')}
                  </p>
                )}
              </div>
              {status === 'loading' ? (
                <p className="map-route-plan-note">{t('map.route.loadingNote')}</p>
              ) : selectedOption ? (
                <p className="map-route-plan-note">{selectedOption.note}</p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function buildRoutePlanOptions(input: {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  pointMarkers: PointMarker[];
  roadGraph?: RoadRouteGraph;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>;
  t: Translate;
  transitLines: TransitOverviewLine[];
  modeProfiles: TransitModeProfileForMap[];
}): RoutePlanOption[] {
  const draft = resolveRoutePlanDraftAccessPoints(
    input.draft,
    input.secondaryPoiIndex,
    input.secondaryPoiParentIndex,
  );
  const options: RoutePlanOption[] = [];
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
  const routeOptionLimit = getRouteOptionLimit(input.enabledModes);
  const roadGraph = input.roadGraph;
  const routeCache = createRoutePlanningCache();
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    input.markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    input.markerRoadAccessIndex,
  );

  if (input.enabledModes.walk) {
    const directWalkAccessOptions = {
      destinationAccessCandidates: destinationRoadAccessCandidates,
      originAccessCandidates: originRoadAccessCandidates,
    };
    const directWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
    );
    const directDistance = directWalkRoute.distance + endpointAccessDistance;
    const directMinutes =
      estimateResolvedWalkRouteMinutes(directWalkRoute) +
      estimateRouteMinutes(endpointAccessDistance, 72);
    const directCoordinates = buildRouteTraceCoordinates(draft, directWalkRoute.coordinates);
    const directRoadLabels = createRouteRoadLabelsFromSegments(directWalkRoute.roadSegments);
    options.push({
      id: 'walk-direct',
      title: input.t('map.route.walkDirect'),
      summary: `${formatRoutePlanDistance(directDistance, input.t)} · ${input.t(
        directWalkRoute.usesRoadGraph
          ? 'map.route.summary.roadEstimate'
          : 'map.route.summary.directEstimate',
      )}`,
      icon: 'directions_walk',
      color:
        routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
        'var(--yct-color-text-secondary)',
      coordinates: directCoordinates,
      traceSegments: [createRouteTraceSegment('walk', directCoordinates)],
      roadLabels: directRoadLabels,
      markerIds: getRouteEndpointMarkerIds(draft),
      estimatedDistance: directDistance,
      estimatedMinutes: directMinutes,
      transferCount: 0,
      walkingDistance: directDistance,
      steps: [
        createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
        ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
        createRouteWalkStep(
          input.t(
            directWalkRoute.usesRoadGraph
              ? 'map.route.walkRoadWithDistance'
              : 'map.route.walkWithDistance',
            {
              distance: formatRoutePlanDistance(directWalkRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(
                  directWalkRoute.distance,
                  directWalkRoute.usesRoadGraph ? 64 : 72,
                ),
                input.t,
              ),
            },
          ),
          directWalkRoute.details,
        ),
        ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
        createRoutePlaceStep(
          input.t('map.route.arrive', { name: draft.destinationLabel }),
          'destination',
        ),
      ],
      note: directWalkRoute.usesRoadGraph
        ? input.t('map.route.walkNote.road')
        : input.t('map.route.walkNote.direct'),
    });

    const fewerTurnWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
      'fewer-turns',
    );
    if (shouldAddFewerTurnWalkRoute(directWalkRoute, fewerTurnWalkRoute)) {
      const fewerTurnDistance = fewerTurnWalkRoute.distance + endpointAccessDistance;
      const fewerTurnMinutes =
        estimateResolvedWalkRouteMinutes(fewerTurnWalkRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const fewerTurnCoordinates = buildRouteTraceCoordinates(draft, fewerTurnWalkRoute.coordinates);
      options.push({
        id: 'walk-fewer-turns',
        title: input.t('map.route.walkFewerTurns'),
        summary: `${formatRoutePlanDistance(fewerTurnDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'conversion_path',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates: fewerTurnCoordinates,
        traceSegments: [createRouteTraceSegment('walk', fewerTurnCoordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(fewerTurnWalkRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        estimatedDistance: fewerTurnDistance,
        estimatedMinutes: fewerTurnMinutes,
        transferCount: 0,
        walkingDistance: fewerTurnDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(fewerTurnWalkRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(fewerTurnWalkRoute.distance, 64),
                input.t,
              ),
            }),
            fewerTurnWalkRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.walkNote.road'),
      });
    }
  }

  options.push(...buildTransitRoutePlanOptions({ ...input, draft, roadGraph, routeCache }));

  return options
    .sort(
      (left, right) =>
        left.estimatedMinutes - right.estimatedMinutes ||
        left.estimatedDistance - right.estimatedDistance ||
        left.title.localeCompare(right.title, 'zh-CN'),
    )
    .slice(0, routeOptionLimit);
}

function createRoutePlanningCache(): RoutePlanningCache {
  return {
    accessCandidatesByPair: new Map(),
    pathByNodePair: new Map(),
    roadRouteByPair: new Map(),
  };
}

function shouldAddFewerTurnWalkRoute(
  directRoute: ResolvedWalkRoute,
  fewerTurnRoute: ResolvedWalkRoute,
): boolean {
  if (!directRoute.usesRoadGraph || !fewerTurnRoute.usesRoadGraph) {
    return false;
  }

  if (areCoordinateChainsEquivalent(directRoute.coordinates, fewerTurnRoute.coordinates)) {
    return false;
  }

  const directTurns = countRoadRouteTurns(directRoute.roadSegments ?? []);
  const fewerTurns = countRoadRouteTurns(fewerTurnRoute.roadSegments ?? []);
  if (fewerTurns >= directTurns) {
    return false;
  }

  return fewerTurnRoute.distance <= directRoute.distance * 1.55 + 240;
}

function areCoordinateChainsEquivalent(
  left: Array<[number, number]>,
  right: Array<[number, number]>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((coordinate, index) => {
    const other = right[index];
    return Boolean(other && getCoordinateDistance(coordinate, other) < 0.5);
  });
}

function getRouteOptionLimit(enabledModes: EnabledRouteTransportModes): number {
  const enabledCount = routeTransportModeOptions.filter((option) => enabledModes[option.mode]).length;
  return Math.min(10, Math.max(3, enabledCount + 2));
}

function getRouteOptionBadges(
  option: RoutePlanOption,
  options: RoutePlanOption[],
  index: number,
  t: Translate,
): string[] {
  const badges: string[] = [];
  const minTransferCount = Math.min(...options.map((item) => item.transferCount));
  const minWalkingDistance = Math.min(...options.map((item) => item.walkingDistance));

  if (index === 0) {
    badges.push(t('map.route.badge.fastest'));
  }

  if (
    option.transferCount === minTransferCount &&
    options.some((item) => item.transferCount !== minTransferCount)
  ) {
    badges.push(t('map.route.badge.fewestTransfers'));
  }

  if (
    Math.round(option.walkingDistance) === Math.round(minWalkingDistance) &&
    options.some((item) => Math.round(item.walkingDistance) !== Math.round(minWalkingDistance))
  ) {
    badges.push(t('map.route.badge.leastWalking'));
  }

  return badges;
}

function resolveRoutePlanDraftAccessPoints(
  draft: RoutePlanDraft,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>,
): RoutePlanDraft {
  const origin = resolveRouteEndpointAccessPoint({
    endpointCoordinate: draft.origin,
    endpointId: draft.originId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
    targetCoordinate: draft.destination,
    targetId: draft.destinationId,
  });
  const destination = resolveRouteEndpointAccessPoint({
    endpointCoordinate: draft.destination,
    endpointId: draft.destinationId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
    targetCoordinate: origin.coordinate,
    targetId: draft.originId,
  });

  return {
    ...draft,
    origin: origin.coordinate,
    originAccessId: origin.accessId,
    originAccessLabel: origin.accessLabel,
    originRaw: origin.accessId ? draft.origin : undefined,
    destination: destination.coordinate,
    destinationAccessId: destination.accessId,
    destinationAccessLabel: destination.accessLabel,
    destinationRaw: destination.accessId ? draft.destination : undefined,
  };
}

function resolveRouteEndpointAccessPoint(input: {
  endpointCoordinate: [number, number];
  endpointId?: string;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>;
  targetCoordinate: [number, number];
  targetId?: string;
}): { coordinate: [number, number]; accessId?: string; accessLabel?: string } {
  if (
    input.endpointId &&
    input.targetId &&
    areRouteEndpointsParentAndChild(
      input.endpointId,
      input.targetId,
      input.secondaryPoiParentIndex,
    )
  ) {
    return { coordinate: input.endpointCoordinate };
  }

  const parentEndpointChildPois = input.endpointId
    ? input.secondaryPoiIndex.get(input.endpointId)
    : undefined;
  const childParent = input.endpointId
    ? input.secondaryPoiParentIndex.get(input.endpointId)
    : undefined;
  if (
    childParent &&
    isRouteAccessSecondaryPoi({
      childLabel: childParent.childLabel,
      marker: childParent.marker,
      parent: childParent.parent,
    })
  ) {
    return { coordinate: input.endpointCoordinate };
  }
  const childEndpointSiblingPois = childParent
    ? input.secondaryPoiIndex
        .get(childParent.parent.id)
        ?.filter((link) => link.marker.id !== input.endpointId)
    : undefined;
  const allChildPois = parentEndpointChildPois ?? childEndpointSiblingPois;
  const accessChildPois = allChildPois?.filter(isRouteAccessSecondaryPoi);
  const childPois = accessChildPois && accessChildPois.length > 0 ? accessChildPois : allChildPois;
  if (!childPois || childPois.length === 0) {
    return { coordinate: input.endpointCoordinate };
  }

  const candidates = childPois
    .map((link) => {
      const coordinate = getMarkerCenter(link.marker);
      return coordinate
        ? {
            coordinate,
            link,
            distanceToTarget: getCoordinateDistance(coordinate, input.targetCoordinate),
          }
        : undefined;
    })
    .filter(
      (
        candidate,
      ): candidate is {
        coordinate: [number, number];
        link: SecondaryPoiLink;
        distanceToTarget: number;
      } => Boolean(candidate),
    )
    .sort((left, right) => left.distanceToTarget - right.distanceToTarget);
  const selected = candidates[0];

  if (!selected) {
    return { coordinate: input.endpointCoordinate };
  }

  if (selected.link.marker.id === input.endpointId) {
    return { coordinate: input.endpointCoordinate };
  }

  return {
    coordinate: selected.coordinate,
    accessId: selected.link.marker.id,
    accessLabel: selected.link.childLabel || formatMarkerDisplayName(selected.link.marker.label),
  };
}

function areRouteEndpointsParentAndChild(
  leftId: string,
  rightId: string,
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>,
): boolean {
  const leftParent = secondaryPoiParentIndex.get(leftId)?.parent.id;
  const rightParent = secondaryPoiParentIndex.get(rightId)?.parent.id;
  return leftParent === rightId || rightParent === leftId;
}

function isRouteAccessSecondaryPoi(link: SecondaryPoiLink): boolean {
  const text = normalizeMarkerSearchText(`${link.childLabel} ${link.marker.label}`);
  const isMetroParent = isMetroStationPoi(link.parent);

  if (isExitMarkerIcon(link.marker.iconFileName)) {
    return isMetroParent;
  }

  if (isWayAccessMarkerIcon(link.marker.iconFileName)) {
    return true;
  }

  if (isMetroParent) {
    return /出入口|出口|站口|[a-z]\d?口/.test(text);
  }

  return !link.marker.iconFileName && /出入口|入口|出口|[东西南北]门|正门|侧门|大门|门岗/.test(text);
}

function buildRouteTraceCoordinates(
  draft: RoutePlanDraft,
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  return dedupeConsecutiveCoordinates([
    ...(draft.originRaw ? [draft.originRaw] : []),
    ...coordinates,
    ...(draft.destinationRaw ? [draft.destinationRaw] : []),
  ]);
}

function createRouteTraceSegment(
  kind: RoutePlanTraceSegment['kind'],
  coordinates: Array<[number, number]>,
  color = routeWalkTraceColor,
): RoutePlanTraceSegment {
  return {
    kind,
    color,
    coordinates: dedupeConsecutiveCoordinates(coordinates),
  };
}

function createRouteRoadLabelsFromSegments(
  segments: readonly RoadRouteInstructionSegment[] | undefined,
  color = routeWalkTraceColor,
): RoutePlanRoadLabel[] {
  const labels: RoutePlanRoadLabel[] = [];

  for (const [index, segment] of (segments ?? []).entries()) {
    if (segment.kind !== 'road') {
      continue;
    }

    if (segment.coordinates.length < 2) {
      continue;
    }

    const label = formatMarkerDisplayName(segment.label);
    if (!label) {
      continue;
    }

    const distance = getCoordinateChainDistance(segment.coordinates);
    if (distance <= 0) {
      continue;
    }

    labels.push({
      color,
      coordinates: segment.coordinates,
      id: `route-road-label-${encodeURIComponent(label)}-${index}`,
      label,
    });
  }

  return labels;
}

function combineRouteRoadLabels(...groups: Array<RoutePlanRoadLabel[] | undefined>): RoutePlanRoadLabel[] {
  return groups.flatMap((group) => group ?? []);
}

function compactRouteTraceSegments(segments: RoutePlanTraceSegment[]): RoutePlanTraceSegment[] {
  return segments.filter((segment) => segment.coordinates.length >= 2);
}

function getRouteEndpointAccessDistance(draft: RoutePlanDraft): number {
  return (
    getRouteSingleEndpointAccessDistance(draft, 'origin') +
    getRouteSingleEndpointAccessDistance(draft, 'destination')
  );
}

function getRouteSingleEndpointAccessDistance(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
): number {
  const raw = endpoint === 'origin' ? draft.originRaw : draft.destinationRaw;
  const access = endpoint === 'origin' ? draft.origin : draft.destination;
  return raw ? getCoordinateDistance(raw, access) : 0;
}

function createRouteEndpointAccessSteps(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
  t?: Translate,
): RoutePlanStep[] {
  const accessLabel = endpoint === 'origin' ? draft.originAccessLabel : draft.destinationAccessLabel;
  if (!accessLabel) {
    return [];
  }

  const distance = getRouteSingleEndpointAccessDistance(draft, endpoint);
  const minutes = estimateRouteMinutes(distance, 72);
  const label =
    endpoint === 'origin'
      ? t
        ? t('map.route.walkToAccess', {
            access: accessLabel,
            distance: formatRoutePlanDistance(distance, t),
            duration: formatRouteStepMinutes(minutes, t),
          })
        : `步行至 ${accessLabel} ${formatRoutePlanDistance(distance)} ${formatRouteStepMinutes(
            minutes,
          )}`
      : t
        ? t('map.route.walkFromAccess', {
            access: accessLabel,
            distance: formatRoutePlanDistance(distance, t),
            duration: formatRouteStepMinutes(minutes, t),
          })
        : `经 ${accessLabel} 步行至终点 ${formatRoutePlanDistance(
            distance,
          )} ${formatRouteStepMinutes(minutes)}`;

  return [createRouteWalkStep(label)];
}

function formatRouteWalkStepLabel(
  usesRoadGraph: boolean,
  distance: number,
  minutes: number,
  t?: Translate,
): string {
  if (!t) {
    return `${usesRoadGraph ? '沿道路步行' : '步行'} ${formatRoutePlanDistance(
      distance,
    )} ${formatRouteStepMinutes(minutes)}`;
  }

  return t(usesRoadGraph ? 'map.route.walkRoadWithDistance' : 'map.route.walkWithDistance', {
    distance: formatRoutePlanDistance(distance, t),
    duration: formatRouteStepMinutes(minutes, t),
  });
}

function createRoutePlaceStep(
  label: string,
  role?: RoutePlanStep['role'],
  icon?: string,
  color?: string,
): RoutePlanStep {
  const resolvedIcon =
    icon ?? (role === 'origin' ? 'location_on' : role === 'destination' ? 'flag' : undefined);
  return { kind: 'place', label, role, icon: resolvedIcon, color };
}

function createRouteWalkStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return {
    kind: 'walk',
    label,
    details: details?.length ? details : [createRouteStepDetail('directions_walk', label)],
  };
}

function createRouteTransitStep(
  label: string,
  color?: string,
  details?: RoutePlanStepDetail[],
): RoutePlanStep {
  return { kind: 'transit', label, color, details };
}

function createRouteTransferStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return { kind: 'transfer', label, role: 'transfer', details };
}

function createRouteStepDetail(
  icon: string,
  label: string,
  meta?: string,
  kind?: RoutePlanStepDetail['kind'],
): RoutePlanStepDetail {
  return { icon, label, meta, kind };
}

function getRouteStepMarkerText(step: RoutePlanStep, t: Translate): string {
  if (step.role === 'origin') {
    return t('map.route.marker.origin');
  }
  if (step.role === 'destination') {
    return t('map.route.marker.destination');
  }
  return '';
}

function buildRoadRouteGraph(roadMarkers: EndpointGroupMarker[]): RoadRouteGraph | undefined {
  const nodes: RoadRouteNode[] = [];
  const adjacency = new Map<string, RoadRouteEdge[]>();
  const baseRoadSegments: RoadRouteSegment[] = [];

  for (const marker of roadMarkers) {
    if (marker.geometry.coordinates.length < 2) {
      continue;
    }

    const roadLabel = formatMarkerDisplayName(marker.label);
    const coordinates = orderRoadTracePoints(marker.geometry.coordinates);
    coordinates.forEach((coordinate, index) => {
      const node: RoadRouteNode = {
        id: `${marker.id}:${index}`,
        coordinate,
        roadId: marker.id,
        roadLabel,
      };
      nodes.push(node);
      adjacency.set(node.id, []);
    });
  }

  if (nodes.length < 2 || nodes.length > 1200) {
    return undefined;
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const nodesByRoadId = new Map<string, RoadRouteNode[]>();
  for (const node of nodes) {
    const roadNodes = nodesByRoadId.get(node.roadId) ?? [];
    roadNodes.push(node);
    nodesByRoadId.set(node.roadId, roadNodes);
  }

  for (const roadNodes of nodesByRoadId.values()) {
    for (let index = 1; index < roadNodes.length; index += 1) {
      const previous = roadNodes[index - 1];
      const current = roadNodes[index];
      if (previous && current) {
        baseRoadSegments.push({
          end: current.coordinate,
          endIsRoadTerminus: index === roadNodes.length - 1,
          endNodeId: current.id,
          id: `${previous.id}->${current.id}`,
          roadId: previous.roadId,
          roadLabel: previous.roadLabel,
          start: previous.coordinate,
          startIsRoadTerminus: index === 1,
          startNodeId: previous.id,
        });
      }
    }
  }

  const connectionThreshold = 100;
  const baseRoadSegmentsById = new Map(baseRoadSegments.map((segment) => [segment.id, segment]));
  const connectionCandidates = collectRoadConnectionCandidates(
    baseRoadSegments,
    connectionThreshold,
  );
  const segmentPointsById = new Map<
    string,
    Array<{ coordinate: [number, number]; nodeId: string; ratio: number }>
  >();
  const resolvedConnections: Array<{
    distance: number;
    leftCoordinate: [number, number];
    leftNodeId: string;
    leftRoadLabel: string;
    rightCoordinate: [number, number];
    rightNodeId: string;
    rightRoadLabel: string;
  }> = [];
  const resolvedConnectionKeys = new Set<string>();
  const nodeIdsBySegmentPointKey = new Map<string, string>();
  let virtualNodeIndex = 0;

  const ensureSegmentPointNode = (
    segment: RoadRouteSegment,
    coordinate: [number, number],
  ): { coordinate: [number, number]; nodeId: string; ratio: number } => {
    if (areCoordinatesClose(segment.start, coordinate)) {
      return { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 };
    }
    if (areCoordinatesClose(segment.end, coordinate)) {
      return { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 };
    }

    const key = `${segment.id}:${coordinate[0].toFixed(3)}:${coordinate[1].toFixed(3)}`;
    const existingNodeId = nodeIdsBySegmentPointKey.get(key);
    if (existingNodeId) {
      return {
        coordinate,
        nodeId: existingNodeId,
        ratio: getRoadSegmentRatio(segment, coordinate),
      };
    }

    const nodeId = `road-virtual:${virtualNodeIndex}`;
    virtualNodeIndex += 1;
    nodes.push({
      coordinate,
      id: nodeId,
      roadId: segment.roadId,
      roadLabel: segment.roadLabel,
    });
    nodesById.set(nodeId, nodes[nodes.length - 1]!);
    adjacency.set(nodeId, []);
    nodeIdsBySegmentPointKey.set(key, nodeId);
    return {
      coordinate,
      nodeId,
      ratio: getRoadSegmentRatio(segment, coordinate),
    };
  };

  for (const candidate of connectionCandidates) {
    const leftSegment = baseRoadSegmentsById.get(candidate.leftSegmentId);
    const rightSegment = baseRoadSegmentsById.get(candidate.rightSegmentId);
    if (!leftSegment || !rightSegment) {
      continue;
    }

    const leftPoint = ensureSegmentPointNode(leftSegment, candidate.leftCoordinate);
    const rightPoint = ensureSegmentPointNode(rightSegment, candidate.rightCoordinate);
    const leftSegmentPoints = segmentPointsById.get(leftSegment.id) ?? [];
    const rightSegmentPoints = segmentPointsById.get(rightSegment.id) ?? [];
    leftSegmentPoints.push(leftPoint);
    rightSegmentPoints.push(rightPoint);
    segmentPointsById.set(leftSegment.id, leftSegmentPoints);
    segmentPointsById.set(rightSegment.id, rightSegmentPoints);
    const connectionKey = `${leftPoint.nodeId}->${rightPoint.nodeId}`;
    if (resolvedConnectionKeys.has(connectionKey)) {
      continue;
    }
    resolvedConnectionKeys.add(connectionKey);
    resolvedConnections.push({
      distance: candidate.distance,
      leftCoordinate: leftPoint.coordinate,
      leftNodeId: leftPoint.nodeId,
      leftRoadLabel: candidate.leftRoadLabel,
      rightCoordinate: rightPoint.coordinate,
      rightNodeId: rightPoint.nodeId,
      rightRoadLabel: candidate.rightRoadLabel,
    });
  }

  const roadSegments: RoadRouteSegment[] = [];
  for (const segment of baseRoadSegments) {
    const segmentPoints = [
      { coordinate: segment.start, nodeId: segment.startNodeId, ratio: 0 },
      ...(segmentPointsById.get(segment.id) ?? []),
      { coordinate: segment.end, nodeId: segment.endNodeId, ratio: 1 },
    ]
      .sort((left, right) => left.ratio - right.ratio)
      .filter((point, index, array) => {
        const previous = array[index - 1];
        return !previous || previous.nodeId !== point.nodeId;
      });

    for (let index = 1; index < segmentPoints.length; index += 1) {
      const previous = segmentPoints[index - 1];
      const current = segmentPoints[index];
      if (!previous || !current || areCoordinatesClose(previous.coordinate, current.coordinate)) {
        continue;
      }

      const previousNode = nodesById.get(previous.nodeId);
      const currentNode = nodesById.get(current.nodeId);
      if (!previousNode || !currentNode) {
        continue;
      }

      roadSegments.push({
        end: current.coordinate,
        endIsRoadTerminus: segment.endIsRoadTerminus && current.ratio === 1,
        endNodeId: current.nodeId,
        id: `${segment.id}:${index - 1}`,
        roadId: segment.roadId,
        roadLabel: segment.roadLabel,
        start: previous.coordinate,
        startIsRoadTerminus: segment.startIsRoadTerminus && previous.ratio === 0,
        startNodeId: previous.nodeId,
      });
      addRoadRouteGraphEdge(adjacency, previousNode, currentNode, {
        coordinates: [previous.coordinate, current.coordinate],
        distance: getCoordinateDistance(previous.coordinate, current.coordinate),
        kind: 'road',
        label: segment.roadLabel,
        reverseLabel: segment.roadLabel,
      });
    }
  }

  for (const connection of resolvedConnections) {
    const leftNode = nodesById.get(connection.leftNodeId);
    const rightNode = nodesById.get(connection.rightNodeId);
    if (!leftNode || !rightNode) {
      continue;
    }

    addRoadRouteGraphEdge(adjacency, leftNode, rightNode, {
      coordinates: [connection.leftCoordinate, connection.rightCoordinate],
      distance: connection.distance,
      kind: 'connection',
      label: connection.rightRoadLabel,
      reverseLabel: connection.leftRoadLabel,
    });
  }

  return { adjacency, nodes, nodesById, roadSegments };
}

function collectRoadConnectionCandidates(
  roadSegments: RoadRouteSegment[],
  threshold: number,
): RoadConnectionCandidate[] {
  const connections = new Map<string, RoadConnectionCandidate>();

  for (let leftIndex = 0; leftIndex < roadSegments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < roadSegments.length; rightIndex += 1) {
      const left = roadSegments[leftIndex];
      const right = roadSegments[rightIndex];
      if (!left || !right || left.roadId === right.roadId) {
        continue;
      }

      for (const candidate of getRoadSegmentConnectionCandidates(left, right, threshold)) {
        const key = [
          left.id,
          right.id,
          candidate.leftCoordinate[0].toFixed(2),
          candidate.leftCoordinate[1].toFixed(2),
          candidate.rightCoordinate[0].toFixed(2),
          candidate.rightCoordinate[1].toFixed(2),
        ].join(':');
        if (connections.has(key)) {
          continue;
        }

        connections.set(key, {
          distance: candidate.distance,
          leftCoordinate: candidate.leftCoordinate,
          leftRoadLabel: left.roadLabel,
          leftSegmentId: left.id,
          rightCoordinate: candidate.rightCoordinate,
          rightRoadLabel: right.roadLabel,
          rightSegmentId: right.id,
        });
      }
    }
  }

  return Array.from(connections.values()).sort(
    (left, right) => left.distance - right.distance,
  );
}

function getRoadSegmentConnectionCandidates(
  left: RoadRouteSegment,
  right: RoadRouteSegment,
  threshold: number,
): Array<{
  distance: number;
  leftCoordinate: [number, number];
  rightCoordinate: [number, number];
}> {
  const intersection = getSegmentIntersectionPoint(left.start, left.end, right.start, right.end);
  if (intersection) {
    return [
      {
        distance: 0,
        leftCoordinate: intersection,
        rightCoordinate: intersection,
      },
    ];
  }

  const candidates: Array<{
    leftCoordinate: [number, number];
    rightCoordinate: [number, number];
  }> = [];
  if (left.startIsRoadTerminus) {
    candidates.push({
      leftCoordinate: left.start,
      rightCoordinate: projectPointOntoSegment(right.start, right.end, left.start).coordinate,
    });
  }
  if (left.endIsRoadTerminus) {
    candidates.push({
      leftCoordinate: left.end,
      rightCoordinate: projectPointOntoSegment(right.start, right.end, left.end).coordinate,
    });
  }
  if (right.startIsRoadTerminus) {
    candidates.push({
      leftCoordinate: projectPointOntoSegment(left.start, left.end, right.start).coordinate,
      rightCoordinate: right.start,
    });
  }
  if (right.endIsRoadTerminus) {
    candidates.push({
      leftCoordinate: projectPointOntoSegment(left.start, left.end, right.end).coordinate,
      rightCoordinate: right.end,
    });
  }

  const deduped = new Map<
    string,
    {
      distance: number;
      leftCoordinate: [number, number];
      rightCoordinate: [number, number];
    }
  >();
  for (const candidate of candidates
    .map((candidate) => ({
      ...candidate,
      distance: getCoordinateDistance(candidate.leftCoordinate, candidate.rightCoordinate),
    }))
    .filter((candidate) => candidate.distance <= threshold)
    .sort((leftCandidate, rightCandidate) => leftCandidate.distance - rightCandidate.distance)) {
    const key = [
      candidate.leftCoordinate[0].toFixed(2),
      candidate.leftCoordinate[1].toFixed(2),
      candidate.rightCoordinate[0].toFixed(2),
      candidate.rightCoordinate[1].toFixed(2),
    ].join(':');
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values());
}

function projectPointOntoSegment(
  start: [number, number],
  end: [number, number],
  point: [number, number],
): { coordinate: [number, number]; ratio: number } {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = lengthSquared
    ? clampNumber(
        ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ) / lengthSquared,
        0,
        1,
      )
    : 0;
  return {
    coordinate: interpolateCoordinate(start, end, ratio),
    ratio,
  };
}

function getSegmentIntersectionPoint(
  leftStart: [number, number],
  leftEnd: [number, number],
  rightStart: [number, number],
  rightEnd: [number, number],
): [number, number] | undefined {
  const leftVector: [number, number] = [
    leftEnd[0] - leftStart[0],
    leftEnd[1] - leftStart[1],
  ];
  const rightVector: [number, number] = [
    rightEnd[0] - rightStart[0],
    rightEnd[1] - rightStart[1],
  ];
  const denominator = leftVector[0] * rightVector[1] - leftVector[1] * rightVector[0];
  if (Math.abs(denominator) < 0.000001) {
    return undefined;
  }

  const delta: [number, number] = [
    rightStart[0] - leftStart[0],
    rightStart[1] - leftStart[1],
  ];
  const leftRatio = (delta[0] * rightVector[1] - delta[1] * rightVector[0]) / denominator;
  const rightRatio = (delta[0] * leftVector[1] - delta[1] * leftVector[0]) / denominator;
  if (
    leftRatio < 0 ||
    leftRatio > 1 ||
    rightRatio < 0 ||
    rightRatio > 1
  ) {
    return undefined;
  }

  return interpolateCoordinate(leftStart, leftEnd, leftRatio);
}

function getRoadSegmentRatio(
  segment: RoadRouteSegment,
  coordinate: [number, number],
): number {
  return projectPointOntoSegment(segment.start, segment.end, coordinate).ratio;
}

function areCoordinatesClose(
  left: [number, number],
  right: [number, number],
  tolerance = 0.01,
): boolean {
  return getCoordinateDistance(left, right) <= tolerance;
}

function addRoadRouteGraphEdge(
  adjacency: Map<string, RoadRouteEdge[]>,
  from: RoadRouteNode,
  to: RoadRouteNode,
  input: {
    coordinates: Array<[number, number]>;
    distance: number;
    kind: 'connection' | 'road';
    label: string;
    reverseLabel?: string;
  },
) {
  adjacency.get(from.id)?.push({
    coordinates: input.coordinates,
    distance: input.distance,
    kind: input.kind,
    label: input.label,
    to: to.id,
  });
  adjacency.get(to.id)?.push({
    coordinates: [...input.coordinates].reverse() as Array<[number, number]>,
    distance: input.distance,
    kind: input.kind,
    label: input.reverseLabel ?? input.label,
    to: from.id,
  });
}

function findRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  strategy: RoadRouteStrategy = 'shortest',
): RoadRoutePath | undefined {
  if (strategy === 'fewer-turns') {
    return findFewerTurnRoadRoutePath(graph, originId, destinationId);
  }

  if (originId === destinationId) {
    const node = graph.nodesById.get(originId);
    return node
      ? {
          coordinates: [node.coordinate],
          distance: 0,
          nodes: [node],
          segments: [],
        }
      : undefined;
  }

  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));

  for (const node of graph.nodes) {
    distances.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    const currentId = findNearestUnvisitedRoadRouteNode(unvisited, distances);
    if (!currentId) {
      break;
    }
    if (currentId === destinationId) {
      break;
    }

    unvisited.delete(currentId);
    const currentDistance = distances.get(currentId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentDistance)) {
      break;
    }

    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!unvisited.has(edge.to)) {
        continue;
      }
      const nextDistance = currentDistance + edge.distance;
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, currentId);
      }
    }
  }

  const distance = distances.get(destinationId);
  if (distance === undefined || !Number.isFinite(distance)) {
    return undefined;
  }

  const pathIds = [destinationId];
  let currentId = destinationId;
  while (currentId !== originId) {
    const previousId = previous.get(currentId);
    if (!previousId) {
      return undefined;
    }
    pathIds.push(previousId);
    currentId = previousId;
  }

  const nodes = pathIds
    .reverse()
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  if (nodes.length < 2) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  for (let index = 1; index < pathIds.length; index += 1) {
    const previousId = pathIds[index - 1];
    const currentId = pathIds[index];
    const edge = previousId
      ? graph.adjacency.get(previousId)?.find((item) => item.to === currentId)
      : undefined;
    if (!edge) {
      continue;
    }

    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function findFewerTurnRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
): RoadRoutePath | undefined {
  const originNode = graph.nodesById.get(originId);
  if (!originNode) {
    return undefined;
  }
  if (originId === destinationId) {
    return {
      coordinates: [originNode.coordinate],
      distance: 0,
      nodes: [originNode],
      segments: [],
    };
  }

  type State = {
    distance: number;
    edge?: RoadRouteEdge;
    key: string;
    nodeId: string;
    previousKey?: string;
    score: number;
  };

  const startKey = `${originId}|`;
  const states = new Map<string, State>([
    [
      startKey,
      {
        distance: 0,
        key: startKey,
        nodeId: originId,
        score: 0,
      },
    ],
  ]);
  const unsettled = new Set([startKey]);
  const settled = new Set<string>();
  let destinationKey: string | undefined;

  while (unsettled.size > 0) {
    const currentKey = findNearestUnsettledRoadRouteState(unsettled, states);
    if (!currentKey) {
      break;
    }
    unsettled.delete(currentKey);
    settled.add(currentKey);

    const current = states.get(currentKey);
    if (!current) {
      continue;
    }
    if (current.nodeId === destinationId) {
      destinationKey = currentKey;
      break;
    }

    for (const edge of graph.adjacency.get(current.nodeId) ?? []) {
      const nextKey = `${edge.to}|${current.nodeId}`;
      if (settled.has(nextKey)) {
        continue;
      }

      const turnPenalty = current.edge ? getRoadRouteTurnPenalty(current.edge, edge) : 0;
      const nextScore = current.score + edge.distance + turnPenalty;
      const existing = states.get(nextKey);
      if (existing && existing.score <= nextScore) {
        continue;
      }

      states.set(nextKey, {
        distance: current.distance + edge.distance,
        edge,
        key: nextKey,
        nodeId: edge.to,
        previousKey: currentKey,
        score: nextScore,
      });
      unsettled.add(nextKey);
    }
  }

  if (!destinationKey) {
    return undefined;
  }

  const edges: RoadRouteEdge[] = [];
  const pathNodeIds: string[] = [];
  let currentKey: string | undefined = destinationKey;
  while (currentKey) {
    const state = states.get(currentKey);
    if (!state) {
      return undefined;
    }
    pathNodeIds.push(state.nodeId);
    if (state.edge) {
      edges.push(state.edge);
    }
    currentKey = state.previousKey;
  }

  const nodes = pathNodeIds
    .reverse()
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  const orderedEdges = edges.reverse();
  if (nodes.length < 2 || orderedEdges.length === 0) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  let distance = 0;
  for (const edge of orderedEdges) {
    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    distance += edge.distance;
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function findNearestUnsettledRoadRouteState(
  unsettled: Set<string>,
  states: Map<string, { score: number }>,
): string | undefined {
  let bestKey: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const key of unsettled) {
    const score = states.get(key)?.score ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestKey = key;
      bestScore = score;
    }
  }
  return bestKey;
}

function getRoadRouteTurnPenalty(previousEdge: RoadRouteEdge, nextEdge: RoadRouteEdge): number {
  const previousVector = getCoordinateChainVector(previousEdge.coordinates);
  const nextVector = getCoordinateChainVector(nextEdge.coordinates);
  const previousLength = Math.hypot(previousVector[0], previousVector[1]);
  const nextLength = Math.hypot(nextVector[0], nextVector[1]);
  if (previousLength === 0 || nextLength === 0) {
    return 0;
  }

  const cosine = clampNumber(
    (previousVector[0] * nextVector[0] + previousVector[1] * nextVector[1]) /
      (previousLength * nextLength),
    -1,
    1,
  );
  const angle = Math.acos(cosine);
  const anglePenalty = Math.pow(angle / Math.PI, 1.25) * 920;
  const roadChangePenalty = previousEdge.label === nextEdge.label ? 0 : 120;
  const connectionPenalty = nextEdge.kind === 'connection' ? 80 : 0;
  return anglePenalty + roadChangePenalty + connectionPenalty;
}

function getCoordinateChainVector(coordinates: Array<[number, number]>): [number, number] {
  const start = coordinates[0];
  const end = coordinates.at(-1);
  if (!start || !end) {
    return [0, 0];
  }
  return [end[0] - start[0], end[1] - start[1]];
}

function buildRoadRouteStepDetails(
  segments: RoadRouteInstructionSegment[],
  t?: Translate,
): RoutePlanStepDetail[] {
  const groups: Array<{
    distance: number;
    label: string;
    kind: RoadRouteInstructionSegment['kind'];
    vector: [number, number];
  }> = [];

  for (const segment of segments) {
    if (segment.coordinates.length < 2) {
      continue;
    }

    const distance = getCoordinateChainDistance(segment.coordinates);
    if (distance <= 0) {
      continue;
    }

    const start = segment.coordinates[0];
    const end = segment.coordinates[segment.coordinates.length - 1];
    if (!start || !end) {
      continue;
    }

    const vector: [number, number] = [
      end[0] - start[0],
      end[1] - start[1],
    ];
    const lastGroup = groups.at(-1);
    if (
      lastGroup &&
      lastGroup.label === segment.label &&
      (
        (lastGroup.kind === 'road' && segment.kind === 'road') ||
        (lastGroup.kind === 'connection' && segment.kind === 'road')
      )
    ) {
      lastGroup.distance += distance;
      lastGroup.kind = 'road';
      lastGroup.vector = vector;
    } else {
      groups.push({
        distance,
        kind: segment.kind,
        label: segment.label,
        vector,
      });
    }
  }

  return groups.map((group, index) =>
    createRouteStepDetail(
      index === 0
        ? 'directions_walk'
        : getTurnInstructionIcon(groups[index - 1]?.vector, group.vector),
      formatRoadRouteStepLabel(group.kind, group.label, t),
      `${formatRoutePlanDistance(group.distance, t)} ${formatRouteStepMinutes(
        estimateRouteMinutes(group.distance, group.kind === 'road' || group.kind === 'connection' ? 64 : 72),
        t,
      )}`,
      'process',
    ),
  );
}

function formatRoadRouteStepLabel(
  kind: RoadRouteInstructionSegment['kind'],
  label: string,
  t?: Translate,
): string {
  if (kind === 'approach') {
    return t ? t('map.route.road.approach', { road: label }) : `接近 ${label}`;
  }
  if (kind === 'connection') {
    return t ? t('map.route.road.connection', { road: label }) : `连接到 ${label}`;
  }
  if (kind === 'depart') {
    return t ? t('map.route.road.depart') : '前往终点';
  }
  return label;
}

function getTurnInstructionText(icon: string, t?: Translate): string | undefined {
  switch (icon) {
    case 'straight':
      return t ? t('map.route.turn.straight') : '直行';
    case 'turn_left':
      return t ? t('map.route.turn.left') : '左转';
    case 'turn_right':
      return t ? t('map.route.turn.right') : '右转';
    case 'turn_slight_left':
      return t ? t('map.route.turn.slightLeft') : '向左前方';
    case 'turn_slight_right':
      return t ? t('map.route.turn.slightRight') : '向右前方';
    default:
      return undefined;
  }
}

function buildWalkRouteBetweenCoordinates(
  origin: [number, number],
  destination: [number, number],
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  t?: Translate,
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
): ResolvedWalkRoute {
  const roadRoute = roadGraph
    ? findRoadRouteBetweenCoordinates(
        origin,
        destination,
        roadGraph,
        routeCache,
        t,
        accessOptions,
        strategy,
      )
    : undefined;
  if (roadRoute) {
    return {
      coordinates: roadRoute.coordinates,
      distance: roadRoute.distance,
      details: roadRoute.details,
      roadSegments: roadRoute.roadSegments,
      usesRoadGraph: true,
    };
  }

  const distance = getCoordinateDistance(origin, destination);
  const minutes = estimateRouteMinutes(distance, 72);
  return {
    coordinates: [origin, destination],
    distance,
    details: [
      createRouteStepDetail(
        'directions_walk',
        t ? t('map.route.walkStraight') : '直线步行',
        `${formatRoutePlanDistance(distance, t)} ${formatRouteStepMinutes(minutes, t)}`,
        'process',
      ),
    ],
    roadSegments: [],
    usesRoadGraph: false,
  };
}

function buildWalkRouteToTransitStop(input: {
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  mode: RouteTransportMode;
  origin: [number, number];
  originRoadAccessCandidates?: RoadAccessCandidate[];
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  stop: TransitRouteStop;
  t: Translate;
}): ResolvedWalkRoute {
  const access = resolveTransitStopAccessPoint(
    input.stop,
    input.mode,
    input.origin,
    input.secondaryPoiIndex,
  );
  if (!access) {
    return buildWalkRouteBetweenCoordinates(
      input.origin,
      input.stop.center,
      input.roadGraph,
      input.routeCache,
      input.t,
      {
        destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          input.markerRoadAccessIndex,
          input.stop.marker.id,
        ),
        originAccessCandidates: input.originRoadAccessCandidates,
      },
    );
  }

  const externalRoute = buildWalkRouteBetweenCoordinates(
    input.origin,
    access.coordinate,
    input.roadGraph,
    input.routeCache,
    input.t,
    {
      destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        access.markerId,
      ),
      originAccessCandidates: input.originRoadAccessCandidates,
    },
  );
  return appendTransitStopAccessSegment({
    access,
    externalRoute,
    markerIds: [access.markerId],
    mode: input.mode,
    stopCoordinate: input.stop.center,
    t: input.t,
    type: 'enter',
  });
}

function buildWalkRouteFromTransitStop(input: {
  destination: [number, number];
  destinationRoadAccessCandidates?: RoadAccessCandidate[];
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  mode: RouteTransportMode;
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  stop: TransitRouteStop;
  t: Translate;
}): ResolvedWalkRoute {
  const access = resolveTransitStopAccessPoint(
    input.stop,
    input.mode,
    input.destination,
    input.secondaryPoiIndex,
  );
  if (!access) {
    return buildWalkRouteBetweenCoordinates(
      input.stop.center,
      input.destination,
      input.roadGraph,
      input.routeCache,
      input.t,
      {
        destinationAccessCandidates: input.destinationRoadAccessCandidates,
        originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          input.markerRoadAccessIndex,
          input.stop.marker.id,
        ),
      },
    );
  }

  const externalRoute = buildWalkRouteBetweenCoordinates(
    access.coordinate,
    input.destination,
    input.roadGraph,
    input.routeCache,
    input.t,
    {
      destinationAccessCandidates: input.destinationRoadAccessCandidates,
      originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        access.markerId,
      ),
    },
  );
  return prependTransitStopAccessSegment({
    access,
    externalRoute,
    markerIds: [access.markerId],
    mode: input.mode,
    stopCoordinate: input.stop.center,
    t: input.t,
    type: 'exit',
  });
}

function resolveTransitStopAccessPoint(
  stop: TransitRouteStop,
  mode: RouteTransportMode,
  reference: [number, number],
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
): { coordinate: [number, number]; label: string; markerId: string } | undefined {
  if (mode !== 'metro') {
    return undefined;
  }

  const links = secondaryPoiIndex.get(stop.marker.id)?.filter(isRouteAccessSecondaryPoi) ?? [];
  return links
    .map((link) => {
      const coordinate = getMarkerCenter(link.marker);
      return coordinate
        ? {
            coordinate,
            label: link.childLabel || formatMarkerDisplayName(link.marker.label),
            markerId: link.marker.id,
            distance: getCoordinateDistance(coordinate, reference),
          }
        : undefined;
    })
    .filter(
      (
        item,
      ): item is {
        coordinate: [number, number];
        label: string;
        markerId: string;
        distance: number;
      } => Boolean(item),
    )
    .sort((left, right) => left.distance - right.distance)[0];
}

function appendTransitStopAccessSegment(input: {
  access: { coordinate: [number, number]; label: string };
  externalRoute: ResolvedWalkRoute;
  markerIds?: string[];
  mode: RouteTransportMode;
  stopCoordinate: [number, number];
  t: Translate;
  type: 'enter' | 'exit';
}): ResolvedWalkRoute {
  const internalDistance = getCoordinateDistance(input.access.coordinate, input.stopCoordinate);
  const internalMinutes = estimateRouteMinutes(internalDistance, 72);
  return {
    coordinates: dedupeConsecutiveCoordinates([
      ...input.externalRoute.coordinates,
      input.stopCoordinate,
    ]),
    details: [
      ...input.externalRoute.details,
      createRouteStepDetail(
        getTransitAccessDetailIcon(input.mode),
        input.t('map.route.metroEnterViaAccess', { access: input.access.label }),
        `${formatRoutePlanDistance(internalDistance, input.t)} ${formatRouteStepMinutes(
          internalMinutes,
          input.t,
        )}`,
        'process',
      ),
    ],
    distance: input.externalRoute.distance + internalDistance,
    markerIds: dedupeValues([...(input.externalRoute.markerIds ?? []), ...(input.markerIds ?? [])]),
    usesRoadGraph: input.externalRoute.usesRoadGraph,
  };
}

function prependTransitStopAccessSegment(input: {
  access: { coordinate: [number, number]; label: string };
  externalRoute: ResolvedWalkRoute;
  markerIds?: string[];
  mode: RouteTransportMode;
  stopCoordinate: [number, number];
  t: Translate;
  type: 'enter' | 'exit';
}): ResolvedWalkRoute {
  const internalDistance = getCoordinateDistance(input.stopCoordinate, input.access.coordinate);
  const internalMinutes = estimateRouteMinutes(internalDistance, 72);
  return {
    coordinates: dedupeConsecutiveCoordinates([
      input.stopCoordinate,
      ...input.externalRoute.coordinates,
    ]),
    details: [
      createRouteStepDetail(
        getTransitAccessDetailIcon(input.mode),
        input.t('map.route.metroExitViaAccess', { access: input.access.label }),
        `${formatRoutePlanDistance(internalDistance, input.t)} ${formatRouteStepMinutes(
          internalMinutes,
          input.t,
        )}`,
        'process',
      ),
      ...input.externalRoute.details,
    ],
    distance: internalDistance + input.externalRoute.distance,
    markerIds: dedupeValues([...(input.markerIds ?? []), ...(input.externalRoute.markerIds ?? [])]),
    usesRoadGraph: input.externalRoute.usesRoadGraph,
  };
}

function getTransitAccessDetailIcon(mode: RouteTransportMode): string {
  return mode === 'metro' ? 'subway' : 'directions_walk';
}

function getCoordinateChainDistance(coordinates: Array<[number, number]>): number {
  return coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = coordinates[index];
    return previous ? total + getCoordinateDistance(previous, coordinate) : total;
  }, 0);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTurnInstructionIcon(
  previous: [number, number] | undefined,
  current: [number, number],
): string {
  if (!previous) {
    return 'directions_walk';
  }

  const previousLength = Math.hypot(previous[0], previous[1]);
  const currentLength = Math.hypot(current[0], current[1]);
  if (previousLength === 0 || currentLength === 0) {
    return 'straight';
  }

  const cross = previous[0] * current[1] - previous[1] * current[0];
  const dot = previous[0] * current[0] + previous[1] * current[1];
  const angle = Math.atan2(cross, dot);
  const absoluteAngle = Math.abs(angle);
  if (absoluteAngle < 0.35) {
    return 'straight';
  }
  if (absoluteAngle < 1.05) {
    return angle > 0 ? 'turn_slight_right' : 'turn_slight_left';
  }
  return angle > 0 ? 'turn_right' : 'turn_left';
}

function findNearestUnvisitedRoadRouteNode(
  unvisited: Set<string>,
  distances: Map<string, number>,
): string | undefined {
  let nearestId: string | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const id of unvisited) {
    const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = id;
    }
  }
  return nearestId;
}

function dedupeConsecutiveCoordinates(
  coordinates: Array<[number, number]>,
): Array<[number, number]> {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];
    return !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
}

interface TransitRouteStop {
  center: [number, number];
  index: number;
  marker: PointMarker;
  stop: TransitLineStopForMap;
}

interface TransitLineDirectionCandidate {
  color: string;
  direction: 'forward' | 'reverse';
  icon: string;
  line: TransitOverviewLine;
  mode: RouteTransportModeOption;
  modeLabel: string;
  stops: TransitRouteStop[];
  terminalName: string;
}

function buildTransitRoutePlanOptions(input: {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>;
  modeProfiles: TransitModeProfileForMap[];
  pointMarkers: PointMarker[];
  roadGraph?: RoadRouteGraph;
  routeCache: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  t: Translate;
  transitLines: TransitOverviewLine[];
}): RoutePlanOption[] {
  const profileByMode = new Map(input.modeProfiles.map((profile) => [profile.mode, profile]));
  const stationMarkerIndex = buildTransitStationMarkerIndex(input.pointMarkers);
  const lineCandidates: TransitLineDirectionCandidate[] = [];

  for (const mode of routeTransportModeOptions) {
    if (mode.mode === 'walk' || !input.enabledModes[mode.mode]) {
      continue;
    }

    const profile = profileByMode.get(mode.mode);
    for (const line of input.transitLines.filter((item) => item.mode === mode.mode)) {
      for (const direction of ['forward', 'reverse'] as const) {
        const stops = getDirectionalLineStops(line, direction)
          .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
            const marker = findTransitStationMarker(
              stop.stationName,
              stationMarkerIndex,
              mode.mode,
            );
            const center = marker ? getMarkerCenter(marker) : undefined;
            return marker && center ? { center, marker, stop } : undefined;
          })
          .filter((stop): stop is Omit<TransitRouteStop, 'index'> => Boolean(stop))
          .map((stop, index): TransitRouteStop => ({ ...stop, index }));

        if (stops.length < 2) {
          continue;
        }

        lineCandidates.push({
          color: line.color ?? profile?.color ?? mode.color,
          direction,
          icon: profile?.icon ?? mode.icon,
          line,
          mode,
          modeLabel: getRouteTransportModeLabel(mode.mode, input.t),
          stops,
          terminalName: stops.at(-1)?.stop.stationName ?? line.lastStationName ?? line.name,
        });
      }
    }
  }

  const directOptions = lineCandidates
    .map((candidate) =>
      buildDirectTransitLineOption(
        candidate,
        input.draft,
        input.t,
        input.markerRoadAccessIndex,
        input.secondaryPoiIndex,
        input.roadGraph,
        input.routeCache,
      ),
    )
    .filter((option): option is RoutePlanOption => Boolean(option));
  const transferOptions = buildTransferTransitLineOptions(
    lineCandidates,
    input.draft,
    input.t,
    input.markerRoadAccessIndex,
    input.secondaryPoiIndex,
    input.roadGraph,
    input.routeCache,
  );

  return [...directOptions, ...transferOptions]
    .sort(
      (left, right) =>
        left.estimatedMinutes - right.estimatedMinutes ||
        left.estimatedDistance - right.estimatedDistance ||
        left.title.localeCompare(right.title, 'zh-CN'),
    )
    .slice(0, 8);
}

function buildDirectTransitLineOption(
  candidate: TransitLineDirectionCandidate,
  draft: RoutePlanDraft,
  t: Translate,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
): RoutePlanOption | undefined {
  const originStop = findNearestRouteLineStop(draft.origin, candidate.stops);
  const destinationStop = findNearestRouteLineStop(draft.destination, candidate.stops);
  if (!originStop || !destinationStop || originStop.index >= destinationStop.index) {
    return undefined;
  }
  if (originStop.marker.id === destinationStop.marker.id) {
    return undefined;
  }

  const segmentStops = candidate.stops.slice(originStop.index, destinationStop.index + 1);
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    markerRoadAccessIndex,
  );
  const accessRoute = buildWalkRouteToTransitStop({
    markerRoadAccessIndex,
    mode: candidate.mode.mode,
    origin: draft.origin,
    originRoadAccessCandidates,
    roadGraph,
    routeCache,
    secondaryPoiIndex,
    stop: originStop,
    t,
  });
  const egressRoute = buildWalkRouteFromTransitStop({
    destination: draft.destination,
    destinationRoadAccessCandidates,
    markerRoadAccessIndex,
    mode: candidate.mode.mode,
    roadGraph,
    routeCache,
    secondaryPoiIndex,
    stop: destinationStop,
    t,
  });
  const accessDistance = accessRoute.distance;
  const egressDistance = egressRoute.distance;
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
  const transitRoute = buildTransitSegmentRoute(
    segmentStops,
    candidate.mode.mode,
    markerRoadAccessIndex,
    roadGraph,
    routeCache,
  );
  const transitDistance = transitRoute.distance;
  const accessMinutes = estimateResolvedWalkRouteMinutes(accessRoute);
  const egressMinutes = estimateResolvedWalkRouteMinutes(egressRoute);
  const endpointAccessMinutes = estimateRouteMinutes(endpointAccessDistance, 72);
  const transitMinutes = estimateTransitSegmentMinutes(
    segmentStops,
    transitDistance,
    candidate.mode.mode,
  );
  const estimatedMinutes = endpointAccessMinutes + accessMinutes + egressMinutes + transitMinutes;
  const stationSpan = Math.max(1, destinationStop.index - originStop.index);
  const coordinates = buildRouteTraceCoordinates(draft, [
    ...accessRoute.coordinates,
    ...transitRoute.coordinates,
    ...egressRoute.coordinates,
  ]);
  const traceSegments = compactRouteTraceSegments([
    createRouteTraceSegment('walk', [
      ...(draft.originRaw ? [draft.originRaw] : []),
      ...accessRoute.coordinates,
    ]),
    createRouteTraceSegment(
      'transit',
      transitRoute.coordinates,
      candidate.color,
    ),
    createRouteTraceSegment('walk', [
      ...egressRoute.coordinates,
      ...(draft.destinationRaw ? [draft.destinationRaw] : []),
    ]),
  ]);
  const labelMarkerIds = dedupeValues([originStop.marker.id, destinationStop.marker.id]);
  const suppressLabelMarkerIds = segmentStops
    .map((stop) => stop.marker.id)
    .filter((id) => !labelMarkerIds.includes(id));
  const roadLabels = combineRouteRoadLabels(
    createRouteRoadLabelsFromSegments(accessRoute.roadSegments),
    createRouteRoadLabelsFromSegments(egressRoute.roadSegments),
  );

  return {
    id: `${candidate.mode.mode}-${candidate.line.id}-${candidate.direction}-${originStop.marker.id}-${destinationStop.marker.id}`,
    title: t
      ? t('map.route.directTitle', { mode: candidate.modeLabel })
      : `${candidate.modeLabel}直达`,
    summary: `${candidate.line.name} · ${
      t ? t('map.route.stationCount', { count: stationSpan }) : `${stationSpan}站`
    } · ${formatRoutePlanDistance(
      endpointAccessDistance + accessDistance + egressDistance,
      t,
    )}${t ? t('map.route.summary.walking') : '步行'}`,
    icon: candidate.icon,
    color: candidate.color,
    coordinates,
    traceSegments,
    roadLabels,
    markerIds: dedupeValues([
      ...getRouteEndpointMarkerIds(draft),
      ...(accessRoute.markerIds ?? []),
      ...segmentStops.map((stop) => stop.marker.id),
      ...(egressRoute.markerIds ?? []),
    ]),
    labelMarkerIds,
    suppressLabelMarkerIds,
    estimatedDistance: endpointAccessDistance + accessDistance + egressDistance + transitDistance,
    estimatedMinutes,
    transferCount: 0,
    walkingDistance: endpointAccessDistance + accessDistance + egressDistance,
    steps: [
      createRoutePlaceStep(
        t ? t('map.route.depart', { name: draft.originLabel }) : `${draft.originLabel} 出发`,
        'origin',
      ),
      ...createRouteEndpointAccessSteps(draft, 'origin', t),
      createRouteWalkStep(
        formatRouteWalkStepLabel(accessRoute.usesRoadGraph, accessDistance, accessMinutes, t),
        accessRoute.details,
      ),
      createRoutePlaceStep(
        t
          ? t('map.route.board', { name: formatMarkerDisplayName(originStop.marker.label) })
          : `${formatMarkerDisplayName(originStop.marker.label)} 进站`,
        'boarding',
        candidate.icon,
        candidate.color,
      ),
      createRouteTransitStep(
        t
          ? t('map.route.ride', {
              line: candidate.line.name,
              direction: candidate.terminalName,
              stops: stationSpan,
              duration: formatRouteStepMinutes(transitMinutes, t),
            })
          : `乘坐 ${candidate.line.name}（${candidate.terminalName}方向） ${stationSpan}站 ${formatRouteStepMinutes(
              transitMinutes,
            )}`,
        candidate.color,
        buildTransitStopStepDetails(segmentStops),
      ),
      createRoutePlaceStep(
        t
          ? t('map.route.alight', { name: formatMarkerDisplayName(destinationStop.marker.label) })
          : `${formatMarkerDisplayName(destinationStop.marker.label)} 出站`,
        'alighting',
        undefined,
        candidate.color,
      ),
      createRouteWalkStep(
        formatRouteWalkStepLabel(egressRoute.usesRoadGraph, egressDistance, egressMinutes, t),
        egressRoute.details,
      ),
      ...createRouteEndpointAccessSteps(draft, 'destination', t),
      createRoutePlaceStep(
        t ? t('map.route.arrive', { name: draft.destinationLabel }) : `到达 ${draft.destinationLabel}`,
        'destination',
      ),
    ],
    note: getTransitRoutePlanNote(candidate.mode.mode, transitRoute.usesRoadGraph, t),
  };
}

function buildTransferTransitLineOptions(
  candidates: TransitLineDirectionCandidate[],
  draft: RoutePlanDraft,
  t: Translate,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
): RoutePlanOption[] {
  const originCandidates = candidates
    .map((candidate) => ({
      candidate,
      originStop: findNearestRouteLineStop(draft.origin, candidate.stops),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: TransitLineDirectionCandidate;
        originStop: TransitRouteStop;
      } => Boolean(item.originStop && item.originStop.index < item.candidate.stops.length - 1),
    )
    .sort(
      (left, right) =>
        getCoordinateDistance(draft.origin, left.originStop.center) -
        getCoordinateDistance(draft.origin, right.originStop.center),
    )
    .slice(0, 12);
  const destinationCandidates = candidates
    .map((candidate) => ({
      candidate,
      destinationStop: findNearestRouteLineStop(draft.destination, candidate.stops),
    }))
    .filter(
      (
        item,
      ): item is {
        candidate: TransitLineDirectionCandidate;
        destinationStop: TransitRouteStop;
      } => Boolean(item.destinationStop && item.destinationStop.index > 0),
    )
    .sort(
      (left, right) =>
        getCoordinateDistance(draft.destination, left.destinationStop.center) -
        getCoordinateDistance(draft.destination, right.destinationStop.center),
    )
    .slice(0, 12);
  const options: RoutePlanOption[] = [];
  const originRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'origin',
    markerRoadAccessIndex,
  );
  const destinationRoadAccessCandidates = getRouteEndpointRoadAccessCandidates(
    draft,
    'destination',
    markerRoadAccessIndex,
  );

  for (const originCandidate of originCandidates) {
    for (const destinationCandidate of destinationCandidates) {
      if (originCandidate.candidate.line.id === destinationCandidate.candidate.line.id) {
        continue;
      }

      const transfer = findTransferStopPair({
        fromCandidate: originCandidate.candidate,
        fromStartIndex: originCandidate.originStop.index + 1,
        toCandidate: destinationCandidate.candidate,
        toEndIndex: destinationCandidate.destinationStop.index - 1,
      });
      if (!transfer) {
        continue;
      }

      const firstSegment = originCandidate.candidate.stops.slice(
        originCandidate.originStop.index,
        transfer.fromStop.index + 1,
      );
      const secondSegment = destinationCandidate.candidate.stops.slice(
        transfer.toStop.index,
        destinationCandidate.destinationStop.index + 1,
      );
      if (firstSegment.length < 2 || secondSegment.length < 2) {
        continue;
      }

      const accessRoute = buildWalkRouteToTransitStop({
        markerRoadAccessIndex,
        mode: originCandidate.candidate.mode.mode,
        origin: draft.origin,
        originRoadAccessCandidates,
        roadGraph,
        routeCache,
        secondaryPoiIndex,
        stop: originCandidate.originStop,
        t,
      });
      const egressRoute = buildWalkRouteFromTransitStop({
        destination: draft.destination,
        destinationRoadAccessCandidates,
        markerRoadAccessIndex,
        mode: destinationCandidate.candidate.mode.mode,
        roadGraph,
        routeCache,
        secondaryPoiIndex,
        stop: destinationCandidate.destinationStop,
        t,
      });
      const transferRoute = buildWalkRouteBetweenCoordinates(
        transfer.fromStop.center,
        transfer.toStop.center,
        roadGraph,
        routeCache,
        t,
        {
          destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
            markerRoadAccessIndex,
            transfer.toStop.marker.id,
          ),
          originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
            markerRoadAccessIndex,
            transfer.fromStop.marker.id,
          ),
        },
      );
      const accessDistance = accessRoute.distance;
      const egressDistance = egressRoute.distance;
      const firstTransitRoute = buildTransitSegmentRoute(
        firstSegment,
        originCandidate.candidate.mode.mode,
        markerRoadAccessIndex,
        roadGraph,
        routeCache,
      );
      const secondTransitRoute = buildTransitSegmentRoute(
        secondSegment,
        destinationCandidate.candidate.mode.mode,
        markerRoadAccessIndex,
        roadGraph,
        routeCache,
      );
      const firstTransitDistance = firstTransitRoute.distance;
      const secondTransitDistance = secondTransitRoute.distance;
      const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
      const transferDistance =
        transfer.fromStop.marker.id === transfer.toStop.marker.id ? 0 : transferRoute.distance;
      const accessMinutes = estimateResolvedWalkRouteMinutes(accessRoute);
      const egressMinutes = estimateResolvedWalkRouteMinutes(egressRoute);
      const endpointAccessMinutes = estimateRouteMinutes(endpointAccessDistance, 72);
      const transferWalkMinutes =
        transferDistance > 0 ? estimateResolvedWalkRouteMinutes(transferRoute) : 0;
      const firstTransitMinutes = estimateTransitSegmentMinutes(
        firstSegment,
        firstTransitDistance,
        originCandidate.candidate.mode.mode,
      );
      const secondTransitMinutes = estimateTransitSegmentMinutes(
        secondSegment,
        secondTransitDistance,
        destinationCandidate.candidate.mode.mode,
      );
      const firstStationSpan = Math.max(1, transfer.fromStop.index - originCandidate.originStop.index);
      const secondStationSpan = Math.max(
        1,
        destinationCandidate.destinationStop.index - transfer.toStop.index,
      );
      const noteMode = shouldUseRoadGraphForTransitMode(originCandidate.candidate.mode.mode)
        ? originCandidate.candidate.mode.mode
        : destinationCandidate.candidate.mode.mode;
      const estimatedMinutes =
        endpointAccessMinutes +
        accessMinutes +
        egressMinutes +
        transferWalkMinutes +
        firstTransitMinutes +
        secondTransitMinutes +
        4;
      const coordinates = buildRouteTraceCoordinates(draft, [
        ...accessRoute.coordinates,
        ...firstTransitRoute.coordinates,
        ...transferRoute.coordinates,
        ...secondTransitRoute.coordinates,
        ...egressRoute.coordinates,
      ]);
      const traceSegments = compactRouteTraceSegments([
        createRouteTraceSegment('walk', [
          ...(draft.originRaw ? [draft.originRaw] : []),
          ...accessRoute.coordinates,
        ]),
        createRouteTraceSegment(
          'transit',
          firstTransitRoute.coordinates,
          originCandidate.candidate.color,
        ),
        createRouteTraceSegment('transfer', transferRoute.coordinates),
        createRouteTraceSegment(
          'transit',
          secondTransitRoute.coordinates,
          destinationCandidate.candidate.color,
        ),
        createRouteTraceSegment('walk', [
          ...egressRoute.coordinates,
          ...(draft.destinationRaw ? [draft.destinationRaw] : []),
        ]),
      ]);
      const labelMarkerIds = dedupeValues([
        originCandidate.originStop.marker.id,
        transfer.fromStop.marker.id,
        transfer.toStop.marker.id,
        destinationCandidate.destinationStop.marker.id,
      ]);
      const suppressLabelMarkerIds = dedupeValues([
        ...firstSegment.map((stop) => stop.marker.id),
        ...secondSegment.map((stop) => stop.marker.id),
      ]).filter((id) => !labelMarkerIds.includes(id));
      const roadLabels = combineRouteRoadLabels(
        createRouteRoadLabelsFromSegments(accessRoute.roadSegments),
        createRouteRoadLabelsFromSegments(transferRoute.roadSegments),
        createRouteRoadLabelsFromSegments(egressRoute.roadSegments),
      );

      options.push({
        id: `transfer-${originCandidate.candidate.line.id}-${destinationCandidate.candidate.line.id}-${originCandidate.originStop.marker.id}-${transfer.fromStop.marker.id}-${destinationCandidate.destinationStop.marker.id}`,
        title: t('map.route.transferTitle', {
          firstMode: originCandidate.candidate.modeLabel,
          secondMode: destinationCandidate.candidate.modeLabel,
        }),
        summary: `${originCandidate.candidate.line.name} → ${destinationCandidate.candidate.line.name} · ${formatRoutePlanDistance(
          endpointAccessDistance + accessDistance + egressDistance + transferDistance,
          t,
        )}${t('map.route.summary.walking')}`,
        icon: 'transfer_within_a_station',
        color: originCandidate.candidate.color,
        coordinates,
        traceSegments,
        roadLabels,
        markerIds: dedupeValues([
          ...getRouteEndpointMarkerIds(draft),
          ...(accessRoute.markerIds ?? []),
          ...firstSegment.map((stop) => stop.marker.id),
          ...secondSegment.map((stop) => stop.marker.id),
          ...(egressRoute.markerIds ?? []),
        ]),
        labelMarkerIds,
        suppressLabelMarkerIds,
        estimatedDistance:
          endpointAccessDistance +
          accessDistance +
          egressDistance +
          transferDistance +
          firstTransitDistance +
          secondTransitDistance,
        estimatedMinutes,
        transferCount: 1,
        walkingDistance: endpointAccessDistance + accessDistance + egressDistance + transferDistance,
        steps: [
          createRoutePlaceStep(t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', t),
          createRouteWalkStep(
            formatRouteWalkStepLabel(accessRoute.usesRoadGraph, accessDistance, accessMinutes, t),
            accessRoute.details,
          ),
          createRoutePlaceStep(
            t('map.route.board', {
              name: formatMarkerDisplayName(originCandidate.originStop.marker.label),
            }),
            'boarding',
            originCandidate.candidate.icon,
            originCandidate.candidate.color,
          ),
          createRouteTransitStep(
            t('map.route.ride', {
              line: originCandidate.candidate.line.name,
              direction: originCandidate.candidate.terminalName,
              stops: firstStationSpan,
              duration: formatRouteStepMinutes(firstTransitMinutes, t),
            }),
            originCandidate.candidate.color,
            buildTransitStopStepDetails(firstSegment),
          ),
          createRoutePlaceStep(
            t('map.route.transferAction', {
              name: formatMarkerDisplayName(transfer.fromStop.marker.label),
            }),
            'transfer',
            undefined,
            originCandidate.candidate.color,
          ),
          createRouteTransferStep(
            t('map.route.transferWalk', {
              distance: formatRoutePlanDistance(transferDistance, t),
              duration: formatRouteStepMinutes(transferWalkMinutes, t),
            }),
            transferRoute.details,
          ),
          createRoutePlaceStep(
            t('map.route.transferBoard', {
              name: formatMarkerDisplayName(transfer.toStop.marker.label),
            }),
            'boarding',
            destinationCandidate.candidate.icon,
            destinationCandidate.candidate.color,
          ),
          createRouteTransitStep(
            t('map.route.ride', {
              line: destinationCandidate.candidate.line.name,
              direction: destinationCandidate.candidate.terminalName,
              stops: secondStationSpan,
              duration: formatRouteStepMinutes(secondTransitMinutes, t),
            }),
            destinationCandidate.candidate.color,
            buildTransitStopStepDetails(secondSegment),
          ),
          createRoutePlaceStep(
            t('map.route.alight', {
              name: formatMarkerDisplayName(destinationCandidate.destinationStop.marker.label),
            }),
            'alighting',
            undefined,
            destinationCandidate.candidate.color,
          ),
          createRouteWalkStep(
            formatRouteWalkStepLabel(egressRoute.usesRoadGraph, egressDistance, egressMinutes, t),
            egressRoute.details,
          ),
          ...createRouteEndpointAccessSteps(draft, 'destination', t),
          createRoutePlaceStep(t('map.route.arrive', { name: draft.destinationLabel }), 'destination'),
        ],
        note: getTransitRoutePlanNote(
          noteMode,
          firstTransitRoute.usesRoadGraph ||
            secondTransitRoute.usesRoadGraph ||
            accessRoute.usesRoadGraph ||
            transferRoute.usesRoadGraph ||
            egressRoute.usesRoadGraph,
          t,
          t('map.route.transitNote.transfer'),
        ),
      });
    }
  }

  return options;
}

function buildTransitStationMarkerIndex(pointMarkers: PointMarker[]): Map<string, PointMarker[]> {
  const index = new Map<string, PointMarker[]>();
  for (const marker of pointMarkers) {
    if (!isTransitStationPoi(marker)) {
      continue;
    }
    for (const key of getStationNameMatchKeys(marker.label)) {
      const current = index.get(key) ?? [];
      current.push(marker);
      index.set(key, current);
    }
  }
  return index;
}

function findTransitStationMarker(
  stationName: string,
  stationMarkerIndex: Map<string, PointMarker[]>,
  mode: RouteTransportMode,
): PointMarker | undefined {
  for (const key of getStationNameMatchKeys(stationName)) {
    const marker = stationMarkerIndex
      .get(key)
      ?.find((item) => matchesTransitMarkerMode(item, mode));
    if (marker) {
      return marker;
    }
  }
  return undefined;
}

function matchesTransitMarkerMode(
  marker: PointMarker,
  mode: RouteTransportMode,
): boolean {
  if (mode === 'bus') {
    return marker.categoryId === 'bus-stop';
  }
  if (mode === 'metro') {
    return marker.categoryId === 'metro-station';
  }
  if (mode === 'tram') {
    return marker.categoryId === 'tram-station';
  }
  if (mode === 'coach') {
    return marker.categoryId === 'coach-station';
  }
  if (mode === 'railway') {
    return marker.categoryId === 'railway-station';
  }
  if (mode === 'ferry') {
    return marker.categoryId === 'ferry-port';
  }
  return marker.categoryId === 'airport';
}

function findNearestRouteLineStop(
  point: [number, number],
  stops: TransitRouteStop[],
): TransitRouteStop | undefined {
  return [...stops].sort(
    (left, right) =>
      getCoordinateDistance(point, left.center) - getCoordinateDistance(point, right.center),
  )[0];
}

function findTransferStopPair(input: {
  fromCandidate: TransitLineDirectionCandidate;
  fromStartIndex: number;
  toCandidate: TransitLineDirectionCandidate;
  toEndIndex: number;
}): { fromStop: TransitRouteStop; toStop: TransitRouteStop } | undefined {
  const toStopsByMarkerId = new Map<string, TransitRouteStop>();
  for (const stop of input.toCandidate.stops) {
    if (stop.index > input.toEndIndex) {
      continue;
    }
    toStopsByMarkerId.set(stop.marker.id, stop);
  }

  return input.fromCandidate.stops
    .filter((stop) => stop.index >= input.fromStartIndex)
    .map((fromStop) => {
      const toStop = toStopsByMarkerId.get(fromStop.marker.id);
      return toStop ? { fromStop, toStop } : undefined;
    })
    .filter(
      (pair): pair is { fromStop: TransitRouteStop; toStop: TransitRouteStop } => Boolean(pair),
    )
    .sort(
      (left, right) =>
        left.fromStop.index +
        left.toStop.index -
        (right.fromStop.index + right.toStop.index),
    )[0];
}

function buildTransitStopStepDetails(stops: TransitRouteStop[]): RoutePlanStepDetail[] {
  return stops.slice(1, -1).map((stop) =>
    createRouteStepDetail(
      'radio_button_checked',
      formatMarkerDisplayName(stop.marker.label),
      undefined,
      'place_pass',
    ),
  );
}

function buildTransitSegmentRoute(
  stops: TransitRouteStop[],
  mode: RouteTransportMode,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
): { coordinates: Array<[number, number]>; distance: number; usesRoadGraph: boolean } {
  if (stops.length < 2) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: 0,
      usesRoadGraph: false,
    };
  }

  if (!shouldUseRoadGraphForTransitMode(mode) || !roadGraph) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: getTransitSegmentDistance(stops),
      usesRoadGraph: false,
    };
  }

  const coordinates: Array<[number, number]> = [];
  let distance = 0;
  let usesRoadGraph = false;

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (!previous || !current) {
      continue;
    }

    const roadSegment = findRoadRouteBetweenCoordinates(
      previous.center,
      current.center,
      roadGraph,
      routeCache,
      undefined,
      {
        destinationAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          markerRoadAccessIndex,
          current.marker.id,
        ),
        originAccessCandidates: getIndexedMarkerRoadAccessCandidates(
          markerRoadAccessIndex,
          previous.marker.id,
        ),
      },
    );
    const segmentCoordinates = roadSegment?.coordinates ?? [previous.center, current.center];
    appendRouteSegmentCoordinates(coordinates, segmentCoordinates);
    distance += roadSegment?.distance ?? getCoordinateDistance(previous.center, current.center);
    usesRoadGraph ||= Boolean(roadSegment);
  }

  return {
    coordinates: dedupeConsecutiveCoordinates(coordinates),
    distance,
    usesRoadGraph,
  };
}

function shouldUseRoadGraphForTransitMode(mode: RouteTransportMode): boolean {
  return mode === 'bus' || mode === 'coach';
}

function findRoadRouteBetweenCoordinates(
  origin: [number, number],
  destination: [number, number],
  graph: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  t?: Translate,
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
): ResolvedRoadRoute | undefined {
  const routeCacheKey = getRoadRouteCacheKey(origin, destination, accessOptions, strategy);
  const cachedRoute = routeCache?.roadRouteByPair.get(routeCacheKey);
  if (cachedRoute !== undefined) {
    return cachedRoute ?? undefined;
  }

  const originAccessCandidates =
    accessOptions?.originAccessCandidates !== undefined
      ? accessOptions.originAccessCandidates
      : findRoadAccessCandidates(origin, destination, graph, routeCache);
  const destinationAccessCandidates =
    accessOptions?.destinationAccessCandidates !== undefined
      ? accessOptions.destinationAccessCandidates
      : findRoadAccessCandidates(destination, origin, graph, routeCache);
  if (originAccessCandidates.length === 0 || destinationAccessCandidates.length === 0) {
    routeCache?.roadRouteByPair.set(routeCacheKey, null);
    return undefined;
  }

  const pathCache = routeCache?.pathByNodePair ?? new Map<string, RoadRoutePath | undefined>();
  let bestRoute: ResolvedRoadRoute | undefined;
  let bestRouteScore = Number.POSITIVE_INFINITY;

  for (const originAccess of originAccessCandidates) {
    for (const destinationAccess of destinationAccessCandidates) {
      const sameSegmentRoute = buildSameSegmentRoadRoute(
        origin,
        destination,
        originAccess,
        destinationAccess,
        t,
      );
      const sameSegmentScore = sameSegmentRoute
        ? getRoadRouteStrategyScore(sameSegmentRoute, strategy)
        : Number.POSITIVE_INFINITY;
      if (sameSegmentRoute && sameSegmentScore < bestRouteScore) {
        bestRoute = sameSegmentRoute;
        bestRouteScore = sameSegmentScore;
      }

      for (const originNodeId of [originAccess.startNodeId, originAccess.endNodeId]) {
        for (const destinationNodeId of [
          destinationAccess.startNodeId,
          destinationAccess.endNodeId,
        ]) {
          const route = buildGraphRoadRouteCandidate({
            destination,
            destinationAccess,
            destinationNodeId,
            graph,
            origin,
            originAccess,
            originNodeId,
            pathCache,
            strategy,
            t,
          });
          const routeScore = route
            ? getRoadRouteStrategyScore(route, strategy)
            : Number.POSITIVE_INFINITY;
          if (route && routeScore < bestRouteScore) {
            bestRoute = route;
            bestRouteScore = routeScore;
          }
        }
      }
    }
  }

  routeCache?.roadRouteByPair.set(routeCacheKey, bestRoute ?? null);
  return bestRoute;
}

function getRoadRouteStrategyScore(
  route: Pick<ResolvedRoadRoute, 'distance' | 'roadSegments'>,
  strategy: RoadRouteStrategy,
): number {
  if (strategy === 'shortest') {
    return route.distance;
  }

  return route.distance + countRoadRouteTurns(route.roadSegments) * 520;
}

function countRoadRouteTurns(segments: readonly RoadRouteInstructionSegment[]): number {
  let turns = 0;
  let previousVector: [number, number] | undefined;
  let previousLabel: string | undefined;

  for (const segment of segments) {
    if (segment.coordinates.length < 2) {
      continue;
    }

    const vector = getCoordinateChainVector(segment.coordinates);
    const vectorLength = Math.hypot(vector[0], vector[1]);
    if (vectorLength === 0) {
      continue;
    }

    if (previousVector) {
      const previousLength = Math.hypot(previousVector[0], previousVector[1]);
      const cosine = previousLength
        ? clampNumber(
            (previousVector[0] * vector[0] + previousVector[1] * vector[1]) /
              (previousLength * vectorLength),
            -1,
            1,
          )
        : 1;
      const angle = Math.acos(cosine);
      if (angle > Math.PI / 7 || (previousLabel && previousLabel !== segment.label)) {
        turns += 1;
      }
    }

    previousVector = vector;
    previousLabel = segment.label;
  }

  return turns;
}

function findRoadAccessCandidates(
  point: [number, number],
  target: [number, number],
  graph: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  limit = 12,
): RoadAccessCandidate[] {
  const accessCacheKey = `${formatCoordinateCacheKey(point)}->${formatCoordinateCacheKey(target)}:${limit}`;
  const cachedCandidates = routeCache?.accessCandidatesByPair.get(accessCacheKey);
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const scoredCandidates = graph.roadSegments.map((segment) => {
    const projection = projectPointToRoadSegment(point, segment);
    const directionPenalty = getRoadAccessDirectionPenalty(point, target, projection.coordinate);
    return {
      ...projection,
      score: projection.distanceToPoint + directionPenalty,
    };
  });
  const scoreCandidates = [...scoredCandidates]
    .sort((left, right) => left.score - right.score)
    .slice(0, limit);
  const distanceCandidates = [...scoredCandidates]
    .sort((left, right) => left.distanceToPoint - right.distanceToPoint)
    .slice(0, limit);
  const deduped = new Map<string, RoadAccessCandidate>();
  const addCandidate = (candidate: RoadAccessCandidate) => {
    const key = [
      candidate.startNodeId,
      candidate.endNodeId,
      candidate.coordinate[0].toFixed(2),
      candidate.coordinate[1].toFixed(2),
    ].join(':');
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  };

  const scoreQuota = Math.ceil(limit * 0.6);
  for (const candidate of scoreCandidates) {
    addCandidate(candidate);
    if (deduped.size >= scoreQuota) {
      break;
    }
  }
  for (const candidate of distanceCandidates) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }
  for (const candidate of scoreCandidates) {
    addCandidate(candidate);
    if (deduped.size >= limit) {
      break;
    }
  }

  const result = Array.from(deduped.values());
  routeCache?.accessCandidatesByPair.set(accessCacheKey, result);
  return result;
}

function getRoadRouteCacheKey(
  origin: [number, number],
  destination: [number, number],
  accessOptions?: RoadRouteAccessOptions,
  strategy: RoadRouteStrategy = 'shortest',
): string {
  return [
    strategy,
    `${formatCoordinateCacheKey(origin)}->${formatCoordinateCacheKey(destination)}`,
    formatRoadAccessCandidatesCacheKey(accessOptions?.originAccessCandidates),
    formatRoadAccessCandidatesCacheKey(accessOptions?.destinationAccessCandidates),
  ].join('|');
}

function formatRoadAccessCandidatesCacheKey(
  candidates: RoadAccessCandidate[] | undefined,
): string {
  if (!candidates || candidates.length === 0) {
    return '*';
  }

  return candidates
    .map(
      (candidate) =>
        `${candidate.roadId}:${candidate.coordinate[0].toFixed(2)},${candidate.coordinate[1].toFixed(2)}`,
    )
    .join(';');
}

function formatCoordinateCacheKey(coordinate: [number, number]): string {
  return `${coordinate[0].toFixed(2)},${coordinate[1].toFixed(2)}`;
}

function projectPointToRoadSegment(
  point: [number, number],
  segment: RoadRouteSegment,
): RoadAccessCandidate {
  const deltaX = segment.end[0] - segment.start[0];
  const deltaZ = segment.end[1] - segment.start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const ratio = lengthSquared
    ? clampNumber(
        ((point[0] - segment.start[0]) * deltaX + (point[1] - segment.start[1]) * deltaZ) /
          lengthSquared,
        0,
        1,
      )
    : 0;
  const coordinate = interpolateCoordinate(segment.start, segment.end, ratio);
  const totalDistance = getCoordinateDistance(segment.start, segment.end);
  const startDistance = totalDistance * ratio;
  return {
    coordinate,
    distanceToPoint: getCoordinateDistance(point, coordinate),
    endDistance: totalDistance - startDistance,
    endNodeId: segment.endNodeId,
    roadId: segment.roadId,
    roadLabel: segment.roadLabel,
    startDistance,
    startNodeId: segment.startNodeId,
  };
}

function buildMarkerRoadAccessIndex(
  markers: PointMarker[],
  graph: RoadRouteGraph,
): Map<string, RoadAccessCandidate[]> {
  const rawIndex = new Map<string, RoadAccessCandidate[]>();
  const projectionOwners = new Map<
    string,
    { distanceToPoint: number; markerId: string }
  >();
  for (const marker of markers) {
    const center = getMarkerCenter(marker);
    if (!center) {
      continue;
    }

    const candidates = buildMarkerRoadAccessCandidates(center, graph);
    if (candidates.length > 0) {
      rawIndex.set(marker.id, candidates);
      for (const candidate of candidates) {
        const key = getRoadAccessProjectionOwnershipKey(candidate);
        const currentOwner = projectionOwners.get(key);
        if (
          !currentOwner ||
          candidate.distanceToPoint < currentOwner.distanceToPoint ||
          (candidate.distanceToPoint === currentOwner.distanceToPoint &&
            marker.id < currentOwner.markerId)
        ) {
          projectionOwners.set(key, {
            distanceToPoint: candidate.distanceToPoint,
            markerId: marker.id,
          });
        }
      }
    }
  }

  const index = new Map<string, RoadAccessCandidate[]>();
  for (const [markerId, candidates] of rawIndex) {
    const ownedCandidates = candidates.filter(
      (candidate) =>
        projectionOwners.get(getRoadAccessProjectionOwnershipKey(candidate))?.markerId ===
        markerId,
    );
    if (ownedCandidates.length > 0) {
      index.set(markerId, ownedCandidates);
    }
  }

  return index;
}

function buildMarkerRoadAccessCandidates(
  point: [number, number],
  graph: RoadRouteGraph,
): RoadAccessCandidate[] {
  const nearestByRoad = new Map<string, RoadAccessCandidate>();
  for (const segment of graph.roadSegments) {
    const projection = projectPointToRoadSegment(point, segment);
    const existing = nearestByRoad.get(segment.roadId);
    if (!existing || projection.distanceToPoint < existing.distanceToPoint) {
      nearestByRoad.set(segment.roadId, projection);
    }
  }

  const sorted = Array.from(nearestByRoad.values()).sort(
    (left, right) => left.distanceToPoint - right.distanceToPoint,
  );

  return sorted
    .filter(
      (candidate, index) =>
        index === 0 || candidate.distanceToPoint <= markerRoadAccessProjectionRange,
    )
    .slice(0, 8);
}

function getRoadAccessProjectionOwnershipKey(candidate: RoadAccessCandidate): string {
  return `${candidate.coordinate[0].toFixed(2)},${candidate.coordinate[1].toFixed(2)}`;
}

function getRoadAccessDirectionPenalty(
  point: [number, number],
  target: [number, number],
  accessPoint: [number, number],
): number {
  const accessVector: [number, number] = [
    accessPoint[0] - point[0],
    accessPoint[1] - point[1],
  ];
  const targetVector: [number, number] = [
    target[0] - point[0],
    target[1] - point[1],
  ];
  const accessLength = Math.hypot(accessVector[0], accessVector[1]);
  const targetLength = Math.hypot(targetVector[0], targetVector[1]);
  if (accessLength === 0 || targetLength === 0) {
    return 0;
  }

  const cosine =
    (accessVector[0] * targetVector[0] + accessVector[1] * targetVector[1]) /
    (accessLength * targetLength);
  return (1 - clampNumber(cosine, -1, 1)) * 18;
}

function buildSameSegmentRoadRoute(
  origin: [number, number],
  destination: [number, number],
  originAccess: RoadAccessCandidate,
  destinationAccess: RoadAccessCandidate,
  t?: Translate,
):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      roadSegments: RoadRouteInstructionSegment[];
    }
  | undefined {
  const sameSegment =
    originAccess.roadId === destinationAccess.roadId &&
    originAccess.startNodeId === destinationAccess.startNodeId &&
    originAccess.endNodeId === destinationAccess.endNodeId;
  if (!sameSegment) {
    return undefined;
  }

  const roadDistance = Math.abs(originAccess.startDistance - destinationAccess.startDistance);
  const instructionSegments: RoadRouteInstructionSegment[] = [];
  if (getCoordinateDistance(origin, originAccess.coordinate) > 0.01) {
    instructionSegments.push({
      coordinates: [origin, originAccess.coordinate],
      kind: 'approach',
      label: originAccess.roadLabel,
    });
  }
  if (roadDistance > 0.01) {
    instructionSegments.push({
      coordinates: [originAccess.coordinate, destinationAccess.coordinate],
      kind: 'road',
      label: originAccess.roadLabel,
    });
  }
  if (getCoordinateDistance(destinationAccess.coordinate, destination) > 0.01) {
    instructionSegments.push({
      coordinates: [destinationAccess.coordinate, destination],
      kind: 'depart',
      label: destinationAccess.roadLabel,
    });
  }

  const coordinates = dedupeConsecutiveCoordinates([
    origin,
    originAccess.coordinate,
    destinationAccess.coordinate,
    destination,
  ]);
  const distance =
    originAccess.distanceToPoint + roadDistance + destinationAccess.distanceToPoint;

  return {
    coordinates,
    details: buildRoadRouteStepDetails(instructionSegments, t),
    distance,
    roadSegments: instructionSegments,
  };
}

function buildGraphRoadRouteCandidate(input: {
  destination: [number, number];
  destinationAccess: RoadAccessCandidate;
  destinationNodeId: string;
  graph: RoadRouteGraph;
  origin: [number, number];
  originAccess: RoadAccessCandidate;
  originNodeId: string;
  pathCache: Map<string, RoadRoutePath | undefined>;
  strategy: RoadRouteStrategy;
  t?: Translate;
}):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      roadSegments: RoadRouteInstructionSegment[];
    }
  | undefined {
  const originNode = input.graph.nodesById.get(input.originNodeId);
  const destinationNode = input.graph.nodesById.get(input.destinationNodeId);
  if (!originNode || !destinationNode) {
    return undefined;
  }

  const pathCacheKey = `${input.strategy}:${input.originNodeId}->${input.destinationNodeId}`;
  if (!input.pathCache.has(pathCacheKey)) {
    input.pathCache.set(
      pathCacheKey,
      findRoadRoutePath(input.graph, input.originNodeId, input.destinationNodeId, input.strategy),
    );
  }
  const roadPath = input.pathCache.get(pathCacheKey);
  if (!roadPath) {
    return undefined;
  }

  const instructionSegments: RoadRouteInstructionSegment[] = [];
  if (getCoordinateDistance(input.origin, input.originAccess.coordinate) > 0.01) {
    instructionSegments.push({
      coordinates: [input.origin, input.originAccess.coordinate],
      kind: 'approach',
      label: input.originAccess.roadLabel,
    });
  }
  if (
    input.originAccess.coordinate[0] !== originNode.coordinate[0] ||
    input.originAccess.coordinate[1] !== originNode.coordinate[1]
  ) {
    instructionSegments.push({
      coordinates: [input.originAccess.coordinate, originNode.coordinate],
      kind: 'road',
      label: input.originAccess.roadLabel,
    });
  }
  instructionSegments.push(...roadPath.segments);
  if (
    destinationNode.coordinate[0] !== input.destinationAccess.coordinate[0] ||
    destinationNode.coordinate[1] !== input.destinationAccess.coordinate[1]
  ) {
    instructionSegments.push({
      coordinates: [destinationNode.coordinate, input.destinationAccess.coordinate],
      kind: 'road',
      label: input.destinationAccess.roadLabel,
    });
  }
  if (getCoordinateDistance(input.destinationAccess.coordinate, input.destination) > 0.01) {
    instructionSegments.push({
      coordinates: [input.destinationAccess.coordinate, input.destination],
      kind: 'depart',
      label: input.destinationAccess.roadLabel,
    });
  }

  const accessDistance =
    input.originAccess.distanceToPoint +
    getCoordinateDistance(input.originAccess.coordinate, originNode.coordinate);
  const egressDistance =
    getCoordinateDistance(destinationNode.coordinate, input.destinationAccess.coordinate) +
    input.destinationAccess.distanceToPoint;
  const coordinates = dedupeConsecutiveCoordinates([
    input.origin,
    input.originAccess.coordinate,
    ...roadPath.coordinates,
    input.destinationAccess.coordinate,
    input.destination,
  ]);

  return {
    coordinates,
    details: buildRoadRouteStepDetails(instructionSegments, input.t),
    distance: accessDistance + roadPath.distance + egressDistance,
    roadSegments: instructionSegments,
  };
}

function appendRouteSegmentCoordinates(
  target: Array<[number, number]>,
  coordinates: Array<[number, number]>,
) {
  for (const coordinate of coordinates) {
    const previous = target.at(-1);
    if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) {
      continue;
    }
    target.push(coordinate);
  }
}

function getTransitRoutePlanNote(
  mode: RouteTransportMode,
  usesRoadGraph: boolean,
  t?: Translate,
  fallbackNote?: string,
): string {
  const defaultFallbackNote =
    fallbackNote ??
    (t
      ? t('map.route.transitNote.default')
      : '已按真实线路站序生成候选；站间耗时优先使用旧数据 travelTime，缺失时仍按距离估算。');
  if (!shouldUseRoadGraphForTransitMode(mode)) {
    return defaultFallbackNote;
  }

  return usesRoadGraph
    ? t
      ? t('map.route.transitNote.road')
      : '公交/客运站间已优先沿旧地图道路端点图生成，并按 100 格规则连通相邻道路；无法连通的片段回退为直线估算。站间耗时优先使用旧数据 travelTime。'
    : t
      ? t('map.route.transitNote.fallbackRoad')
      : '已尝试使用旧地图道路端点图生成公交/客运站间路径；当前路网缺失或不连通的片段仍按直线估算。站间耗时优先使用旧数据 travelTime。';
}

function getTransitSegmentDistance(stops: TransitRouteStop[]): number {
  return stops.slice(1).reduce((total, stop, index) => {
    const previous = stops[index];
    return previous ? total + getCoordinateDistance(previous.center, stop.center) : total;
  }, 0);
}

function estimateTransitSegmentMinutes(
  stops: TransitRouteStop[],
  distance: number,
  mode: RouteTransportMode,
): number {
  const travelTimes = stops
    .map((stop) => stop.stop.travelTime)
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined));
  const knownTravelTimes = travelTimes.filter((value): value is number => value !== undefined);
  const looksCumulative =
    knownTravelTimes.length >= 2 &&
    knownTravelTimes.every((value, index) => index === 0 || value >= knownTravelTimes[index - 1]!);
  const firstTravelTime = travelTimes.find((value) => value !== undefined);
  const lastTravelTime = [...travelTimes].reverse().find((value) => value !== undefined);
  const cumulativeTravelTime =
    looksCumulative && firstTravelTime !== undefined && lastTravelTime !== undefined
      ? lastTravelTime - firstTravelTime
      : 0;
  const segmentTravelTime = looksCumulative
    ? cumulativeTravelTime
    : travelTimes
        .slice(1)
        .filter((value): value is number => value !== undefined)
        .reduce((total, value) => total + value, 0);

  if (segmentTravelTime > 0) {
    return Math.max(1, Math.round(segmentTravelTime));
  }
  return estimateRouteMinutes(distance, getTransitSpeedFactor(mode));
}

function dedupeValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getRouteEndpointMarkerIds(draft: RoutePlanDraft): string[] {
  return dedupeValues([
    draft.originId,
    draft.originAccessId,
    draft.destinationId,
    draft.destinationAccessId,
  ].filter((id): id is string => Boolean(id)));
}

function getRouteEndpointRoadAccessCandidates(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
): RoadAccessCandidate[] | undefined {
  const markerId =
    endpoint === 'origin'
      ? draft.originAccessId ?? draft.originId
      : draft.destinationAccessId ?? draft.destinationId;
  return markerId
    ? getIndexedMarkerRoadAccessCandidates(markerRoadAccessIndex, markerId)
    : undefined;
}

function getIndexedMarkerRoadAccessCandidates(
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  markerId: string,
): RoadAccessCandidate[] {
  return markerRoadAccessIndex.get(markerId) ?? [];
}

function findNearestRouteStation<T extends { center: [number, number] }>(
  point: [number, number],
  candidates: T[],
): T | undefined {
  return [...candidates].sort(
    (left, right) =>
      getCoordinateDistance(point, left.center) - getCoordinateDistance(point, right.center),
  )[0];
}

function getCoordinateDistance(left: [number, number], right: [number, number]): number {
  const deltaX = left[0] - right[0];
  const deltaZ = left[1] - right[1];
  return Math.hypot(deltaX, deltaZ);
}

function estimateRouteMinutes(distance: number, blocksPerMinute: number): number {
  return Math.max(1, Math.round(distance / blocksPerMinute));
}

function estimateResolvedWalkRouteMinutes(route: ResolvedWalkRoute): number {
  return route.distance <= 0
    ? 0
    : estimateRouteMinutes(route.distance, route.usesRoadGraph ? 64 : 72);
}

function getTransitSpeedFactor(mode: RouteTransportMode): number {
  if (mode === 'metro' || mode === 'railway') {
    return 220;
  }

  if (mode === 'tram') {
    return 150;
  }

  if (mode === 'coach') {
    return 180;
  }

  if (mode === 'ferry') {
    return 130;
  }

  return 120;
}

function formatRoutePlanDistance(distance: number, t?: Translate): string {
  const count = Math.max(0, Math.round(distance));
  return t ? t('map.route.distance.blocks', { count }) : `${count} 格`;
}

function formatRoutePlanMinutes(minutes: number, t?: Translate): string {
  const count = Math.max(1, minutes);
  return t ? t('map.route.duration.short', { count }) : `约 ${count} 分`;
}

function formatRouteStepMinutes(minutes: number, t?: Translate): string {
  const count = Math.max(1, Math.round(minutes));
  return t ? t('map.route.duration.step', { count }) : `${count}分钟`;
}

function buildMapSharePayload(target: MapShareTarget, t: Translate): MapSharePayload {
  if (target.kind === 'marker') {
    const label = formatMarkerDisplayName(target.marker.label);
    const coordinate = getCenterableMarkerPrimaryCoordinate(target.marker);
    const url = buildMapMarkerShareUrl(target.marker);
    const category = target.marker.categoryId
      ? getMarkerCategoryDisplayName(target.marker.categoryId, t)
      : formatMarkerDetail(target.marker, t);
    const coordinateText = coordinate
      ? `X ${formatMapCoordinate(coordinate[0])} / Z ${formatMapCoordinate(coordinate[1])}`
      : '';

    return {
      color: 'var(--yct-color-primary)',
      eyebrow: category,
      icon: 'location_on',
      meta: [formatMarkerDetail(target.marker, t), coordinateText].filter(Boolean),
      steps: [],
      text: [
        t('map.poi.shareText', { name: label }),
        formatMarkerDetail(target.marker, t),
        t('map.share.footerText'),
        t('map.share.footerDisclaimer'),
      ]
        .filter(Boolean)
        .join('\n'),
      title: t('map.poi.shareTitle', { name: label }),
      url,
    };
  }

  const routeTitle = `${target.draft.originLabel} → ${target.draft.destinationLabel}`;
  const url = buildRoutePlanShareUrl(
    target.draft,
    target.enabledModes,
    target.option?.id,
  );
  const optionSummary = target.option
    ? [
        target.option.title,
        target.option.summary,
        `${formatRoutePlanMinutes(target.option.estimatedMinutes, t)} · ${formatRoutePlanDistance(
          target.option.walkingDistance,
          t,
        )}`,
      ]
    : [];
  const steps =
    target.option?.steps.map((step) => ({
      color: step.color,
      details: step.details,
      icon: step.icon,
      kind: step.kind,
      label: step.label,
      role: step.role,
    })) ?? [];
  const text = [
    t('map.route.shareText', { route: routeTitle }),
    ...optionSummary,
    target.option ? formatRouteShareStepTextList(target.option) : '',
    t('map.share.footerText'),
    t('map.share.footerDisclaimer'),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    color: target.option?.color ?? 'var(--yct-color-primary)',
    eyebrow: t('map.route.share'),
    icon: target.option?.icon ?? 'route',
    meta: optionSummary,
    steps,
    text,
    title: routeTitle,
    url,
  };
}

function formatRouteShareStepTextList(option: RoutePlanOption): string {
  return option.steps
    .map((step) => `${getRouteShareStepTextSymbol(step)} ${step.label}`)
    .join('\n');
}

function getRouteShareStepTextSymbol(step: RoutePlanStep): string {
  if (step.role === 'origin') {
    return '●';
  }

  if (step.role === 'destination') {
    return '●';
  }

  if (step.kind === 'place') {
    return '○';
  }

  return '↓';
}

function getRouteShareStepMarkerIcon(step: MapShareStep): string | undefined {
  if (step.kind !== 'place') {
    return undefined;
  }

  if (step.role === 'origin') {
    return 'location_on';
  }

  if (step.role === 'destination') {
    return 'flag';
  }

  if (step.role === 'transfer') {
    return 'radio_button_unchecked';
  }

  if (step.role === 'alighting') {
    return 'exit_to_app';
  }

  return step.icon ?? (step.role === 'boarding' ? 'directions_bus' : undefined);
}

function formatShareRouteDetailLabel(detail: RoutePlanStepDetail, t: Translate): string {
  const turnInstruction = getTurnInstructionText(detail.icon, t);
  if (!turnInstruction) {
    return detail.label;
  }

  const departLabel = t('map.route.road.depart');
  if (detail.label === departLabel) {
    return `${turnInstruction} ${departLabel}`;
  }

  const connectionPrefix = t('map.route.road.connection', { road: '' }).trim();
  const approachPrefix = t('map.route.road.approach', { road: '' }).trim();
  if (
    (connectionPrefix && detail.label.startsWith(connectionPrefix)) ||
    (approachPrefix && detail.label.startsWith(approachPrefix))
  ) {
    return `${turnInstruction} ${detail.label}`;
  }

  return `${turnInstruction} ${t('map.route.road.enter', { road: detail.label })}`;
}

async function runMapShareAction({
  mode,
  payload,
  previewElement,
  t,
}: Readonly<{
  mode: MapShareMode;
  payload: MapSharePayload;
  previewElement: HTMLElement | null;
  t: Translate;
}>): Promise<string> {
  if (mode === 'link') {
    await copyTextOrUseSystemShare(payload.url, {
      text: payload.text,
      title: payload.title,
      url: payload.url,
    });
    return t('map.share.linkCopied');
  }

  if (mode === 'text') {
    await copyTextOrUseSystemShare(payload.text, {
      text: payload.text,
      title: payload.title,
      url: payload.url,
    });
    return t('map.share.textCopied');
  }

  if (!previewElement) {
    throw new Error('Share preview is not mounted');
  }

  const imageBlob = await createMapShareImageBlob(previewElement);
  const file = new File([imageBlob], 'yuchengtong-share.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      text: payload.text,
      title: payload.title,
    });
    return t('map.share.imageShared');
  }

  downloadBlob(imageBlob, 'yuchengtong-share.png');
  return t('map.share.imageDownloaded');
}

async function copyTextOrUseSystemShare(value: string, shareData: ShareData): Promise<void> {
  try {
    await copyTextToClipboard(value);
    return;
  } catch {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  }

  throw new Error(`Sharing is unavailable for ${value.length} characters`);
}

async function createMapShareImageBlob(previewElement: HTMLElement): Promise<Blob> {
  await document.fonts?.ready;
  const fontEmbedCSS = await getFontEmbedCSS(previewElement, {
    preferredFontFormat: 'woff2',
  });
  const blob = await toBlob(previewElement, {
    cacheBust: true,
    fontEmbedCSS,
    pixelRatio: Math.min(window.devicePixelRatio || 2, 3),
    preferredFontFormat: 'woff2',
  });

  if (!blob) {
    throw new Error('Failed to create share image');
  }

  return blob;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getCenterableMarkerPrimaryCoordinate(marker: CenterableMarker): [number, number] | null {
  if (marker.geometry.type === 'Point') {
    return marker.geometry.coordinates;
  }

  const coordinate = marker.geometry.coordinates[0];
  return coordinate ? [coordinate[0], coordinate[1]] : null;
}

function buildMapMarkerShareUrl(marker: CenterableMarker): string {
  const url = new URL(appPath('/map'), window.location.origin);
  url.searchParams.set('ms', encodeBase64UrlText(marker.id));
  return url.toString();
}

function buildRoutePlanShareUrl(
  draft: RoutePlanDraft,
  enabledModes: EnabledRouteTransportModes,
  selectedOptionId?: string,
): string {
  const url = new URL(appPath('/map'), window.location.origin);
  const compactState = buildCompactRoutePlanShareState(draft, enabledModes, selectedOptionId);
  setCompactRoutePlanShareSearchParam(url, compactState);
  return url.toString();
}

function readMapSharedFocusKey(searchParams: Pick<URLSearchParams, 'get'>): string | null {
  const compactMarkerKey = decodeBase64UrlText(searchParams.get('ms'));
  if (compactMarkerKey) {
    return compactMarkerKey;
  }

  const markerKey = normalizeMapSharedFocusValue(
    searchParams.get('m') ?? searchParams.get('marker'),
  );
  if (markerKey) {
    return markerKey;
  }

  const lineKey = normalizeMapSharedFocusValue(
    searchParams.get('l') ?? searchParams.get('line') ?? searchParams.get('lineId'),
  );
  return lineKey ? ensureTransitLineFocusKey(lineKey) : null;
}

function readMapSharedCoordinateFocus(
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>,
): SharedCoordinateFocusState | null {
  const compactCoordinate = parseCoordinateParam(
    searchParams.get('c') ?? searchParams.get('coordinate'),
  );
  const xValue = searchParams.get('x');
  const zValue = searchParams.get('z');
  const x = xValue === null ? Number.NaN : Number(xValue);
  const z = zValue === null ? Number.NaN : Number(zValue);
  const coordinate =
    compactCoordinate ??
    (Number.isFinite(x) && Number.isFinite(z) ? ([x, z] as [number, number]) : null);
  if (!coordinate) {
    return null;
  }
  const label =
    normalizeMapSharedFocusValue(searchParams.get('label') ?? searchParams.get('name')) ??
    undefined;

  return {
    coordinate,
    key: searchParams.toString(),
    label,
  };
}

function readMapSharedRoutePlan(
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>,
): SharedRoutePlanState | null {
  const compressedRoutePlan = readCompressedRoutePlanShareState(
    searchParams.get('rsc'),
    searchParams,
  );
  if (compressedRoutePlan) {
    return compressedRoutePlan;
  }

  const compactRoutePlan = readBase64RoutePlanShareState(searchParams.get('rs'), searchParams);
  if (compactRoutePlan) {
    return compactRoutePlan;
  }

  if ((searchParams.get('r') ?? searchParams.get('route')) !== '1') {
    return null;
  }

  const origin = parseCoordinateParam(searchParams.get('o') ?? searchParams.get('origin'));
  const destination = parseCoordinateParam(
    searchParams.get('d') ?? searchParams.get('destination'),
  );
  if (!origin || !destination) {
    return null;
  }

  const draft: RoutePlanDraft = {
    destination,
    destinationId:
      normalizeMapSharedFocusValue(searchParams.get('di') ?? searchParams.get('destinationId')) ??
      undefined,
    destinationLabel:
      normalizeMapSharedFocusValue(
        searchParams.get('dl') ?? searchParams.get('destinationLabel'),
      ) ??
      formatPoint(destination),
    origin,
    originId:
      normalizeMapSharedFocusValue(searchParams.get('oi') ?? searchParams.get('originId')) ??
      undefined,
    originLabel:
      normalizeMapSharedFocusValue(searchParams.get('ol') ?? searchParams.get('originLabel')) ??
      formatPoint(origin),
  };

  return {
    draft,
    enabledModes: parseRouteTransportModes(searchParams.get('tm') ?? searchParams.get('modes')),
    key: searchParams.toString(),
    selectedOptionId:
      normalizeMapSharedFocusValue(searchParams.get('op') ?? searchParams.get('option')) ??
      undefined,
  };
}

function buildCompactRoutePlanShareState(
  draft: RoutePlanDraft,
  enabledModes: EnabledRouteTransportModes,
  selectedOptionId?: string,
): CompactRoutePlanShareState {
  const modes = routeTransportModeOptions
    .filter((mode) => enabledModes[mode.mode])
    .map((mode) => mode.mode);

  return [
    formatCoordinateParam(draft.origin),
    formatCoordinateParam(draft.destination),
    draft.originLabel !== formatPoint(draft.origin) ? draft.originLabel : '',
    draft.destinationLabel !== formatPoint(draft.destination) ? draft.destinationLabel : '',
    draft.originId ?? '',
    draft.destinationId ?? '',
    modes.join('.'),
    selectedOptionId ?? '',
  ];
}

function setCompactRoutePlanShareSearchParam(
  url: URL,
  state: CompactRoutePlanShareState,
) {
  const json = JSON.stringify(state);
  const compressed = LZString.compressToEncodedURIComponent(json);
  const base64 = encodeBase64UrlText(json);
  if (`rsc=${compressed}`.length < `rs=${base64}`.length) {
    url.searchParams.set('rsc', compressed);
  } else {
    url.searchParams.set('rs', base64);
  }
}

function readCompressedRoutePlanShareState(
  value: string | null,
  searchParams: Pick<URLSearchParams, 'toString'>,
): SharedRoutePlanState | null {
  if (!value) {
    return null;
  }

  try {
    return readRoutePlanShareStateJson(
      LZString.decompressFromEncodedURIComponent(value),
      searchParams,
    );
  } catch {
    return null;
  }
}

function readBase64RoutePlanShareState(
  value: string | null,
  searchParams: Pick<URLSearchParams, 'toString'>,
): SharedRoutePlanState | null {
  const decoded = decodeBase64UrlText(value);
  if (!decoded) {
    return null;
  }

  return readRoutePlanShareStateJson(decoded, searchParams);
}

function readRoutePlanShareStateJson(
  value: string | null,
  searchParams: Pick<URLSearchParams, 'toString'>,
): SharedRoutePlanState | null {
  if (!value) {
    return null;
  }

  try {
    const state = JSON.parse(value) as unknown;
    if (!Array.isArray(state)) {
      return null;
    }

    const [
      originValue,
      destinationValue,
      originLabelValue,
      destinationLabelValue,
      originIdValue,
      destinationIdValue,
      modesValue,
      selectedOptionIdValue,
    ] = state;
    if (typeof originValue !== 'string' || typeof destinationValue !== 'string') {
      return null;
    }

    const origin = parseCoordinateParam(originValue);
    const destination = parseCoordinateParam(destinationValue);
    if (!origin || !destination) {
      return null;
    }

    return {
      draft: {
        destination,
        destinationId:
          typeof destinationIdValue === 'string'
            ? normalizeMapSharedFocusValue(destinationIdValue) ?? undefined
            : undefined,
        destinationLabel:
          typeof destinationLabelValue === 'string' && destinationLabelValue.trim()
            ? destinationLabelValue
            : formatPoint(destination),
        origin,
        originId:
          typeof originIdValue === 'string'
            ? normalizeMapSharedFocusValue(originIdValue) ?? undefined
            : undefined,
        originLabel:
          typeof originLabelValue === 'string' && originLabelValue.trim()
            ? originLabelValue
            : formatPoint(origin),
      },
      enabledModes:
        typeof modesValue === 'string'
          ? parseRouteTransportModes(modesValue.replaceAll('.', ','))
          : { ...defaultRouteTransportModes },
      key: searchParams.toString(),
      selectedOptionId:
        typeof selectedOptionIdValue === 'string'
          ? normalizeMapSharedFocusValue(selectedOptionIdValue) ?? undefined
          : undefined,
    };
  } catch {
    return null;
  }
}

function encodeBase64UrlText(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64UrlText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function formatCoordinateParam([x, z]: [number, number]): string {
  return `${roundCoordinateForParam(x)},${roundCoordinateForParam(z)}`;
}

function roundCoordinateForParam(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseCoordinateParam(value: string | null): [number, number] | null {
  const parts = value?.split(',').map((part) => Number(part.trim()));
  if (!parts || parts.length !== 2) {
    return null;
  }
  const [x, z] = parts;
  return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
}

function parseRouteTransportModes(value: string | null): EnabledRouteTransportModes {
  const enabledModes = { ...defaultRouteTransportModes };
  if (!value?.trim()) {
    return enabledModes;
  }

  const selectedModes = new Set(value.split(',').map((mode) => mode.trim()));
  for (const mode of routeTransportModeOptions) {
    enabledModes[mode.mode] = selectedModes.has(mode.mode);
  }
  return enabledModes;
}

function normalizeMapSharedFocusValue(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function ensureTransitLineFocusKey(value: string): string {
  return value.startsWith('transit-line-') ? value : `transit-line-${value}`;
}

function findMapMarkerBySharedFocusKey(
  markers: MapMarkerSnapshot['markers'],
  focusKey: string,
): MapMarkerSnapshot['markers'][number] | undefined {
  const exactMarker = markers.find((marker) => marker.id === focusKey);
  if (exactMarker) {
    return exactMarker;
  }

  const transitLineId = focusKey.replace(/^transit-line-/, '');
  return markers.find(
    (marker) =>
      isTransitLineMarker(marker) && marker.id.replace(/^transit-line-/, '') === transitLineId,
  );
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  throw new Error(`Clipboard API is unavailable for ${value.length} characters`);
}

function getMarkerCategoryFallbackName(categoryId: string): string {
  return markerCategoryFallbackNames[categoryId] ?? categoryId;
}

function getMarkerCategoryDisplayName(
  categoryId: string,
  t: Translate,
  fallbackName?: string,
): string {
  const messageKey = markerCategoryMessageKeys[categoryId];
  return messageKey ? t(messageKey) : (fallbackName ?? getMarkerCategoryFallbackName(categoryId));
}

function getMapMarkerListEmptyText(input: {
  loadStatus: LoadStatus;
  markerListCategoryId: string;
  nearbySearchCenter: NearbySearchCenter | null;
  t: Translate;
}): string {
  if (input.loadStatus === 'loading') {
    return input.t('map.empty.loading');
  }

  if (input.nearbySearchCenter) {
    return input.t('map.empty.nearby');
  }

  if (input.markerListCategoryId === favoriteMarkerCategoryId) {
    return input.t('map.empty.favorites');
  }

  return input.t('map.empty.noMatch');
}

function PoiActionBar({
  isFavorite,
  marker,
  onPlanRoute,
  onSearchNearby,
  onShare,
  onToggleFavorite,
  status,
  t,
}: Readonly<{
  isFavorite: boolean;
  marker: CenterableMarker;
  onPlanRoute: () => void;
  onSearchNearby: () => void;
  onShare: () => void;
  onToggleFavorite: () => void;
  status: string;
  t: Translate;
}>) {
  return (
    <>
      <div className="map-poi-action-bar" aria-label={t('map.poi.actions')}>
        <button className="secondary-action-button is-primary" type="button" onClick={onPlanRoute}>
          <span className="material-symbols-outlined" aria-hidden="true">
            directions
          </span>
          <span>{t('map.poi.route')}</span>
        </button>
        <button
          className="icon-action-button"
          type="button"
          aria-label={t('map.poi.nearbyAria', { name: marker.label })}
          onClick={onSearchNearby}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            travel_explore
          </span>
        </button>
        <button
          className={`icon-action-button${isFavorite ? ' is-active' : ''}`}
          type="button"
          aria-pressed={isFavorite}
          aria-label={t(isFavorite ? 'map.poi.unfavoriteAria' : 'map.poi.favoriteAria', {
            name: marker.label,
          })}
          onClick={onToggleFavorite}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            bookmark
          </span>
        </button>
        <button
          className="icon-action-button"
          type="button"
          aria-label={t('map.poi.shareAria', { name: marker.label })}
          onClick={onShare}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            share
          </span>
        </button>
      </div>
      {status ? <p className="map-poi-action-status">{status}</p> : null}
    </>
  );
}

function getDirectionalLineStops(
  line: TransitOverviewLine,
  direction: 'forward' | 'reverse',
): TransitLineStopForMap[] {
  const sourceStops: TransitLineStopForMap[] =
    line.stationStops && line.stationStops.length > 0
      ? line.stationStops
      : line.stationNames.map((stationName, sequence) => ({
          stationName,
          sequence,
        }));

  const filteredStops = sourceStops.filter((stop) =>
    isTransitLineStopVisibleInDirection(stop, direction),
  );

  const sortedStops = [...filteredStops].sort((left, right) => left.sequence - right.sequence);
  return direction === 'forward' ? sortedStops : sortedStops.reverse();
}

function isTransitLineStopVisibleInDirection(
  stop: TransitLineStopForMap,
  direction: 'forward' | 'reverse',
): boolean {
  return direction === 'forward' ? stop.oneWay !== 'up' : stop.oneWay !== 'down';
}

function formatTransitStopOneWayLabel(
  oneWay: TransitLineStopForMap['oneWay'],
  t: Translate,
): string {
  // 旧 YCT 数据中 down 表示数据记载方向，up 表示反向。
  return oneWay === 'down'
    ? t('lineDetail.oneWay.forward')
    : t('lineDetail.oneWay.reverse');
}

function isPointMarker(marker: MapMarkerSnapshot['markers'][number]): marker is PointMarker {
  return marker.geometry.type === 'Point';
}

function shouldRenderAsPointPoi(marker: PointMarker): boolean {
  return marker.categoryId !== 'road';
}

function isEndpointGroupMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is EndpointGroupMarker {
  return marker.geometry.type === 'MultiPoint' && marker.categoryId !== 'transit-line';
}

function isTransitLineMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is TransitLineMarker {
  return marker.geometry.type === 'MultiPoint' && marker.categoryId === 'transit-line';
}

function isRoadEndpointGroupMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is EndpointGroupMarker {
  return marker.geometry.type === 'MultiPoint' && getRoadMarkerKind(marker) !== undefined;
}

function isLinearDetailMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return isTransitLineMarker(marker) || isRoadEndpointGroupMarker(marker);
}

function isTransitStationPoi(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return Boolean(
    marker.categoryId &&
    [
      'airport',
      'bus-stop',
      'coach-station',
      'ferry-port',
      'metro-station',
      'railway-station',
      'tram-station',
    ].includes(marker.categoryId),
  );
}

function isBusStopPoi(marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId'>): boolean {
  return marker.categoryId === 'bus-stop';
}

function isMetroStationPoi(marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId'>): boolean {
  return marker.categoryId === 'metro-station';
}

function groupSecondaryPois(links: SecondaryPoiLink[]): SecondaryPoiGroup[] {
  const groups = new Map<string, SecondaryPoiGroup>();

  for (const link of links) {
    const group = getSecondaryPoiGroup(link);
    const current = groups.get(group.id) ?? { ...group, items: [] };
    current.items.push(link);
    groups.set(group.id, current);
  }

  return [...groups.values()].sort(
    (left, right) =>
      getSecondaryPoiGroupOrder(left.id) - getSecondaryPoiGroupOrder(right.id) ||
      left.label.localeCompare(right.label, 'zh-CN'),
  );
}

function getSecondaryPoiGroup(link: SecondaryPoiLink): Omit<SecondaryPoiGroup, 'items'> {
  const categoryId = link.marker.categoryId?.toLowerCase() ?? '';
  const text = normalizeMarkerSearchText(`${link.childLabel} ${link.marker.label} ${categoryId}`);

  if (isRouteAccessSecondaryPoi(link)) {
    return { id: 'access', label: '出入口' };
  }

  if (
    isTransitStationPoi(link.marker) ||
    /station|stop|port|airport|metro|bus|tram|railway|coach|ferry/.test(categoryId)
  ) {
    return { id: 'transport', label: '交通' };
  }

  if (/([a-z]\d?座|[0-9一二三四五六七八九十]+号楼|楼栋|楼|栋|座|塔)/.test(text)) {
    return { id: 'building', label: '楼栋' };
  }

  if (/景点|公园|广场|展馆|文化|纪念|湖|山|岛|园|scenery|park/.test(text)) {
    return { id: 'scenery', label: '景点' };
  }

  if (/商店|商场|餐厅|酒店|超市|住宅|小区|工厂|shop|restaurant|hotel|residence|industry/.test(text)) {
    return { id: 'nearby', label: '周边' };
  }

  return { id: 'facility', label: '设施' };
}

function getSecondaryPoiGroupOrder(groupId: string): number {
  const index = ['access', 'transport', 'building', 'scenery', 'facility', 'nearby'].indexOf(groupId);
  return index >= 0 ? index : 99;
}

function formatSecondaryPoiGroupLabel(groupId: string, fallback: string, t: Translate): string {
  const labelKeyByGroupId: Record<string, CommonMessageKey> = {
    access: 'map.poi.group.access',
    building: 'map.poi.group.building',
    facility: 'map.poi.group.facility',
    nearby: 'map.poi.group.nearby',
    scenery: 'map.poi.group.scenery',
    transport: 'map.poi.group.transport',
  };
  const labelKey = labelKeyByGroupId[groupId];
  return labelKey ? t(labelKey) : fallback;
}

function buildSecondaryPoiIndex(markers: PointMarker[]): Map<string, SecondaryPoiLink[]> {
  const links = resolveSecondaryPoiLinks(markers);
  const index = new Map<string, SecondaryPoiLink[]>();
  for (const link of links) {
    const values = index.get(link.parent.id) ?? [];
    values.push(link);
    index.set(link.parent.id, values);
  }

  for (const [parentId, parentLinks] of index) {
    index.set(parentId, sortSecondaryPoiLinks(parentLinks));
  }

  return index;
}

function buildSecondaryPoiParentIndex(markers: PointMarker[]): Map<string, SecondaryPoiParentLink> {
  return new Map(
    resolveSecondaryPoiLinks(markers).map((link) => [
      link.marker.id,
      { childLabel: link.childLabel, marker: link.marker, parent: link.parent },
    ]),
  );
}

function resolveSecondaryPoiLinks(
  markers: PointMarker[],
): Array<SecondaryPoiLink & { parent: PointMarker }> {
  const markersByName = new Map<string, PointMarker[]>();
  for (const marker of markers) {
    const key = normalizeMarkerSearchText(marker.label);
    const values = markersByName.get(key) ?? [];
    values.push(marker);
    markersByName.set(key, values);
  }

  const links: Array<SecondaryPoiLink & { parent: PointMarker }> = [];
  for (const marker of markers) {
    const parsed = parseSecondaryPoiName(marker.label);
    if (!parsed) {
      continue;
    }

    const parentCandidates = markersByName
      .get(normalizeMarkerSearchText(parsed.parentName))
      ?.filter((candidate) => candidate.id !== marker.id && !isBusStopPoi(candidate));
    if (!parentCandidates || parentCandidates.length === 0) {
      continue;
    }

    const parent = findNearestParentPoi(marker, parentCandidates);
    if (!parent) {
      continue;
    }

    links.push({ childLabel: parsed.childName, marker, parent });
  }

  return links;
}

function sortSecondaryPoiLinks(links: SecondaryPoiLink[]): SecondaryPoiLink[] {
  return links.sort(
    (left, right) =>
      left.childLabel.localeCompare(right.childLabel, 'zh-CN') ||
      formatMarkerDisplayName(left.marker.label).localeCompare(
        formatMarkerDisplayName(right.marker.label),
        'zh-CN',
      ),
  );
}

function parseSecondaryPoiName(label: string): { parentName: string; childName: string } | undefined {
  const displayName = formatMarkerDisplayName(label);
  const separatorMatch = /[-－–—]/.exec(displayName);
  if (!separatorMatch || separatorMatch.index <= 0) {
    return undefined;
  }

  const parentName = displayName.slice(0, separatorMatch.index).trim();
  const childName = displayName.slice(separatorMatch.index + separatorMatch[0].length).trim();
  if (!parentName || !childName) {
    return undefined;
  }

  return { parentName, childName };
}

function findNearestParentPoi(
  child: PointMarker,
  candidates: PointMarker[],
): PointMarker | undefined {
  return [...candidates].sort(
    (left, right) =>
      getCoordinateDistance(child.geometry.coordinates, left.geometry.coordinates) -
      getCoordinateDistance(child.geometry.coordinates, right.geometry.coordinates),
  )[0];
}

function MarkerListIcon({
  marker,
  iconBaseUrl,
}: Readonly<{
  marker: SidebarMarker;
  iconBaseUrl: string;
}>) {
  if (marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)) {
    return <img src={toMarkerIconUrl(marker.iconFileName, iconBaseUrl)} alt="" draggable={false} />;
  }

  return (
    <span
      className="material-symbols-outlined map-marker-list-symbol"
      style={{ color: marker.accentColor }}
      aria-hidden="true"
    >
      {marker.symbolIcon ?? 'location_on'}
    </span>
  );
}

function filterMarkers<T extends { label: string }>(markers: T[], query: string): T[] {
  const normalizedQuery = normalizeMarkerSearchText(query);
  if (!normalizedQuery) {
    return markers;
  }

  return markers.filter((marker) =>
    normalizeMarkerSearchText(marker.label).includes(normalizedQuery),
  );
}

function buildStationConnectionIndex(
  overview: TransitOverviewResponse | null,
  t: Translate,
): Map<string, TransitLineConnection[]> {
  if (!overview) {
    return new Map();
  }

  const profileByMode = new Map(
    (overview.modeProfiles ?? []).map((profile) => [profile.mode, profile]),
  );
  const connectionsByStation = new Map<string, TransitLineConnection[]>();

  for (const line of overview.lines ?? []) {
    const profile = profileByMode.get(line.mode);
      const connection: TransitLineConnection = {
        id: line.id,
        mode: line.mode,
        modeLabel: getTransitModeDisplayLabel(line.mode, profile?.label ?? line.mode, t),
        name: line.name,
        color: line.color ?? profile?.color,
        sortOrder: profile?.sortOrder ?? 999,
    };

    for (const stationName of line.stationNames ?? []) {
      for (const key of getStationNameMatchKeys(stationName)) {
        const existing = connectionsByStation.get(key) ?? [];
        if (!existing.some((item) => item.id === connection.id)) {
          existing.push(connection);
          connectionsByStation.set(key, existing);
        }
      }
    }
  }

  for (const [key, connections] of connectionsByStation) {
    connectionsByStation.set(key, connections.sort(compareTransitConnections));
  }

  return connectionsByStation;
}

function findStationConnections(
  marker: MapMarkerSnapshot['markers'][number],
  index: Map<string, TransitLineConnection[]>,
): TransitLineConnection[] {
  const collected: TransitLineConnection[] = [];
  const seen = new Set<string>();

  for (const key of getStationNameMatchKeys(marker.label)) {
    const connections = index.get(key);
    if (!connections) {
      continue;
    }

    for (const connection of connections) {
      if (seen.has(connection.id)) {
        continue;
      }

      seen.add(connection.id);
      collected.push(connection);
    }
  }

  return collected.sort(compareTransitConnections);
}

function buildTransitLineLookup(
  overview: TransitOverviewResponse | null,
): ReadonlyMap<string, TransitOverviewLine> {
  const lookup = new Map<string, TransitOverviewLine>();

  for (const line of overview?.lines ?? []) {
    lookup.set(line.id, line);
    lookup.set(line.name, line);
  }

  return lookup;
}

function findTransitLineByMarker(
  marker: TransitLineMarker,
  lookup: ReadonlyMap<string, TransitOverviewLine>,
): TransitOverviewLine | undefined {
  const markerLineId = marker.id.replace(/^transit-line-/, '');
  return lookup.get(markerLineId) ?? lookup.get(marker.label);
}

function compareTransitConnections(
  left: TransitLineConnection,
  right: TransitLineConnection,
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.modeLabel.localeCompare(right.modeLabel, 'zh-CN') ||
    left.name.localeCompare(right.name, 'zh-CN')
  );
}

function getStationNameMatchKeys(value: string): string[] {
  const normalized = normalizeStationNameForMatch(value);
  if (!normalized) {
    return [];
  }

  const keys = new Set([normalized]);
  const withoutLindongPrefix = normalized.replace(/^临东/, '');
  if (withoutLindongPrefix) {
    keys.add(withoutLindongPrefix);
  }

  const withoutTransitSuffix = normalized
    .replace(/地铁站$/u, '')
    .replace(/公交枢纽站$/u, '')
    .replace(/公交枢纽$/u, '')
    .replace(/公交站$/u, '')
    .replace(/汽车客运枢纽站$/u, '客运站')
    .replace(/汽车客运站$/u, '客运站')
    .replace(/区客运站$/u, '客运站');
  if (withoutTransitSuffix) {
    keys.add(withoutTransitSuffix);
    keys.add(withoutTransitSuffix.replace(/^临东/, ''));
  }

  if (normalized.endsWith('客运站')) {
    keys.add(`临东${normalized}`);
    keys.add(normalized.replace(/客运站$/u, ''));
  }

  if (normalized.endsWith('站')) {
    keys.add(normalized.replace(/站$/u, ''));
  }

  return Array.from(keys).filter(Boolean);
}

function normalizeStationNameForMatch(value: string): string {
  return normalizeMarkerDisplayText(value);
}

function buildVisibleTiles(
  view: MapView,
  size: ViewportSize,
  tileTemplate: string,
  regionIndex: UnminedRegionIndex | undefined,
  options?: { tileZoom?: number },
): VisibleTile[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const viewScale = getScale(view.zoom);
  const tileZoom = options?.tileZoom ?? getTileZoom(view.zoom);
  const tileScale = getScale(tileZoom);
  const tileDisplaySize = tileSize * (viewScale / tileScale);
  const worldMinX = view.centerX - size.width / (2 * viewScale);
  const worldMaxX = view.centerX + size.width / (2 * viewScale);
  const worldMinZ = view.centerZ - size.height / (2 * viewScale);
  const worldMaxZ = view.centerZ + size.height / (2 * viewScale);
  const minTileX = Math.floor((worldMinX * tileScale) / tileSize) - 1;
  const maxTileX = Math.floor((worldMaxX * tileScale) / tileSize) + 1;
  const minTileZ = Math.floor((worldMinZ * tileScale) / tileSize) - 1;
  const maxTileZ = Math.floor((worldMaxZ * tileScale) / tileSize) + 1;
  const tiles: VisibleTile[] = [];

  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileZ = minTileZ; tileZ <= maxTileZ; tileZ += 1) {
      if (regionIndex && !hasUnminedTile(tileX, tileZ, tileZoom, regionIndex)) {
        continue;
      }

      tiles.push({
        id: `${tileZoom}:${tileX}:${tileZ}`,
        url: buildTileUrl(tileTemplate, tileZoom, tileX, tileZ),
        left:
          size.width / 2 + (tileX * tileSize * viewScale) / tileScale - view.centerX * viewScale,
        top:
          size.height / 2 + (tileZ * tileSize * viewScale) / tileScale - view.centerZ * viewScale,
        displaySize: tileDisplaySize,
      });
    }
  }

  return tiles;
}

function buildUnminedRegionIndex(
  response: UnminedRegionResponse | null,
): UnminedRegionIndex | undefined {
  if (!response?.properties || response.regions.length === 0) {
    return undefined;
  }

  return {
    properties: response.properties,
    groups: new Map(response.regions.map((region) => [getRegionKey(region.x, region.z), region])),
  };
}

function hasUnminedTile(
  tileX: number,
  tileZ: number,
  unminedZoomLevel: number,
  regionIndex: UnminedRegionIndex,
): boolean {
  const { properties } = regionIndex;
  const zoomFactor = Math.pow(2, unminedZoomLevel);
  const worldMinX = properties.minRegionX * 512;
  const worldMinZ = properties.minRegionZ * 512;
  const worldWidth = (properties.maxRegionX + 1 - properties.minRegionX) * 512;
  const worldHeight = (properties.maxRegionZ + 1 - properties.minRegionZ) * 512;
  const minTileX = Math.floor((worldMinX * zoomFactor) / tileSize);
  const minTileZ = Math.floor((worldMinZ * zoomFactor) / tileSize);
  const maxTileX = Math.ceil(((worldMinX + worldWidth) * zoomFactor) / tileSize) - 1;
  const maxTileZ = Math.ceil(((worldMinZ + worldHeight) * zoomFactor) / tileSize) - 1;

  if (tileX < minTileX || tileZ < minTileZ || tileX > maxTileX || tileZ > maxTileZ) {
    return false;
  }

  const tileBlockSize = tileSize / zoomFactor;
  const tileBlockPoint = {
    x: tileX * tileBlockSize,
    z: tileZ * tileBlockSize,
  };
  const tileRegionPoint = {
    x: Math.floor(tileBlockPoint.x / 512),
    z: Math.floor(tileBlockPoint.z / 512),
  };
  const tileRegionSize = Math.ceil(tileBlockSize / 512);

  for (let x = tileRegionPoint.x; x < tileRegionPoint.x + tileRegionSize; x += 1) {
    for (let z = tileRegionPoint.z; z < tileRegionPoint.z + tileRegionSize; z += 1) {
      if (hasRegion(regionIndex, x, z)) {
        return true;
      }
    }
  }

  return false;
}

function hasRegion(regionIndex: UnminedRegionIndex, x: number, z: number): boolean {
  const group = {
    x: Math.floor(x / 32),
    z: Math.floor(z / 32),
  };
  const regionMap = regionIndex.groups.get(getRegionKey(group.x, group.z));
  if (!regionMap) {
    return false;
  }

  const relX = x - group.x * 32;
  const relZ = z - group.z * 32;
  const index = relZ * 32 + relX;
  const value = regionMap.m[Math.floor(index / 32)] ?? 0;
  const bit = index % 32;
  return (value & (1 << bit)) !== 0;
}

function getRegionKey(x: number, z: number): string {
  return `${x}:${z}`;
}

function buildTileUrl(template: string, zoom: number, tileX: number, tileZ: number): string {
  return template
    .replaceAll('{z}', String(zoom))
    .replaceAll('{xd}', String(Math.floor(tileX / 10)))
    .replaceAll('{yd}', String(Math.floor(tileZ / 10)))
    .replaceAll('{x}', String(tileX))
    .replaceAll('{y}', String(tileZ));
}

function projectPointMarkers(
  markers: PointMarker[],
  view: MapView,
  size: ViewportSize,
  iconBaseUrl: string,
  focusedMarkerId: string | null,
  browseMode: MapBrowseMode,
  representativePoiIds: ReadonlySet<string>,
  options?: {
    forceLabelMarkerIds?: ReadonlySet<string>;
    suppressLabelMarkerIds?: ReadonlySet<string>;
  },
): ProjectedMarker[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  const projected = markers
    .map((marker) => {
      const [x, z] = marker.geometry.coordinates;
      const forceLabel = Boolean(options?.forceLabelMarkerIds?.has(marker.id));
      const suppressLabel = Boolean(options?.suppressLabelMarkerIds?.has(marker.id));
      const priority =
        getMarkerPriorityForBrowseMode(marker, browseMode) +
        (representativePoiIds.has(marker.id) ? representativePoiPriorityBoost : 0) +
        (forceLabel ? 1000 : 0);
      return {
        id: marker.id,
        label: formatMarkerDisplayName(marker.label),
        categoryId: marker.categoryId,
        x,
        z,
        left: size.width / 2 + (x - view.centerX) * scale,
        top: size.height / 2 + (z - view.centerZ) * scale,
        iconUrl:
          marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)
            ? toMarkerIconUrl(marker.iconFileName, iconBaseUrl)
            : undefined,
        symbolIcon: marker.symbolIcon,
        showLabel: forceLabel
          ? true
          : suppressLabel
            ? false
            : marker.id === focusedMarkerId ||
              shouldShowMarkerLabelForBrowseMode(marker, browseMode, priority),
        priority,
        roadKind: getRoadMarkerKind(marker),
      };
    })
    .filter(
      (marker) =>
        marker.left >= -80 &&
        marker.left <= size.width + 80 &&
        marker.top >= -80 &&
        marker.top <= size.height + 80,
    );

  return projected;
}

function projectCoordinateMarker(
  id: ProjectedGuideMarker['kind'],
  label: string,
  coordinates: [number, number],
  view: MapView,
  size: ViewportSize,
  padding: number,
): ProjectedGuideMarker | null {
  if (size.width <= 0 || size.height <= 0) {
    return null;
  }

  const scale = getScale(view.zoom);
  const left = size.width / 2 + (coordinates[0] - view.centerX) * scale;
  const top = size.height / 2 + (coordinates[1] - view.centerZ) * scale;
  if (
    left < -padding ||
    left > size.width + padding ||
    top < -padding ||
    top > size.height + padding
  ) {
    return null;
  }

  return {
    id,
    label,
    kind: id,
    left,
    top,
  };
}

function projectRoadTraceMarkers(
  markers: EndpointGroupMarker[],
  view: MapView,
  size: ViewportSize,
  focusedMarkerId: string | null,
  options: { isMuted: boolean; suppressLargeOverlap: boolean },
): ProjectedRoadTrace[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  const projected: ProjectedRoadTrace[] = [];

  for (const marker of markers) {
    if (marker.geometry.coordinates.length < 2) {
      continue;
    }

    const orderedCoordinates = orderRoadTracePoints(marker.geometry.coordinates);
    const orderedPoints = orderedCoordinates.map(([x, z]) => ({
      left: size.width / 2 + (x - view.centerX) * scale,
      top: size.height / 2 + (z - view.centerZ) * scale,
    }));
    const traceProjection = buildTraceProjection(orderedCoordinates, view, size);

    const bounds = getTraceBounds(orderedPoints);
    if (
      !traceProjection ||
      orderedPoints.length < 2 ||
      !traceBoundsIntersectsViewport(bounds, size)
    ) {
      continue;
    }

    const roadKind = getRoadMarkerKind(marker);
    const isSelected = marker.id === focusedMarkerId;
    projected.push({
      id: marker.id,
      label: formatMarkerDisplayName(marker.label),
      path: traceProjection.path,
      viewBox: traceProjection.viewBox,
      accentColor: isSelected
        ? 'var(--yct-color-primary)'
        : (marker.accentColor ?? (roadKind === 'highway' ? '#c2552d' : '#65706d')),
      pointCount: marker.geometry.coordinates.length,
      pathLength: getProjectedPathLength(orderedPoints),
      bounds,
      left: traceProjection.left,
      top: traceProjection.top,
      width: traceProjection.width,
      height: traceProjection.height,
      roadKind,
      isSelected,
      isMuted: options.isMuted,
    });
  }

  return options.suppressLargeOverlap ? suppressOverlappedRoadTraces(projected) : projected;
}

function projectTransitLineTraces(
  markers: TransitLineMarker[],
  view: MapView,
  size: ViewportSize,
  focusedMarkerId?: string | null,
): ProjectedRoadTrace[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  return markers.flatMap((marker) => {
    if (marker.geometry.coordinates.length < 2) {
      return [];
    }

    const points = marker.geometry.coordinates.map(([x, z]) => ({
      left: size.width / 2 + (x - view.centerX) * scale,
      top: size.height / 2 + (z - view.centerZ) * scale,
    }));
    const traceProjection = buildTraceProjection(marker.geometry.coordinates, view, size);
    const bounds = getTraceBounds(points);

    if (!traceProjection || !traceBoundsIntersectsViewport(bounds, size)) {
      return [];
    }

    return [
      {
        id: `${marker.id}-trace`,
        label: formatMarkerDisplayName(marker.label),
        path: traceProjection.path,
        viewBox: traceProjection.viewBox,
        accentColor: marker.accentColor,
        pointCount: marker.geometry.coordinates.length,
        pathLength: getProjectedPathLength(points),
        bounds,
        left: traceProjection.left,
        top: traceProjection.top,
        width: traceProjection.width,
        height: traceProjection.height,
        isSelected: marker.id === focusedMarkerId,
      },
    ];
  });
}

function projectRoutePlanTrace(
  option: RoutePlanOption,
  view: MapView,
  size: ViewportSize,
): ProjectedRoadTrace | undefined {
  if (size.width <= 0 || size.height <= 0 || option.coordinates.length < 2) {
    return undefined;
  }

  const scale = getScale(view.zoom);
  const points = option.coordinates.map(([x, z]) => ({
    left: size.width / 2 + (x - view.centerX) * scale,
    top: size.height / 2 + (z - view.centerZ) * scale,
  }));
  const traceProjection = buildTraceProjection(option.coordinates, view, size);
  const bounds = getTraceBounds(points);

  if (!traceProjection || !traceBoundsIntersectsViewport(bounds, size)) {
    return undefined;
  }
  const segments = option.traceSegments
    ?.map((segment): ProjectedRouteTraceSegment | undefined => {
      if (segment.coordinates.length < 2) {
        return undefined;
      }

      return {
        color: segment.color,
        path: buildTracePath(segment.coordinates, view, size, traceProjection.left, traceProjection.top),
      };
    })
    .filter((segment): segment is ProjectedRouteTraceSegment => Boolean(segment));
  const labels = projectRouteRoadLabels(option.roadLabels, view, size);

  return {
    id: `route-option-${option.id}`,
    label: option.title,
    labels: labels.length > 0 ? labels : undefined,
    path: traceProjection.path,
    segments: segments && segments.length > 0 ? segments : undefined,
    viewBox: traceProjection.viewBox,
    accentColor: option.color,
    pointCount: option.coordinates.length,
    pathLength: getProjectedPathLength(points),
    bounds,
    left: traceProjection.left,
    top: traceProjection.top,
    width: traceProjection.width,
    height: traceProjection.height,
    isSelected: true,
  };
}

function projectRouteRoadLabels(
  labels: RoutePlanRoadLabel[] | undefined,
  view: MapView,
  size: ViewportSize,
): ProjectedRouteRoadLabel[] {
  if (!labels?.length || size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  const groupsByLabel = new Map<
    string,
    {
      color?: string;
      id: string;
      label: string;
      segments: Array<{
        start: { left: number; top: number };
        end: { left: number; top: number };
        length: number;
      }>;
      visibleLength: number;
    }
  >();

  for (const label of labels) {
    const visibleSegments = getVisibleProjectedRouteLabelSegments(
      label.coordinates.map(([x, z]) => ({
        left: size.width / 2 + (x - view.centerX) * scale,
        top: size.height / 2 + (z - view.centerZ) * scale,
      })),
      size,
    );
    const visibleLength = visibleSegments.reduce((total, segment) => total + segment.length, 0);
    if (visibleLength <= 0) {
      continue;
    }

    const group = groupsByLabel.get(label.label) ?? {
      color: label.color,
      id: label.id,
      label: label.label,
      segments: [],
      visibleLength: 0,
    };
    group.segments.push(...visibleSegments);
    group.visibleLength += visibleLength;
    groupsByLabel.set(label.label, group);
  }

  return [...groupsByLabel.values()].flatMap((group) => {
    if (group.visibleLength < 72) {
      return [];
    }
    const position = getProjectedRouteLabelPointAtDistance(group.segments, group.visibleLength / 2);
    if (!position) {
      return [];
    }

    return [
      {
        color: group.color,
        id: group.id,
        label: group.label,
        left: position.left,
        top: position.top,
      },
    ];
  });
}

function getVisibleProjectedRouteLabelSegments(
  points: Array<{ left: number; top: number }>,
  size: ViewportSize,
): Array<{ start: { left: number; top: number }; end: { left: number; top: number }; length: number }> {
  const segments: Array<{
    start: { left: number; top: number };
    end: { left: number; top: number };
    length: number;
  }> = [];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) {
      continue;
    }

    const clipped = clipProjectedSegmentToViewport(start, end, size, 12);
    if (!clipped) {
      continue;
    }

    const length = Math.hypot(clipped.end.left - clipped.start.left, clipped.end.top - clipped.start.top);
    if (length <= 0) {
      continue;
    }
    segments.push({ ...clipped, length });
  }

  return segments;
}

function clipProjectedSegmentToViewport(
  start: { left: number; top: number },
  end: { left: number; top: number },
  size: ViewportSize,
  padding: number,
): { start: { left: number; top: number }; end: { left: number; top: number } } | undefined {
  const minLeft = padding;
  const maxLeft = Math.max(minLeft, size.width - padding);
  const minTop = padding;
  const maxTop = Math.max(minTop, size.height - padding);
  const deltaLeft = end.left - start.left;
  const deltaTop = end.top - start.top;
  let startRatio = 0;
  let endRatio = 1;

  const clip = (denominator: number, numerator: number): boolean => {
    if (denominator === 0) {
      return numerator <= 0;
    }
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > endRatio) {
        return false;
      }
      if (ratio > startRatio) {
        startRatio = ratio;
      }
      return true;
    }
    if (ratio < startRatio) {
      return false;
    }
    if (ratio < endRatio) {
      endRatio = ratio;
    }
    return true;
  };

  if (
    !clip(-deltaLeft, start.left - minLeft) ||
    !clip(deltaLeft, maxLeft - start.left) ||
    !clip(-deltaTop, start.top - minTop) ||
    !clip(deltaTop, maxTop - start.top)
  ) {
    return undefined;
  }

  return {
    start: {
      left: start.left + startRatio * deltaLeft,
      top: start.top + startRatio * deltaTop,
    },
    end: {
      left: start.left + endRatio * deltaLeft,
      top: start.top + endRatio * deltaTop,
    },
  };
}

function getProjectedRouteLabelPointAtDistance(
  segments: Array<{ start: { left: number; top: number }; end: { left: number; top: number }; length: number }>,
  targetDistance: number,
): { left: number; top: number } | undefined {
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length >= targetDistance) {
      const ratio = clampNumber((targetDistance - travelled) / segment.length, 0, 1);
      return {
        left: segment.start.left + (segment.end.left - segment.start.left) * ratio,
        top: segment.start.top + (segment.end.top - segment.start.top) * ratio,
      };
    }
    travelled += segment.length;
  }

  const fallback = segments.at(-1);
  return fallback?.end;
}

function buildTraceProjection(
  coordinates: Array<[number, number]>,
  view: MapView,
  size: ViewportSize,
): Pick<ProjectedRoadTrace, 'path' | 'viewBox' | 'left' | 'top' | 'width' | 'height'> | undefined {
  if (coordinates.length < 2) {
    return undefined;
  }

  const scale = getScale(view.zoom);
  const points = coordinates.map(([x, z]) => ({
    left: size.width / 2 + (x - view.centerX) * scale,
    top: size.height / 2 + (z - view.centerZ) * scale,
  }));
  const bounds = getTraceBounds(points);
  const padding = 28;
  const left = bounds.minLeft - padding;
  const top = bounds.minTop - padding;
  const width = Math.max(1, bounds.maxLeft - bounds.minLeft + padding * 2);
  const height = Math.max(1, bounds.maxTop - bounds.minTop + padding * 2);

  return {
    path: buildTracePath(coordinates, view, size, left, top),
    viewBox: `0 0 ${roundSvg(width)} ${roundSvg(height)}`,
    left,
    top,
    width,
    height,
  };
}

function buildTracePath(
  coordinates: Array<[number, number]>,
  view: MapView,
  size: ViewportSize,
  left: number,
  top: number,
): string {
  const scale = getScale(view.zoom);
  return coordinates
    .map(([x, z], index) => {
      const pointLeft = size.width / 2 + (x - view.centerX) * scale;
      const pointTop = size.height / 2 + (z - view.centerZ) * scale;
      return `${index === 0 ? 'M' : 'L'} ${roundSvg(pointLeft - left)} ${roundSvg(pointTop - top)}`;
    })
    .join(' ');
}

function traceBoundsIntersectsViewport(bounds: TraceBounds, size: ViewportSize): boolean {
  const padding = 160;

  return !(
    bounds.maxLeft < -padding ||
    bounds.minLeft > size.width + padding ||
    bounds.maxTop < -padding ||
    bounds.minTop > size.height + padding
  );
}

function orderRoadTracePoints(coordinates: Array<[number, number]>): Array<[number, number]> {
  const remaining = [...coordinates];
  const firstIndex = findRoadTraceStartIndex(remaining);
  const ordered = [remaining.splice(firstIndex, 1)[0]].filter(Boolean) as Array<[number, number]>;

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((coordinate, index) => {
      const distance = squaredDistance(last, coordinate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const next = remaining.splice(nearestIndex, 1)[0];
    if (next) {
      ordered.push(next);
    }
  }

  return ordered;
}

function findRoadTraceStartIndex(coordinates: Array<[number, number]>): number {
  const xValues = coordinates.map((coordinate) => coordinate[0]);
  const zValues = coordinates.map((coordinate) => coordinate[1]);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const zRange = Math.max(...zValues) - Math.min(...zValues);
  const primaryAxis = xRange > zRange ? 0 : 1;
  const secondaryAxis = primaryAxis === 0 ? 1 : 0;

  return coordinates.reduce((bestIndex, coordinate, index) => {
    const best = coordinates[bestIndex];
    if (!best) {
      return index;
    }

    if (coordinate[primaryAxis] === best[primaryAxis]) {
      return coordinate[secondaryAxis] < best[secondaryAxis] ? index : bestIndex;
    }

    return coordinate[primaryAxis] < best[primaryAxis] ? index : bestIndex;
  }, 0);
}

function squaredDistance(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeMarkerSearchText(value: string): string {
  return normalizeMarkerDisplayText(value).toLowerCase();
}

function formatMarkerDisplayName(value: string): string {
  return normalizeMarkerDisplayText(value) || value.trim();
}

function normalizeMarkerDisplayText(value: string): string {
  return value
    .replace(/[\s\u3000]+/g, '')
    .replace(/[|｜]+/g, '')
    .trim();
}

function getRoadMarkerKind(
  marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId' | 'label' | 'iconFileName'>,
): RoadMarkerKind | undefined {
  const label = normalizeMarkerSearchText(marker.label);
  const iconFileName = marker.iconFileName?.toLowerCase() ?? '';
  if (
    label.includes('高速') ||
    label.includes('快速') ||
    iconFileName.includes('highway') ||
    iconFileName.includes('toll')
  ) {
    return 'highway';
  }

  if (marker.categoryId === 'road') {
    return 'road';
  }

  return undefined;
}

function getMarkerIconBaseName(fileName?: string): string {
  return (
    fileName
      ?.trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? ''
  );
}

function isExitMarkerIcon(fileName?: string): boolean {
  return getMarkerIconBaseName(fileName).startsWith('exit');
}

function isWayAccessMarkerIcon(fileName?: string): boolean {
  const baseName = getMarkerIconBaseName(fileName);
  return baseName === 'way-in' || baseName === 'way-out';
}

function isTransparentRoadIcon(fileName: string): boolean {
  const baseName = getMarkerIconBaseName(fileName);

  return ['road', 'roadpoint', 'highway-s1', 'toll-gate'].includes(baseName);
}

function isHighwayIconFileName(fileName: string): boolean {
  const baseName = getMarkerIconBaseName(fileName);

  return /^highway-[a-z0-9-]+$/i.test(baseName);
}

function applyMapOverlayCollisionVisibility(
  markers: ProjectedMarker[],
  linearPois: ProjectedLinearPoi[],
  size: ViewportSize,
  focusedMarkerId: string | null,
  hideCollidingLabelsOnly: boolean,
): { markers: ProjectedMarker[]; linearPois: ProjectedLinearPoi[] } {
  const acceptedBoxes: MarkerCollisionBox[] = [];
  const markerState = new Map(markers.map((marker) => [marker.id, { ...marker }]));
  const linearState = new Map(linearPois.map((marker) => [marker.id, { ...marker }]));
  const orderedMarkers = [
    ...markers.map((marker) => createMarkerCollisionItem(marker)),
    ...linearPois.flatMap((marker) => createLinearPoiCollisionItem(marker)),
  ].sort((left, right) => {
    if (left.id === focusedMarkerId) {
      return -1;
    }

    if (right.id === focusedMarkerId) {
      return 1;
    }

    return right.priority - left.priority;
  });

  for (const marker of orderedMarkers) {
    if (
      marker.left < 0 ||
      marker.left > size.width ||
      marker.top < 18 ||
      marker.top > size.height - 18
    ) {
      if (hideCollidingLabelsOnly) {
        hideCollisionItemLabel(marker, markerState, linearState);
      } else {
        hideCollisionItem(marker, markerState, linearState);
      }
      continue;
    }

    const box = getMarkerCollisionBox(marker);
    if (box.left < 0 || box.right > size.width || box.top < 0 || box.bottom > size.height) {
      if (hideCollidingLabelsOnly) {
        hideCollisionItemLabel(marker, markerState, linearState);
      } else {
        hideCollisionItem(marker, markerState, linearState);
      }
      continue;
    }

    if (acceptedBoxes.some((acceptedBox) => boxesOverlap(box, acceptedBox))) {
      if (hideCollidingLabelsOnly) {
        if (marker.id !== focusedMarkerId) {
          hideCollisionItemLabel(marker, markerState, linearState);
        }
      } else if (marker.id !== focusedMarkerId) {
        hideCollisionItem(marker, markerState, linearState);
      }
      continue;
    }

    acceptedBoxes.push(box);
  }

  return {
    markers: markers.flatMap((marker) => {
      const updated = markerState.get(marker.id);
      return updated ? [updated] : [];
    }),
    linearPois: linearPois.flatMap((marker) => {
      const updated = linearState.get(marker.id);
      return updated ? [updated] : [];
    }),
  };
}

interface MarkerCollisionBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface OverlayCollisionItem {
  kind: 'marker' | 'linear';
  id: string;
  label: string;
  left: number;
  top: number;
  priority: number;
  showLabel: boolean;
  hasIcon: boolean;
  isVerticalLabel: boolean;
}

function createMarkerCollisionItem(marker: ProjectedMarker): OverlayCollisionItem {
  return {
    kind: 'marker',
    id: marker.id,
    label: marker.label,
    left: marker.left,
    top: marker.top,
    priority: marker.priority,
    showLabel: marker.showLabel,
    hasIcon: Boolean(marker.iconUrl || marker.symbolIcon),
    isVerticalLabel: false,
  };
}

function createLinearPoiCollisionItem(marker: ProjectedLinearPoi): OverlayCollisionItem[] {
  if (!marker.showCenter || (!marker.showTextLabel && !marker.iconUrl && !marker.symbolIcon)) {
    return [];
  }

  return [
    {
      kind: 'linear',
      id: marker.id,
      label: marker.label,
      left: marker.left,
      top: marker.top,
      priority: getLinearPoiPriority(marker),
      showLabel: marker.showTextLabel,
      hasIcon: Boolean(marker.iconUrl || marker.symbolIcon),
      isVerticalLabel: marker.isVerticalLabel,
    },
  ];
}

function hideCollisionItem(
  item: OverlayCollisionItem,
  markerState: Map<string, ProjectedMarker>,
  linearState: Map<string, ProjectedLinearPoi>,
) {
  if (item.kind === 'marker') {
    markerState.delete(item.id);
    return;
  }

  const linear = linearState.get(item.id);
  if (linear) {
    linearState.set(item.id, { ...linear, showCenter: false });
  }
}

function hideCollisionItemLabel(
  item: OverlayCollisionItem,
  markerState: Map<string, ProjectedMarker>,
  linearState: Map<string, ProjectedLinearPoi>,
) {
  if (item.kind === 'marker') {
    const marker = markerState.get(item.id);
    if (marker) {
      markerState.set(item.id, { ...marker, showLabel: false });
    }
    return;
  }

  const linear = linearState.get(item.id);
  if (!linear) {
    return;
  }

  if (linear.iconUrl || linear.symbolIcon) {
    linearState.set(item.id, { ...linear, showTextLabel: false });
    return;
  }

  linearState.set(item.id, { ...linear, showCenter: false, showTextLabel: false });
}

function getMarkerCollisionBox(marker: OverlayCollisionItem): MarkerCollisionBox {
  const labelLength = normalizeMarkerDisplayText(marker.label).length;
  const labelWidth = Math.max(42, labelLength * 12);
  const labelHeight = Math.max(36, labelLength * 13);
  const iconWidth = marker.hasIcon ? 24 : 0;
  const totalWidth = marker.showLabel
    ? marker.isVerticalLabel
      ? Math.max(iconWidth, 20)
      : iconWidth + (iconWidth ? 4 : 0) + labelWidth
    : Math.max(iconWidth, 20);
  const totalHeight = marker.showLabel && marker.isVerticalLabel ? labelHeight : 32;

  return {
    left: marker.left - 12,
    right: marker.left - 12 + totalWidth,
    top: marker.top - totalHeight / 2,
    bottom: marker.top + totalHeight / 2,
  };
}

function getMarkerPriorityForBrowseMode(marker: PointMarker, browseMode: MapBrowseMode): number {
  const categoryId = marker.categoryId ?? '';
  const roadKind = getRoadMarkerKind(marker);

  if (roadKind === 'highway') {
    return 40;
  }

  if (roadKind === 'road') {
    return browseMode === 'traffic' ? 8 : 28;
  }

  if (browseMode === 'traffic' && highPriorityTransitCategoryIds.has(categoryId)) {
    return 34;
  }

  if (categoryId === 'bus-stop') {
    return browseMode === 'traffic' ? 12 : 5;
  }

  if (browseMode === 'traffic' && lowPriorityTrafficCategoryIds.has(categoryId)) {
    return 2;
  }

  if (highPriorityTransitCategoryIds.has(categoryId)) {
    return 24;
  }

  return marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName) ? 16 : 8;
}

function getLinearPoiPriority(marker: ProjectedLinearPoi): number {
  if (marker.roadKind === 'highway') {
    return 32;
  }

  if (marker.roadKind === 'road') {
    return 22;
  }

  if (marker.iconUrl || marker.symbolIcon) {
    return 18;
  }

  return 10;
}

function shouldShowMarkerLabelForBrowseMode(
  marker: PointMarker,
  browseMode: MapBrowseMode,
  priority: number,
): boolean {
  const categoryId = marker.categoryId ?? '';

  if (categoryId === 'bus-stop') {
    return false;
  }

  if (browseMode === 'traffic') {
    return priority >= 16 && !lowPriorityTrafficCategoryIds.has(categoryId);
  }

  if (browseMode === 'road-network') {
    return priority >= 12;
  }

  return priority >= 10;
}

function shouldUseVerticalRoadLabel(
  coordinates: Array<[number, number]>,
  center: [number, number],
): boolean {
  if (coordinates.length < 2) {
    return false;
  }

  const nearest = [...coordinates]
    .sort((left, right) => squaredDistance(left, center) - squaredDistance(right, center))
    .slice(0, 2);
  const sample = [center, ...nearest];
  const xValues = sample.map(([x]) => x);
  const zValues = sample.map(([, z]) => z);
  const xRange = Math.max(...xValues) - Math.min(...xValues);
  const zRange = Math.max(...zValues) - Math.min(...zValues);

  return zRange > Math.max(8, xRange * 1.35);
}

function boxesOverlap(left: MarkerCollisionBox, right: MarkerCollisionBox): boolean {
  const gap = 4;
  return !(
    left.right + gap <= right.left ||
    right.right + gap <= left.left ||
    left.bottom + gap <= right.top ||
    right.bottom + gap <= left.top
  );
}

function projectLinearPoiMarkers(
  markers: Array<EndpointGroupMarker | TransitLineMarker>,
  view: MapView,
  size: ViewportSize,
  options: { focusedMarkerId: string | null; hideRoadEndpoints: boolean; iconBaseUrl: string },
): ProjectedLinearPoi[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  const projected: ProjectedLinearPoi[] = [];

  for (const marker of markers) {
    const labelAnchor = getLinearMarkerLabelAnchor(marker, view, size);
    if (!labelAnchor) {
      continue;
    }

    const hideEndpoints =
      options.hideRoadEndpoints &&
      isRoadEndpointGroupMarker(marker) &&
      marker.id !== options.focusedMarkerId;
    const endpoints = hideEndpoints
      ? []
      : marker.geometry.coordinates
          .map(([x, z], index) => ({
            id: `${marker.id}-${index}`,
            left: size.width / 2 + (x - view.centerX) * scale,
            top: size.height / 2 + (z - view.centerZ) * scale,
          }))
          .filter(
            (endpoint) =>
              endpoint.left >= -80 &&
              endpoint.left <= size.width + 80 &&
              endpoint.top >= -80 &&
              endpoint.top <= size.height + 80,
          );

    const [centerX, centerZ] = labelAnchor;
    const roadKind = getRoadMarkerKind(marker);
    const label = formatMarkerDisplayName(marker.label);
    const highwayIconUrl =
      roadKind === 'highway' && marker.iconFileName && isHighwayIconFileName(marker.iconFileName)
        ? toMarkerIconUrl(marker.iconFileName, options.iconBaseUrl)
        : undefined;
    const symbolIcon = roadKind ? undefined : marker.symbolIcon;
    const showTextLabel = Boolean(label) && !highwayIconUrl;
    const projectedMarker: ProjectedLinearPoi = {
      id: marker.id,
      label,
      left: size.width / 2 + (centerX - view.centerX) * scale,
      top: size.height / 2 + (centerZ - view.centerZ) * scale,
      endpointCount: marker.geometry.coordinates.length,
      accentColor: marker.accentColor,
      iconUrl: highwayIconUrl,
      roadKind,
      showCenter: Boolean(label || highwayIconUrl || symbolIcon),
      showTextLabel,
      isVerticalLabel:
        Boolean(roadKind) && showTextLabel
          ? shouldUseVerticalRoadLabel(marker.geometry.coordinates, labelAnchor)
          : false,
      symbolIcon,
      endpoints,
    };

    if (
      projectedMarker.endpoints.length > 0 ||
      (projectedMarker.left >= -100 &&
        projectedMarker.left <= size.width + 100 &&
        projectedMarker.top >= -100 &&
        projectedMarker.top <= size.height + 100)
    ) {
      projected.push(projectedMarker);
    }
  }

  return projected;
}

function screenToWorld(
  x: number,
  y: number,
  view: MapView,
  size: ViewportSize,
): { x: number; z: number } {
  const scale = getScale(view.zoom);
  return {
    x: view.centerX + (x - size.width / 2) / scale,
    z: view.centerZ + (y - size.height / 2) / scale,
  };
}

function toCoordinatePair(point: { x: number; z: number }): [number, number] {
  return [point.x, point.z];
}

function buildScaleBarInfo(view: MapView, size: ViewportSize, t: Translate): ScaleBarInfo {
  const scale = getScale(view.zoom);
  const targetPixels = clamp(size.width * 0.18, 72, 140);
  const rawDistance = targetPixels / scale;
  const distance = chooseNiceScaleDistance(rawDistance);

  return {
    distance,
    pixelWidth: Math.max(36, distance * scale),
    label: formatScaleDistance(distance, t),
  };
}

function chooseNiceScaleDistance(rawDistance: number): number {
  if (!Number.isFinite(rawDistance) || rawDistance <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rawDistance));
  const candidates = [exponent - 1, exponent, exponent + 1].flatMap((power) => {
    const unit = 10 ** power;
    return [1, 2, 5, 10].map((base) => base * unit);
  });

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - rawDistance) < Math.abs(best - rawDistance) ? candidate : best,
  );
}

function formatScaleDistance(distance: number, t: Translate): string {
  if (distance >= 1000) {
    return t('map.hud.scale.kilometers', { value: formatCompactNumber(distance / 1000) });
  }

  return t('map.hud.scale.blocks', { value: formatCompactNumber(distance) });
}

function formatTransitLineTime(line: TransitOverviewLine, t: Translate): string {
  const first = line.firstLastBus?.first;
  const last = line.firstLastBus?.last;
  if (first || last) {
    return `${first ?? t('lineDetail.toBeAdded')}-${last ?? t('lineDetail.toBeAdded')}`;
  }

  return line.departureTimes?.length
    ? t('lineDetail.extra.departures', { count: line.departureTimes.length })
    : t('lineDetail.toBeAdded');
}

function fitMarkerToMapView(
  marker: CenterableMarker,
  current: MapView,
  size: ViewportSize,
): MapView {
  const center = getMarkerCenter(marker);
  if (!center) {
    return current;
  }

  return {
    ...current,
    centerX: center[0],
    centerZ: center[1],
    zoom:
      marker.geometry.type === 'MultiPoint'
        ? getZoomToFitCoordinates(marker.geometry.coordinates, size, 120, current.zoom)
        : Math.max(current.zoom, 0),
  };
}

function fitRouteDraftToMapView(draft: RoutePlanDraft, current: MapView, size: ViewportSize): MapView {
  const coordinates = [draft.origin, draft.destination];
  const bounds = getCoordinateBounds(coordinates);
  return {
    ...current,
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    zoom: getZoomToFitCoordinates(coordinates, size, 120, current.zoom),
  };
}

function getZoomToFitCoordinates(
  coordinates: Array<[number, number]>,
  size: ViewportSize,
  padding: number,
  fallbackZoom: number,
): number {
  if (coordinates.length < 2 || size.width <= padding * 2 || size.height <= padding * 2) {
    return Math.max(fallbackZoom, 0);
  }

  const bounds = getCoordinateBounds(coordinates);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height);
  const zoom = Math.floor(Math.log2(Math.max(scale, 2 ** mapDefaults.minZoom)));
  return clampZoom(zoom);
}

function getCoordinateBounds(coordinates: Array<[number, number]>): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  return coordinates.reduce(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function getTraceBounds(points: Array<{ left: number; top: number }>): TraceBounds {
  return points.reduce(
    (current, point) => ({
      minLeft: Math.min(current.minLeft, point.left),
      maxLeft: Math.max(current.maxLeft, point.left),
      minTop: Math.min(current.minTop, point.top),
      maxTop: Math.max(current.maxTop, point.top),
    }),
    {
      minLeft: Number.POSITIVE_INFINITY,
      maxLeft: Number.NEGATIVE_INFINITY,
      minTop: Number.POSITIVE_INFINITY,
      maxTop: Number.NEGATIVE_INFINITY,
    },
  );
}

function getProjectedPathLength(points: Array<{ left: number; top: number }>): number {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1];
    if (!previous) {
      return total;
    }

    return total + Math.hypot(point.left - previous.left, point.top - previous.top);
  }, 0);
}

function suppressOverlappedRoadTraces(traces: ProjectedRoadTrace[]): ProjectedRoadTrace[] {
  const hiddenIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < traces.length; leftIndex += 1) {
    const left = traces[leftIndex];
    if (!left || left.roadKind === 'highway' || hiddenIds.has(left.id)) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < traces.length; rightIndex += 1) {
      const right = traces[rightIndex];
      if (!right || right.roadKind === 'highway' || hiddenIds.has(right.id)) {
        continue;
      }

      if (!traceBoundsHaveLargeOverlap(left.bounds, right.bounds)) {
        continue;
      }

      hiddenIds.add(left.pathLength <= right.pathLength ? left.id : right.id);
    }
  }

  return traces.filter((trace) => !hiddenIds.has(trace.id));
}

function traceBoundsHaveLargeOverlap(left: TraceBounds, right: TraceBounds): boolean {
  const overlapWidth =
    Math.min(left.maxLeft, right.maxLeft) - Math.max(left.minLeft, right.minLeft);
  const overlapHeight = Math.min(left.maxTop, right.maxTop) - Math.max(left.minTop, right.minTop);
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return false;
  }

  const overlapArea = overlapWidth * overlapHeight;
  const leftArea = Math.max(1, (left.maxLeft - left.minLeft) * (left.maxTop - left.minTop));
  const rightArea = Math.max(1, (right.maxLeft - right.minLeft) * (right.maxTop - right.minTop));
  return overlapArea / Math.min(leftArea, rightArea) >= 0.58;
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMapCoordinate(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

function getScale(zoom: number): number {
  return 2 ** zoom;
}

function getPinchPoints(
  pointers: Map<number, ActivePointer>,
): { left: GesturePoint; right: GesturePoint } | null {
  const points = Array.from(pointers.entries())
    .slice(0, 2)
    .map(([id, point]) => ({ id, ...point }));
  if (points.length < 2) {
    return null;
  }

  return {
    left: points[0],
    right: points[1],
  };
}

function getPointerDistance(left: ActivePointer, right: ActivePointer): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function getMidpoint(left: ActivePointer, right: ActivePointer): ActivePointer {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function clampZoom(zoom: number): number {
  return Math.max(mapDefaults.minZoom, Math.min(mapDefaults.maxZoom, zoom));
}

function getTileZoom(zoom: number): number {
  return Math.max(mapDefaults.minZoom, Math.min(mapDefaults.maxZoom, Math.round(zoom)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTileBaseUrl(tileTemplate: string): string {
  const index = tileTemplate.indexOf('tiles/');
  if (index >= 0) {
    return tileTemplate.slice(0, index);
  }

  return '';
}

function toMarkerIconUrl(fileName: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(fileName)) {
    return fileName;
  }

  if (fileName.startsWith('/')) {
    return appPath(fileName);
  }

  if (!baseUrl) {
    return fileName;
  }

  return new URL(fileName.replace(/^\/+/, ''), baseUrl).toString();
}

function formatPoint([x, z]: [number, number]): string {
  return `${Math.round(x)}, ${Math.round(z)}`;
}

function getMarkerCenter(marker: CenterableMarker): [number, number] | undefined {
  if (marker.geometry.type === 'Point') {
    return marker.geometry.coordinates;
  }

  if (marker.geometry.coordinates.length === 0) {
    return undefined;
  }

  const total = marker.geometry.coordinates.reduce(
    (sum, coordinate) => ({
      x: sum.x + coordinate[0],
      z: sum.z + coordinate[1],
    }),
    { x: 0, z: 0 },
  );

  return [
    total.x / marker.geometry.coordinates.length,
    total.z / marker.geometry.coordinates.length,
  ];
}

function getLinearMarkerLabelAnchor(
  marker: EndpointGroupMarker | TransitLineMarker,
  view: MapView,
  size: ViewportSize,
): [number, number] | undefined {
  if (marker.geometry.coordinates.length === 0) {
    return undefined;
  }

  if (marker.geometry.coordinates.length === 1) {
    return marker.geometry.coordinates[0];
  }

  const orderedCoordinates = isTransitLineMarker(marker)
    ? marker.geometry.coordinates
    : orderRoadTracePoints(marker.geometry.coordinates);

  return (
    getPolylineMidpoint(getVisiblePolylineCoordinates(orderedCoordinates, view, size)) ??
    getPolylineMidpoint(orderedCoordinates)
  );
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function getVisiblePolylineCoordinates(
  coordinates: Array<[number, number]>,
  view: MapView,
  size: ViewportSize,
): Array<[number, number]> {
  if (coordinates.length < 2) {
    return coordinates;
  }

  const bounds = getViewportWorldBounds(view, size, 96);
  const visibleCoordinates: Array<[number, number]> = [];
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    const clipped = clipSegmentToWorldBounds(from, to, bounds);
    if (!clipped) {
      continue;
    }

    appendCoordinate(visibleCoordinates, clipped[0]);
    appendCoordinate(visibleCoordinates, clipped[1]);
  }

  return visibleCoordinates;
}

function getViewportWorldBounds(
  view: MapView,
  size: ViewportSize,
  paddingPixels: number,
): WorldBounds {
  const scale = getScale(view.zoom);
  const padding = paddingPixels / scale;
  const halfWidth = size.width / 2 / scale;
  const halfHeight = size.height / 2 / scale;
  return {
    minX: view.centerX - halfWidth - padding,
    maxX: view.centerX + halfWidth + padding,
    minZ: view.centerZ - halfHeight - padding,
    maxZ: view.centerZ + halfHeight + padding,
  };
}

function clipSegmentToWorldBounds(
  from: [number, number],
  to: [number, number],
  bounds: WorldBounds,
): [[number, number], [number, number]] | null {
  const deltaX = to[0] - from[0];
  const deltaZ = to[1] - from[1];
  let startRatio = 0;
  let endRatio = 1;

  const edges: Array<[number, number]> = [
    [-deltaX, from[0] - bounds.minX],
    [deltaX, bounds.maxX - from[0]],
    [-deltaZ, from[1] - bounds.minZ],
    [deltaZ, bounds.maxZ - from[1]],
  ];

  for (const [edgeDelta, edgeDistance] of edges) {
    if (edgeDelta === 0) {
      if (edgeDistance < 0) {
        return null;
      }
      continue;
    }

    const ratio = edgeDistance / edgeDelta;
    if (edgeDelta < 0) {
      startRatio = Math.max(startRatio, ratio);
    } else {
      endRatio = Math.min(endRatio, ratio);
    }

    if (startRatio > endRatio) {
      return null;
    }
  }

  return [interpolateCoordinate(from, to, startRatio), interpolateCoordinate(from, to, endRatio)];
}

function interpolateCoordinate(
  from: [number, number],
  to: [number, number],
  ratio: number,
): [number, number] {
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
}

function appendCoordinate(target: Array<[number, number]>, coordinate: [number, number]) {
  const previous = target.at(-1);
  if (previous && squaredDistance(previous, coordinate) < 0.000001) {
    return;
  }

  target.push(coordinate);
}

function getPolylineMidpoint(coordinates: Array<[number, number]>): [number, number] | undefined {
  if (coordinates.length === 0) {
    return undefined;
  }

  if (coordinates.length === 1) {
    return coordinates[0];
  }

  const segments = coordinates.slice(1).map((coordinate, index) => {
    const previous = coordinates[index] ?? coordinate;
    return {
      from: previous,
      to: coordinate,
      length: Math.sqrt(squaredDistance(previous, coordinate)),
    };
  });
  const totalLength = segments.reduce((total, segment) => total + segment.length, 0);

  if (totalLength <= 0) {
    return coordinates[0];
  }

  let remaining = totalLength / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return [
        segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
        segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
      ];
    }

    remaining -= segment.length;
  }

  return coordinates.at(-1);
}

function getMarkerDistanceToMapCenter(marker: CenterableMarker, view: MapView): number {
  return getMarkerDistanceToCoordinates(marker, [view.centerX, view.centerZ]);
}

function getMarkerDistanceToCoordinates(
  marker: CenterableMarker,
  coordinates: [number, number],
): number {
  const center = getMarkerCenter(marker);
  if (!center) {
    return Number.POSITIVE_INFINITY;
  }

  return squaredDistance(center, coordinates);
}

function formatGeometryDetail(marker: CenterableMarker, t: Translate): string {
  if (marker.geometry.type === 'Point') {
    return t('map.geometry.pointMarker');
  }

  if (marker.categoryId === 'transit-line') {
    return t('map.geometry.transitLineObject', {
      count: marker.geometry.coordinates.length,
    });
  }

  return t('map.geometry.linearObject', {
    count: marker.geometry.coordinates.length,
  });
}

function formatMarkerDetail(marker: SidebarMarker, t: Translate): string {
  if (marker.description) {
    return marker.description;
  }

  if (marker.geometry.type === 'Point') {
    return formatPoint(marker.geometry.coordinates);
  }

  if (marker.categoryId === 'transit-line') {
    return marker.geometry.coordinates.length > 0
      ? t('map.geometry.transitLineDetail', {
          count: marker.geometry.coordinates.length,
        })
      : t('map.geometry.transitLinePending');
  }

  return t('map.geometry.roadEndpointCount', {
    count: marker.geometry.coordinates.length,
  });
}

function dedupeMarkersById<T extends { id: string }>(markers: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const marker of markers) {
    if (seen.has(marker.id)) {
      continue;
    }

    seen.add(marker.id);
    deduped.push(marker);
  }

  return deduped;
}
