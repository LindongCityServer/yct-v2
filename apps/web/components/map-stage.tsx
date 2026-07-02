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

  useEffect(() => {
    let cancelled = false;

    async function loadMapData() {
      setLoadStatus('loading');

      try {
        const [tileResult, markerResult, categoryResult] = await Promise.all([
          fetch('/api/map/tile-providers', { cache: 'no-store' }),
          fetch('/api/map/markers', { cache: 'no-store' }),
          fetch('/api/map/poi-categories', { cache: 'no-store' }),
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
        const response = await fetch('/api/transit/overview', { cache: 'no-store' });
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
    const source = queryMode
      ? [...filteredTransitLineMarkers, ...filteredEndpointGroupMarkers, ...filteredPointMarkers]
      : [...endpointGroupMarkers, ...pointMarkers];
    const categoryFiltered =
      markerListCategoryId === 'all'
        ? source
        : source.filter((marker) => marker.categoryId === markerListCategoryId);

    if (queryMode) {
      return categoryFiltered.slice(0, 12);
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
    pointMarkers,
  ]);
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
        const response = await fetch('/api/map/unmined-regions', { cache: 'force-cache' });
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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    updateCursorWorld(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      centerX: mapView.centerX,
      centerZ: mapView.centerZ,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    updateCursorWorld(event);
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
      const response = await fetch('/api/map/poi-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: poiTitle,
          categoryId: poiCategoryId,
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
      setPoiX('');
      setPoiZ('');
      setPoiSubmitStatus('已提交，等待管理员审核。');
      setPoiSubmitDialogOpen(false);
    } finally {
      setPoiSubmitBusy(false);
    }
  };

  const hasMapOverlay =
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
              onChange={(event) => setMarkerQuery(event.currentTarget.value)}
              placeholder="搜索地点或标记"
            />
            {markerQuery ? (
              <button
                className="search-clear-button"
                type="button"
                aria-label="清空地图搜索"
                onClick={() => setMarkerQuery('')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            ) : null}
          </div>
          {focusedMarker && isCenterableMarker(focusedMarker) ? null : sidebarMarkers.length ? (
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
                <span>{markerQuery.trim() ? '搜索结果' : '地图标记'}</span>
                <span className="muted">{sidebarMarkers.length} 个</span>
              </button>
              {markerListExpanded ? (
                <>
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
                    {sidebarMarkers.map((marker) => {
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
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <p className="muted">
              {loadStatus === 'loading' ? '正在读取地图标记' : '暂无匹配标记'}
            </p>
          )}
        </div>
        {focusedMarker && isCenterableMarker(focusedMarker) ? (
          <aside className="map-poi-detail-panel" aria-labelledby="map-poi-detail-title">
            <div className="map-poi-detail-header">
              <MarkerListIcon marker={focusedMarker} tileBaseUrl={tileBaseUrl} />
              <div>
                <h2 id="map-poi-detail-title">{formatMarkerDisplayName(focusedMarker.label)}</h2>
                <span>{focusedMarkerCategoryName ?? focusedMarker.categoryId ?? '地图对象'}</span>
              </div>
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
                  <PoiActionBar marker={focusedMarker} />
                </>
              ) : null}
              {!isLinearDetailMarker(focusedMarker) && poiDetailTab === 'facilities' ? (
                <p>{focusedMarker.description ?? '暂无设施数据'}</p>
              ) : null}
            </div>
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
}: Readonly<{ trace: ProjectedRoadTrace; kind: 'road' | 'transit'; title: string }>) {
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

function PoiActionBar({ marker }: Readonly<{ marker: CenterableMarker }>) {
  return (
    <div className="map-poi-action-bar" aria-label="地点操作">
      <button className="secondary-action-button is-primary" type="button">
        <span className="material-symbols-outlined" aria-hidden="true">
          directions
        </span>
        <span>查看路线</span>
      </button>
      <button className="icon-action-button" type="button" aria-label={`搜索 ${marker.label} 周边`}>
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

  if (browseMode === 'road-network' && lowPriorityTrafficCategoryIds.has(categoryId)) {
    return 4;
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
    const labelAnchor = getLinearMarkerLabelAnchor(marker);
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

  return getPolylineMidpoint(orderedCoordinates);
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
  const center = getMarkerCenter(marker);
  if (!center) {
    return Number.POSITIVE_INFINITY;
  }

  return squaredDistance(center, [view.centerX, view.centerZ]);
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
