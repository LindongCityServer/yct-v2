'use client';

import type {
  ApiListResponse,
  ApiMeta,
  MapMarkerSnapshot,
  PoiCategory,
  TileProviderDescriptor,
} from '@yct/contracts';
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appPath } from '../lib/app-paths';

interface MarkerResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
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
  kind: 'default-anchor' | 'route-origin' | 'route-destination';
}

interface ProjectedRoadTrace {
  id: string;
  label: string;
  path: string;
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
  originLabel: string;
  destinationLabel: string;
  destination: [number, number];
  origin: [number, number];
}

type RouteTransportMode = 'walk' | 'bus' | 'metro' | 'tram' | 'coach' | 'ferry' | 'railway';

interface RouteTransportModeOption {
  mode: RouteTransportMode;
  label: string;
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
  estimatedDistance: number;
  estimatedMinutes: number;
  steps: string[];
  note: string;
}

interface NearbySearchCenter {
  markerId: string;
  label: string;
  coordinates: [number, number];
}

interface ScaleBarInfo {
  distance: number;
  pixelWidth: number;
  label: string;
}

type LoadStatus = 'loading' | 'ready' | 'unavailable';
type RoadMarkerKind = 'road' | 'highway';
type MapBrowseMode = 'satellite' | 'road-network' | 'traffic';

const mapBrowseModes: Array<{ value: MapBrowseMode; label: string; icon: string }> = [
  { value: 'satellite', label: '卫星', icon: 'satellite_alt' },
  { value: 'road-network', label: '路网', icon: 'conversion_path' },
  { value: 'traffic', label: '交通', icon: 'commute' },
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

const routeTransportModeOptions: RouteTransportModeOption[] = [
  { mode: 'walk', label: '步行', icon: 'directions_walk', color: '#4B5B57' },
  { mode: 'bus', label: '公交', icon: 'directions_bus', color: 'var(--yct-color-tertiary)' },
  { mode: 'metro', label: '地铁', icon: 'subway', color: 'var(--yct-color-secondary)' },
  { mode: 'tram', label: '有轨', icon: 'tram', color: 'var(--yct-color-tram)' },
  { mode: 'coach', label: '客运', icon: 'airport_shuttle', color: 'var(--yct-color-coach)' },
  { mode: 'ferry', label: '轮渡', icon: 'directions_boat', color: 'var(--yct-color-ferry)' },
  { mode: 'railway', label: '铁路', icon: 'train', color: 'var(--yct-color-railway)' },
];

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
const mapDefaults = {
  minZoom: -7,
  maxZoom: 3,
  defaultZoom: 0,
  centerX: -945,
  centerZ: -876,
};

type PoiDetailTab = 'summary' | 'facilities';

export function MapStage() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activePointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [markerQuery, setMarkerQuery] = useState('');
  const [tileResponse, setTileResponse] = useState<ApiListResponse<TileProviderDescriptor> | null>(
    null,
  );
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
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string | null>(null);
  const [nearbySearchCenter, setNearbySearchCenter] = useState<NearbySearchCenter | null>(null);
  const [poiDetailCollapsed, setPoiDetailCollapsed] = useState(false);

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

  const activeTileProvider = tileResponse?.items[0];
  const tileTemplate = activeTileProvider?.tileTemplate;
  const tileBaseUrl = tileTemplate ? getTileBaseUrl(tileTemplate) : '';
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
  const focusedPointMarker = useMemo(
    () => pointMarkers.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, pointMarkers],
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
        .filter(Boolean),
    );
    const categories =
      categoryResponse?.items
        .filter((category) => availableCategoryIds.has(category.id))
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'zh-CN'),
        ) ?? [];

    return [{ id: 'all', name: '全部' }, ...categories];
  }, [categoryResponse, endpointGroupMarkers, pointMarkers, transitLineMarkers]);
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

  const rawProjectedMarkers = useMemo(
    () =>
      projectPointMarkers(
        markersVisible ? pointOverlaySource : [],
        mapView,
        viewportSize,
        tileBaseUrl,
        focusedMarkerId,
        browseMode,
      ).slice(0, 220),
    [
      browseMode,
      focusedMarkerId,
      markerQuery,
      markersVisible,
      pointOverlaySource,
      mapView,
      tileBaseUrl,
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
        iconBaseUrl: tileBaseUrl,
      }),
    [focusedMarkerId, linearOverlaySource, mapView, tileBaseUrl, viewportSize],
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
  const selectedRoadTraceSource = useMemo(() => {
    const selectedRoadTrace = focusedMarkerId
      ? roadTraceSource.find((marker) => marker.id === focusedMarkerId)
      : undefined;
    return selectedRoadTrace ? [selectedRoadTrace] : [];
  }, [focusedMarkerId, roadTraceSource]);
  const browseModeRoadTraceSource = useMemo(() => {
    if (!linearFeaturesVisible) {
      return [];
    }

    const baseSource = roadTraceSource;

    return dedupeMarkersById([...selectedRoadTraceSource, ...baseSource]);
  }, [browseMode, linearFeaturesVisible, roadTraceSource, selectedRoadTraceSource]);
  const projectedRoadTraces = useMemo(
    () =>
      projectRoadTraceMarkers(browseModeRoadTraceSource, mapView, viewportSize, focusedMarkerId, {
        isMuted: browseMode === 'traffic' || browseMode === 'satellite',
        suppressLargeOverlap: browseMode !== 'satellite',
      }).slice(0, 160),
    [browseMode, browseModeRoadTraceSource, focusedMarkerId, mapView, viewportSize],
  );
  const projectedTransitTraces = useMemo(
    () =>
      linearFeaturesVisible && focusedTransitLineMarker
        ? projectTransitLineTraces([focusedTransitLineMarker], mapView, viewportSize).slice(0, 4)
        : [],
    [focusedTransitLineMarker, linearFeaturesVisible, mapView, viewportSize],
  );
  const publicPoiCategories = useMemo(
    () => categoryResponse?.items.filter((category) => category.acceptsPublicSubmissions) ?? [],
    [categoryResponse],
  );
  const dataSourceText =
    markerResponse?.meta.message ?? activeTileProvider?.freshness?.note ?? '地图数据正在读取。';
  const categoryById = useMemo(
    () => new Map((categoryResponse?.items ?? []).map((category) => [category.id, category.name])),
    [categoryResponse],
  );
  const stationConnectionIndex = useMemo(
    () => buildStationConnectionIndex(transitOverview),
    [transitOverview],
  );
  const routePlanOptions = useMemo(
    () =>
      routePlanDraft
        ? buildRoutePlanOptions({
            draft: routePlanDraft,
            enabledModes: routeTransportModes,
            pointMarkers,
            stationConnectionIndex,
            modeProfiles: transitOverview?.modeProfiles ?? [],
          })
        : [],
    [pointMarkers, routePlanDraft, routeTransportModes, stationConnectionIndex, transitOverview],
  );
  const selectedRouteOption =
    routePlanOptions.find((option) => option.id === selectedRouteOptionId) ?? routePlanOptions[0];
  const selectedRouteTrace = useMemo(
    () =>
      selectedRouteOption
        ? projectRoutePlanTrace(selectedRouteOption, mapView, viewportSize)
        : undefined,
    [mapView, selectedRouteOption, viewportSize],
  );
  const focusedMarkerCenter =
    focusedMarker && isCenterableMarker(focusedMarker) ? getMarkerCenter(focusedMarker) : undefined;
  const focusedMarkerCategoryName = focusedMarker?.categoryId
    ? categoryById.get(focusedMarker.categoryId)
    : undefined;
  const focusedMarkerConnections =
    focusedMarker && isTransitStationPoi(focusedMarker)
      ? findStationConnections(focusedMarker, stationConnectionIndex)
      : [];
  const focusedTransitLine =
    focusedMarker && isTransitLineMarker(focusedMarker)
      ? findTransitLineByMarker(focusedMarker, transitOverview)
      : undefined;
  const scaleBarInfo = useMemo(
    () => buildScaleBarInfo(mapView, viewportSize),
    [mapView, viewportSize],
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

  const focusMapMarker = (marker: SidebarMarker) => {
    setMapView((current) => fitMarkerToMapView(marker, current, viewportSize));
    setFocusedMarkerId(marker.id);
    setPoiDetailTab('summary');
    setPoiDetailCollapsed(false);
    setNearbySearchCenter(null);
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
    pinchRef.current = {
      pointerIds: [points.left.id, points.right.id],
      startDistance: Math.max(1, getPointerDistance(points.left, points.right)),
      startZoom: mapView.zoom,
      anchorWorld: screenToWorld(screenX, screenY, mapView, viewportSize),
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

    if (activePointersRef.current.size >= 2) {
      dragRef.current = null;
      startPinchGesture(event.currentTarget);
      return;
    }

    startDragGesture(event.pointerId, event.clientX, event.clientY, mapView);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorWorld(event);
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pinchRef.current && activePointersRef.current.size >= 2) {
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
    activePointersRef.current.delete(event.pointerId);
    if (pinchRef.current?.pointerIds.includes(event.pointerId)) {
      pinchRef.current = null;
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

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomDelta = clamp(-event.deltaY / 320, -0.5, 0.5);
    const nextZoom = clampZoom(mapView.zoom + zoomDelta);
    if (nextZoom === mapView.zoom) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const before = screenToWorld(
      event.clientX - rect.left,
      event.clientY - rect.top,
      mapView,
      viewportSize,
    );
    const nextScale = getScale(nextZoom);
    setMapView({
      zoom: nextZoom,
      centerX: before.x - (event.clientX - rect.left - viewportSize.width / 2) / nextScale,
      centerZ: before.z - (event.clientY - rect.top - viewportSize.height / 2) / nextScale,
    });
  };

  const submitPoi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPoiSubmitStatus('');
    const x = Number(poiX);
    const z = Number(poiZ);

    if (!poiTitle.trim() || !poiCategoryId || !Number.isFinite(x) || !Number.isFinite(z)) {
      setPoiSubmitStatus('请填写名称、分类和有效坐标。');
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
          setPoiSubmitStatus(imageData.message ?? '图片上传失败');
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
        setPoiSubmitStatus(data.message ?? '投稿提交失败');
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
      setPoiSubmitStatus('已提交，等待管理员审核。');
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

    setRoutePlanDraft({
      destinationId: marker.id,
      originLabel: formatPoint([mapView.centerX, mapView.centerZ]),
      destinationLabel: formatMarkerDisplayName(marker.label),
      destination,
      origin: [mapView.centerX, mapView.centerZ],
    });
    setRoutePlanCollapsed(false);
    setSelectedRouteOptionId(null);
  };

  const updateRoutePlanOriginToMapCenter = () => {
    setRoutePlanDraft((current) =>
      current
        ? {
            ...current,
            origin: [mapView.centerX, mapView.centerZ],
            originLabel: formatPoint([mapView.centerX, mapView.centerZ]),
          }
        : current,
    );
  };

  const swapRoutePlanEndpoints = () => {
    setRoutePlanDraft((current) =>
      current
        ? {
            ...current,
            destinationId: undefined,
            origin: current.destination,
            originLabel: current.destinationLabel,
            destination: current.origin,
            destinationLabel: current.originLabel,
          }
        : current,
    );
    setSelectedRouteOptionId(null);
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
    setMarkerListExpanded(true);
  };

  const projectedGuideMarkers = useMemo(() => {
    const markers: ProjectedGuideMarker[] = [];
    const defaultAnchor = projectCoordinateMarker(
      'default-anchor',
      '默认视图',
      [mapDefaults.centerX, mapDefaults.centerZ],
      mapView,
      viewportSize,
      32,
    );
    if (defaultAnchor) {
      markers.push(defaultAnchor);
    }

    if (routePlanDraft) {
      const routeOrigin = projectCoordinateMarker(
        'route-origin',
        '起点',
        routePlanDraft.origin,
        mapView,
        viewportSize,
        40,
      );
      const routeDestination = projectCoordinateMarker(
        'route-destination',
        '终点',
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
    }

    return markers;
  }, [mapView, routePlanDraft, viewportSize]);

  const hasMapOverlay =
    projectedGuideMarkers.length > 0 ||
    Boolean(selectedRouteTrace) ||
    projectedMarkers.length > 0 ||
    projectedLinearPois.length > 0 ||
    projectedRoadTraces.length > 0 ||
    projectedTransitTraces.length > 0;

  return (
    <section className="map-stage" aria-labelledby="map-title">
      <h1 id="map-title" className="sr-only">
        地图探索
      </h1>

      <aside className="map-control-stack map-sidebar-stack" aria-label="地图操作">
        <div className="map-panel-section">
          <div className="search-box map-search-box">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              aria-label="筛选地图标记"
              value={markerQuery}
              onChange={(event) => updateMarkerQuery(event.currentTarget.value)}
              placeholder="搜索地点或标记"
            />
            {markerQuery ? (
              <button
                className="search-clear-button"
                type="button"
                aria-label="清空地图搜索"
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
              collapsed={routePlanCollapsed}
              enabledModes={routeTransportModes}
              options={routePlanOptions}
              selectedOptionId={selectedRouteOption?.id}
              onClear={() => setRoutePlanDraft(null)}
              onFocusDestination={() => {
                if (routePlanDraft.destinationId) {
                  setFocusedMarkerId(routePlanDraft.destinationId);
                  setPoiDetailCollapsed(false);
                }
              }}
              onSetAllModes={(enabled) =>
                setRouteTransportModes(
                  Object.fromEntries(
                    routeTransportModeOptions.map((mode) => [mode.mode, enabled]),
                  ) as EnabledRouteTransportModes,
                )
              }
              onSelectOption={setSelectedRouteOptionId}
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
                    ? '搜索结果'
                    : nearbySearchCenter
                      ? `${nearbySearchCenter.label}周边`
                      : '地图标记'}
                </span>
                <span className="muted">{sidebarMarkers.length} 个</span>
              </button>
              {markerListExpanded ? (
                <>
                  {nearbySearchCenter ? (
                    <div className="map-nearby-search-note">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        travel_explore
                      </span>
                      <span>按距离显示 {nearbySearchCenter.label} 周边标记</span>
                      <button type="button" onClick={() => setNearbySearchCenter(null)}>
                        退出
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
                    <div className="map-category-strip" aria-label="筛选地图标记分类">
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
                        aria-label={markerCategoryExpanded ? '收起分类筛选' : '展开分类筛选'}
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
                            <MarkerListIcon marker={marker} tileBaseUrl={tileBaseUrl} />
                            <span>{formatMarkerDisplayName(marker.label)}</span>
                            <span className="muted">{formatMarkerDetail(marker)}</span>
                          </>
                        );

                        if (marker.href) {
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
                            onClick={() => focusMapMarker(marker)}
                          >
                            {content}
                          </button>
                        );
                      })
                    ) : (
                      <p className="map-marker-list-empty">
                        {loadStatus === 'loading'
                          ? '正在读取地图标记'
                          : nearbySearchCenter
                            ? '周边暂无可显示标记'
                            : '暂无匹配标记'}
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
              <MarkerListIcon marker={focusedMarker} tileBaseUrl={tileBaseUrl} />
              <div>
                <h2 id="map-poi-detail-title">{formatMarkerDisplayName(focusedMarker.label)}</h2>
                <span>{focusedMarkerCategoryName ?? focusedMarker.categoryId ?? '地图对象'}</span>
              </div>
              <button
                className="icon-action-button"
                type="button"
                aria-label={poiDetailCollapsed ? '展开地点信息' : '收起地点信息'}
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
                aria-label="关闭地点信息"
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
                  <div className="map-poi-detail-tabs" aria-label="地点信息分类">
                    {[
                      ['summary', '简介'],
                      ['facilities', '设施/出入口'],
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
                    />
                  ) : isRoadEndpointGroupMarker(focusedMarker) ? (
                    <RoadMapDetail marker={focusedMarker} />
                  ) : poiDetailTab === 'summary' ? (
                    <>
                      {focusedMarker.imageUrl ? (
                        <img
                          className="map-poi-detail-image"
                          src={focusedMarker.imageUrl}
                          alt={`${formatMarkerDisplayName(focusedMarker.label)} 图片`}
                        />
                      ) : null}
                      {focusedMarker.description ? <p>{focusedMarker.description}</p> : null}
                      <dl>
                        {focusedMarkerCenter ? (
                          <div>
                            <dt>坐标</dt>
                            <dd>{formatPoint(focusedMarkerCenter)}</dd>
                          </div>
                        ) : null}
                        <div>
                          <dt>类型</dt>
                          <dd>{formatGeometryDetail(focusedMarker)}</dd>
                        </div>
                        {isTransitStationPoi(focusedMarker) ? (
                          <div>
                            <dt>接驳线路</dt>
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
                                '暂无已知接驳线路'
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
                          <span>打开详情</span>
                        </a>
                      ) : null}
                      <PoiActionBar
                        marker={focusedMarker}
                        onPlanRoute={() => createRoutePlanDraft(focusedMarker)}
                        onSearchNearby={() => startNearbySearch(focusedMarker)}
                      />
                    </>
                  ) : null}
                  {!isLinearDetailMarker(focusedMarker) && poiDetailTab === 'facilities' ? (
                    <p>{focusedMarker.description ?? '暂无设施数据'}</p>
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
        onWheel={handleWheel}
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
              ? '地图数据读取中'
              : loadStatus === 'ready'
                ? `${pointMarkers.length + endpointGroupMarkers.length + transitLineMarkers.length} 个对象`
                : '地图数据暂不可用'}
          </span>
        </div>

        <div className="map-hud" aria-label="地图比例尺与坐标">
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
                : '移动光标查看坐标'}
            </span>
          </div>
        </div>

        {hasMapOverlay ? (
          <div className="map-marker-layer" aria-label="地图标记示意层">
            {selectedRouteTrace ? (
              <div className="map-route-trace-layer" aria-hidden="true">
                <TraceLayerView
                  trace={selectedRouteTrace}
                  kind="route"
                  title={`${selectedRouteOption?.title ?? '路线方案'} · 初步估算`}
                />
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
                  <>
                    <span className="material-symbols-outlined map-guide-marker-icon">
                      location_on
                    </span>
                    <span className="map-guide-marker-badge">{marker.label}</span>
                  </>
                )}
              </div>
            ))}
            {projectedRoadTraces.length ? (
              <div className="map-road-trace-layer" aria-hidden="true">
                {projectedRoadTraces.map((trace) => (
                  <TraceLayerView
                    trace={trace}
                    kind="road"
                    key={trace.id}
                    title={`${trace.label} · 近似线，${trace.pointCount} 个端点`}
                  />
                ))}
              </div>
            ) : null}
            {projectedTransitTraces.length ? (
              <div className="map-transit-trace-layer" aria-hidden="true">
                {projectedTransitTraces.map((trace) => (
                  <TraceLayerView
                    trace={trace}
                    kind="transit"
                    key={trace.id}
                    title={`${trace.label} · ${trace.pointCount} 个途经站`}
                  />
                ))}
              </div>
            ) : null}
            {projectedLinearPois.map((marker) => {
              const sourceMarker = linearOverlaySource.find((item) => item.id === marker.id);
              const focusLinearMarker = () => {
                if (sourceMarker) {
                  focusMapMarker(sourceMarker);
                }
              };

              return (
                <div className="map-linear-poi" key={marker.id}>
                  {marker.endpoints.map((endpoint) => (
                    <button
                      className="map-linear-poi-endpoint"
                      type="button"
                      aria-label={`查看 ${marker.label}`}
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
                      title={`${marker.label} · ${marker.endpointCount} 个端点`}
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
            {projectedMarkers.map((marker) => (
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
                aria-label={`查看 ${marker.label}`}
                key={marker.id}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  const source = pointMarkers.find((item) => item.id === marker.id);
                  if (source) {
                    focusMapMarker(source);
                  }
                }}
                style={
                  {
                    '--marker-left': `${marker.left}px`,
                    '--marker-top': `${marker.top}px`,
                  } as CSSProperties
                }
                title={`${marker.label} (${marker.x}, ${marker.z})`}
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
            <p>{loadStatus === 'loading' ? '正在读取地图标记' : '暂无可显示地图标记'}</p>
          </div>
        )}
      </div>

      <div className="map-toolbar">
        <button
          className="icon-button"
          type="button"
          aria-label="放大地图"
          onClick={() => zoomBy(0.5)}
        >
          <span className="material-symbols-outlined">add</span>
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="缩小地图"
          onClick={() => zoomBy(-0.5)}
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
        <button className="icon-button" type="button" aria-label="回到默认视图" onClick={resetView}>
          <span className="material-symbols-outlined">my_location</span>
        </button>
        <button
          className={layerPanelOpen ? 'icon-button is-active' : 'icon-button'}
          type="button"
          aria-label="图层与投稿"
          aria-expanded={layerPanelOpen}
          aria-controls="map-layer-panel"
          onClick={() => setLayerPanelOpen((current) => !current)}
        >
          <span className="material-symbols-outlined">layers</span>
        </button>
      </div>

      {layerPanelOpen ? (
        <aside className="map-layer-panel" id="map-layer-panel" aria-label="图层与投稿">
          <div className="map-browse-mode-control" role="tablist" aria-label="地图浏览模式">
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
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
          <p className="map-layer-note">
            {browseMode === 'satellite'
              ? `加载${activeTileProvider?.name ?? '地图瓦片'}，仅叠加关键道路。`
              : browseMode === 'road-network'
                ? '关闭瓦片，突出道路网络和道路文字。'
                : '关闭瓦片，突出公共交通站点并淡化道路。'}
          </p>
          <div className="map-layer-option-list">
            <label className="map-layer-toggle">
              <span className="material-symbols-outlined" aria-hidden="true">
                location_on
              </span>
              <span>
                <strong>标记点</strong>
                <small>{markersVisible ? '显示地点标记' : '已隐藏地点标记'}</small>
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
                <strong>线条与标签</strong>
                <small>{linearFeaturesVisible ? '显示道路/线路覆盖' : '已隐藏道路/线路覆盖'}</small>
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
            <span>投稿 POI</span>
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
              <h2 id="map-poi-submit-title">投稿公开 POI</h2>
              <button
                className="icon-action-button"
                type="button"
                onClick={() => setPoiSubmitDialogOpen(false)}
                aria-label="关闭投稿窗口"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <form className="map-poi-submit-form" onSubmit={submitPoi}>
              <label>
                <span>地点名称</span>
                <input
                  autoFocus
                  value={poiTitle}
                  onChange={(event) => setPoiTitle(event.currentTarget.value)}
                  placeholder="地点名称"
                  aria-label="地点名称"
                />
              </label>
              <label>
                <span>分类</span>
                <select
                  value={poiCategoryId}
                  onChange={(event) => setPoiCategoryId(event.currentTarget.value)}
                  aria-label="POI 分类"
                >
                  {publicPoiCategories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>地点简介</span>
                <textarea
                  value={poiDescription}
                  onChange={(event) => setPoiDescription(event.currentTarget.value)}
                  placeholder="可填写地点用途、开放状态、出入口说明等"
                  aria-label="地点简介"
                  maxLength={1000}
                />
              </label>
              <label>
                <span>相关链接</span>
                <input
                  type="url"
                  value={poiHref}
                  onChange={(event) => setPoiHref(event.currentTarget.value)}
                  placeholder="https://..."
                  aria-label="相关链接"
                />
              </label>
              <label>
                <span>上传图片</span>
                <input
                  key={poiImageFileInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                  onChange={(event) => setPoiImageFile(event.currentTarget.files?.[0] ?? null)}
                  aria-label="上传图片"
                />
              </label>
              <label>
                <span>图片链接</span>
                <input
                  type="url"
                  value={poiImageUrl}
                  onChange={(event) => setPoiImageUrl(event.currentTarget.value)}
                  placeholder="https://.../photo.png"
                  aria-label="图片链接"
                />
              </label>
              <div className="map-poi-coordinate-row">
                <label>
                  <span>X 坐标</span>
                  <input
                    type="number"
                    value={poiX}
                    onChange={(event) => setPoiX(event.currentTarget.value)}
                    placeholder="X"
                    aria-label="X 坐标"
                  />
                </label>
                <label>
                  <span>Z 坐标</span>
                  <input
                    type="number"
                    value={poiZ}
                    onChange={(event) => setPoiZ(event.currentTarget.value)}
                    placeholder="Z"
                    aria-label="Z 坐标"
                  />
                </label>
              </div>
              <button
                className="secondary-action-button is-primary"
                type="submit"
                disabled={poiSubmitBusy || publicPoiCategories.length === 0}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload
                </span>
                <span>{poiSubmitBusy ? '提交中' : '提交审核'}</span>
              </button>
            </form>
            {poiSubmitStatus ? <p className="map-source-note">{poiSubmitStatus}</p> : null}
          </section>
        </div>
      ) : null}
      <MapStageLegal />
    </section>
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
  return (
    <footer className="map-legal" aria-label="备案信息">
      <p>本站部分代码使用人工智能技术生成，上述地名、组织名均为虚构。</p>
      <p>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
          辽ICP备2021004959号-1
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=21100502000117"
          target="_blank"
          rel="noreferrer"
        >
          辽公网安备21100502000117号
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
        : 'map-transit-trace is-selected';

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
      <path className={pathClassName} d={trace.path}>
        <title>{title}</title>
      </path>
    </svg>
  );
}

function TransitLineMapDetail({
  line,
  lineColor,
}: Readonly<{ line: TransitOverviewLine; lineColor?: string }>) {
  const [direction, setDirection] = useState<'forward' | 'reverse'>('forward');
  const stationStops = getDirectionalLineStops(line, direction);
  const firstStationName = stationStops[0]?.stationName ?? line.firstStationName;
  const lastStationName =
    stationStops[stationStops.length - 1]?.stationName ?? line.lastStationName;
  const forwardDirectionName = line.lastStationName ?? line.stationNames.at(-1) ?? '正向';
  const reverseDirectionName = line.firstStationName ?? line.stationNames[0] ?? '反向';

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
          <dt>首末车时间</dt>
          <dd>{formatTransitLineTime(line)}</dd>
        </div>
        <div>
          <dt>运营单位</dt>
          <dd>{line.operator ?? '待补充'}</dd>
        </div>
        <div>
          <dt>票价</dt>
          <dd>{line.fare ?? '待补充'}</dd>
        </div>
        <div>
          <dt>站点</dt>
          <dd>
            {firstStationName && lastStationName
              ? `${firstStationName} → ${lastStationName}`
              : `${stationStops.length} 站`}
          </dd>
        </div>
      </dl>
      <div className="map-line-direction-switch" role="tablist" aria-label="线路方向">
        <button
          className={direction === 'forward' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={direction === 'forward'}
          onClick={() => setDirection('forward')}
        >
          {formatMarkerDisplayName(forwardDirectionName)}方向
        </button>
        <button
          className={direction === 'reverse' ? 'is-active' : ''}
          type="button"
          role="tab"
          aria-selected={direction === 'reverse'}
          onClick={() => setDirection('reverse')}
        >
          {formatMarkerDisplayName(reverseDirectionName)}方向
        </button>
      </div>
      {stationStops.length > 0 ? (
        <ol className="map-line-station-list">
          {stationStops.map((stop, index) => (
            <li key={`${stop.stationName}-${stop.sequence}-${index}`}>
              <span className="map-line-station-node" aria-hidden="true" />
              <span>
                {formatMarkerDisplayName(stop.stationName)}
                {stop.oneWay ? <small>{stop.oneWay === 'up' ? '仅正向' : '仅反向'}</small> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p>这条线路暂未导入站点列表。</p>
      )}
    </div>
  );
}

function RoadMapDetail({ marker }: Readonly<{ marker: EndpointGroupMarker }>) {
  return (
    <div className="map-linear-detail">
      <p>这是一组从旧地图道路端点归并出的线性地点，当前轨迹为近似展示。</p>
      <dl>
        <div>
          <dt>端点数量</dt>
          <dd>{marker.geometry.coordinates.length} 个</dd>
        </div>
        <div>
          <dt>轨迹状态</dt>
          <dd>已在地图上高亮近似轨迹</dd>
        </div>
      </dl>
    </div>
  );
}

function RoutePlanDraftCard({
  draft,
  collapsed,
  enabledModes,
  options,
  selectedOptionId,
  onClear,
  onFocusDestination,
  onSetAllModes,
  onSelectOption,
  onSwapEndpoints,
  onToggleCollapsed,
  onToggleMode,
  onUseMapCenter,
}: Readonly<{
  draft: RoutePlanDraft;
  collapsed: boolean;
  enabledModes: EnabledRouteTransportModes;
  options: RoutePlanOption[];
  selectedOptionId?: string;
  onClear: () => void;
  onFocusDestination: () => void;
  onSetAllModes: (enabled: boolean) => void;
  onSelectOption: (optionId: string) => void;
  onSwapEndpoints: () => void;
  onToggleCollapsed: () => void;
  onToggleMode: (mode: RouteTransportMode) => void;
  onUseMapCenter: () => void;
}>) {
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? options[0];
  const allModesEnabled = routeTransportModeOptions.every((mode) => enabledModes[mode.mode]);

  return (
    <section
      className={collapsed ? 'map-route-plan-card is-collapsed' : 'map-route-plan-card'}
      aria-label="路线规划"
    >
      <div className="map-route-plan-top">
        <div className="map-route-endpoint-list">
          <div className="map-route-endpoint-row">
            <span className="map-route-endpoint-dot is-origin" aria-hidden="true" />
            <strong>{draft.originLabel}</strong>
            <button type="button" onClick={onUseMapCenter}>
              修改
            </button>
          </div>
          <div className="map-route-endpoint-row">
            <span className="map-route-endpoint-dot is-destination" aria-hidden="true" />
            <strong>{draft.destinationLabel}</strong>
            <button type="button" onClick={onFocusDestination} disabled={!draft.destinationId}>
              修改
            </button>
          </div>
        </div>
        <div className="map-route-plan-header-actions">
          <button type="button" aria-label="交换起终点" onClick={onSwapEndpoints}>
            <span className="material-symbols-outlined" aria-hidden="true">
              swap_vert
            </span>
          </button>
          <button
            type="button"
            aria-label={collapsed ? '展开路线规划' : '收起路线规划'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {collapsed ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
            </span>
          </button>
          <button type="button" aria-label="关闭路线规划" onClick={onClear}>
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="map-route-mode-toggle-list" aria-label="路线交通方式">
            <button
              className={allModesEnabled ? 'is-active' : ''}
              type="button"
              aria-pressed={allModesEnabled}
              onClick={() => onSetAllModes(!allModesEnabled)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {allModesEnabled ? 'check_box' : 'select_check_box'}
              </span>
              <span>全部</span>
            </button>
            {routeTransportModeOptions.map((mode) => (
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
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
          <div className="map-route-option-list" aria-label="路线方案">
            {options.length > 0 ? (
              options.map((option, index) => {
                const isSelected = option.id === selectedOption?.id;
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
                      <strong>{formatRoutePlanMinutes(option.estimatedMinutes)}</strong>
                      <span className="map-route-option-distance">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          directions_walk
                        </span>
                        {formatRoutePlanDistance(option.estimatedDistance)}
                      </span>
                      {index === 0 ? (
                        <span className="map-route-option-badge">最快到达</span>
                      ) : null}
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
                      <ol className="map-route-step-timeline" aria-label="选中路线步骤">
                        {option.steps.map((step, stepIndex) => {
                          const isFirst = stepIndex === 0;
                          const isLast = stepIndex === option.steps.length - 1;
                          return (
                            <li
                              className={
                                isFirst ? 'is-origin' : isLast ? 'is-destination' : 'is-transfer'
                              }
                              key={`${option.id}-${stepIndex}`}
                            >
                              <span className="map-route-step-marker" aria-hidden="true">
                                {isFirst ? '起' : isLast ? '终' : ''}
                              </span>
                              <span>{step}</span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="map-route-plan-note">请至少启用一种交通方式。</p>
            )}
          </div>
          {selectedOption ? <p className="map-route-plan-note">{selectedOption.note}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function buildRoutePlanOptions(input: {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  pointMarkers: PointMarker[];
  stationConnectionIndex: Map<string, TransitLineConnection[]>;
  modeProfiles: TransitModeProfileForMap[];
}): RoutePlanOption[] {
  const options: RoutePlanOption[] = [];
  const directDistance = getCoordinateDistance(input.draft.origin, input.draft.destination);

  if (input.enabledModes.walk) {
    options.push({
      id: 'walk-direct',
      title: '步行直达',
      summary: `${formatRoutePlanDistance(directDistance)} · 直线估算`,
      icon: 'directions_walk',
      color: routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ?? '#4B5B57',
      coordinates: [input.draft.origin, input.draft.destination],
      estimatedDistance: directDistance,
      estimatedMinutes: estimateRouteMinutes(directDistance, 72),
      steps: [
        `从起点按直线前往 ${input.draft.destinationLabel}`,
        `到达 ${input.draft.destinationLabel}`,
      ],
      note: '当前为直线步行估算；道路级导航发布后会改为沿道路、出入口和可通行规则规划。',
    });
  }

  const profileByMode = new Map(input.modeProfiles.map((profile) => [profile.mode, profile]));
  for (const mode of routeTransportModeOptions) {
    if (mode.mode === 'walk' || !input.enabledModes[mode.mode]) {
      continue;
    }

    const option = buildTransitRoutePlanOption({
      draft: input.draft,
      mode,
      profile: profileByMode.get(mode.mode),
      pointMarkers: input.pointMarkers,
      stationConnectionIndex: input.stationConnectionIndex,
    });
    if (option) {
      options.push(option);
    }
  }

  return options
    .sort(
      (left, right) =>
        left.estimatedMinutes - right.estimatedMinutes ||
        left.estimatedDistance - right.estimatedDistance ||
        left.title.localeCompare(right.title, 'zh-CN'),
    )
    .slice(0, 5);
}

function buildTransitRoutePlanOption(input: {
  draft: RoutePlanDraft;
  mode: RouteTransportModeOption;
  profile?: TransitModeProfileForMap;
  pointMarkers: PointMarker[];
  stationConnectionIndex: Map<string, TransitLineConnection[]>;
}): RoutePlanOption | undefined {
  const stationCandidates = input.pointMarkers
    .filter((marker) => isTransitStationPoi(marker))
    .map((marker) => {
      const center = getMarkerCenter(marker);
      const connections = findStationConnections(marker, input.stationConnectionIndex).filter(
        (connection) => connection.mode === input.mode.mode,
      );
      return center && connections.length > 0 ? { marker, center, connections } : undefined;
    })
    .filter(
      (
        candidate,
      ): candidate is {
        marker: PointMarker;
        center: [number, number];
        connections: TransitLineConnection[];
      } => Boolean(candidate),
    );

  if (stationCandidates.length < 2) {
    return undefined;
  }

  const originStation = findNearestRouteStation(input.draft.origin, stationCandidates);
  const destinationStation = findNearestRouteStation(input.draft.destination, stationCandidates);
  if (!originStation || !destinationStation) {
    return undefined;
  }

  const accessDistance = getCoordinateDistance(input.draft.origin, originStation.center);
  const egressDistance = getCoordinateDistance(input.draft.destination, destinationStation.center);
  const transitDistance = getCoordinateDistance(originStation.center, destinationStation.center);
  const sharedLine = originStation.connections.find((left) =>
    destinationStation.connections.some((right) => right.id === left.id),
  );
  const modeLabel = input.profile?.label ?? input.mode.label;
  const color = input.profile?.color ?? input.mode.color;
  const icon = input.profile?.icon ?? input.mode.icon;
  const transferPenalty = sharedLine ? 0 : 8;
  const estimatedMinutes =
    estimateRouteMinutes(accessDistance + egressDistance, 72) +
    estimateRouteMinutes(transitDistance, getTransitSpeedFactor(input.mode.mode)) +
    transferPenalty;

  return {
    id: `${input.mode.mode}-${originStation.marker.id}-${destinationStation.marker.id}`,
    title: sharedLine ? `${modeLabel}少换乘` : `${modeLabel}接驳`,
    summary: `${formatRoutePlanDistance(accessDistance + egressDistance)} 步行接驳 · ${formatRoutePlanDistance(
      transitDistance,
    )} 站间估算`,
    icon,
    color,
    coordinates: [
      input.draft.origin,
      originStation.center,
      destinationStation.center,
      input.draft.destination,
    ],
    estimatedDistance: accessDistance + egressDistance + transitDistance,
    estimatedMinutes,
    steps: [
      `步行约 ${formatRoutePlanDistance(accessDistance)} 到 ${formatMarkerDisplayName(originStation.marker.label)}`,
      sharedLine
        ? `乘坐 ${sharedLine.name} 前往 ${formatMarkerDisplayName(destinationStation.marker.label)}`
        : `使用 ${modeLabel} 从 ${formatMarkerDisplayName(originStation.marker.label)} 前往 ${formatMarkerDisplayName(
            destinationStation.marker.label,
          )}，可能需要换乘`,
      `步行约 ${formatRoutePlanDistance(egressDistance)} 到 ${input.draft.destinationLabel}`,
    ],
    note: sharedLine
      ? '已找到两端共同线路，但站间路径仍按直线估算，未代表真实乘车时间。'
      : '已找到两端接驳站点，但换乘和站间路径需要等待线路坐标、道路网络和时刻表继续完善。',
  };
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

function formatRoutePlanDistance(distance: number): string {
  return `${Math.max(0, Math.round(distance))} 格`;
}

function formatRoutePlanMinutes(minutes: number): string {
  return `约 ${Math.max(1, minutes)} 分`;
}

function PoiActionBar({
  marker,
  onPlanRoute,
  onSearchNearby,
}: Readonly<{ marker: CenterableMarker; onPlanRoute: () => void; onSearchNearby: () => void }>) {
  return (
    <div className="map-poi-action-bar" aria-label="地点操作">
      <button className="secondary-action-button is-primary" type="button" onClick={onPlanRoute}>
        <span className="material-symbols-outlined" aria-hidden="true">
          directions
        </span>
        <span>查看路线</span>
      </button>
      <button
        className="icon-action-button"
        type="button"
        aria-label={`搜索 ${marker.label} 周边`}
        onClick={onSearchNearby}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          travel_explore
        </span>
      </button>
      <button className="icon-action-button" type="button" aria-label={`收藏 ${marker.label}`}>
        <span className="material-symbols-outlined" aria-hidden="true">
          bookmark
        </span>
      </button>
      <button className="icon-action-button" type="button" aria-label={`分享 ${marker.label}`}>
        <span className="material-symbols-outlined" aria-hidden="true">
          share
        </span>
      </button>
    </div>
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

  const filteredStops =
    direction === 'forward'
      ? sourceStops.filter((stop) => stop.oneWay !== 'down')
      : sourceStops.filter((stop) => stop.oneWay !== 'up');

  const sortedStops = [...filteredStops].sort((left, right) => left.sequence - right.sequence);
  return direction === 'forward' ? sortedStops : sortedStops.reverse();
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
    ['metro-station', 'bus-stop', 'tram-station', 'railway-station', 'coach-station'].includes(
      marker.categoryId,
    ),
  );
}

function MarkerListIcon({
  marker,
  tileBaseUrl,
}: Readonly<{
  marker: SidebarMarker;
  tileBaseUrl: string;
}>) {
  if (marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)) {
    return <img src={toMarkerIconUrl(marker.iconFileName, tileBaseUrl)} alt="" draggable={false} />;
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
      modeLabel: profile?.label ?? line.mode,
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

function findTransitLineByMarker(
  marker: TransitLineMarker,
  overview: TransitOverviewResponse | null,
): TransitOverviewLine | undefined {
  if (!overview) {
    return undefined;
  }

  const markerLineId = marker.id.replace(/^transit-line-/, '');
  return overview.lines.find((line) => line.id === markerLineId || line.name === marker.label);
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
): ProjectedMarker[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const scale = getScale(view.zoom);
  const projected = markers
    .map((marker) => {
      const [x, z] = marker.geometry.coordinates;
      const priority = getMarkerPriorityForBrowseMode(marker, browseMode);
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
        showLabel:
          marker.id === focusedMarkerId ||
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
        isSelected: true,
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

  return {
    id: `route-option-${option.id}`,
    label: option.title,
    path: traceProjection.path,
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
    path: points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${roundSvg(point.left - left)} ${roundSvg(point.top - top)}`,
      )
      .join(' '),
    viewBox: `0 0 ${roundSvg(width)} ${roundSvg(height)}`,
    left,
    top,
    width,
    height,
  };
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

function isTransparentRoadIcon(fileName: string): boolean {
  const baseName =
    fileName
      .trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? '';

  return ['road', 'roadpoint', 'highway-s1', 'toll-gate'].includes(baseName);
}

function isHighwayIconFileName(fileName: string): boolean {
  const baseName =
    fileName
      .trim()
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.[^.]+$/, '')
      .toLowerCase() ?? '';

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
  const labelWidth = Math.min(
    120,
    Math.max(42, normalizeMarkerDisplayText(marker.label).length * 12),
  );
  const labelHeight = Math.min(
    120,
    Math.max(36, normalizeMarkerDisplayText(marker.label).length * 13),
  );
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

function buildScaleBarInfo(view: MapView, size: ViewportSize): ScaleBarInfo {
  const scale = getScale(view.zoom);
  const targetPixels = clamp(size.width * 0.18, 72, 140);
  const rawDistance = targetPixels / scale;
  const distance = chooseNiceScaleDistance(rawDistance);

  return {
    distance,
    pixelWidth: Math.max(36, distance * scale),
    label: formatScaleDistance(distance),
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

function formatScaleDistance(distance: number): string {
  if (distance >= 1000) {
    return `${formatCompactNumber(distance / 1000)} km`;
  }

  return `${formatCompactNumber(distance)} 格`;
}

function formatTransitLineTime(line: TransitOverviewLine): string {
  const first = line.firstLastBus?.first;
  const last = line.firstLastBus?.last;
  if (first || last) {
    return `${first ?? '待补'}-${last ?? '待补'}`;
  }

  return line.departureTimes?.length ? `${line.departureTimes.length} 个班次` : '待补充';
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

function formatGeometryDetail(marker: CenterableMarker): string {
  if (marker.geometry.type === 'Point') {
    return '点标记';
  }

  if (marker.categoryId === 'transit-line') {
    return `线路对象，${marker.geometry.coordinates.length} 个途经坐标`;
  }

  return `线性对象端点组，${marker.geometry.coordinates.length} 个端点`;
}

function formatMarkerDetail(marker: SidebarMarker): string {
  if (marker.description) {
    return marker.description;
  }

  if (marker.geometry.type === 'Point') {
    return formatPoint(marker.geometry.coordinates);
  }

  if (marker.categoryId === 'transit-line') {
    return marker.geometry.coordinates.length > 0
      ? `线路坐标 ${marker.geometry.coordinates.length} 个`
      : '待补线路坐标';
  }

  return `道路端点 ${marker.geometry.coordinates.length} 个`;
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
