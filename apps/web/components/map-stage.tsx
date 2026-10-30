'use client';

import { TransitOperatorName } from './transit-operator-name';

import type {
  ApiListResponse,
  ApiMeta,
  AdministrativeArea,
  CompactMapRouteShareState,
  LocaleCode,
  MapGeometry,
  MapMarkerSnapshot,
  MapNetworkDirection,
  MapSpatialProfile,
  MapTravelMode,
  LocalizedLabelMap,
  OperationsFeedItem,
  PoiCategory,
  PoiFacilitySnapshot,
  TileProviderDescriptor,
  TransitFareQuote,
  TransitLineRouteMode,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
  TransitLineStopLocationRef,
  TransitStationDetailSnapshot,
  TransitStationTransferSnapshot,
} from '@yct/contracts';
import { ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM } from '@yct/contracts';
import { quoteTaxiFare, quoteTransitRouteFare } from '@yct/domain';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { startTransition, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getFontEmbedCSS, toBlob } from 'html-to-image';
import LZString from 'lz-string';
import QRCode from 'qrcode';
import { appPath } from '../lib/app-paths';
import { buildExploreCandidates, pickExploreCandidate } from '../lib/random-explore';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishAssistantPageContext } from '../lib/client-assistant-page-context';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import { publishGlobalSearchRequested } from '../lib/client-global-search-events';
import { publishToastRequested } from '../lib/client-toast-events';
import { readMapFavoriteMarkerIds, writeMapFavoriteMarkerIds } from '../lib/client-map-favorites';
import {
  publishMapNearbySearchScopeChanged,
  publishMapRoutePanelVisibilityChanged,
  publishMapShortcutContextChanged,
  publishMapSidebarOverlayChanged,
  publishMapTileProviderSelected,
  subscribeMapNearbySearchScopeChanged,
  subscribeMapNavigationLayoutChanged,
  subscribeMapRouteShortcutRequested,
  subscribeMapTileProviderSelected,
  subscribeMapViewShortcutRequested,
  subscribeMapZoomRequested,
  type MapNearbySearchScope,
} from '../lib/client-map-ui-events';
import {
  readSelectedMapTileProviderId,
  writeSelectedMapTileProviderId,
} from '../lib/client-map-settings';
import { useI18n, type CommonMessageKey } from '../lib/client-i18n';
import { formatFareTextWithoutCurrencyUnit } from '../lib/fare-display';
import {
  findCoordinateChainProjection,
  getCoordinateChainDistance,
  getCoordinateDistance,
  squaredDistance,
  type CoordinateChainProjection,
} from '../lib/map-spatial';
import type { MetroFacilityIconAssetName } from '../lib/metro-wayfinding';
import {
  collectMapRoadConnectionProjections,
  getMapRoadMarkerKind as getRoadMarkerKind,
  orderMapRoadCoordinates as orderRoadTracePoints,
  shouldUseVerticalMapRoadLabel,
} from '../lib/map-road-geometry';
import {
  isTransitLineDirectionIncluded,
  type TransitLineTravelDirection,
} from '../lib/transit-line-direction';
import {
  buildTransitRealtimeSnapshot,
  buildTransitSchedules,
  buildTransitStationBoard,
  formatTransitClockMinutes,
  getBeijingClockMinutes,
  type TransitRealtimeSnapshot,
  type TransitRealtimeVehicle,
  type TransitStationBoardEntry,
} from '../lib/transit-realtime';
import { resolveDirectionalDepartureTimes } from '../lib/transit-departure-editor';
import { createTripReminder } from '../lib/client-trip-reminders';
import { requestConfirmation } from '../lib/client-dialog-events';
import { resolveLegacySegmentMinutes } from '../lib/transit-segment-minutes';
import { getTransitStopLocationMarkerIdsForDirection } from '../lib/transit-stop-location';
import {
  buildMapMarkerSearchText,
  filterMapMarkers,
  getMapMarkerSearchMatchPriority,
} from '../lib/map-marker-search';
import { getTransitStationNameMatchKeys as getStationNameMatchKeys } from '../lib/transit-station-detail-match';
import { isTransitPoiMarkerCompatibleWithStation } from '../lib/transit-station-mode';
import {
  buildMapPlaceRelationIndex,
  dedupeEquivalentMapPlaceMarkers,
  getEquivalentMapPlaceMarkerIds,
  resolveCanonicalMapPlaceMarker,
  type MapPlaceRelationIndex,
} from '../lib/map-place-relations';
import { PoiFacilityEditor } from './poi-facility-editor';
import { AdminEditLink } from './admin-edit-link';
import { BrandSymbol, BrandWordmark } from './brand-logo';
import { MaterialSymbol } from './material-symbol';
import { MapLayerToggle } from './map-layer-toggle';
import { ProgressiveImage } from './progressive-image';
import { DualRangeInput } from './range-input';
import { SegmentedControl } from './segmented-control';
import { useMobileActionRail, type MobileActionRailItem } from './mobile-action-rail';
import { RouteModeToggleList } from './route-mode-toggle-list';
import {
  buildMarkerRoadAccessIndex,
  buildSecondaryPoiIndex,
  buildSecondaryPoiParentIndex,
  buildRoadRouteGraph,
  buildRoutePlanCalculationKey,
  buildRoutePlanOptions,
  buildTransitSegmentRoute,
  buildTransitStationMarkerIndex,
  clampNumber,
  clockToServiceDayMinutes,
  dedupeConsecutiveCoordinates,
  dedupeValues,
  estimateRouteMinutes,
  estimateVehicleRouteMinutes,
  findRoadAccessCandidates,
  findTransitStationMarker,
  formatRoutePlanDistance,
  formatRoutePlanFare,
  formatRoutePlanMinutes,
  getConfiguredTransitSegment,
  getRouteOptionBadges,
  getRouteOptionLimit,
  getRouteStepMarkerText,
  getRouteTransportModeLabel,
  getTransitSpeedFactor,
  getTurnInstructionText,
  isPlayerLocationMarkerId,
  isRouteAccessSecondaryPoi,
  matchesTransitMarkerMode,
  normalizeServiceDayMinutes,
  selectRoutePlanOptions,
  shouldUseRoadGraphForTransitMode,
  updateRoutePlanDraftPlayerEndpoints,
} from '../lib/map-route-plan';
import {
  routeTransportModeOptions,
  type CenterableMarker,
  type EnabledRouteTransportModes,
  type EndpointGroupMarker,
  type LinearMarkerGeometry,
  type LocalizedMapMarker,
  type PointMarker,
  type RegionGeometry,
  type RoadAccessCandidate,
  type RoadRouteGraph,
  type RouteEndpointKind,
  type RoutePlanDraft,
  type RoutePlanOption,
  type RoutePlanRoadLabel,
  type RoutePlanSortMode,
  type RoutePlanStep,
  type RoutePlanStepDetail,
  type RoutePlanTimeContext,
  type RoutePlanTimeMode,
  type RoutePlanTraceSegment,
  type RouteTransportMode,
  type RouteTransportModeOption,
  type RouteTraversalBarrier,
  type SecondaryPoiLink,
  type SecondaryPoiParentLink,
  type TransitLineStopForMap,
  type TransitModeProfileForMap,
  type TransitOverviewLine,
  type TransitRouteStop,
  type TransitSegmentRouteResolution,
} from '../lib/map-route-plan';

interface MarkerResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  iconBaseUrl?: string;
}

interface PlayerLocationResponse {
  meta: ApiMeta;
  snapshot: MapMarkerSnapshot;
  currentAccount?: {
    serverAccountName: string;
    hasRecordedLocation: boolean;
  };
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

interface MapVisibleRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
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
  markerId?: string;
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
  dynamicSymbol?: NonNullable<MapMarkerSnapshot['markers'][number]['spatial']>['dynamicSymbol'];
  symbolIcon?: string;
  showLabel: boolean;
  /** POI 显式选择「不使用图标」时为 true：不绘制图标与符号，名称标签居中。 */
  hideIcon: boolean;
  priority: number;
  roadKind?: RoadMarkerKind;
  playerPresence?: 'online' | 'offline';
  isPlayer?: boolean;
  isCurrentAccount?: boolean;
  transitOperationStatus?: 'operating' | 'planned' | 'closed';
}

interface ProjectedLinearPoi {
  id: string;
  label: string;
  left: number;
  top: number;
  endpointCount: number;
  accentColor?: string;
  iconUrl?: string;
  dynamicSymbol?: NonNullable<MapMarkerSnapshot['markers'][number]['spatial']>['dynamicSymbol'];
  roadKind?: RoadMarkerKind;
  showCenter: boolean;
  showTextLabel: boolean;
  isVerticalLabel: boolean;
  /** POI 显式选择「不使用图标」时为 true：名称标签居中。 */
  hideIcon: boolean;
  symbolIcon?: string;
  endpoints: Array<{
    id: string;
    left: number;
    top: number;
  }>;
}

interface ProjectedShapePoi {
  accentColor?: string;
  centerLeft: number;
  centerTop: number;
  id: string;
  isArea: boolean;
  isRegionMarker: boolean;
  labelMode: 'label' | 'representative';
  label: string;
  path: string;
  basePath?: string;
  fillColor?: string;
  fillOpacity?: number;
  priority: number;
  showLabel: boolean;
  strokeColor?: string;
  strokeOpacity?: number;
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
  routeRoadSegments?: ProjectedRouteRoadSegment[];
  segments?: ProjectedRouteTraceSegment[];
  transitSegments?: ProjectedTransitTraceSegment[];
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

interface ProjectedNearbyRangeTrace {
  endLeft: number;
  endTop: number;
  height: number;
  left: number;
  path: string;
  startLeft: number;
  startTop: number;
  top: number;
  viewBox: string;
  width: number;
}

interface ProjectedTransitTraceSegment {
  operationStatus: 'operating' | 'planned';
  path: string;
}

interface ProjectedRouteRoadSegment extends ProjectedRouteTraceSegment {
  id: string;
  label: string;
}

interface ProjectedRouteRoadLabel {
  color?: string;
  id: string;
  isVerticalLabel: boolean;
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
  stationDetails?: TransitStationDetailSnapshot[];
}

interface TransitStationDetailsResponse {
  items: TransitStationDetailSnapshot[];
}

interface MapSpatialProfileResponse {
  profile?: MapSpatialProfile;
}

interface AdministrativeAreaResponse {
  items?: AdministrativeArea[];
}

interface ProjectedAdministrativeArea {
  area: AdministrativeArea;
  centerLeft: number;
  centerTop: number;
  fillColor?: string;
  path: string;
  showLabel: boolean;
  strokeColor?: string;
}

interface TransitLineConnection {
  id: string;
  mode: string;
  modeLabel: string;
  name: string;
  color?: string;
  sortOrder: number;
}

interface TransitStationConnectionIndex {
  /** 按站名聚合的线路，作为没有明确停靠 POI 时的默认回退。 */
  byName: Map<string, TransitLineConnection[]>;
  /** 线路实际使用的 POI（显式停靠点或按交通方式解析出的默认点位）。 */
  byMarkerId: Map<string, TransitLineConnection[]>;
}

interface RoadRoutingSnapshot {
  graph?: RoadRouteGraph;
  markerRoadAccessIndex: Map<string, RoadAccessCandidate[]>;
}

type RoadRoutingStatus = 'loading' | 'ready';

type MapShareMode = 'link' | 'text' | 'image';
type MapShareCopyKind = 'link' | 'text' | 'coordinate' | 'teleport';

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
  coordinateText?: string;
  eyebrow: string;
  icon: string;
  meta: string[];
  steps: MapShareStep[];
  text: string;
  title: string;
  teleportCommand?: string;
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

interface SecondaryPoiGroup {
  id: string;
  label: string;
  items: SecondaryPoiLink[];
}

interface NearbySearchCenter {
  markerId: string;
  label: string;
  coordinates: [number, number];
  /** 线性 POI 周边搜索时保存有序折线，用于计算沿线里程。 */
  chain?: Array<[number, number]>;
  kind: 'point' | 'linear';
  length?: number;
}

interface SharedRoutePlanState {
  draft: RoutePlanDraft;
  enabledModes: EnabledRouteTransportModes;
  key: string;
  selectedOptionId?: string;
}

type CompactRoutePlanShareState = CompactMapRouteShareState;

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

/** 区域 POI 的半透明填充色：按分类语义取色，未命中的分类沿用原强调色。 */
const mapAreaFillColorByCategory: Readonly<Record<string, string>> = {
  park: '#3f8f5b',
  scenery: '#2f8c7c',
  water: '#3b7fc4',
  museum: '#8a63b6',
  education: '#6b74c9',
  medical: '#c75c5c',
  sports: '#d1812f',
  commerce: '#c29a2c',
  dining: '#c4763f',
  residence: '#7c8ca6',
  industry: '#8b7863',
  'public-service': '#3e9ba0',
  facility: '#8892a3',
  parking: '#5e7fa8',
  airport: '#6a7b92',
  'coach-station': '#647e9e',
  'metro-station': '#647e9e',
  'railway-station': '#647e9e',
  'ferry-port': '#647e9e',
  'tram-station': '#647e9e',
};

function getMapAreaFillColor(categoryId: string | undefined): string | undefined {
  return categoryId ? mapAreaFillColorByCategory[categoryId] : undefined;
}

const defaultRouteTransportModes: EnabledRouteTransportModes = {
  walk: true,
  taxi: false,
  bus: true,
  metro: true,
  tram: true,
  coach: false,
  ferry: false,
  railway: false,
};

const favoriteMarkerCategoryId = 'favorites';
type Translate = ReturnType<typeof useI18n>['t'];

const mapShareModes: MapShareMode[] = ['image'];

const mapShareCopyKinds: MapShareCopyKind[] = ['link', 'text', 'coordinate', 'teleport'];

const mapShareModeIcons: Record<MapShareMode, string> = {
  image: 'download',
  link: 'link',
  text: 'article',
};

const mapShareModeLabelKeys: Record<MapShareMode, CommonMessageKey> = {
  image: 'map.share.image',
  link: 'map.share.link',
  text: 'map.share.text',
};

const mapShareCopyLabelKeys: Record<MapShareCopyKind, CommonMessageKey> = {
  coordinate: 'map.share.coordinate',
  link: 'map.share.link',
  teleport: 'map.share.teleport',
  text: 'map.share.text',
};

const mapShareCopySuccessKeys: Record<MapShareCopyKind, CommonMessageKey> = {
  coordinate: 'map.share.coordinateCopied',
  link: 'map.share.linkCopied',
  teleport: 'map.share.teleportCopied',
  text: 'map.share.textCopied',
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
  player: '玩家',
  'public-service': '公共服务',
  railway: '铁路',
  'railway-station': '铁路车站',
  residence: '居住区',
  road: '道路',
  scenery: '景点',
  sports: '体育',
  'tram-station': '有轨电车站',
  'transit-line': '线路',
  water: '水域',
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
  water: 'map.categoryName.water',
};

const routeWalkTraceColor = 'var(--yct-color-primary)';
const routePlanRecalculateDelayMs = 260;
/** 线性 POI 沿线搜索时，标记到线路中心线的最大垂距（地图格）。 */
const nearbyLinearCorridorDistance = 300;
const nearbyLinearResultLimit = 80;

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

function getLocalizedTileProviderName(provider: TileProviderDescriptor, t: Translate): string {
  const messageKey = tileProviderNameKeys[provider.id];
  return messageKey ? t(messageKey) : provider.name;
}

function getLocalizedTileProviderNote(
  provider: TileProviderDescriptor,
  t: Translate,
): string | undefined {
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
const mapDefaults = {
  minZoom: -7,
  maxZoom: 3,
  defaultZoom: 0,
  centerX: -945,
  centerZ: -876,
};
/** 在线路详情中选中站点时，地图至少放大到该层级。 */
const transitStationFocusZoom = 3;
// 规划路线取景：留出标记点文字标签的屏幕空间，并使用精确缩放让路线正好填满安全框。
const routePlanFitPadding = 64;
// 标记点标签位于图标右侧，按 96px 的保守宽度换算成世界坐标参与取景。
const routePlanLabelOverhang = 96;
// 路书折叠后等动画与尺寸观察器稳定，再执行重新取景。
const routeCollapsedFitDelay = 360;
// 地图可视范围变化（拖拽/缩放/取景/尺寸变化）停止后，再执行标记碰撞计算。
const mapViewSettleDelayMs = 160;
// 与 --yct-motion-duration-state 保持一致：淡出动画播完后移除节点。
const mapOverlayFadeDurationMs = 160;

/**
 * 为地图覆盖物提供淡出能力：被筛掉的项再保留一个动效时长，等 CSS 淡出动画播完再从 DOM 移除；
 * 重新出现的项立即回到列表。动态效果关闭时动效时长为 0，视觉上等同瞬时切换。
 */
function useFadeOutOverlayItems<T extends { id: string }>(
  items: T[],
  enabled: boolean,
): Array<{ item: T; leaving: boolean }> {
  const [leavingItems, setLeavingItems] = useState<T[]>([]);
  const previousItemsRef = useRef<T[]>(items);

  useEffect(() => {
    const previousItems = previousItemsRef.current;
    previousItemsRef.current = items;

    if (!enabled) {
      setLeavingItems((current) => (current.length > 0 ? [] : current));
      return;
    }

    const currentIds = new Set(items.map((item) => item.id));
    const removedItems = previousItems.filter((item) => !currentIds.has(item.id));
    setLeavingItems((current) => {
      const next = new Map(
        current.filter((item) => !currentIds.has(item.id)).map((item) => [item.id, item]),
      );
      for (const item of removedItems) {
        if (!next.has(item.id)) {
          next.set(item.id, item);
        }
      }

      const nextItems = [...next.values()];
      if (
        nextItems.length === current.length &&
        nextItems.every((item, index) => item === current[index])
      ) {
        return current;
      }
      return nextItems;
    });
  }, [enabled, items]);

  useEffect(() => {
    if (leavingItems.length === 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => setLeavingItems([]), mapOverlayFadeDurationMs);
    return () => window.clearTimeout(timer);
  }, [leavingItems]);

  const currentIds = new Set(items.map((item) => item.id));
  return [
    ...items.map((item) => ({ item, leaving: false })),
    ...leavingItems
      .filter((item) => !currentIds.has(item.id))
      .map((item) => ({ item, leaving: true })),
  ];
}

type PoiDetailTab = 'summary' | 'facilities' | 'operations';

export function MapStage() {
  const { locale, t } = useI18n();
  const mobileActionRail = useMobileActionRail();
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activePointersRef = useRef<Map<number, ActivePointer>>(new Map());
  const pinchRef = useRef<PinchState | null>(null);
  const tapRef = useRef<TapState | null>(null);
  const suppressedMarkerClickRef = useRef<string | null>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [markerQuery, setMarkerQuery] = useState('');
  const [tileResponse, setTileResponse] = useState<ApiListResponse<TileProviderDescriptor> | null>(
    null,
  );
  const [selectedTileProviderId, setSelectedTileProviderId] = useState('');
  const [markerResponse, setMarkerResponse] = useState<MarkerResponse | null>(null);
  const [playerLocationResponse, setPlayerLocationResponse] =
    useState<PlayerLocationResponse | null>(null);
  const [transitOverview, setTransitOverview] = useState<TransitOverviewResponse | null>(null);
  const [mapSpatialProfile, setMapSpatialProfile] = useState<MapSpatialProfile | null>(null);
  const [administrativeAreas, setAdministrativeAreas] = useState<AdministrativeArea[]>([]);
  const [transitStationDetails, setTransitStationDetails] = useState<
    TransitStationDetailSnapshot[]
  >([]);
  const [categoryResponse, setCategoryResponse] = useState<ApiListResponse<PoiCategory> | null>(
    null,
  );
  const [regionResponse, setRegionResponse] = useState<UnminedRegionResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [transitLoadStatus, setTransitLoadStatus] = useState<LoadStatus>('loading');
  const [exploreReload, setExploreReload] = useState(0);
  const [mapCompletedReload, setMapCompletedReload] = useState(-1);
  const [transitCompletedReload, setTransitCompletedReload] = useState(-1);
  const luckyRequest = searchParams.get('lucky');
  // 「手气不错」从点击到落点完成（含地图/线路数据加载）期间的等待态，用于图标加载动画。
  const [explorePending, setExplorePending] = useState(false);
  const handledLuckyRef = useRef<string | null>(null);
  const luckyRequiredReloadRef = useRef(0);
  const lastLuckyMarkerRef = useRef<string | undefined>(undefined);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [mapVisibleRect, setMapVisibleRect] = useState<MapVisibleRect>({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });
  const [mapNavigationExpanded, setMapNavigationExpanded] = useState(true);
  const [mapView, setMapView] = useState<MapView>({
    centerX: mapDefaults.centerX,
    centerZ: mapDefaults.centerZ,
    zoom: mapDefaults.defaultZoom,
  });
  const mapViewRef = useRef<MapView>(mapView);
  // 可视范围变化过程中沿用上一次的筛选结果并继续做碰撞检测，停稳后才基于全量标记重算。
  const [mapViewSettled, setMapViewSettled] = useState(true);
  const lastOverlayVisibilityRef = useRef<MapOverlayVisibilitySnapshot | null>(null);
  // 视图变化期间被碰撞检测隐藏的标记：隐藏后保持到本次变化结束，避免缩放时反复闪现。
  const mapViewCollisionHiddenIdsRef = useRef<Set<string>>(new Set());
  const hasMeasuredViewportRef = useRef(false);
  const viewportSizeRef = useRef<ViewportSize>(viewportSize);
  const mapVisibleLayoutRef = useRef<{
    rect: MapVisibleRect;
    size: ViewportSize;
  } | null>(null);
  const mapVisibleRectRef = useRef<MapVisibleRect>(mapVisibleRect);
  const appliedDefaultCurrentAccountLocationIdRef = useRef<string | null>(null);
  const routeFitStateRef = useRef<{ rectKey: string; routeKey: string } | null>(null);
  const routeManuallyZoomedRef = useRef(false);
  const [poiTitle, setPoiTitle] = useState('');
  const [poiCategoryId, setPoiCategoryId] = useState('');
  const [poiDescription, setPoiDescription] = useState('');
  const [poiHref, setPoiHref] = useState('');
  const [poiImageUrl, setPoiImageUrl] = useState('');
  const [poiImageFiles, setPoiImageFiles] = useState<File[]>([]);
  const [poiImageFileInputKey, setPoiImageFileInputKey] = useState(0);
  const [poiX, setPoiX] = useState('');
  const [poiZ, setPoiZ] = useState('');
  const [poiOpeningHours, setPoiOpeningHours] = useState('');
  const [poiAddress, setPoiAddress] = useState('');
  const [poiFloorLabel, setPoiFloorLabel] = useState('');
  const [poiAddressRoadMarkerId, setPoiAddressRoadMarkerId] = useState('');
  const [poiFacilities, setPoiFacilities] = useState<PoiFacilitySnapshot[]>([]);
  const [poiSubmitStatus, setPoiSubmitStatus] = useState('');
  const [poiSubmitBusy, setPoiSubmitBusy] = useState(false);
  const [poiSubmitDialogOpen, setPoiSubmitDialogOpen] = useState(false);
  // 提交按钮位于 form 之外（弹窗直接子级操作栏，保证吸底几何正确），用 form 属性关联。
  const poiSubmitFormId = useId();
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);
  const [selectedAdministrativeAreaId, setSelectedAdministrativeAreaId] = useState<string | null>(
    null,
  );
  const [transitLineDirectionSelection, setTransitLineDirectionSelection] = useState<{
    direction: TransitLineTravelDirection;
    lineId: string;
  } | null>(null);
  const [poiDetailTab, setPoiDetailTab] = useState<PoiDetailTab>('summary');
  const [focusedPoiOperations, setFocusedPoiOperations] = useState<OperationsFeedItem[]>([]);
  const [focusedPoiOperationsLoading, setFocusedPoiOperationsLoading] = useState(false);
  const [secondaryPoiCategoryFilter, setSecondaryPoiCategoryFilter] = useState('all');
  const [secondaryPoiFloorFilter, setSecondaryPoiFloorFilter] = useState('all');
  const [secondaryPoiKeyword, setSecondaryPoiKeyword] = useState('');
  const [secondaryPoiCategoryExpanded, setSecondaryPoiCategoryExpanded] = useState(false);
  const [secondaryPoiFloorExpanded, setSecondaryPoiFloorExpanded] = useState(false);
  const [markerListCategoryId, setMarkerListCategoryId] = useState('all');
  const [markerCategoryExpanded, setMarkerCategoryExpanded] = useState(false);
  const [browseMode, setBrowseMode] = useState<MapBrowseMode>('satellite');
  const [markersVisible, setMarkersVisible] = useState(true);
  const [playersVisible, setPlayersVisible] = useState(true);
  const [linearFeaturesVisible, setLinearFeaturesVisible] = useState(true);
  const [perspective2_5dVisible, setPerspective2_5dVisible] = useState(false);
  const [markerListExpanded, setMarkerListExpanded] = useState(true);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; z: number } | null>(null);
  const [routePlanDraft, setRoutePlanDraft] = useState<RoutePlanDraft | null>(null);
  const [routePlanCollapsed, setRoutePlanCollapsed] = useState(false);
  const [routeTransportModes, setRouteTransportModes] = useState<EnabledRouteTransportModes>(
    defaultRouteTransportModes,
  );
  const [routePlanSortMode, setRoutePlanSortMode] = useState<RoutePlanSortMode>('time');
  const [routePlanTimeMode, setRoutePlanTimeMode] = useState<RoutePlanTimeMode>('departure');
  /** 空字符串表示自动：出发模式取当前时刻，到达模式取一小时后。 */
  const [routePlanTimeValue, setRoutePlanTimeValue] = useState('');
  const [routePlanRequirementDialogOpen, setRoutePlanRequirementDialogOpen] = useState(false);
  useEffect(() => {
    // 首次进入：出发时间默认填当前时刻。
    setRoutePlanTimeValue((current) =>
      current ? current : getDefaultRoutePlanTimeValue('departure'),
    );
  }, []);
  const [routePlanOptions, setRoutePlanOptions] = useState<RoutePlanOption[]>([]);
  const [routePlanOptionsKey, setRoutePlanOptionsKey] = useState<string | null>(null);
  const [routePlanStatus, setRoutePlanStatus] = useState<RoutePlanStatus>('idle');
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string | null>(null);
  const [editingRouteEndpoint, setEditingRouteEndpoint] = useState<RouteEndpointKind | null>(null);
  const [routeEndpointQuery, setRouteEndpointQuery] = useState('');
  const [shareTarget, setShareTarget] = useState<MapShareTarget | null>(null);
  const [roadRoutingStatus, setRoadRoutingStatus] = useState<RoadRoutingStatus>('ready');
  const [roadRoutingSnapshot, setRoadRoutingSnapshot] = useState<RoadRoutingSnapshot>(() => ({
    markerRoadAccessIndex: new Map(),
  }));
  const [poiCoordinatePickMode, setPoiCoordinatePickMode] = useState(false);
  const [nearbySearchCenter, setNearbySearchCenter] = useState<NearbySearchCenter | null>(null);
  const [nearbySearchScope, setNearbySearchScope] = useState<MapNearbySearchScope>('outside');
  const [nearbyLinearRange, setNearbyLinearRange] = useState<[number, number]>([0, 0]);
  const [poiDetailCollapsed, setPoiDetailCollapsed] = useState(false);
  const [lineInfoDialogOpen, setLineInfoDialogOpen] = useState(false);
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
    setLineInfoDialogOpen(false);
  }, [focusedMarkerId]);
  useEffect(() => {
    mapViewRef.current = mapView;
  }, [mapView]);

  // 地图可视范围变化期间沿用上一次停稳时的筛选结果（不新增标记），并在这批标记内继续做碰撞检测；
  // 变化停止（拖拽松手、缩放结束、尺寸稳定）后再基于全量标记重新决定最终显示。
  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return undefined;
    }
    if (!hasMeasuredViewportRef.current) {
      hasMeasuredViewportRef.current = true;
      return undefined;
    }

    setMapViewSettled(false);
    const timer = window.setTimeout(() => {
      // 视图停稳后重新全量计算，本次变化期间累积的隐藏记录作废。
      mapViewCollisionHiddenIdsRef.current.clear();
      setMapViewSettled(true);
    }, mapViewSettleDelayMs);
    return () => window.clearTimeout(timer);
  }, [mapView, viewportSize]);

  // 移动端默认收起结果列表：展开态会切换为覆盖全屏的浮层布局，首屏保持地图与底部导航可见。
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      setMarkerListExpanded(false);
    }
  }, []);

  useEffect(() => {
    publishMapRoutePanelVisibilityChanged({ visible: Boolean(routePlanDraft) });
  }, [routePlanDraft]);

  useEffect(
    () => () => {
      publishMapRoutePanelVisibilityChanged({ visible: false });
      publishMapShortcutContextChanged({
        canPlanFocusedMarker: false,
        canSwapRouteEndpoints: false,
      });
    },
    [],
  );

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
      const safeRect = normalizeMapVisibleRect(mapVisibleRectRef.current, currentSize);
      const pointerX = clamp(event.clientX - rect.left, safeRect.left, safeRect.right);
      const pointerY = clamp(event.clientY - rect.top, safeRect.top, safeRect.bottom);
      routeManuallyZoomedRef.current = true;
      setMapView(
        zoomMapViewAroundScreenPoint(currentView, nextZoom, currentSize, pointerX, pointerY),
      );
    };

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  useEffect(
    () => subscribeMapNavigationLayoutChanged(({ expanded }) => setMapNavigationExpanded(expanded)),
    [],
  );

  useEffect(
    () =>
      subscribeMapNearbySearchScopeChanged(({ scope }) => {
        setNearbySearchScope(scope);
      }),
    [],
  );

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
    setPoiDetailTab('summary');
    setPoiActionStatus('');
    setSecondaryPoiCategoryFilter('all');
    setSecondaryPoiFloorFilter('all');
    setSecondaryPoiKeyword('');
    setSecondaryPoiCategoryExpanded(false);
    setSecondaryPoiFloorExpanded(false);
  }, [focusedMarkerId]);

  useEffect(() => {
    if (!focusedMarkerId) {
      setFocusedPoiOperations([]);
      setFocusedPoiOperationsLoading(false);
      return;
    }

    let cancelled = false;
    setFocusedPoiOperations([]);
    setFocusedPoiOperationsLoading(true);
    void fetch(appPath(`/api/operations/poi-messages/${encodeURIComponent(focusedMarkerId)}`), {
      cache: 'no-store',
    })
      .then((response) => response.json() as Promise<ApiListResponse<OperationsFeedItem>>)
      .then((data) => {
        if (!cancelled) {
          setFocusedPoiOperations(data.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFocusedPoiOperations([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFocusedPoiOperationsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    async function loadMapData() {
      setLoadStatus('loading');

      try {
        const [tileResult, markerResult, categoryResult, spatialProfileResult, areaResult] =
          await Promise.all([
            fetch(appPath('/api/map/tile-providers'), {
              cache: 'no-store',
              signal: controller.signal,
            }),
            fetch(appPath('/api/map/markers'), { cache: 'no-store', signal: controller.signal }),
            fetch(appPath('/api/map/poi-categories'), {
              cache: 'no-store',
              signal: controller.signal,
            }),
            fetch(appPath('/api/map/spatial-profile'), {
              cache: 'no-store',
              signal: controller.signal,
            }).catch(() => null),
            fetch(appPath('/api/map/administrative-areas'), {
              cache: 'no-store',
              signal: controller.signal,
            }).catch(() => null),
          ]);

        const tileData = (await tileResult.json()) as ApiListResponse<TileProviderDescriptor>;
        const markerData = (await markerResult.json()) as MarkerResponse;
        const categoryData = (await categoryResult.json()) as ApiListResponse<PoiCategory>;
        const spatialProfileData = spatialProfileResult
          ? ((await spatialProfileResult.json().catch(() => ({}))) as MapSpatialProfileResponse)
          : {};
        const areaData = areaResult
          ? ((await areaResult.json().catch(() => ({}))) as AdministrativeAreaResponse)
          : {};

        if (!cancelled) {
          setTileResponse(tileData);
          setMarkerResponse(
            markerResult.ok && Array.isArray(markerData.snapshot?.markers) ? markerData : null,
          );
          setCategoryResponse(categoryData);
          setMapSpatialProfile(spatialProfileData.profile ?? null);
          setAdministrativeAreas(areaData.items ?? []);
          setLoadStatus(
            tileResult.ok &&
              markerResult.ok &&
              categoryResult.ok &&
              Array.isArray(tileData.items) &&
              Array.isArray(markerData.snapshot?.markers) &&
              Array.isArray(categoryData.items)
              ? 'ready'
              : 'unavailable',
          );
        }
      } catch {
        if (!cancelled) {
          setLoadStatus('unavailable');
        }
      }
    }

    void loadMapData().finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setMapCompletedReload(exploreReload);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [exploreReload]);

  useEffect(
    () =>
      subscribeMapTileProviderSelected(({ providerId }) => {
        if (!tileResponse?.items.some((provider) => provider.id === providerId)) {
          return;
        }
        setSelectedTileProviderId(providerId);
        writeSelectedMapTileProviderId(providerId);
      }),
    [tileResponse],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function loadPlayerLocations() {
      try {
        const response = await fetch(appPath('/api/map/player-locations'), { cache: 'no-store' });
        const data = (await response.json()) as PlayerLocationResponse;
        if (!cancelled && data.snapshot) {
          setPlayerLocationResponse(data);
        }
      } catch {
        // 短暂请求失败时保留上一帧位置，下一轮继续刷新。
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(loadPlayerLocations, 10_000);
        }
      }
    }

    void loadPlayerLocations();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    async function loadTransitOverview() {
      setTransitLoadStatus('loading');
      try {
        const [overviewResponse, stationDetailsResponse] = await Promise.all([
          fetch(appPath('/api/transit/overview'), { cache: 'no-store', signal: controller.signal }),
          fetch(appPath('/api/transit/station-details'), {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);
        const [overviewData, stationDetailsData] = await Promise.all([
          overviewResponse.json() as Promise<TransitOverviewResponse>,
          stationDetailsResponse.json() as Promise<TransitStationDetailsResponse>,
        ]);
        if (!cancelled) {
          const usable = overviewResponse.ok && Array.isArray(overviewData.lines);
          setTransitOverview(usable ? overviewData : null);
          setTransitLoadStatus(usable ? 'ready' : 'unavailable');
        }
        if (!cancelled && stationDetailsResponse.ok) {
          setTransitStationDetails(stationDetailsData.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setTransitOverview(null);
          setTransitLoadStatus('unavailable');
          setTransitStationDetails([]);
        }
      }
    }

    void loadTransitOverview().finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setTransitCompletedReload(exploreReload);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [exploreReload]);

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

  const sidebarBlocksMapViewport = Boolean(routePlanDraft || focusedMarkerId || markerListExpanded);
  useEffect(() => {
    const viewport = viewportRef.current;
    const sidebar = sidebarRef.current;
    if (!viewport || !sidebar) {
      return undefined;
    }

    const updateMapVisibleRect = () => {
      const viewportBounds = viewport.getBoundingClientRect();
      const sidebarBounds = sidebar.getBoundingClientRect();
      const insetValue = Number.parseFloat(
        window.getComputedStyle(viewport).getPropertyValue('--yct-map-control-inset'),
      );
      const inset = Number.isFinite(insetValue) ? insetValue : 16;
      const isMobile = window.matchMedia('(max-width: 720px)').matches;
      const nextRect = normalizeMapVisibleRect(
        {
          left: isMobile
            ? inset
            : sidebarBlocksMapViewport
              ? sidebarBounds.right - viewportBounds.left + inset
              : Math.max(inset, sidebarBounds.left - viewportBounds.left),
          top: inset,
          right: viewportBounds.width - inset,
          bottom: isMobile
            ? sidebarBounds.top - viewportBounds.top - inset
            : viewportBounds.height - inset,
        },
        { width: viewportBounds.width, height: viewportBounds.height },
      );
      setMapVisibleRect((current) =>
        mapVisibleRectsEqual(current, nextRect) ? current : nextRect,
      );
    };

    const resizeObserver = new ResizeObserver(updateMapVisibleRect);
    resizeObserver.observe(viewport);
    resizeObserver.observe(sidebar);
    window.addEventListener('resize', updateMapVisibleRect);
    const animationFrame = window.requestAnimationFrame(updateMapVisibleRect);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateMapVisibleRect);
      resizeObserver.disconnect();
    };
  }, [mapNavigationExpanded, poiDetailCollapsed, routePlanCollapsed, sidebarBlocksMapViewport]);

  const effectiveMapVisibleRect = useMemo(
    () => normalizeMapVisibleRect(mapVisibleRect, viewportSize),
    [mapVisibleRect, viewportSize],
  );

  useEffect(() => {
    if (viewportSize.width <= 0 || viewportSize.height <= 0) {
      return;
    }

    const previousLayout = mapVisibleLayoutRef.current;
    const previousRect = previousLayout?.rect ?? {
      left: 0,
      top: 0,
      right: viewportSize.width,
      bottom: viewportSize.height,
    };
    const previousSize = previousLayout?.size ?? viewportSize;
    if (
      previousLayout &&
      mapVisibleRectsEqual(previousRect, effectiveMapVisibleRect) &&
      previousSize.width === viewportSize.width &&
      previousSize.height === viewportSize.height
    ) {
      return;
    }

    setMapView((current) => {
      const scale = getScale(current.zoom);
      const previousCenterX = (previousRect.left + previousRect.right) / 2;
      const previousCenterY = (previousRect.top + previousRect.bottom) / 2;
      const visibleWorldX = current.centerX + (previousCenterX - previousSize.width / 2) / scale;
      const visibleWorldZ = current.centerZ + (previousCenterY - previousSize.height / 2) / scale;
      const nextCenterX = (effectiveMapVisibleRect.left + effectiveMapVisibleRect.right) / 2;
      const nextCenterY = (effectiveMapVisibleRect.top + effectiveMapVisibleRect.bottom) / 2;
      return {
        ...current,
        centerX: visibleWorldX - (nextCenterX - viewportSize.width / 2) / scale,
        centerZ: visibleWorldZ - (nextCenterY - viewportSize.height / 2) / scale,
      };
    });
    mapVisibleLayoutRef.current = { rect: effectiveMapVisibleRect, size: viewportSize };
  }, [effectiveMapVisibleRect, viewportSize]);

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
  const regionIndex = useMemo(() => buildUnminedRegionIndex(regionResponse), [regionResponse]);
  const localizedStaticRoutingMarkerSnapshot = useMemo(
    () =>
      (markerResponse?.snapshot.markers ?? [])
        .filter((marker) => marker.categoryId !== 'player')
        .map((marker) => ({
          ...marker,
          label: resolveLocalizedLabel(marker.label, marker.localizedLabels, locale),
          sourceLabel: marker.label,
        })),
    [locale, markerResponse],
  );
  const localizedStaticMarkerSnapshot = useMemo(
    () =>
      localizedStaticRoutingMarkerSnapshot.filter(
        (marker) => marker.transitOperationStatus !== 'closed',
      ),
    [localizedStaticRoutingMarkerSnapshot],
  );
  const localizedPlayerMarkerSnapshot = useMemo(
    () =>
      (playerLocationResponse?.snapshot.markers ?? []).map((marker) => ({
        ...marker,
        label: resolveLocalizedLabel(marker.label, marker.localizedLabels, locale),
        sourceLabel: marker.label,
      })),
    [locale, playerLocationResponse],
  );
  const markerSnapshot = useMemo(
    () => [...localizedStaticMarkerSnapshot, ...localizedPlayerMarkerSnapshot],
    [localizedPlayerMarkerSnapshot, localizedStaticMarkerSnapshot],
  );
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
  const localizedTransitOverview = useMemo(
    () => localizeTransitOverview(transitOverview, locale),
    [locale, transitOverview],
  );
  const rawPointMarkers = useMemo(() => markerSnapshot.filter(isPointMarker), [markerSnapshot]);
  const pointMarkers = useMemo(
    () => rawPointMarkers.filter(shouldRenderAsPointPoi),
    [rawPointMarkers],
  );
  const staticPointMarkers = useMemo(
    () => localizedStaticMarkerSnapshot.filter(isPointMarker).filter(shouldRenderAsPointPoi),
    [localizedStaticMarkerSnapshot],
  );
  const staticRoutingPointMarkers = useMemo(
    () => localizedStaticRoutingMarkerSnapshot.filter(isPointMarker).filter(shouldRenderAsPointPoi),
    [localizedStaticRoutingMarkerSnapshot],
  );
  const staticEndpointGroupMarkers = useMemo(
    () => localizedStaticMarkerSnapshot.filter(isEndpointGroupMarker),
    [localizedStaticMarkerSnapshot],
  );
  const staticShapeMarkers = useMemo(
    () => localizedStaticMarkerSnapshot.filter(isShapeMarker),
    [localizedStaticMarkerSnapshot],
  );
  const routeTraversalBarriers = useMemo(
    () =>
      localizedStaticRoutingMarkerSnapshot.flatMap((marker): RouteTraversalBarrier[] => {
        const explicitBarrier = marker.spatial?.traversalBarrier;
        const waterCategory = marker.categoryId?.trim().toLowerCase() === 'water';
        if (
          !isRegionMarker(marker) ||
          (!waterCategory && explicitBarrier?.kind !== 'blocked_area')
        ) {
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
      }),
    [localizedStaticRoutingMarkerSnapshot],
  );
  const endpointGroupMarkers = useMemo(
    () => markerSnapshot.filter(isEndpointGroupMarker),
    [markerSnapshot],
  );
  const shapeMarkers = useMemo(() => markerSnapshot.filter(isShapeMarker), [markerSnapshot]);
  const transitLineMarkers = useMemo(
    () => markerSnapshot.filter(isTransitLineMarker),
    [markerSnapshot],
  );
  const sharedMarkerFocusKey = useMemo(() => readMapSharedFocusKey(searchParams), [searchParams]);
  const sharedRoutePlan = useMemo(() => readMapSharedRoutePlan(searchParams), [searchParams]);
  const sharedCoordinateFocus = useMemo(
    () => readMapSharedCoordinateFocus(searchParams),
    [searchParams],
  );
  const centerableMarkers = useMemo(
    () => markerSnapshot.filter(isCenterableMarker),
    [markerSnapshot],
  );
  const mapPlaceRelationIndex = useMemo(
    () => buildMapPlaceRelationIndex(localizedStaticMarkerSnapshot.filter(isCenterableMarker)),
    [localizedStaticMarkerSnapshot],
  );
  const canonicalCenterableMarkers = useMemo(
    () => dedupeEquivalentMapPlaceMarkers(centerableMarkers, mapPlaceRelationIndex),
    [centerableMarkers, mapPlaceRelationIndex],
  );
  const currentAccountLocationMarker = useMemo(
    () => pointMarkers.find((marker) => marker.playerLocation?.isCurrentAccount),
    [pointMarkers],
  );
  const preferredCurrentLocation = useMemo<[number, number]>(
    () =>
      currentAccountLocationMarker?.geometry.coordinates ?? [
        mapDefaults.centerX,
        mapDefaults.centerZ,
      ],
    [currentAccountLocationMarker],
  );
  useEffect(() => {
    if (
      !currentAccountLocationMarker ||
      appliedDefaultCurrentAccountLocationIdRef.current === currentAccountLocationMarker.id ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) {
      return;
    }

    appliedDefaultCurrentAccountLocationIdRef.current = currentAccountLocationMarker.id;
    if (
      focusedMarkerId ||
      routePlanDraft ||
      sharedCoordinateFocus ||
      sharedMarkerFocusKey ||
      luckyRequest ||
      sharedRoutePlan
    ) {
      return;
    }

    setMapView((current) =>
      fitCoordinatesToMapView(
        [preferredCurrentLocation],
        { ...current, zoom: mapDefaults.defaultZoom },
        viewportSize,
        0,
        effectiveMapVisibleRect,
      ),
    );
  }, [
    currentAccountLocationMarker,
    effectiveMapVisibleRect,
    focusedMarkerId,
    preferredCurrentLocation,
    routePlanDraft,
    sharedCoordinateFocus,
    sharedMarkerFocusKey,
    sharedRoutePlan,
    viewportSize,
  ]);
  const routeEndpointCandidates = useMemo(() => {
    if (!editingRouteEndpoint) {
      return [];
    }

    const query = routeEndpointQuery.trim();
    const source = query
      ? filterMarkers(canonicalCenterableMarkers, query)
      : [...canonicalCenterableMarkers].sort(
          (left, right) =>
            getMarkerDistanceToCoordinates(left, [mapView.centerX, mapView.centerZ]) -
            getMarkerDistanceToCoordinates(right, [mapView.centerX, mapView.centerZ]),
        );

    return source;
  }, [
    canonicalCenterableMarkers,
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
  const filteredShapeMarkers = useMemo(
    () => filterMarkers(shapeMarkers, markerQuery),
    [markerQuery, shapeMarkers],
  );
  const focusedMarker = useMemo(
    () => markerSnapshot.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, markerSnapshot],
  );
  useEffect(() => {
    publishMapShortcutContextChanged({
      canPlanFocusedMarker: Boolean(
        !routePlanDraft && focusedMarker && isCenterableMarker(focusedMarker),
      ),
      canSwapRouteEndpoints: Boolean(routePlanDraft),
    });
  }, [focusedMarker, routePlanDraft]);
  // 移动端以浮层方式展开侧栏面板：按实际渲染优先级判断（路书 > POI 详情 > 结果列表），
  // 避免路书折叠时仍被残留的 POI 选中态误判为展开。
  const sidebarPanelExpanded = routePlanDraft
    ? !routePlanCollapsed
    : focusedMarker && isCenterableMarker(focusedMarker)
      ? !poiDetailCollapsed
      : markerListExpanded;
  useEffect(() => {
    publishMapSidebarOverlayChanged({ visible: sidebarPanelExpanded });
  }, [sidebarPanelExpanded]);
  useEffect(
    () => () => {
      publishMapSidebarOverlayChanged({ visible: false });
    },
    [],
  );
  const focusedMarkerIsPlayer = Boolean(focusedMarker?.playerLocation);
  const focusedTransitLineMarker = useMemo(
    () => transitLineMarkers.find((marker) => marker.id === focusedMarkerId),
    [focusedMarkerId, transitLineMarkers],
  );
  const transitLineLookup = useMemo(
    () => buildTransitLineLookup(localizedTransitOverview),
    [localizedTransitOverview],
  );
  const stationConnectionIndex = useMemo(
    () => buildStationConnectionIndex(localizedTransitOverview, t, pointMarkers),
    [localizedTransitOverview, pointMarkers, t],
  );
  const focusedTransitLine = focusedTransitLineMarker
    ? findTransitLineByMarker(focusedTransitLineMarker, transitLineLookup)
    : undefined;
  const focusedTransitLineDirection =
    focusedTransitLine && transitLineDirectionSelection?.lineId === focusedTransitLine.id
      ? transitLineDirectionSelection.direction
      : 'forward';
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

  // 把地图当前查看的线路/地点交给问一问，回答“这条线/这里”时才能用上真实上下文。
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const highlights: Parameters<typeof publishAssistantPageContext>[0]['highlights'] = [];
    if (focusedTransitLine) {
      highlights.push({
        kind: 'line',
        title: focusedTransitLine.name,
        detail: [
          focusedTransitLine.firstStationName && focusedTransitLine.lastStationName
            ? `${focusedTransitLine.firstStationName} → ${focusedTransitLine.lastStationName}`
            : undefined,
          (focusedTransitLine.stationCount ?? 0) > 0
            ? `共 ${focusedTransitLine.stationCount} 站`
            : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/map?line=${encodeURIComponent(focusedTransitLine.id)}`,
      });
    } else if (focusedMarker && isCenterableMarker(focusedMarker)) {
      const label =
        locale === 'zh-CN'
          ? focusedMarker.label
          : (focusedMarker.localizedLabels?.[locale] ?? focusedMarker.label);
      highlights.push({
        kind: 'marker',
        title: label,
        detail: [focusedMarker.categoryId, focusedMarker.address].filter(Boolean).join(' · '),
        href: `/map?marker=${encodeURIComponent(focusedMarker.id)}`,
      });
    }

    const trimmedMarkerQuery = markerQuery.trim();
    if (trimmedMarkerQuery) {
      highlights.push({ kind: 'search', title: trimmedMarkerQuery });
    }

    publishAssistantPageContext({ pathname: window.location.pathname, highlights });
  }, [focusedMarker, focusedTransitLine, locale, markerQuery]);

  const centerableMarkerById = useMemo(
    () => new Map(centerableMarkers.map((marker) => [marker.id, marker])),
    [centerableMarkers],
  );
  const nearbySearchRegion = useMemo(() => {
    if (!nearbySearchCenter) {
      return undefined;
    }
    const marker = centerableMarkerById.get(nearbySearchCenter.markerId);
    return marker && isRegionMarker(marker) ? marker : undefined;
  }, [centerableMarkerById, nearbySearchCenter]);
  const focusedBoundRegions = useMemo(
    () =>
      focusedMarker?.boundRegionMarkerIds?.flatMap((id) => {
        const marker = centerableMarkerById.get(id);
        return marker ? [marker] : [];
      }) ?? [],
    [centerableMarkerById, focusedMarker],
  );
  const secondaryPoiIndex = useMemo(
    () =>
      buildSecondaryPoiIndex(
        staticPointMarkers,
        [...staticPointMarkers, ...staticShapeMarkers],
        mapPlaceRelationIndex,
      ),
    [mapPlaceRelationIndex, staticPointMarkers, staticShapeMarkers],
  );
  const secondaryPoiParentIndex = useMemo(
    () =>
      buildSecondaryPoiParentIndex(
        staticPointMarkers,
        [...staticPointMarkers, ...staticShapeMarkers],
        mapPlaceRelationIndex,
      ),
    [mapPlaceRelationIndex, staticPointMarkers, staticShapeMarkers],
  );
  const representativePoiIds = useMemo(
    () => new Set(secondaryPoiIndex.keys()),
    [secondaryPoiIndex],
  );
  const focusedSecondaryPois =
    focusedMarker && isCenterableMarker(focusedMarker)
      ? (secondaryPoiIndex.get(focusedMarker.id) ?? [])
      : [];
  const focusedParentPoi = focusedPointMarker
    ? secondaryPoiParentIndex.get(focusedPointMarker.id)
    : undefined;
  const focusedSecondaryPoiCategoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          focusedSecondaryPois
            .map((link) => link.marker.categoryId)
            .filter((categoryId): categoryId is string => Boolean(categoryId)),
        ),
      ).sort((left, right) =>
        (categoryById.get(left) ?? left).localeCompare(categoryById.get(right) ?? right, 'zh-CN'),
      ),
    [categoryById, focusedSecondaryPois],
  );
  const focusedSecondaryPoiFloorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          focusedSecondaryPois
            .map((link) => link.marker.floorLabel)
            .filter((floorLabel): floorLabel is string => Boolean(floorLabel)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true })),
    [focusedSecondaryPois],
  );
  const filteredFocusedSecondaryPois = useMemo(() => {
    const keyword = normalizeMarkerSearchText(secondaryPoiKeyword);
    return focusedSecondaryPois.filter(
      (link) =>
        (secondaryPoiCategoryFilter === 'all' ||
          link.marker.categoryId === secondaryPoiCategoryFilter) &&
        (secondaryPoiFloorFilter === 'all' || link.marker.floorLabel === secondaryPoiFloorFilter) &&
        (!keyword ||
          normalizeMarkerSearchText(
            [
              link.childLabel,
              buildMapMarkerSearchText(link.marker),
              link.marker.categoryId ? categoryById.get(link.marker.categoryId) : '',
            ].join(' '),
          ).includes(keyword)),
    );
  }, [
    categoryById,
    focusedSecondaryPois,
    secondaryPoiCategoryFilter,
    secondaryPoiFloorFilter,
    secondaryPoiKeyword,
  ]);
  const focusedSecondaryPoiGroups = useMemo(
    () => groupSecondaryPois(filteredFocusedSecondaryPois, categoryById, t),
    [categoryById, filteredFocusedSecondaryPois, t],
  );
  const focusedTransitStationMarkers = useMemo(
    () =>
      focusedTransitLine
        ? findTransitLineStationMarkers(pointMarkers, focusedTransitLine, stationConnectionIndex)
        : [],
    [focusedTransitLine, pointMarkers, stationConnectionIndex],
  );
  const pointOverlaySource = useMemo(() => {
    if (editingRouteEndpoint) {
      return routeEndpointQuery.trim()
        ? filterMarkers(pointMarkers, routeEndpointQuery)
        : pointMarkers;
    }
    if (!focusedMarker) {
      return filteredPointMarkers;
    }
    if (focusedPointMarker) {
      return dedupeMarkersById([
        focusedPointMarker,
        ...focusedSecondaryPois.map((link) => link.marker),
      ]);
    }
    if (focusedSecondaryPois.length > 0) {
      return dedupeMarkersById(focusedSecondaryPois.map((link) => link.marker));
    }
    return focusedTransitStationMarkers;
  }, [
    editingRouteEndpoint,
    filteredPointMarkers,
    focusedMarker,
    focusedPointMarker,
    focusedSecondaryPois,
    focusedTransitStationMarkers,
    pointMarkers,
    routeEndpointQuery,
  ]);
  const markerListCategoryOptions = useMemo(() => {
    const availableCategoryIds = new Set(
      [...pointMarkers, ...endpointGroupMarkers, ...shapeMarkers, ...transitLineMarkers]
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
    const playerCategory = [...configuredCategories, ...inferredCategories].find(
      (category) => category.id === 'player',
    );
    const otherConfiguredCategories = configuredCategories.filter(
      (category) => category.id !== 'player',
    );
    const otherInferredCategories = inferredCategories.filter(
      (category) => category.id !== 'player',
    );

    return [
      { id: 'all', name: t('map.category.all') },
      ...(playerCategory ? [playerCategory] : []),
      { id: favoriteMarkerCategoryId, name: t('map.category.favorites') },
      ...otherConfiguredCategories,
      ...otherInferredCategories,
    ];
  }, [categoryResponse, endpointGroupMarkers, pointMarkers, shapeMarkers, t, transitLineMarkers]);
  const playerMarkerCounts = useMemo(
    () =>
      pointMarkers.reduce(
        (counts, marker) => {
          if (!marker.playerLocation) {
            return counts;
          }

          counts.total += 1;
          if (marker.playerLocation.presence === 'online') {
            counts.online += 1;
          }
          return counts;
        },
        { online: 0, total: 0 },
      ),
    [pointMarkers],
  );
  const nearbyLinearProjectionIndex = useMemo(() => {
    const index = new Map<string, CoordinateChainProjection>();
    if (nearbySearchCenter?.kind !== 'linear' || !nearbySearchCenter.chain) {
      return index;
    }

    for (const marker of [...shapeMarkers, ...pointMarkers]) {
      if (marker.id === nearbySearchCenter.markerId) {
        continue;
      }
      const center = getMarkerCenter(marker);
      if (!center) {
        continue;
      }
      const projection = findCoordinateChainProjection(center, nearbySearchCenter.chain);
      if (projection) {
        index.set(marker.id, projection);
      }
    }

    return index;
  }, [nearbySearchCenter, pointMarkers, shapeMarkers]);
  const nearbyLinearRangeTrace = useMemo<ProjectedNearbyRangeTrace | undefined>(() => {
    const chain = nearbySearchCenter?.chain;
    if (
      nearbySearchCenter?.kind !== 'linear' ||
      !chain ||
      chain.length < 2 ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) {
      return undefined;
    }

    const rangeStart = Math.min(nearbyLinearRange[0], nearbyLinearRange[1]);
    const rangeEnd = Math.max(nearbyLinearRange[0], nearbyLinearRange[1]);
    if (rangeEnd - rangeStart < 0.01) {
      return undefined;
    }

    const coordinates = sliceCoordinateChainByMileage(chain, rangeStart, rangeEnd);
    if (coordinates.length < 2) {
      return undefined;
    }
    const projection = buildTraceProjection(coordinates, mapView, viewportSize);
    if (!projection) {
      return undefined;
    }

    const scale = getScale(mapView.zoom);
    const projectPoint = ([x, z]: [number, number]) => ({
      left: viewportSize.width / 2 + (x - mapView.centerX) * scale - projection.left,
      top: viewportSize.height / 2 + (z - mapView.centerZ) * scale - projection.top,
    });
    const startPoint = projectPoint(coordinates[0]!);
    const endPoint = projectPoint(coordinates[coordinates.length - 1]!);

    return {
      ...projection,
      startLeft: startPoint.left,
      startTop: startPoint.top,
      endLeft: endPoint.left,
      endTop: endPoint.top,
    };
  }, [mapView, nearbyLinearRange, nearbySearchCenter, viewportSize]);
  const sidebarMarkers = useMemo(() => {
    const queryMode = Boolean(markerQuery.trim());
    const nearbyMode = !queryMode && nearbySearchCenter;
    const nearbyLinearMode = Boolean(nearbyMode && nearbySearchCenter?.kind === 'linear');
    const source = queryMode
      ? [
          ...filteredTransitLineMarkers,
          ...filteredEndpointGroupMarkers,
          ...filteredShapeMarkers,
          ...filteredPointMarkers,
        ]
      : nearbyMode
        ? (nearbyLinearMode
            ? [...shapeMarkers, ...pointMarkers]
            : [...endpointGroupMarkers, ...shapeMarkers, ...pointMarkers]
          ).filter((marker) => marker.id !== nearbySearchCenter.markerId)
        : [...endpointGroupMarkers, ...shapeMarkers, ...pointMarkers];
    const dedupedSource = dedupeEquivalentMapPlaceMarkers(source, mapPlaceRelationIndex);
    const categoryFiltered =
      markerListCategoryId === 'all'
        ? dedupedSource
        : markerListCategoryId === favoriteMarkerCategoryId
          ? dedupedSource.filter((marker) => favoriteMarkerIds.has(marker.id))
          : dedupedSource.filter((marker) => marker.categoryId === markerListCategoryId);
    const nearbyScopeFiltered =
      nearbyMode && nearbySearchRegion
        ? categoryFiltered.filter(
            (marker) =>
              isMarkerInsideRegion(marker, nearbySearchRegion.geometry) ===
              (nearbySearchScope === 'inside'),
          )
        : categoryFiltered;

    if (queryMode) {
      return nearbyScopeFiltered
        .map((marker) => ({
          marker,
          matchPriority: getMapMarkerSearchMatchPriority(marker, markerQuery),
          distance: getMarkerDistanceToMapCenter(marker, mapView),
        }))
        .sort(
          (left, right) =>
            left.matchPriority - right.matchPriority || left.distance - right.distance,
        )
        .map(({ marker }) => marker)
        .slice(0, 12);
    }

    if (nearbyMode) {
      if (nearbyLinearMode && nearbySearchCenter.chain) {
        const rangeStart = Math.min(nearbyLinearRange[0], nearbyLinearRange[1]);
        const rangeEnd = Math.max(nearbyLinearRange[0], nearbyLinearRange[1]);
        return nearbyScopeFiltered
          .map((marker) => ({
            marker,
            projection: nearbyLinearProjectionIndex.get(marker.id),
          }))
          .filter(
            (entry): entry is { marker: CenterableMarker; projection: CoordinateChainProjection } =>
              Boolean(
                entry.projection &&
                entry.projection.distance <= nearbyLinearCorridorDistance &&
                entry.projection.mileage >= rangeStart &&
                entry.projection.mileage <= rangeEnd,
              ),
          )
          .sort((left, right) => left.projection.mileage - right.projection.mileage)
          .map(({ marker }) => marker)
          .slice(0, nearbyLinearResultLimit);
      }

      return nearbyScopeFiltered
        .map((marker) => ({
          marker,
          distance: getMarkerDistanceToCoordinates(marker, nearbySearchCenter.coordinates),
        }))
        .sort((left, right) => left.distance - right.distance)
        .map(({ marker }) => marker)
        .slice(0, 12);
    }

    return nearbyScopeFiltered
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
    filteredShapeMarkers,
    filteredTransitLineMarkers,
    favoriteMarkerIds,
    mapView,
    markerListCategoryId,
    markerQuery,
    mapPlaceRelationIndex,
    nearbyLinearProjectionIndex,
    nearbyLinearRange,
    nearbySearchCenter,
    nearbySearchRegion,
    nearbySearchScope,
    pointMarkers,
    shapeMarkers,
  ]);

  useEffect(() => {
    const categoryStillAvailable = markerListCategoryOptions.some(
      (category) => category.id === markerListCategoryId,
    );
    if (!categoryStillAvailable) {
      setMarkerListCategoryId('all');
    }
  }, [markerListCategoryId, markerListCategoryOptions]);

  useEffect(() => {
    if (searchParams.get('category') !== 'player') {
      return;
    }

    if (!markerListCategoryOptions.some((category) => category.id === 'player')) {
      return;
    }

    setMarkerListCategoryId('player');
    setMarkerListExpanded(true);
    setPlayersVisible(true);
  }, [markerListCategoryOptions, searchParams]);

  const routePlanNowAnchor = routePlanDraft?.originId ?? routePlanDraft?.originLabel ?? '';
  const routePlanTimeContext = useMemo<RoutePlanTimeContext>(() => {
    const nowMinutes = normalizeServiceDayMinutes(getBeijingClockMinutes());
    const requested = clockToServiceDayMinutes(routePlanTimeValue || undefined);
    return routePlanTimeMode === 'arrival'
      ? { mode: 'arrival', minutes: requested ?? nowMinutes + 60, nowMinutes }
      : { mode: 'departure', minutes: requested ?? nowMinutes, nowMinutes };
    // 起点变化时刷新“现在”，避免长时间停留后仍按旧时刻规划。
  }, [routePlanNowAnchor, routePlanTimeMode, routePlanTimeValue]);
  const routePlanCalculationKey = routePlanDraft
    ? buildRoutePlanCalculationKey(routePlanDraft, routeTransportModes, routePlanTimeContext)
    : null;
  const routePlanHasTwoLinearEndpoints =
    Boolean(routePlanDraft?.originId && routePlanDraft?.destinationId) &&
    isLinearDetailMarkerId(routePlanDraft?.originId, centerableMarkerById) &&
    isLinearDetailMarkerId(routePlanDraft?.destinationId, centerableMarkerById);
  const currentRoutePlanOptions = useMemo(
    () =>
      routePlanCalculationKey && routePlanOptionsKey === routePlanCalculationKey
        ? selectRoutePlanOptions(
            routePlanOptions,
            routeTransportModes,
            getRouteOptionLimit(routeTransportModes),
            routePlanSortMode,
          )
        : [],
    [
      routePlanCalculationKey,
      routePlanOptions,
      routePlanOptionsKey,
      routePlanSortMode,
      routeTransportModes,
    ],
  );

  useEffect(() => {
    mapVisibleRectRef.current = effectiveMapVisibleRect;
  }, [effectiveMapVisibleRect]);
  const currentRoutePlanStatus: RoutePlanStatus =
    routePlanDraft && routePlanOptionsKey !== routePlanCalculationKey ? 'loading' : routePlanStatus;
  const selectedRouteOption =
    currentRoutePlanOptions.find((option) => option.id === selectedRouteOptionId) ??
    currentRoutePlanOptions[0];
  const routeResultActive = Boolean(routePlanDraft && selectedRouteOption && !editingRouteEndpoint);
  const routeOverlayVisibility = useMemo(
    () => buildRouteOverlayVisibility(selectedRouteOption, routePlanDraft, routeResultActive),
    [routePlanDraft, routeResultActive, selectedRouteOption],
  );
  const routeResultMarkerIds = routeOverlayVisibility?.markerIds;
  const pointProjectionSource = useMemo(() => {
    const nonPlayerSource = pointOverlaySource.filter((marker) => !marker.playerLocation);
    const baseSource =
      focusedMarker && !focusedMarkerIsPlayer
        ? nonPlayerSource
        : markersVisible
          ? nonPlayerSource
          : [];
    const playerSource = pointMarkers.filter((marker) => marker.playerLocation);
    const visiblePlayerSource = playersVisible ? playerSource : [];
    if (!routeResultMarkerIds) {
      return dedupeMarkersById([...baseSource, ...visiblePlayerSource]);
    }

    const routeMarkers = pointMarkers.filter(
      (marker) => routeResultMarkerIds.has(marker.id) && (playersVisible || !marker.playerLocation),
    );
    return dedupeMarkersById([...baseSource, ...visiblePlayerSource, ...routeMarkers]);
  }, [
    focusedMarker,
    focusedMarkerIsPlayer,
    markersVisible,
    playersVisible,
    pointMarkers,
    pointOverlaySource,
    routeResultMarkerIds,
  ]);
  const rawProjectedMarkers = useMemo(() => {
    const projected = projectPointMarkers(
      pointProjectionSource,
      mapView,
      viewportSize,
      markerIconBaseUrl,
      focusedMarkerId,
      browseMode,
      representativePoiIds,
      {
        forceLabelMarkerIds: routeOverlayVisibility?.forceLabelMarkerIds,
        suppressLabelMarkerIds: routeOverlayVisibility?.suppressLabelMarkerIds,
      },
    );
    if (routeResultMarkerIds) {
      return projected;
    }

    const playerMarkers = projected.filter((marker) => marker.isPlayer);
    const nonPlayerMarkers = projected
      .filter((marker) => !marker.isPlayer)
      .sort(
        (left, right) =>
          Number(right.showLabel) - Number(left.showLabel) || right.priority - left.priority,
      )
      .slice(0, 220);
    return [...nonPlayerMarkers, ...playerMarkers];
  }, [
    browseMode,
    focusedMarkerId,
    markerQuery,
    markersVisible,
    pointProjectionSource,
    representativePoiIds,
    mapView,
    markerIconBaseUrl,
    routeResultMarkerIds,
    routeOverlayVisibility,
    viewportSize,
  ]);
  const linearOverlaySource = useMemo(() => {
    const effectiveFocusedMarker = editingRouteEndpoint ? undefined : focusedMarker;
    if (!linearFeaturesVisible && !effectiveFocusedMarker) {
      return [];
    }

    const activeQuery = editingRouteEndpoint ? routeEndpointQuery : markerQuery;
    const queryMatched = activeQuery.trim()
      ? [
          ...filterMarkers(endpointGroupMarkers, activeQuery),
          ...filterMarkers(transitLineMarkers, activeQuery),
        ]
      : [];
    const focusedLinearMarker =
      !editingRouteEndpoint && focusedMarkerId
        ? [...endpointGroupMarkers, ...transitLineMarkers].find(
            (marker) => marker.id === focusedMarkerId,
          )
        : undefined;
    const roadLabelSource =
      effectiveFocusedMarker || browseMode === 'traffic'
        ? []
        : endpointGroupMarkers.filter(
            (marker) =>
              Boolean(getRoadMarkerKind(marker)) &&
              linearMarkerIntersectsViewport(marker, mapView, viewportSize),
          );
    const combined = focusedLinearMarker
      ? [focusedLinearMarker]
      : [...queryMatched, ...roadLabelSource];

    return dedupeMarkersById(combined).filter((marker) => marker.geometry.coordinates.length > 0);
  }, [
    browseMode,
    editingRouteEndpoint,
    endpointGroupMarkers,
    focusedMarker,
    focusedMarkerId,
    linearFeaturesVisible,
    mapView,
    markerQuery,
    routeEndpointQuery,
    transitLineMarkers,
    viewportSize,
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
  const shapeOverlaySource = useMemo(() => {
    if (routeResultActive) {
      return [];
    }
    const focusedShape = focusedMarkerId
      ? shapeMarkers.find((marker) => marker.id === focusedMarkerId)
      : undefined;
    if (focusedShape) {
      return [focusedShape];
    }
    if (focusedMarkerId) {
      return [];
    }
    if (!markersVisible) {
      return [];
    }
    return markerQuery.trim() ? filteredShapeMarkers : shapeMarkers;
  }, [
    filteredShapeMarkers,
    focusedMarkerId,
    markerQuery,
    markersVisible,
    routeResultActive,
    shapeMarkers,
  ]);
  const rawProjectedShapePois = useMemo(
    () =>
      projectShapePoiMarkers(
        shapeOverlaySource,
        mapView,
        viewportSize,
        perspective2_5dVisible && browseMode !== 'satellite',
        new Map(
          (localizedTransitOverview?.lines ?? []).flatMap((line) =>
            line.color ? [[line.id, line.color] as const] : [],
          ),
        ),
        // 区域填充由独立图层统一绘制；主图层只在卫星视图聚焦区域时保留填充。
        browseMode === 'satellite' && focusedMarkerId ? 0.18 : 0,
      ),
    [
      browseMode,
      focusedMarkerId,
      localizedTransitOverview?.lines,
      mapView,
      perspective2_5dVisible,
      shapeOverlaySource,
      viewportSize,
    ],
  );
  const projectedAdministrativeAreas = useMemo(
    () =>
      projectAdministrativeAreas(
        administrativeAreas,
        markerSnapshot,
        new Map(
          (localizedTransitOverview?.lines ?? []).flatMap((line) =>
            line.color ? [[line.id, line.color] as const] : [],
          ),
        ),
        mapView,
        viewportSize,
      ),
    [administrativeAreas, localizedTransitOverview?.lines, mapView, markerSnapshot, viewportSize],
  );
  // 区域填充按地铁线条的方式处理：作为独立的几何图层常驻，不随标记、标签、
  // 搜索或聚焦而消失；受「线条与标签」开关控制，聚焦或路线结果展示时保留。
  const rawAreaFillShapePois = useMemo(() => {
    if (browseMode !== 'road-network' && browseMode !== 'traffic') {
      return [];
    }
    const keepForContext = Boolean(focusedMarker) || routeResultActive;
    if (!linearFeaturesVisible && !keepForContext) {
      return [];
    }
    return projectShapePoiMarkers(
      shapeMarkers,
      mapView,
      viewportSize,
      false,
      new Map(
        (localizedTransitOverview?.lines ?? []).flatMap((line) =>
          line.color ? [[line.id, line.color] as const] : [],
        ),
      ),
      0.18,
    ).filter((shape) => shape.isArea);
  }, [
    browseMode,
    focusedMarker,
    linearFeaturesVisible,
    localizedTransitOverview?.lines,
    mapView,
    routeResultActive,
    shapeMarkers,
    viewportSize,
  ]);
  const {
    markers: projectedMarkers,
    linearPois: projectedLinearPois,
    shapePois: projectedShapePois,
  } = useMemo(() => {
    if (mapViewSettled) {
      return applyMapOverlayCollisionVisibility(
        rawProjectedMarkers,
        rawProjectedLinearPois,
        rawProjectedShapePois,
        viewportSize,
        focusedMarkerId,
        Boolean(markerQuery.trim()),
        mapView.zoom >= mapDefaults.maxZoom,
      );
    }

    // 视图变化中：先沿用上一次停稳时的筛选结果（不新增标记），
    // 再在这批标记内继续做碰撞检测；一旦出现重叠就隐藏，并保持到本次变化结束。
    const previousVisibility = applyMapOverlayPreviousVisibility(
      rawProjectedMarkers,
      rawProjectedLinearPois,
      rawProjectedShapePois,
      viewportSize,
      lastOverlayVisibilityRef.current,
    );
    const hiddenIds = mapViewCollisionHiddenIdsRef.current;
    const visibleMarkers = previousVisibility.markers.filter((marker) => !hiddenIds.has(marker.id));
    const collisionResult = applyMapOverlayCollisionVisibility(
      visibleMarkers,
      previousVisibility.linearPois,
      previousVisibility.shapePois,
      viewportSize,
      focusedMarkerId,
      Boolean(markerQuery.trim()),
      mapView.zoom >= mapDefaults.maxZoom,
    );
    const acceptedIds = new Set(collisionResult.markers.map((marker) => marker.id));
    for (const marker of visibleMarkers) {
      if (!acceptedIds.has(marker.id)) {
        hiddenIds.add(marker.id);
      }
    }
    return collisionResult;
  }, [
    focusedMarkerId,
    markerQuery,
    mapView.zoom,
    mapViewSettled,
    rawProjectedLinearPois,
    rawProjectedMarkers,
    rawProjectedShapePois,
    viewportSize,
  ]);
  // 记录停稳状态下的筛选结果，供下一次可视范围变化期间沿用。
  useEffect(() => {
    if (!mapViewSettled) {
      return;
    }

    lastOverlayVisibilityRef.current = {
      markers: new Map(projectedMarkers.map((marker) => [marker.id, marker.showLabel])),
      linearPois: new Map(
        projectedLinearPois.map((marker) => [
          marker.id,
          { showCenter: marker.showCenter, showTextLabel: marker.showTextLabel },
        ]),
      ),
      shapePois: new Set(projectedShapePois.map((shape) => shape.id)),
    };
  }, [mapViewSettled, projectedLinearPois, projectedMarkers, projectedShapePois]);
  const roadNetworkSource = useMemo(
    () => staticEndpointGroupMarkers.filter(isRoutableNetworkMarker),
    [staticEndpointGroupMarkers],
  );
  const roadTraceSource = useMemo(
    () => roadNetworkSource.filter((marker) => getRoadMarkerKind(marker)),
    [roadNetworkSource],
  );
  const poiAddressRoadOptions = useMemo(() => {
    const matched = findPoiAddressRoadMarkers(poiAddress, roadTraceSource);
    const matchedIds = new Set(matched.map((marker) => marker.id));
    return [
      ...matched,
      ...roadTraceSource
        .filter((marker) => !matchedIds.has(marker.id))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    ];
  }, [poiAddress, roadTraceSource]);
  useEffect(() => {
    let cancelled = false;

    if (loadStatus !== 'ready') {
      setRoadRoutingStatus('ready');
      setRoadRoutingSnapshot({ markerRoadAccessIndex: new Map() });
      return undefined;
    }

    setRoadRoutingStatus('loading');

    const timer = window.setTimeout(() => {
      const graph = buildRoadRouteGraph(
        roadNetworkSource,
        mapSpatialProfile?.roadTiming.junctionSnapTolerance ?? 30,
        mapSpatialProfile?.defaultY ?? 64,
        mapSpatialProfile?.verticalTolerance ?? 0,
        mapSpatialProfile?.worldId ?? 'lindong-overworld',
      );
      const markerRoadAccessIndex = graph
        ? buildMarkerRoadAccessIndex(staticPointMarkers, graph)
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
  }, [
    loadStatus,
    mapSpatialProfile?.defaultY,
    mapSpatialProfile?.roadTiming.junctionSnapTolerance,
    mapSpatialProfile?.verticalTolerance,
    roadNetworkSource,
    staticPointMarkers,
  ]);
  const roadRoutingGraph = roadRoutingSnapshot.graph;
  const markerRoadAccessIndex = roadRoutingSnapshot.markerRoadAccessIndex;
  const focusedDirectionalTransitLineRoute = useMemo(
    () =>
      focusedTransitLineMarker && focusedTransitLine
        ? buildDirectionalTransitLineRoute(
            focusedTransitLineMarker,
            focusedTransitLine,
            focusedTransitLineDirection,
            pointMarkers,
            roadRoutingGraph,
            mapSpatialProfile?.roadTiming,
            markerRoadAccessIndex,
          )
        : undefined,
    [
      focusedTransitLine,
      focusedTransitLineDirection,
      focusedTransitLineMarker,
      mapSpatialProfile?.roadTiming,
      markerRoadAccessIndex,
      pointMarkers,
      roadRoutingGraph,
    ],
  );
  const focusedDirectionalTransitLineMarker =
    focusedTransitLineMarker && focusedTransitLine
      ? (focusedDirectionalTransitLineRoute?.marker ?? focusedTransitLineMarker)
      : undefined;
  const routeMarkerRoadAccessIndex = useMemo(() => {
    if (!routePlanDraft || !roadRoutingGraph) {
      return markerRoadAccessIndex;
    }

    const nextIndex = new Map(markerRoadAccessIndex);
    const originCoordinate = routePlanDraft.originRaw ?? routePlanDraft.origin;
    const destinationCoordinate = routePlanDraft.destinationRaw ?? routePlanDraft.destination;
    if (isPlayerLocationMarkerId(routePlanDraft.originId)) {
      nextIndex.set(
        routePlanDraft.originId,
        findRoadAccessCandidates(originCoordinate, destinationCoordinate, roadRoutingGraph),
      );
    }
    if (isPlayerLocationMarkerId(routePlanDraft.destinationId)) {
      nextIndex.set(
        routePlanDraft.destinationId,
        findRoadAccessCandidates(destinationCoordinate, originCoordinate, roadRoutingGraph),
      );
    }
    return nextIndex;
  }, [markerRoadAccessIndex, roadRoutingGraph, routePlanDraft]);
  const selectedRoadTraceSource = useMemo(() => {
    const selectedRoadTrace = focusedMarkerId
      ? roadTraceSource.find((marker) => marker.id === focusedMarkerId)
      : undefined;
    return selectedRoadTrace ? [selectedRoadTrace] : [];
  }, [focusedMarkerId, roadTraceSource]);
  const browseModeRoadTraceSource = useMemo(() => {
    const shouldForceRoadReference = browseMode === 'road-network' || browseMode === 'traffic';
    const shouldKeepContextReference = Boolean(focusedMarker) || routeResultActive;
    if (!linearFeaturesVisible && !shouldForceRoadReference && !shouldKeepContextReference) {
      return [];
    }

    const baseSource = roadTraceSource;

    return dedupeMarkersById([...selectedRoadTraceSource, ...baseSource]);
  }, [
    browseMode,
    focusedMarker,
    linearFeaturesVisible,
    roadTraceSource,
    routeResultActive,
    selectedRoadTraceSource,
  ]);
  const projectedRoadTraces = useMemo(() => {
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
  }, [browseMode, browseModeRoadTraceSource, focusedMarkerId, mapView, viewportSize]);
  const projectedTransitTraces = useMemo(() => {
    const shouldKeepContextReference = Boolean(focusedMarker) || routeResultActive;
    if (!linearFeaturesVisible && !focusedTransitLineMarker && !shouldKeepContextReference) {
      return [];
    }

    const traceSource = focusedDirectionalTransitLineMarker
      ? [focusedDirectionalTransitLineMarker]
      : metroTransitLineMarkers;

    return projectTransitLineTraces(traceSource, mapView, viewportSize, focusedMarkerId).slice(
      0,
      48,
    );
  }, [
    focusedMarkerId,
    focusedMarker,
    focusedDirectionalTransitLineMarker,
    focusedTransitLineMarker,
    linearFeaturesVisible,
    mapView,
    metroTransitLineMarkers,
    routeResultActive,
    viewportSize,
  ]);
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
    [markerResponse?.meta.message, playerLocationResponse?.meta.message, tileSourceText]
      .filter(Boolean)
      .join('\n') || t('map.source.tooltipLoading');
  const updateSelectedTileProviderId = (providerId: string) => {
    publishMapTileProviderSelected({ providerId });
  };
  const routePlanRequest = useMemo(
    () =>
      routePlanDraft
        ? {
            draft: routePlanDraft,
            enabledModes: routeTransportModes,
            markerRoadAccessIndex: routeMarkerRoadAccessIndex,
            defaultDrivingSpeedKmh: mapSpatialProfile?.defaultDrivingSpeedKmh ?? 60,
            roadTiming: mapSpatialProfile?.roadTiming,
            taxiFare: mapSpatialProfile?.taxiFare,
            transitFare: mapSpatialProfile?.transitFare,
            pointMarkers: staticRoutingPointMarkers,
            traversalBarriers: routeTraversalBarriers,
            secondaryPoiIndex,
            secondaryPoiParentIndex,
            transitLines: localizedTransitOverview?.lines ?? [],
            modeProfiles: localizedTransitOverview?.modeProfiles ?? [],
            time: routePlanTimeContext,
          }
        : null,
    [
      routeMarkerRoadAccessIndex,
      mapSpatialProfile?.defaultDrivingSpeedKmh,
      mapSpatialProfile?.roadTiming,
      mapSpatialProfile?.taxiFare,
      mapSpatialProfile?.transitFare,
      staticRoutingPointMarkers,
      routeTraversalBarriers,
      routePlanDraft,
      routeTransportModes,
      routePlanTimeContext,
      secondaryPoiIndex,
      secondaryPoiParentIndex,
      localizedTransitOverview,
    ],
  );
  useEffect(() => {
    if (!routePlanDraft) {
      return;
    }

    const nextDraft = updateRoutePlanDraftPlayerEndpoints(routePlanDraft, pointMarkers);
    if (nextDraft === routePlanDraft) {
      return;
    }

    setRoutePlanDraft(nextDraft);
    setSelectedRouteOptionId(null);
  }, [pointMarkers, routePlanDraft]);
  useEffect(() => {
    if (!routePlanDraft || !routePlanRequest) {
      setRoutePlanOptions([]);
      setRoutePlanOptionsKey(null);
      setRoutePlanStatus('idle');
      return;
    }

    if (routePlanHasTwoLinearEndpoints) {
      // 起点和终点均为线性 POI 时不生成任何规划结果。
      setRoutePlanOptions([]);
      setRoutePlanOptionsKey(routePlanCalculationKey);
      setRoutePlanStatus('ready');
      return;
    }

    let cancelled = false;
    setRoutePlanStatus('loading');
    setRoutePlanOptions([]);
    setRoutePlanOptionsKey(null);

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
        setRoutePlanOptionsKey(routePlanCalculationKey);
        setRoutePlanStatus('ready');
      });
    }, routePlanRecalculateDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    roadRoutingGraph,
    roadRoutingStatus,
    routePlanCalculationKey,
    routePlanDraft,
    routePlanHasTwoLinearEndpoints,
    routePlanRequest,
    t,
  ]);
  const selectedRouteTrace = useMemo(
    () =>
      routeResultActive && selectedRouteOption
        ? projectRoutePlanTrace(selectedRouteOption, mapView, viewportSize)
        : undefined,
    [mapView, routeResultActive, selectedRouteOption, viewportSize],
  );
  const projectedRouteEndpointMarkers = useMemo(
    () =>
      routePlanDraft && selectedRouteOption && routeResultActive
        ? projectRouteEndpointMarkers(
            selectedRouteOption,
            routePlanDraft,
            pointMarkers,
            mapView,
            viewportSize,
          )
        : [],
    [mapView, pointMarkers, routePlanDraft, routeResultActive, selectedRouteOption, viewportSize],
  );
  const visibleProjectedMarkers = useMemo(() => {
    const baseMarkers = routeResultMarkerIds
      ? rawProjectedMarkers.filter((marker) => routeResultMarkerIds.has(marker.id))
      : projectedMarkers;
    return [...baseMarkers, ...projectedRouteEndpointMarkers];
  }, [projectedMarkers, projectedRouteEndpointMarkers, rawProjectedMarkers, routeResultMarkerIds]);
  const visibleSelectedRouteTrace = useMemo(
    () => applyRouteRoadLabelCollisionVisibility(selectedRouteTrace, visibleProjectedMarkers),
    [selectedRouteTrace, visibleProjectedMarkers],
  );
  const visibleProjectedLinearPois = routeResultActive ? [] : projectedLinearPois;
  // 视图停稳后碰撞筛选会新增/移除标记，这里用淡入淡出代替瞬时切换；
  // 标记点在视图变化期间也要淡出（按世界坐标跟随移动），线性/形状覆盖物只在停稳后淡出。
  const fadeMarkers = useFadeOutOverlayItems(visibleProjectedMarkers, true);
  const fadeLinearPois = useFadeOutOverlayItems(visibleProjectedLinearPois, mapViewSettled);
  const fadeShapePois = useFadeOutOverlayItems(projectedShapePois, mapViewSettled);
  // 淡出中的标记没有新的投影结果，用世界坐标按当前视图换算屏幕位置，避免停在旧位置。
  const mapProjectionScale = getScale(mapView.zoom);
  const renderedFadeMarkers = fadeMarkers.map(({ item, leaving }) =>
    leaving
      ? {
          leaving,
          item: {
            ...item,
            left: viewportSize.width / 2 + (item.x - mapView.centerX) * mapProjectionScale,
            top: viewportSize.height / 2 + (item.z - mapView.centerZ) * mapProjectionScale,
          },
        }
      : { leaving, item },
  );
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
  const focusedTransitStationDetails = useMemo(() => {
    if (!focusedMarker || !isMetroStationPoi(focusedMarker)) {
      return [];
    }

    const markerKeys = new Set(getMarkerStationNameMatchKeys(focusedMarker));
    const details =
      transitStationDetails.length > 0
        ? transitStationDetails
        : (transitOverview?.stationDetails ?? []);
    return details
      .filter((detail) =>
        getStationNameMatchKeys(detail.stationName).some((key) => markerKeys.has(key)),
      )
      .sort((left, right) => left.lineName.localeCompare(right.lineName, 'zh-CN'));
  }, [focusedMarker, transitOverview, transitStationDetails]);
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
      currentRoutePlanOptions.length > 0 &&
      !currentRoutePlanOptions.some((option) => option.id === selectedRouteOptionId)
    ) {
      setSelectedRouteOptionId(currentRoutePlanOptions[0].id);
    }
  }, [currentRoutePlanOptions, routePlanDraft, selectedRouteOptionId]);

  useEffect(() => {
    if (!routeResultActive || !routePlanDraft || !selectedRouteOption) {
      routeFitStateRef.current = null;
      routeManuallyZoomedRef.current = false;
      return;
    }

    const routeKey = [
      selectedRouteOption.id,
      ...routePlanDraft.origin,
      ...routePlanDraft.destination,
      ...selectedRouteOption.markerIds,
      selectedRouteOption.coordinates.length,
      ...(selectedRouteOption.coordinates[0] ?? []),
      ...(selectedRouteOption.coordinates.at(-1) ?? []),
    ].join(':');
    const rectKey = [
      effectiveMapVisibleRect.left,
      effectiveMapVisibleRect.top,
      effectiveMapVisibleRect.right,
      effectiveMapVisibleRect.bottom,
    ].join(':');
    const previousFitState = routeFitStateRef.current;
    const routeChanged = previousFitState?.routeKey !== routeKey;
    const rectChanged = previousFitState?.rectKey !== rectKey;
    if (!routeChanged && !rectChanged) {
      return;
    }
    routeFitStateRef.current = { rectKey, routeKey };

    const markerIds = new Set(selectedRouteOption.markerIds);
    const semanticCoordinates = pointMarkers
      .filter((marker) => markerIds.has(marker.id))
      .map((marker) => getMarkerCenter(marker))
      .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

    // 路线本身发生变化（首次规划完成、切换方案）时，采用与折叠态一致的精确取景。
    if (routeChanged) {
      routeManuallyZoomedRef.current = false;
      setMapView((current) =>
        fitRoutePlanToMapView(
          selectedRouteOption,
          semanticCoordinates,
          current,
          viewportSize,
          effectiveMapVisibleRect,
        ),
      );
      return;
    }

    if (!rectChanged || routeManuallyZoomedRef.current) {
      return;
    }

    // 安全框尺寸变化（窗口缩放、面板动画）同样使用新的精确取景，避免仍按旧的固定留白与整数缩放。
    setMapView((current) =>
      fitRoutePlanToMapView(
        selectedRouteOption,
        semanticCoordinates,
        current,
        viewportSize,
        effectiveMapVisibleRect,
      ),
    );
  }, [
    effectiveMapVisibleRect,
    pointMarkers,
    routePlanDraft,
    routeResultActive,
    selectedRouteOption,
    viewportSize,
  ]);

  // 路书折叠后重新取景：等折叠动画结束、安全框尺寸稳定，再把路线与标记点标签收进可视区。
  useEffect(() => {
    if (!routePlanCollapsed || !routeResultActive || !routePlanDraft || !selectedRouteOption) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const markerIds = new Set(selectedRouteOption.markerIds);
      const semanticCoordinates = pointMarkers
        .filter((marker) => markerIds.has(marker.id))
        .map((marker) => getMarkerCenter(marker))
        .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
      routeManuallyZoomedRef.current = false;
      setMapView((current) =>
        fitRoutePlanToMapView(
          selectedRouteOption,
          semanticCoordinates,
          current,
          viewportSizeRef.current,
          mapVisibleRectRef.current,
        ),
      );
    }, routeCollapsedFitDelay);

    return () => window.clearTimeout(timer);
  }, [pointMarkers, routePlanCollapsed, routePlanDraft, routeResultActive, selectedRouteOption]);

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

  const zoomBy = useCallback((delta: number) => {
    routeManuallyZoomedRef.current = true;
    setMapView((current) => {
      const currentSize = viewportSizeRef.current;
      const safeRect = normalizeMapVisibleRect(mapVisibleRectRef.current, currentSize);
      return zoomMapViewAroundScreenPoint(
        current,
        clampZoom(current.zoom + delta),
        currentSize,
        (safeRect.left + safeRect.right) / 2,
        (safeRect.top + safeRect.bottom) / 2,
      );
    });
  }, []);

  useEffect(() => subscribeMapZoomRequested(({ delta }) => zoomBy(delta)), [zoomBy]);

  const triggerRandomExplore = useCallback(() => {
    const token =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setExplorePending(true);
    router.push(appPath(`/map?lucky=${token}`), { scroll: false });
  }, [router]);

  const panByScreenDelta = useCallback((deltaX: number, deltaY: number) => {
    routeManuallyZoomedRef.current = true;
    setMapView((current) => {
      const scale = getScale(current.zoom);
      return {
        ...current,
        centerX: current.centerX - deltaX / scale,
        centerZ: current.centerZ - deltaY / scale,
      };
    });
  }, []);

  // WASD 与方向键平移地图；输入框、可编辑区域和带修饰键的组合键不拦截。
  useEffect(() => {
    const panStepPixels = 64;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      if (event.target instanceof HTMLElement) {
        if (
          event.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
        ) {
          return;
        }
      }
      const key = event.key.toLowerCase();
      let deltaX = 0;
      let deltaY = 0;
      if (key === 'w' || key === 'arrowup') {
        deltaY = panStepPixels;
      } else if (key === 's' || key === 'arrowdown') {
        deltaY = -panStepPixels;
      } else if (key === 'a' || key === 'arrowleft') {
        deltaX = panStepPixels;
      } else if (key === 'd' || key === 'arrowright') {
        deltaX = -panStepPixels;
      } else {
        return;
      }
      event.preventDefault();
      panByScreenDelta(deltaX, deltaY);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panByScreenDelta]);

  const resetView = useCallback(() => {
    setMapView((current) =>
      fitCoordinatesToMapView(
        [preferredCurrentLocation],
        { ...current, zoom: mapDefaults.defaultZoom },
        viewportSize,
        0,
        effectiveMapVisibleRect,
      ),
    );
  }, [effectiveMapVisibleRect, preferredCurrentLocation, viewportSize]);

  // 移动端侧边操作栏开启后，地图右侧竖排工具条整体移入侧栏。
  const mobileActionRailItems = useMemo<MobileActionRailItem[]>(
    () =>
      mobileActionRail?.enabled
        ? [
            {
              id: 'rail-map-zoom-out',
              group: 'page',
              order: 10,
              priority: 70,
              label: t('map.toolbar.zoomOut'),
              icon: 'remove',
              onClick: () => zoomBy(-0.5),
            },
            {
              id: 'rail-map-zoom-in',
              group: 'page',
              order: 20,
              priority: 71,
              label: t('map.toolbar.zoomIn'),
              icon: 'add',
              onClick: () => zoomBy(0.5),
            },
            {
              id: 'rail-map-reset',
              group: 'page',
              order: 30,
              priority: 72,
              label: t('map.toolbar.reset'),
              icon: 'my_location',
              onClick: resetView,
            },
            {
              id: 'rail-map-layers',
              group: 'page',
              order: 40,
              priority: 80,
              label: t('map.layer.open'),
              icon: 'layers',
              active: layerPanelOpen,
              onClick: () => setLayerPanelOpen((current) => !current),
            },
          ]
        : [],
    [layerPanelOpen, mobileActionRail?.enabled, resetView, t, zoomBy],
  );

  useEffect(() => {
    if (!mobileActionRail) {
      return;
    }
    mobileActionRail.registerItems('map-stage', mobileActionRailItems);
  }, [mobileActionRail, mobileActionRailItems]);

  // 快捷键处理函数随渲染更新，订阅只建立一次，避免弹层状态变化时反复解绑/重绑。
  const shortcutCommandRef = useRef<
    (
      command:
        | 'focus_search'
        | 'reset_view'
        | 'toggle_layers'
        | 'toggle_favorite'
        | 'search_nearby'
        | 'random_explore'
        | 'dismiss',
    ) => void
  >(() => undefined);
  shortcutCommandRef.current = (command) => {
    if (command === 'focus_search') {
      setMarkerListExpanded(true);
      searchInputRef.current?.focus();
      return;
    }

    if (command === 'random_explore') {
      triggerRandomExplore();
      return;
    }

    if (command === 'reset_view') {
      resetView();
      return;
    }

    if (command === 'toggle_layers') {
      setLayerPanelOpen((current) => !current);
      return;
    }

    if (command === 'toggle_favorite') {
      if (
        !shareTarget &&
        !poiSubmitDialogOpen &&
        !layerPanelOpen &&
        focusedMarker &&
        isCenterableMarker(focusedMarker)
      ) {
        toggleFavoriteMarker(focusedMarker);
      }
      return;
    }

    if (command === 'search_nearby') {
      if (
        !shareTarget &&
        !poiSubmitDialogOpen &&
        !layerPanelOpen &&
        focusedMarker &&
        isCenterableMarker(focusedMarker)
      ) {
        startNearbySearch(focusedMarker);
      }
      return;
    }

    // 按视觉层级从高到低逐层关闭，保证一次 Esc 只收起最上面的一层。
    if (shareTarget) {
      setShareTarget(null);
      return;
    }
    if (poiCoordinatePickMode) {
      setPoiCoordinatePickMode(false);
      return;
    }
    if (poiSubmitDialogOpen) {
      setPoiSubmitDialogOpen(false);
      return;
    }
    if (layerPanelOpen) {
      setLayerPanelOpen(false);
      return;
    }
    if (routePlanDraft) {
      setRoutePlanDraft(null);
      setEditingRouteEndpoint(null);
      setRouteEndpointQuery('');
      return;
    }
    if (focusedMarkerId) {
      setFocusedMarkerId(null);
      return;
    }
    if (selectedAdministrativeAreaId) {
      setSelectedAdministrativeAreaId(null);
      return;
    }
    if (nearbySearchCenter) {
      setNearbySearchCenter(null);
    }
  };

  useEffect(
    () => subscribeMapViewShortcutRequested(({ command }) => shortcutCommandRef.current(command)),
    [],
  );

  const focusMapMarker = useCallback(
    (marker: CenterableMarker) => {
      setMapView((current) =>
        fitMarkerToMapView(marker, current, viewportSize, effectiveMapVisibleRect),
      );
      setFocusedMarkerId(marker.id);
      setSelectedAdministrativeAreaId(null);
      setPoiDetailTab('summary');
      setPoiDetailCollapsed(false);
      setNearbySearchCenter(null);
    },
    [effectiveMapVisibleRect, viewportSize],
  );

  // A query token survives the map chunk loading and also works from other pages.
  useEffect(() => {
    if (!luckyRequest) return;
    luckyRequiredReloadRef.current = exploreReload;
    if (loadStatus === 'unavailable' || transitLoadStatus === 'unavailable') {
      luckyRequiredReloadRef.current = exploreReload + 1;
      setExploreReload(exploreReload + 1);
    }
    const timer = window.setTimeout(() => {
      if (handledLuckyRef.current !== luckyRequest) {
        handledLuckyRef.current = luckyRequest;
        setExplorePending(false);
        publishToastRequested({ message: t('map.explore.failed'), tone: 'warning' });
      }
    }, 15000);
    return () => window.clearTimeout(timer);
    // The request token is the trigger; data updates must not start another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [luckyRequest]);

  const luckyCandidates = useMemo(
    () => buildExploreCandidates(canonicalCenterableMarkers, localizedTransitOverview?.lines ?? []),
    [canonicalCenterableMarkers, localizedTransitOverview],
  );

  useEffect(() => {
    if (
      !luckyRequest ||
      handledLuckyRef.current === luckyRequest ||
      mapCompletedReload < luckyRequiredReloadRef.current ||
      transitCompletedReload < luckyRequiredReloadRef.current ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    )
      return;
    handledLuckyRef.current = luckyRequest;
    setExplorePending(false);
    if (loadStatus !== 'ready' || transitLoadStatus !== 'ready') {
      publishToastRequested({ message: t('map.explore.failed'), tone: 'warning' });
      return;
    }
    const target = pickExploreCandidate(luckyCandidates, lastLuckyMarkerRef.current);
    if (!target) {
      publishToastRequested({ message: t('map.explore.empty'), tone: 'info' });
      return;
    }
    lastLuckyMarkerRef.current = target.id;
    setRoutePlanDraft(null);
    setEditingRouteEndpoint(null);
    setMarkerQuery('');
    setMarkersVisible(true);
    setLinearFeaturesVisible(true);
    setLayerPanelOpen(false);
    focusMapMarker(target);
    publishToastRequested({
      message: t('map.explore.found', { name: target.label }),
      tone: 'success',
      durationMs: 1500,
      dedupeKey: 'map-lucky-result',
    });
  }, [
    luckyRequest,
    mapCompletedReload,
    transitCompletedReload,
    loadStatus,
    transitLoadStatus,
    luckyCandidates,
    focusMapMarker,
    viewportSize.width,
    viewportSize.height,
    t,
  ]);

  useEffect(() => {
    if (!sharedMarkerFocusKey) {
      if (appliedSharedMarkerFocusKey) {
        setAppliedSharedMarkerFocusKey(null);
      }
      return;
    }

    if (
      appliedSharedMarkerFocusKey === sharedMarkerFocusKey ||
      markerSnapshot.length === 0 ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) {
      return;
    }

    const marker = findMapMarkerBySharedFocusKey(markerSnapshot, sharedMarkerFocusKey);
    if (marker && isCenterableMarker(marker)) {
      focusMapMarker(marker);
      setAppliedSharedMarkerFocusKey(sharedMarkerFocusKey);
    }
  }, [
    appliedSharedMarkerFocusKey,
    focusMapMarker,
    markerSnapshot,
    sharedMarkerFocusKey,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (!sharedRoutePlan) {
      if (appliedSharedRoutePlanKey) {
        setAppliedSharedRoutePlanKey(null);
      }
      return;
    }

    if (
      appliedSharedRoutePlanKey === sharedRoutePlan.key ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) {
      return;
    }

    const sharedDraftOriginMarker = sharedRoutePlan.draft.originId
      ? centerableMarkerById.get(sharedRoutePlan.draft.originId)
      : undefined;
    const sharedDraftDestinationMarker = sharedRoutePlan.draft.destinationId
      ? centerableMarkerById.get(sharedRoutePlan.draft.destinationId)
      : undefined;
    if (
      sharedDraftOriginMarker &&
      sharedDraftDestinationMarker &&
      isLinearDetailMarker(sharedDraftOriginMarker) &&
      isLinearDetailMarker(sharedDraftDestinationMarker)
    ) {
      publishToastRequested({
        dedupeKey: 'map-route-linear-endpoint',
        message: t('map.route.linearEndpointBlocked'),
        tone: 'error',
      });
      setAppliedSharedRoutePlanKey(sharedRoutePlan.key);
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
      fitRouteDraftToMapView(sharedRoutePlan.draft, current, viewportSize, effectiveMapVisibleRect),
    );
    setAppliedSharedRoutePlanKey(sharedRoutePlan.key);
  }, [
    appliedSharedRoutePlanKey,
    centerableMarkerById,
    effectiveMapVisibleRect,
    sharedRoutePlan,
    t,
    viewportSize,
  ]);

  useEffect(() => {
    if (!sharedCoordinateFocus) {
      if (appliedSharedCoordinateFocusKey) {
        setAppliedSharedCoordinateFocusKey(null);
      }
      return;
    }

    if (
      appliedSharedCoordinateFocusKey === sharedCoordinateFocus.key ||
      viewportSize.width <= 0 ||
      viewportSize.height <= 0
    ) {
      return;
    }

    setFocusedMarkerId(null);
    setRoutePlanDraft(null);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setNearbySearchCenter(null);
    setMapView((current) =>
      fitCoordinatesToMapView(
        [sharedCoordinateFocus.coordinate],
        { ...current, zoom: Math.max(current.zoom, mapDefaults.defaultZoom) },
        viewportSize,
        0,
        effectiveMapVisibleRect,
      ),
    );
    setAppliedSharedCoordinateFocusKey(sharedCoordinateFocus.key);
  }, [
    appliedSharedCoordinateFocusKey,
    effectiveMapVisibleRect,
    sharedCoordinateFocus,
    viewportSize,
  ]);

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

  const focusTransitStationStop = (line: TransitOverviewLine, stationName: string) => {
    const stationMarker = findTransitStationMarkerForLine(
      pointMarkers,
      stationName,
      line,
      stationConnectionIndex,
    );
    if (stationMarker) {
      focusMapMarker(stationMarker);
    }
  };

  const focusTransitStationView = (line: TransitOverviewLine, stationName: string) => {
    const stationMarker = findTransitStationMarkerForLine(
      pointMarkers,
      stationName,
      line,
      stationConnectionIndex,
    );
    const center = stationMarker ? getMarkerCenter(stationMarker) : undefined;
    if (!center) {
      return;
    }

    setMapView((current) => {
      const targetZoom = clampZoom(Math.max(current.zoom, transitStationFocusZoom));
      const scale = getScale(targetZoom);
      const visibleRect = normalizeMapVisibleRect(effectiveMapVisibleRect, viewportSize);
      const visibleCenterX = (visibleRect.left + visibleRect.right) / 2;
      const visibleCenterY = (visibleRect.top + visibleRect.bottom) / 2;
      return {
        ...current,
        zoom: targetZoom,
        centerX: center[0] - (visibleCenterX - viewportSize.width / 2) / scale,
        centerZ: center[1] - (visibleCenterY - viewportSize.height / 2) / scale,
      };
    });
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
    routeManuallyZoomedRef.current = true;
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
    const markerId =
      event.pointerType === 'mouse' ? undefined : getPointerTargetMapMarkerId(event.target);
    tapRef.current =
      editingRouteEndpoint || poiCoordinatePickMode || markerId
        ? {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            markerId,
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
      if (!wasPinching && tap.markerId) {
        const marker = centerableMarkers.find((item) => item.id === tap.markerId);
        if (marker) {
          suppressedMarkerClickRef.current = marker.id;
          window.setTimeout(() => {
            if (suppressedMarkerClickRef.current === marker.id) {
              suppressedMarkerClickRef.current = null;
            }
          }, 0);
          handleMapMarkerActivate(marker);
        }
      } else if (!wasPinching && (editingRouteEndpoint || poiCoordinatePickMode)) {
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

  const updatePoiAddress = (address: string) => {
    setPoiAddress(address);
    const matched = findPoiAddressRoadMarkers(address, roadTraceSource);
    setPoiAddressRoadMarkerId((current) => {
      if (matched.length === 1) {
        return matched[0]?.id ?? '';
      }
      return matched.some((marker) => marker.id === current) ? current : '';
    });
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
    if (poiFacilities.some((facility) => !facility.description.trim())) {
      setPoiSubmitStatus(t('map.poiSubmit.invalidFacility'));
      return;
    }

    setPoiSubmitBusy(true);
    try {
      const externalImageUrl = poiImageUrl.trim();
      if (poiImageFiles.length + (externalImageUrl ? 1 : 0) > 12) {
        setPoiSubmitStatus(t('map.poiSubmit.tooManyImages'));
        return;
      }
      const uploadedImageUrls: string[] = [];
      for (const imageFile of poiImageFiles) {
        const imageBody = new FormData();
        imageBody.append('file', imageFile);
        const imageResponse = await fetch(appPath('/api/map/poi-submission-images/upload'), {
          method: 'POST',
          body: imageBody,
        });
        const imageData = (await imageResponse.json()) as {
          imageUrl?: string;
          message?: string;
        };
        if (publishLoginRequiredForResponse(imageResponse)) {
          return;
        }
        if (!imageResponse.ok || !imageData.imageUrl) {
          setPoiSubmitStatus(imageData.message ?? t('map.poiSubmit.imageUploadFailed'));
          return;
        }
        uploadedImageUrls.push(imageData.imageUrl);
      }
      const imageUrls = [externalImageUrl, ...uploadedImageUrls].filter(Boolean);

      const response = await fetch(appPath('/api/map/poi-submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: poiTitle,
          categoryId: poiCategoryId,
          description: poiDescription.trim() || undefined,
          href: poiHref.trim() || undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          imageUrl: imageUrls[0],
          visibility: 'public_pending_review',
          geometry: {
            type: 'Point',
            coordinates: [x, z],
          },
          openingHours: poiOpeningHours.trim() || undefined,
          address: poiAddress.trim() || undefined,
          floorLabel: poiFloorLabel.trim() || undefined,
          addressRoadMarkerId: poiAddressRoadMarkerId || undefined,
          facilities: poiFacilities.length > 0 ? poiFacilities : undefined,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (publishLoginRequiredForResponse(response)) {
        return;
      }
      if (!response.ok) {
        setPoiSubmitStatus(data.message ?? t('map.poiSubmit.submitFailed'));
        return;
      }

      setPoiTitle('');
      setPoiDescription('');
      setPoiHref('');
      setPoiImageUrl('');
      setPoiImageFiles([]);
      setPoiImageFileInputKey((current) => current + 1);
      setPoiX('');
      setPoiZ('');
      setPoiOpeningHours('');
      setPoiAddress('');
      setPoiFloorLabel('');
      setPoiAddressRoadMarkerId('');
      setPoiFacilities([]);
      setPoiSubmitStatus(t('map.poiSubmit.success'));
      setPoiSubmitDialogOpen(false);
      publishAdminDataChanged({
        resource: 'poi',
        reason: 'submission_created',
        occurredAt: new Date().toISOString(),
      });
    } finally {
      setPoiSubmitBusy(false);
    }
  };

  interface ResolvedLinearRouteEndpoint {
    coordinate: [number, number];
    label: string;
  }

  const isLinearRouteEndpointId = (markerId: string | undefined): boolean => {
    const marker = markerId ? centerableMarkerById.get(markerId) : undefined;
    return marker ? isLinearDetailMarker(marker) : false;
  };

  const resolveLinearRouteEndpoint = (
    marker: CenterableMarker,
    endpoint: RouteEndpointKind,
    reference: [number, number],
  ): ResolvedLinearRouteEndpoint | undefined => {
    if (isTransitLineMarker(marker)) {
      const line = findTransitLineByMarker(marker, transitLineLookup);
      if (line) {
        const mode = isRouteTransportMode(line.mode) ? line.mode : 'walk';
        const stationMarkerIndex = buildTransitStationMarkerIndex(pointMarkers);
        const stops = (
          line.stationStops && line.stationStops.length > 0
            ? line.stationStops
            : line.stationNames.map((stationName, sequence) => ({
                stationName,
                displayStationName: line.displayStationNames?.[sequence],
                operationStatus: 'operating' as const,
                sequence,
              }))
        )
          .map((stop) => {
            const stationMarker = findTransitStationMarker(
              stop,
              stationMarkerIndex,
              pointMarkers,
              mode,
            );
            const center = stationMarker ? getMarkerCenter(stationMarker) : undefined;
            return center
              ? {
                  center,
                  name: stop.displayStationName ?? stop.stationName,
                }
              : undefined;
          })
          .filter((stop): stop is { center: [number, number]; name: string } => Boolean(stop));
        if (stops.length > 0) {
          const candidates =
            endpoint === 'origin' && stops.length > 1
              ? [stops[0]!, stops[stops.length - 1]!]
              : stops;
          const nearest = candidates.reduce((best, stop) =>
            getCoordinateDistance(stop.center, reference) <
            getCoordinateDistance(best.center, reference)
              ? stop
              : best,
          );
          return {
            coordinate: nearest.center,
            label: `${formatMarkerDisplayName(marker.label)}（${formatMarkerDisplayName(nearest.name)}）`,
          };
        }
      }
    }

    if (isRoadEndpointGroupMarker(marker)) {
      const chain = getLinearMarkerChain(marker);
      const coordinate =
        endpoint === 'origin'
          ? findNearestChainEndpoint(reference, chain)
          : findCoordinateChainProjection(reference, chain)?.coordinate;
      if (coordinate) {
        return { coordinate, label: formatMarkerDisplayName(marker.label) };
      }
    }

    return undefined;
  };

  const normalizeLinearRoutePlanDraft = (draft: RoutePlanDraft): RoutePlanDraft => {
    const originMarker = draft.originId ? centerableMarkerById.get(draft.originId) : undefined;
    const destinationMarker = draft.destinationId
      ? centerableMarkerById.get(draft.destinationId)
      : undefined;
    const originIsLinear = Boolean(originMarker && isLinearDetailMarker(originMarker));
    const destinationIsLinear = Boolean(
      destinationMarker && isLinearDetailMarker(destinationMarker),
    );

    // 起点和终点不能同时为线性 POI；入口处已拦截，这里只做防御。
    if (!originIsLinear && !destinationIsLinear) {
      return draft;
    }
    if (originIsLinear && destinationIsLinear) {
      return draft;
    }

    let next = draft;
    if (destinationIsLinear && destinationMarker) {
      const resolved = resolveLinearRouteEndpoint(
        destinationMarker,
        'destination',
        draft.originRaw ?? draft.origin,
      );
      if (resolved) {
        next = {
          ...next,
          destination: resolved.coordinate,
          destinationLabel: resolved.label,
          destinationAccessId: undefined,
          destinationAccessLabel: undefined,
          destinationRaw: undefined,
        };
      }
    }

    if (originIsLinear && originMarker) {
      const resolved = resolveLinearRouteEndpoint(
        originMarker,
        'origin',
        next.destinationRaw ?? next.destination,
      );
      if (resolved) {
        next = {
          ...next,
          origin: resolved.coordinate,
          originLabel: resolved.label,
          originAccessId: undefined,
          originAccessLabel: undefined,
          originRaw: undefined,
        };
      }
    }

    return next;
  };

  const createRoutePlanDraft = (marker: CenterableMarker) => {
    const origin = preferredCurrentLocation;
    const resolvedDestination = isLinearDetailMarker(marker)
      ? resolveLinearRouteEndpoint(marker, 'destination', origin)
      : undefined;
    const destination = resolvedDestination?.coordinate ?? getMarkerCenter(marker);
    if (!destination) {
      return;
    }

    setRoutePlanDraft({
      destinationId: marker.id,
      originId: currentAccountLocationMarker?.id,
      originLabel: currentAccountLocationMarker
        ? t('map.location.currentAccount', {
            name:
              currentAccountLocationMarker.playerLocation?.serverAccountName ??
              currentAccountLocationMarker.label,
          })
        : t('map.route.currentLocation'),
      destinationLabel: resolvedDestination?.label ?? formatMarkerDisplayName(marker.label),
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
        ? normalizeLinearRoutePlanDraft({
            ...current,
            originId: undefined,
            origin: [mapView.centerX, mapView.centerZ],
            originLabel: formatPoint([mapView.centerX, mapView.centerZ]),
          })
        : current,
    );
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
    setSelectedRouteOptionId(null);
  };

  const swapRoutePlanEndpoints = () => {
    if (
      isLinearRouteEndpointId(routePlanDraft?.originId) &&
      isLinearRouteEndpointId(routePlanDraft?.destinationId)
    ) {
      publishToastRequested({
        dedupeKey: 'map-route-linear-endpoint',
        message: t('map.route.linearEndpointBlocked'),
        tone: 'error',
      });
      return;
    }

    setRoutePlanDraft((current) =>
      current
        ? normalizeLinearRoutePlanDraft({
            ...current,
            destinationId: current.originId,
            originId: current.destinationId,
            origin: current.destination,
            originLabel: current.destinationLabel,
            destination: current.origin,
            destinationLabel: current.originLabel,
            destinationAccessId: current.originAccessId,
            originAccessId: current.destinationAccessId,
            destinationAccessLabel: current.originAccessLabel,
            originAccessLabel: current.destinationAccessLabel,
            destinationRaw: current.originRaw,
            originRaw: current.destinationRaw,
          })
        : current,
    );
    setSelectedRouteOptionId(null);
    setEditingRouteEndpoint(null);
    setRouteEndpointQuery('');
  };

  useEffect(
    () =>
      subscribeMapRouteShortcutRequested(({ command }) => {
        if (command === 'swap_endpoints' && routePlanDraft) {
          swapRoutePlanEndpoints();
          return;
        }

        if (
          command === 'plan_focused_marker' &&
          !routePlanDraft &&
          focusedMarker &&
          isCenterableMarker(focusedMarker)
        ) {
          createRoutePlanDraft(focusedMarker);
        }
      }),
    [focusedMarker, routePlanDraft],
  );

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

    const otherIsLinear =
      endpoint === 'origin'
        ? isLinearRouteEndpointId(routePlanDraft?.destinationId)
        : isLinearRouteEndpointId(routePlanDraft?.originId);
    if (isLinearDetailMarker(marker) && otherIsLinear) {
      publishToastRequested({
        dedupeKey: 'map-route-linear-endpoint',
        message: t('map.route.linearEndpointBlocked'),
        tone: 'error',
      });
      return;
    }

    const label = formatMarkerDisplayName(marker.label);
    setRoutePlanDraft((current) => {
      if (!current) {
        return current;
      }

      const next =
        endpoint === 'origin'
          ? {
              ...current,
              originId: marker.id,
              origin: center,
              originLabel: label,
              originAccessId: undefined,
              originAccessLabel: undefined,
              originRaw: undefined,
            }
          : {
              ...current,
              destinationId: marker.id,
              destination: center,
              destinationLabel: label,
              destinationAccessId: undefined,
              destinationAccessLabel: undefined,
              destinationRaw: undefined,
            };
      return normalizeLinearRoutePlanDraft(next);
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

      const next =
        endpoint === 'origin'
          ? {
              ...current,
              originId: undefined,
              origin: coordinates,
              originLabel: label,
              originAccessId: undefined,
              originAccessLabel: undefined,
              originRaw: undefined,
            }
          : {
              ...current,
              destinationId: undefined,
              destination: coordinates,
              destinationLabel: label,
              destinationAccessId: undefined,
              destinationAccessLabel: undefined,
              destinationRaw: undefined,
            };
      return normalizeLinearRoutePlanDraft(next);
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

  const handleMapMarkerPointerDown = (event: ReactPointerEvent<Element>) => {
    if (event.pointerType === 'mouse') {
      event.stopPropagation();
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tapRef.current?.pointerId === event.pointerId) {
      tapRef.current = null;
    }
    handlePointerUp(event);
  };

  const handleMapMarkerClick = (marker: CenterableMarker) => {
    if (suppressedMarkerClickRef.current === marker.id) {
      suppressedMarkerClickRef.current = null;
      return;
    }
    handleMapMarkerActivate(marker);
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

    const isLinear = isLinearDetailMarker(marker);
    const chain = isLinear
      ? isTransitLineMarker(marker) && focusedDirectionalTransitLineRoute?.marker.id === marker.id
        ? focusedDirectionalTransitLineRoute.marker.geometry.coordinates
        : getLinearMarkerChain(marker)
      : undefined;
    const length = chain && chain.length > 1 ? getCoordinateChainDistance(chain) : 0;

    setNearbySearchCenter({
      markerId: marker.id,
      label: formatMarkerDisplayName(marker.label),
      coordinates: center,
      chain,
      kind: isLinear ? 'linear' : 'point',
      length,
    });
    setNearbyLinearRange([0, length]);
    publishMapNearbySearchScopeChanged({ markerId: marker.id, scope: 'outside' });
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
      currentAccountLocationMarker
        ? t('map.location.currentAccount', {
            name:
              currentAccountLocationMarker.playerLocation?.serverAccountName ??
              currentAccountLocationMarker.label,
          })
        : t('map.route.defaultView'),
      preferredCurrentLocation,
      mapView,
      viewportSize,
      32,
    );
    if (sharedCoordinateFocus) {
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
  }, [
    currentAccountLocationMarker,
    mapView,
    preferredCurrentLocation,
    sharedCoordinateFocus,
    t,
    viewportSize,
  ]);
  const hasMapOverlay =
    projectedGuideMarkers.length > 0 ||
    Boolean(visibleSelectedRouteTrace) ||
    visibleProjectedMarkers.length > 0 ||
    visibleProjectedLinearPois.length > 0 ||
    rawProjectedShapePois.length > 0 ||
    projectedAdministrativeAreas.length > 0 ||
    visibleProjectedRoadTraces.length > 0 ||
    visibleProjectedTransitTraces.length > 0;

  return (
    <section
      className={[
        'map-stage',
        `is-mode-${browseMode}`,
        focusedMarker || routeResultActive ? 'has-context-overlay' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="map-title"
    >
      <h1 id="map-title" className="sr-only">
        {t('map.title')}
      </h1>

      <aside
        className="map-control-stack map-sidebar-stack"
        aria-label={t('map.title')}
        ref={sidebarRef}
      >
        {routePlanDraft ? (
          <RoutePlanDraftCard
            draft={routePlanDraft}
            t={t}
            blockedByLinearEndpoints={routePlanHasTwoLinearEndpoints}
            collapsed={routePlanCollapsed}
            editingEndpoint={editingRouteEndpoint}
            enabledModes={routeTransportModes}
            endpointCandidates={routeEndpointCandidates}
            endpointQuery={routeEndpointQuery}
            mapCenterCoordinates={[mapView.centerX, mapView.centerZ]}
            secondaryPoiIndex={secondaryPoiIndex}
            options={currentRoutePlanOptions}
            sortMode={routePlanSortMode}
            status={currentRoutePlanStatus}
            selectedOptionId={selectedRouteOption?.id}
            timeMode={routePlanTimeMode}
            timeValue={routePlanTimeValue}
            onEditRequirements={() => setRoutePlanRequirementDialogOpen(true)}
            iconBaseUrl={markerIconBaseUrl}
            onBeginEndpointEdit={beginRouteEndpointEdit}
            onClear={() => {
              setRoutePlanDraft(null);
              setEditingRouteEndpoint(null);
              setRouteEndpointQuery('');
            }}
            onEndpointQueryChange={setRouteEndpointQuery}
            onSelectOption={setSelectedRouteOptionId}
            onSortModeChange={setRoutePlanSortMode}
            onSelectEndpointCandidate={applyRouteEndpointMarker}
            onShare={() => void shareRoutePlan()}
            onSwapEndpoints={swapRoutePlanEndpoints}
            onToggleCollapsed={() => setRoutePlanCollapsed((current) => !current)}
            onUseMapCenter={updateRoutePlanOriginToMapCenter}
          />
        ) : null}
        {!routePlanDraft && !focusedMarker ? (
          <div className="map-panel-section">
            <div className="search-box map-search-box">
              <span className="material-symbols-outlined" aria-hidden="true">
                search
              </span>
              <input
                ref={searchInputRef}
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
              ) : (
                <button
                  className={
                    explorePending ? 'search-random-button is-loading' : 'search-random-button'
                  }
                  type="button"
                  aria-label={t('map.explore.action')}
                  title={t('map.explore.action')}
                  aria-busy={explorePending || undefined}
                  disabled={explorePending}
                  onClick={triggerRandomExplore}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    casino
                  </span>
                </button>
              )}
            </div>
            {routePlanDraft || (focusedMarker && isCenterableMarker(focusedMarker)) ? null : (
              <div
                className={markerListExpanded ? 'map-marker-list' : 'map-marker-list is-collapsed'}
              >
                <div className="map-marker-list-header">
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
                      {markerListCategoryId === 'player'
                        ? t('map.categoryName.player')
                        : markerQuery.trim()
                          ? t('map.markerList.results')
                          : nearbySearchCenter
                            ? t(
                                nearbySearchCenter.kind === 'linear'
                                  ? 'map.markerList.nearbyLinear'
                                  : 'map.markerList.nearby',
                                { name: nearbySearchCenter.label },
                              )
                            : t('map.markerList.default')}
                    </span>
                    <span className="muted">
                      {markerListCategoryId === 'player'
                        ? t('map.markerList.playerCount', playerMarkerCounts)
                        : t('map.markerList.count', { count: sidebarMarkers.length })}
                    </span>
                  </button>
                  {markerListExpanded ? (
                    <>
                      {nearbySearchCenter ? (
                        <div className="map-nearby-search-note">
                          <span className="material-symbols-outlined" aria-hidden="true">
                            travel_explore
                          </span>
                          <span>
                            {t(
                              nearbySearchCenter.kind === 'linear'
                                ? 'map.nearby.noteLinear'
                                : 'map.nearby.note',
                              { name: nearbySearchCenter.label },
                            )}
                          </span>
                          <button
                            className="map-nearby-search-exit"
                            type="button"
                            onClick={() => setNearbySearchCenter(null)}
                          >
                            {t('map.nearby.exit')}
                          </button>
                          {nearbySearchCenter.kind === 'linear' &&
                          (nearbySearchCenter.length ?? 0) > 0 ? (
                            <div className="map-nearby-linear-range">
                              <div className="map-nearby-linear-range-head">
                                <span>{t('map.nearby.rangeLabel')}</span>
                                <strong>
                                  {t('map.nearby.rangeValue', {
                                    from: formatRoutePlanDistance(nearbyLinearRange[0], t),
                                    to: formatRoutePlanDistance(nearbyLinearRange[1], t),
                                  })}
                                </strong>
                              </div>
                              <DualRangeInput
                                aria-label={t('map.nearby.rangeAria')}
                                min={0}
                                max={Math.ceil(nearbySearchCenter.length ?? 0)}
                                step={1}
                                value={nearbyLinearRange}
                                onChange={(value) =>
                                  setNearbyLinearRange([
                                    Math.min(value[0], value[1]),
                                    Math.max(value[0], value[1]),
                                  ])
                                }
                              />
                            </div>
                          ) : null}
                          {nearbySearchRegion ? (
                            <div
                              className="map-nearby-scope-switch"
                              aria-label={t('map.nearby.scopeAria')}
                            >
                              {(['outside', 'inside'] as const).map((scope) => (
                                <button
                                  className={nearbySearchScope === scope ? 'is-active' : ''}
                                  type="button"
                                  aria-pressed={nearbySearchScope === scope}
                                  key={scope}
                                  onClick={() =>
                                    publishMapNearbySearchScopeChanged({
                                      markerId: nearbySearchCenter.markerId,
                                      scope,
                                    })
                                  }
                                >
                                  <span className="material-interaction-label">
                                    {t(
                                      scope === 'outside'
                                        ? 'map.nearby.scopeOutside'
                                        : 'map.nearby.scopeInside',
                                    )}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div
                        className={
                          markerCategoryExpanded
                            ? 'map-category-filter is-expanded'
                            : 'map-category-filter'
                        }
                      >
                        <div
                          className="map-category-strip"
                          aria-label={t('map.categoryFilter.aria')}
                        >
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
                              <span className="material-interaction-label">{category.name}</span>
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
                    </>
                  ) : null}
                </div>
                {markerListExpanded ? (
                  <div className="map-marker-list-items">
                    {sidebarMarkers.length > 0 ? (
                      sidebarMarkers.map((marker) => {
                        const center = getMarkerCenter(marker);
                        const linearProjection =
                          nearbySearchCenter?.kind === 'linear'
                            ? nearbyLinearProjectionIndex.get(marker.id)
                            : undefined;
                        const distanceDetail = linearProjection
                          ? t('map.nearby.mileage', {
                              distance: formatRoutePlanDistance(linearProjection.mileage, t),
                            })
                          : formatMarkerListDistanceDetail(marker, {
                              coordinates: nearbySearchCenter?.coordinates ?? [
                                mapView.centerX,
                                mapView.centerZ,
                              ],
                              t,
                              secondaryPoiIndex,
                            });
                        const playerPresence = marker.playerLocation?.presence;
                        const content = (
                          <>
                            <MarkerListIcon marker={marker} iconBaseUrl={markerIconBaseUrl} />
                            <span>{formatMarkerDisplayName(marker.label)}</span>
                            <span className="map-marker-list-detail">
                              {playerPresence ? (
                                <span className={`map-player-list-presence is-${playerPresence}`}>
                                  <span className="material-symbols-outlined" aria-hidden="true">
                                    {playerPresence === 'online' ? 'wifi' : 'wifi_off'}
                                  </span>
                                  {t(
                                    playerPresence === 'online'
                                      ? 'map.player.status.online'
                                      : 'map.player.status.offline',
                                  )}
                                </span>
                              ) : null}
                              <span className="muted">{distanceDetail}</span>
                            </span>
                          </>
                        );

                        return (
                          <button
                            className={[
                              'map-marker-list-item',
                              marker.id === focusedMarkerId ? 'is-active' : '',
                              playerPresence ? 'is-player' : '',
                              playerPresence === 'offline' ? 'is-offline' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
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
                      <div className="map-marker-list-empty">
                        <p>
                          {getMapMarkerListEmptyText({
                            loadStatus,
                            markerListCategoryId,
                            nearbySearchCenter,
                            t,
                          })}
                        </p>
                        {markerQuery.trim() ? (
                          <button
                            type="button"
                            onClick={() =>
                              publishGlobalSearchRequested({ query: markerQuery.trim() })
                            }
                          >
                            {t('globalSearch.searchAll', { query: markerQuery.trim() })}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        {!routePlanDraft && focusedMarker && isCenterableMarker(focusedMarker) ? (
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
                {focusedMarker.playerLocation ? (
                  <span
                    className={`map-player-presence is-${focusedMarker.playerLocation.presence}`}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {focusedMarker.playerLocation.presence === 'online' ? 'wifi' : 'wifi_off'}
                    </span>
                    {t(
                      focusedMarker.playerLocation.presence === 'online'
                        ? 'map.player.status.online'
                        : 'map.player.status.offline',
                    )}
                  </span>
                ) : (
                  <span>
                    {focusedMarkerCategoryName ??
                      focusedMarker.categoryId ??
                      t('map.poi.objectFallback')}
                  </span>
                )}
              </div>
              {!focusedMarker.playerLocation ? (
                <AdminEditLink
                  compact
                  href={
                    focusedTransitLine
                      ? `/admin/transit?section=lines&lineId=${encodeURIComponent(focusedTransitLine.id)}`
                      : `/admin/map-poi?markerId=${encodeURIComponent(focusedMarker.id)}`
                  }
                  label={focusedTransitLine ? t('admin.editLine') : t('admin.editPoi')}
                />
              ) : null}
              {focusedTransitLine ? (
                <button
                  className="icon-action-button map-line-info-button"
                  type="button"
                  aria-label={t('map.lineInfo.openAria', { name: focusedTransitLine.name })}
                  onClick={() => setLineInfoDialogOpen(true)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    info
                  </span>
                </button>
              ) : null}
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
                {!isLinearDetailMarker(focusedMarker) && !focusedMarkerIsPlayer ? (
                  <div className="map-poi-detail-tabs" aria-label={t('map.poi.tabsAria')}>
                    {[
                      ['summary', t('map.poi.summary')],
                      ['facilities', t('map.poi.facilities')],
                      ['operations', t('map.poi.operations')],
                    ].map(([tab, label]) => (
                      <button
                        className={poiDetailTab === tab ? 'is-active' : ''}
                        type="button"
                        aria-pressed={poiDetailTab === tab}
                        key={tab}
                        onClick={() => setPoiDetailTab(tab as PoiDetailTab)}
                      >
                        <span className="material-interaction-label">{label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="map-poi-detail-body">
                  {focusedTransitLine ? (
                    <TransitLineMapDetail
                      direction={focusedTransitLineDirection}
                      line={focusedTransitLine}
                      lineColor={focusedMarker.accentColor}
                      modeProfiles={transitOverview?.modeProfiles ?? []}
                      referenceCoordinate={preferredCurrentLocation}
                      segmentMinutes={focusedDirectionalTransitLineRoute?.segmentMinutes}
                      stops={focusedDirectionalTransitLineRoute?.stops}
                      onDirectionChange={(direction) =>
                        setTransitLineDirectionSelection({
                          direction,
                          lineId: focusedTransitLine.id,
                        })
                      }
                      onFocusStation={(stationName) =>
                        focusTransitStationStop(focusedTransitLine, stationName)
                      }
                      onSelectStation={(stationName) =>
                        focusTransitStationView(focusedTransitLine, stationName)
                      }
                      t={t}
                    />
                  ) : isRoadEndpointGroupMarker(focusedMarker) ? (
                    <RoadMapDetail marker={focusedMarker} t={t} />
                  ) : poiDetailTab === 'summary' ? (
                    <>
                      {focusedMarker.playerLocation ? (
                        <div className="map-player-detail-summary">
                          <div className="map-player-detail-summary-row">
                            <span>{t('map.player.serverAccount')}</span>
                            <strong>{focusedMarker.playerLocation.serverAccountName}</strong>
                          </div>
                          <p>
                            {t(
                              focusedMarker.playerLocation.presence === 'online'
                                ? 'map.player.observed'
                                : 'map.player.lastSeen',
                              {
                                time: formatPlayerLocationTimestamp(
                                  focusedMarker.playerLocation.presence === 'online'
                                    ? focusedMarker.playerLocation.observedAt
                                    : focusedMarker.playerLocation.lastSeenAt,
                                  locale,
                                ),
                              },
                            )}
                          </p>
                        </div>
                      ) : null}
                      {getMapMarkerImageUrls(focusedMarker).length > 0 ? (
                        <MapPoiImageGallery
                          imageUrls={getMapMarkerImageUrls(focusedMarker)}
                          imageAlt={t('map.poi.imageAlt', {
                            name: formatMarkerDisplayName(focusedMarker.label),
                          })}
                          previousLabel={t('map.poi.imagePrevious')}
                          nextLabel={t('map.poi.imageNext')}
                          counterLabel={(current, total) =>
                            t('map.poi.imageCounter', { current, total })
                          }
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
                        {focusedMarker.address ? (
                          <div>
                            <dt>{t('map.poi.address')}</dt>
                            <dd>{focusedMarker.address}</dd>
                          </div>
                        ) : null}
                        {focusedMarker.floorLabel ? (
                          <div>
                            <dt>{t('map.poi.floor')}</dt>
                            <dd>{focusedMarker.floorLabel}</dd>
                          </div>
                        ) : null}
                        {focusedMarker.openingHours ? (
                          <div>
                            <dt>{t('map.poi.openingHours')}</dt>
                            <dd>{focusedMarker.openingHours}</dd>
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
                                className="map-poi-parent-link"
                                type="button"
                                onClick={() => focusMapMarker(focusedParentPoi.parent)}
                              >
                                {formatMarkerDisplayName(focusedParentPoi.parent.label)}
                              </button>
                            </dd>
                          </div>
                        ) : null}
                        {focusedBoundRegions.length > 0 ? (
                          <div>
                            <dt>{t('map.poi.boundRegions')}</dt>
                            <dd>
                              <span className="map-transfer-line-list">
                                {focusedBoundRegions.map((region) => (
                                  <button
                                    className="map-transfer-line-chip map-poi-region-chip"
                                    type="button"
                                    key={region.id}
                                    onClick={() => focusMapMarker(region)}
                                  >
                                    {formatMarkerDisplayName(region.label)}
                                  </button>
                                ))}
                              </span>
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
                    </>
                  ) : null}
                  {!isLinearDetailMarker(focusedMarker) &&
                  !focusedMarkerIsPlayer &&
                  poiDetailTab === 'facilities' ? (
                    <>
                      {focusedTransitStationDetails.length > 0 ? (
                        <TransitStationInfrastructureDetail
                          details={focusedTransitStationDetails}
                          lines={transitOverview?.lines ?? []}
                          key={focusedMarker.id}
                          t={t}
                        />
                      ) : null}
                      {focusedMarker.facilities?.length ? (
                        <div className="map-poi-facility-list">
                          {focusedMarker.facilities.map((facility, index) => (
                            <div
                              className="map-poi-facility-item"
                              key={`${facility.symbolIcon}-${index}`}
                            >
                              <MaterialSymbol name={facility.symbolIcon} aria-hidden="true" />
                              <span>{facility.description}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {focusedSecondaryPois.length > 0 ? (
                        <div
                          className="map-poi-related-list"
                          aria-label={t('map.poi.relatedPlaces')}
                        >
                          <div className="map-poi-related-filters">
                            <label className="map-poi-related-keyword">
                              <span>{t('map.poi.filterKeyword')}</span>
                              <input
                                type="search"
                                value={secondaryPoiKeyword}
                                onChange={(event) =>
                                  setSecondaryPoiKeyword(event.currentTarget.value)
                                }
                                placeholder={t('map.poi.filterKeywordPlaceholder')}
                              />
                            </label>
                            <div className="map-poi-related-filter-section">
                              <span>{t('map.poi.filterCategory')}</span>
                              <div
                                className={
                                  secondaryPoiCategoryExpanded
                                    ? 'map-category-filter is-expanded'
                                    : 'map-category-filter'
                                }
                              >
                                <div
                                  className="map-category-strip"
                                  aria-label={t('map.poi.filterCategory')}
                                >
                                  {['all', ...focusedSecondaryPoiCategoryOptions].map(
                                    (categoryId) => (
                                      <button
                                        className={
                                          secondaryPoiCategoryFilter === categoryId
                                            ? 'map-category-pill is-active'
                                            : 'map-category-pill'
                                        }
                                        type="button"
                                        key={categoryId}
                                        onClick={() => setSecondaryPoiCategoryFilter(categoryId)}
                                      >
                                        <span className="material-interaction-label">
                                          {categoryId === 'all'
                                            ? t('map.poi.filterAll')
                                            : (categoryById.get(categoryId) ??
                                              getMarkerCategoryDisplayName(categoryId, t))}
                                        </span>
                                      </button>
                                    ),
                                  )}
                                </div>
                                {focusedSecondaryPoiCategoryOptions.length > 3 ? (
                                  <button
                                    className="map-category-toggle"
                                    type="button"
                                    aria-expanded={secondaryPoiCategoryExpanded}
                                    aria-label={
                                      secondaryPoiCategoryExpanded
                                        ? t('map.categoryFilter.collapse')
                                        : t('map.categoryFilter.expand')
                                    }
                                    onClick={() =>
                                      setSecondaryPoiCategoryExpanded((current) => !current)
                                    }
                                  >
                                    <span className="material-symbols-outlined" aria-hidden="true">
                                      {secondaryPoiCategoryExpanded
                                        ? 'keyboard_arrow_up'
                                        : 'keyboard_arrow_down'}
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {focusedSecondaryPoiFloorOptions.length > 0 ? (
                              <div className="map-poi-related-filter-section">
                                <span>{t('map.poi.filterFloor')}</span>
                                <div
                                  className={
                                    secondaryPoiFloorExpanded
                                      ? 'map-category-filter is-expanded'
                                      : 'map-category-filter'
                                  }
                                >
                                  <div
                                    className="map-category-strip"
                                    aria-label={t('map.poi.filterFloor')}
                                  >
                                    {['all', ...focusedSecondaryPoiFloorOptions].map(
                                      (floorLabel) => (
                                        <button
                                          className={
                                            secondaryPoiFloorFilter === floorLabel
                                              ? 'map-category-pill is-active'
                                              : 'map-category-pill'
                                          }
                                          type="button"
                                          key={floorLabel}
                                          onClick={() => setSecondaryPoiFloorFilter(floorLabel)}
                                        >
                                          <span className="material-interaction-label">
                                            {floorLabel === 'all'
                                              ? t('map.poi.filterAll')
                                              : floorLabel}
                                          </span>
                                        </button>
                                      ),
                                    )}
                                  </div>
                                  {focusedSecondaryPoiFloorOptions.length > 3 ? (
                                    <button
                                      className="map-category-toggle"
                                      type="button"
                                      aria-expanded={secondaryPoiFloorExpanded}
                                      aria-label={
                                        secondaryPoiFloorExpanded
                                          ? t('map.categoryFilter.collapse')
                                          : t('map.categoryFilter.expand')
                                      }
                                      onClick={() =>
                                        setSecondaryPoiFloorExpanded((current) => !current)
                                      }
                                    >
                                      <span
                                        className="material-symbols-outlined"
                                        aria-hidden="true"
                                      >
                                        {secondaryPoiFloorExpanded
                                          ? 'keyboard_arrow_up'
                                          : 'keyboard_arrow_down'}
                                      </span>
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {focusedSecondaryPoiGroups.map((group) => (
                            <section className="map-poi-related-group" key={group.id}>
                              <h4>
                                <span>
                                  {formatSecondaryPoiGroupLabel(group.id, group.label, t)}
                                </span>
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
                                        {item.marker.floorLabel
                                          ? ` · ${item.marker.floorLabel}`
                                          : ''}
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
                                  <strong>
                                    {formatMarkerDisplayName(focusedParentPoi.parent.label)}
                                  </strong>
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
                      ) : focusedMarker.facilities?.length ? null : (
                        <p>{t('map.poi.noFacilities')}</p>
                      )}
                    </>
                  ) : null}
                  {!isLinearDetailMarker(focusedMarker) &&
                  !focusedMarkerIsPlayer &&
                  poiDetailTab === 'operations' ? (
                    <PoiOperationsMessageList
                      items={focusedPoiOperations}
                      loading={focusedPoiOperationsLoading}
                      t={t}
                    />
                  ) : null}
                </div>
                {/* 操作底栏固定在滚动区外：线性要素（公交线路/道路端点组）常显，其余仅摘要标签页显示 */}
                {isLinearDetailMarker(focusedMarker) || poiDetailTab === 'summary' ? (
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
        onPointerCancel={handlePointerCancel}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {visibleTiles ? (
          <div className="unmined-tile-stack" aria-hidden="true">
            <TileLayerView
              layer={visibleTiles}
              className="unmined-tile-layer"
              key={`tile-${visibleTiles.zoom}`}
            />
          </div>
        ) : null}

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
          <div className="map-hud-chips">
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
                        count:
                          pointMarkers.length +
                          endpointGroupMarkers.length +
                          shapeMarkers.length +
                          transitLineMarkers.length,
                      })
                    : t('map.source.unavailable')}
              </span>
            </div>
            <div className="map-coordinate-chip">
              <span className="material-symbols-outlined" aria-hidden="true">
                {nearbySearchCenter ? 'gps_fixed' : 'near_me'}
              </span>
              <span>
                {nearbySearchCenter
                  ? `X ${formatMapCoordinate(nearbySearchCenter.coordinates[0])} / Z ${formatMapCoordinate(nearbySearchCenter.coordinates[1])}`
                  : cursorWorld
                    ? `X ${formatMapCoordinate(cursorWorld.x)} / Z ${formatMapCoordinate(cursorWorld.z)}`
                    : t('map.hud.cursor')}
              </span>
            </div>
          </div>
        </div>

        {hasMapOverlay || Boolean(visibleTiles?.tiles.length) ? (
          <div className="map-marker-layer" aria-label={t('map.overlay.aria')}>
            {projectedAdministrativeAreas.length > 0 ? (
              <div className="map-administrative-area-layer">
                <svg
                  viewBox={`0 0 ${Math.max(1, viewportSize.width)} ${Math.max(1, viewportSize.height)}`}
                  aria-hidden="true"
                >
                  {projectedAdministrativeAreas
                    .filter((area) => area.area.id === selectedAdministrativeAreaId)
                    .map((area) => (
                      <path
                        className="is-selected"
                        d={area.path}
                        key={area.area.id}
                        style={
                          {
                            '--administrative-area-fill': area.fillColor,
                            '--administrative-area-fill-opacity':
                              area.area.style?.fillOpacity ?? 0.14,
                            '--administrative-area-stroke': area.strokeColor,
                            '--administrative-area-stroke-opacity':
                              area.area.style?.strokeOpacity ?? 0.72,
                          } as CSSProperties
                        }
                      />
                    ))}
                </svg>
                {projectedAdministrativeAreas
                  .filter((area) => area.showLabel)
                  .map((area) => (
                    <button
                      className={`map-administrative-area-label${
                        area.area.id === selectedAdministrativeAreaId ? ' is-selected' : ''
                      }`}
                      key={`${area.area.id}-label`}
                      type="button"
                      aria-pressed={area.area.id === selectedAdministrativeAreaId}
                      style={
                        {
                          '--administrative-area-left': `${area.centerLeft}px`,
                          '--administrative-area-top': `${area.centerTop}px`,
                        } as CSSProperties
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        setFocusedMarkerId(null);
                        setSelectedAdministrativeAreaId((current) =>
                          current === area.area.id ? null : area.area.id,
                        );
                      }}
                    >
                      {area.area.name}
                    </button>
                  ))}
              </div>
            ) : null}
            {rawAreaFillShapePois.length > 0 ? (
              <div className="map-shape-poi-layer map-shape-poi-fill-layer">
                <svg
                  viewBox={`0 0 ${Math.max(1, viewportSize.width)} ${Math.max(1, viewportSize.height)}`}
                  aria-hidden="true"
                >
                  {rawAreaFillShapePois.map((shape) => (
                    <path
                      key={`${shape.id}-area-fill`}
                      className="map-shape-poi-path is-area"
                      d={shape.path}
                      style={
                        {
                          '--shape-poi-fill-color': shape.fillColor ?? shape.accentColor,
                          '--shape-poi-fill-opacity': shape.fillOpacity ?? 0.18,
                        } as CSSProperties
                      }
                    />
                  ))}
                </svg>
              </div>
            ) : null}
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
            {nearbyLinearRangeTrace ? (
              <div className="map-nearby-range-trace-layer" aria-hidden="true">
                <svg
                  className="map-trace-block map-nearby-range-trace"
                  viewBox={nearbyLinearRangeTrace.viewBox}
                  preserveAspectRatio="none"
                  style={
                    {
                      '--trace-left': `${nearbyLinearRangeTrace.left}px`,
                      '--trace-top': `${nearbyLinearRangeTrace.top}px`,
                      '--trace-width': `${nearbyLinearRangeTrace.width}px`,
                      '--trace-height': `${nearbyLinearRangeTrace.height}px`,
                    } as CSSProperties
                  }
                >
                  <path className="map-nearby-range-trace-halo" d={nearbyLinearRangeTrace.path} />
                  <path className="map-nearby-range-trace-core" d={nearbyLinearRangeTrace.path} />
                  <circle
                    className="map-nearby-range-trace-endpoint"
                    cx={nearbyLinearRangeTrace.startLeft}
                    cy={nearbyLinearRangeTrace.startTop}
                    r={5}
                  />
                  <circle
                    className="map-nearby-range-trace-endpoint"
                    cx={nearbyLinearRangeTrace.endLeft}
                    cy={nearbyLinearRangeTrace.endTop}
                    r={5}
                  />
                </svg>
                <span
                  className="map-nearby-range-label is-start"
                  style={{
                    left: `${nearbyLinearRangeTrace.left + nearbyLinearRangeTrace.startLeft}px`,
                    top: `${nearbyLinearRangeTrace.top + nearbyLinearRangeTrace.startTop}px`,
                  }}
                >
                  {formatRoutePlanDistance(Math.min(nearbyLinearRange[0], nearbyLinearRange[1]), t)}
                </span>
                <span
                  className="map-nearby-range-label is-end"
                  style={{
                    left: `${nearbyLinearRangeTrace.left + nearbyLinearRangeTrace.endLeft}px`,
                    top: `${nearbyLinearRangeTrace.top + nearbyLinearRangeTrace.endTop}px`,
                  }}
                >
                  {formatRoutePlanDistance(Math.max(nearbyLinearRange[0], nearbyLinearRange[1]), t)}
                </span>
              </div>
            ) : null}
            {visibleSelectedRouteTrace ? (
              <div className="map-route-trace-layer" aria-hidden="true">
                <TraceLayerView
                  trace={visibleSelectedRouteTrace}
                  kind="route"
                  title={t('map.route.traceTitle', {
                    title: selectedRouteOption?.title ?? t('map.route.optionFallback'),
                  })}
                />
                {visibleSelectedRouteTrace.labels?.map((label) => (
                  <span
                    className={
                      label.isVerticalLabel
                        ? 'map-route-road-label is-vertical'
                        : 'map-route-road-label'
                    }
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
            {rawProjectedShapePois.length > 0 ? (
              <div
                className={
                  poiCoordinatePickMode
                    ? 'map-shape-poi-layer is-coordinate-pick-through'
                    : 'map-shape-poi-layer'
                }
              >
                <svg
                  viewBox={`0 0 ${Math.max(1, viewportSize.width)} ${Math.max(1, viewportSize.height)}`}
                  aria-hidden="true"
                >
                  {rawProjectedShapePois.map((shape) => {
                    const source = shapeOverlaySource.find((marker) => marker.id === shape.id);
                    return (
                      <g key={`${shape.id}-shape`}>
                        {shape.basePath ? (
                          <path
                            className={`map-shape-poi-path is-area is-extrusion-base${
                              shape.isRegionMarker ? ' is-region-marker' : ''
                            }`}
                            d={shape.basePath}
                            style={
                              {
                                '--shape-poi-color': shape.strokeColor ?? shape.accentColor,
                                '--shape-poi-fill-color': shape.fillColor ?? shape.accentColor,
                                '--shape-poi-fill-opacity': shape.fillOpacity ?? 0.18,
                              } as CSSProperties
                            }
                          />
                        ) : null}
                        <path
                          className={[
                            'map-shape-poi-path',
                            shape.isArea ? 'is-area' : 'is-line',
                            shape.isRegionMarker ? 'is-region-marker' : '',
                            shape.id === focusedMarkerId ? 'is-selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          d={shape.path}
                          data-map-marker-id={source?.id}
                          onPointerDown={shape.isArea ? undefined : handleMapMarkerPointerDown}
                          onClick={
                            shape.isArea
                              ? undefined
                              : () => {
                                  if (source) {
                                    handleMapMarkerClick(source);
                                  }
                                }
                          }
                          style={
                            {
                              '--shape-poi-color': shape.accentColor,
                              '--shape-poi-stroke-color': shape.strokeColor ?? shape.accentColor,
                              '--shape-poi-stroke-opacity': shape.strokeOpacity ?? 1,
                              '--shape-poi-fill-color': shape.fillColor ?? shape.accentColor,
                              '--shape-poi-fill-opacity': shape.fillOpacity ?? 0,
                              pointerEvents:
                                poiCoordinatePickMode || shape.isArea ? 'none' : undefined,
                            } as CSSProperties
                          }
                        >
                          <title>{shape.label}</title>
                        </path>
                      </g>
                    );
                  })}
                </svg>
                {fadeShapePois.map(({ item: shape, leaving }) => {
                  const source = shapeOverlaySource.find((marker) => marker.id === shape.id);
                  return source ? (
                    <button
                      className={[
                        'map-shape-poi-center',
                        `is-${shape.labelMode}`,
                        shape.isArea ? 'is-area-poi' : '',
                        shape.id === focusedMarkerId ? 'is-selected' : '',
                        leaving ? 'is-overlay-leaving' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      data-map-marker-id={source.id}
                      key={`${shape.id}-center`}
                      onPointerDown={handleMapMarkerPointerDown}
                      onClick={() => handleMapMarkerClick(source)}
                      style={
                        {
                          '--shape-poi-left': `${shape.centerLeft}px`,
                          '--shape-poi-top': `${shape.centerTop}px`,
                          '--shape-poi-color': shape.isArea
                            ? (shape.fillColor ?? shape.strokeColor ?? shape.accentColor)
                            : shape.accentColor,
                        } as CSSProperties
                      }
                    >
                      {shape.labelMode === 'representative' ? (
                        <MarkerListIcon marker={source} iconBaseUrl={markerIconBaseUrl} />
                      ) : null}
                      {shape.showLabel ? (
                        <span className="map-marker-label">{shape.label}</span>
                      ) : null}
                    </button>
                  ) : null;
                })}
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
                {marker.kind === 'default-anchor' ? null : (
                  <span className="map-guide-marker-badge">{marker.label}</span>
                )}
              </div>
            ))}
            {fadeLinearPois.map(({ item: marker, leaving }) => {
              const sourceMarker = linearOverlaySource.find((item) => item.id === marker.id);
              const focusLinearMarker = () => {
                if (sourceMarker) {
                  handleMapMarkerClick(sourceMarker);
                }
              };

              return (
                <div
                  className={leaving ? 'map-linear-poi is-overlay-leaving' : 'map-linear-poi'}
                  key={marker.id}
                >
                  {marker.endpoints.map((endpoint) => (
                    <button
                      className="map-linear-poi-endpoint"
                      type="button"
                      aria-label={t('map.overlay.viewMarker', { name: marker.label })}
                      data-map-marker-id={sourceMarker?.id}
                      key={endpoint.id}
                      onPointerDown={handleMapMarkerPointerDown}
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
                        marker.roadKind &&
                        marker.showTextLabel &&
                        !marker.iconUrl &&
                        !marker.dynamicSymbol
                          ? 'is-road-label'
                          : '',
                        marker.isVerticalLabel ? 'is-vertical' : '',
                        marker.hideIcon ? 'is-icon-hidden' : '',
                        marker.iconUrl || marker.dynamicSymbol || marker.symbolIcon
                          ? 'has-icon'
                          : '',
                        marker.id === focusedMarkerId ? 'is-selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      type="button"
                      data-map-marker-id={sourceMarker?.id}
                      onPointerDown={handleMapMarkerPointerDown}
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
                      {marker.dynamicSymbol ? (
                        <DynamicMapMarkerSymbol symbol={marker.dynamicSymbol} />
                      ) : marker.iconUrl ? (
                        <img src={marker.iconUrl} alt="" draggable={false} />
                      ) : marker.symbolIcon ? (
                        <MaterialSymbol
                          className="map-linear-poi-symbol"
                          name={marker.symbolIcon}
                          aria-hidden="true"
                        />
                      ) : null}
                      {marker.showTextLabel ? (
                        <span className="map-marker-label">{marker.label}</span>
                      ) : null}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {renderedFadeMarkers.map(({ item: marker, leaving }) => (
              <button
                className={[
                  'map-marker-dot',
                  !marker.isPlayer && (marker.showLabel || marker.id === focusedMarkerId)
                    ? 'has-label'
                    : '',
                  !marker.iconUrl && !marker.hideIcon ? 'has-fallback-icon' : '',
                  marker.hideIcon ? 'is-icon-hidden' : '',
                  marker.id === focusedMarkerId ? 'is-selected' : '',
                  marker.roadKind ? `is-${marker.roadKind}` : '',
                  marker.playerPresence === 'offline' ? 'is-offline' : '',
                  marker.isPlayer ? 'is-player' : '',
                  marker.isCurrentAccount ? 'is-current-account' : '',
                  marker.transitOperationStatus === 'planned' ? 'is-transit-planned' : '',
                  leaving ? 'is-overlay-leaving' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                aria-label={t('map.overlay.viewMarker', { name: marker.label })}
                data-map-marker-id={marker.id}
                key={marker.id}
                onPointerDown={handleMapMarkerPointerDown}
                onClick={() => {
                  const source = pointMarkers.find((item) => item.id === marker.id);
                  if (source) {
                    handleMapMarkerClick(source);
                  }
                }}
                style={
                  {
                    '--marker-left': `${marker.left}px`,
                    '--marker-top': `${marker.top}px`,
                    // 选中描边与填充共用分类色，避免和分类图标的主色脱节。
                    '--map-marker-accent-color': getMapAreaFillColor(marker.categoryId),
                  } as CSSProperties
                }
                title={t('map.overlay.markerTitle', {
                  name: marker.label,
                  x: marker.x,
                  z: marker.z,
                })}
              >
                {marker.transitOperationStatus === 'planned' ? (
                  <span className="map-transit-planned-station" aria-hidden="true" />
                ) : marker.dynamicSymbol ? (
                  <DynamicMapMarkerSymbol symbol={marker.dynamicSymbol} />
                ) : marker.iconUrl ? (
                  <img src={marker.iconUrl} alt="" draggable={false} />
                ) : null}
                <MaterialSymbol name={marker.symbolIcon ?? 'location_on'} aria-hidden="true" />
                {!marker.isPlayer && (marker.showLabel || marker.id === focusedMarkerId) ? (
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
            <p>{loadStatus === 'loading' ? t('map.empty.loading') : t('map.empty.unavailable')}</p>
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
          <SegmentedControl
            className="map-browse-mode-control"
            role="tablist"
            ariaLabel={t('map.layer.modeAria')}
            value={browseMode}
            onChange={setBrowseMode}
            options={mapBrowseModes.map((mode) => ({
              value: mode.value,
              label: (
                <>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {mode.icon}
                  </span>
                  <span>{t(mode.labelKey)}</span>
                </>
              ),
            }))}
          />
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
                  name:
                    activeTileProviderName ??
                    activeTileProvider?.name ??
                    t('map.source.tileFallback'),
                })
              : browseMode === 'road-network'
                ? t('map.layer.noteRoadNetwork')
                : t('map.layer.noteTraffic')}
          </p>
          <div className="map-layer-option-list">
            <MapLayerToggle
              icon="location_on"
              title={t('map.layer.markers')}
              detail={markersVisible ? t('map.layer.markersVisible') : t('map.layer.markersHidden')}
              checked={markersVisible}
              onChange={setMarkersVisible}
            />
            {browseMode !== 'satellite' ? (
              <MapLayerToggle
                icon="view_in_ar"
                title={t('map.layer.perspective')}
                detail={
                  perspective2_5dVisible
                    ? t('map.layer.perspectiveVisible')
                    : t('map.layer.perspectiveHidden')
                }
                checked={perspective2_5dVisible}
                onChange={setPerspective2_5dVisible}
              />
            ) : null}
            <MapLayerToggle
              icon="person_pin_circle"
              title={t('map.layer.players')}
              detail={playersVisible ? t('map.layer.playersVisible') : t('map.layer.playersHidden')}
              checked={playersVisible}
              onChange={setPlayersVisible}
            />
            <MapLayerToggle
              icon="route"
              title={t('map.layer.linearFeatures')}
              detail={
                linearFeaturesVisible
                  ? t('map.layer.linearFeaturesVisible')
                  : t('map.layer.linearFeaturesHidden')
              }
              checked={linearFeaturesVisible}
              onChange={setLinearFeaturesVisible}
            />
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
      {lineInfoDialogOpen && focusedTransitLine ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setLineInfoDialogOpen(false)}
        >
          <section
            className="modal-panel map-line-info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-line-info-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <h2 id="map-line-info-title">
                {t('map.lineInfo.title', { name: focusedTransitLine.name })}
              </h2>
              <button
                className="icon-action-button"
                type="button"
                aria-label={t('map.poi.close')}
                onClick={() => setLineInfoDialogOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
            <dl className="line-attribute-list">
              <div>
                <dt>{t('lineDetail.firstLast')}</dt>
                <dd>{formatTransitLineTime(focusedTransitLine, t)}</dd>
              </div>
              <div>
                <dt>{t('lineDetail.operator')}</dt>
                <dd>
                  <TransitOperatorName
                    name={focusedTransitLine.operator}
                    url={focusedTransitLine.operatorUrl}
                    fallback={t('lineDetail.toBeAdded')}
                  />
                </dd>
              </div>
              <div>
                <dt>{t('map.lineDetail.fare')}</dt>
                <dd>
                  {formatFareTextWithoutCurrencyUnit(focusedTransitLine.fare) ??
                    t('lineDetail.toBeAdded')}
                </dd>
              </div>
              <div>
                <dt>{t('map.lineDetail.stations')}</dt>
                <dd>
                  {focusedTransitLine.displayFirstStationName &&
                  focusedTransitLine.displayLastStationName
                    ? `${focusedTransitLine.displayFirstStationName} → ${focusedTransitLine.displayLastStationName}`
                    : focusedTransitLine.firstStationName && focusedTransitLine.lastStationName
                      ? `${focusedTransitLine.firstStationName} → ${focusedTransitLine.lastStationName}`
                      : t('lineDetail.extra.stations', {
                          count:
                            focusedTransitLine.stationStops?.length ??
                            focusedTransitLine.stationNames.length,
                        })}
                </dd>
              </div>
            </dl>
          </section>
        </div>
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
            <form className="map-poi-submit-form" id={poiSubmitFormId} onSubmit={submitPoi}>
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
                <span>{t('map.poiSubmit.openingHours')}</span>
                <input
                  value={poiOpeningHours}
                  onChange={(event) => setPoiOpeningHours(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.openingHoursPlaceholder')}
                  aria-label={t('map.poiSubmit.openingHours')}
                  maxLength={500}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.address')}</span>
                <input
                  value={poiAddress}
                  onChange={(event) => updatePoiAddress(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.addressPlaceholder')}
                  aria-label={t('map.poiSubmit.address')}
                  maxLength={300}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.floor')}</span>
                <input
                  value={poiFloorLabel}
                  onChange={(event) => setPoiFloorLabel(event.currentTarget.value)}
                  placeholder={t('map.poiSubmit.floorPlaceholder')}
                  aria-label={t('map.poiSubmit.floor')}
                  maxLength={40}
                />
              </label>
              <label>
                <span>{t('map.poiSubmit.addressRoad')}</span>
                <select
                  value={poiAddressRoadMarkerId}
                  disabled={!poiAddress.trim()}
                  onChange={(event) => setPoiAddressRoadMarkerId(event.currentTarget.value)}
                  aria-label={t('map.poiSubmit.addressRoad')}
                >
                  <option value="">{t('map.poiSubmit.noAddressRoad')}</option>
                  {poiAddressRoadOptions.map((marker) => (
                    <option value={marker.id} key={marker.id}>
                      {marker.label}
                    </option>
                  ))}
                </select>
              </label>
              <PoiFacilityEditor facilities={poiFacilities} onChange={setPoiFacilities} />
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
                  multiple
                  accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                  onChange={(event) =>
                    setPoiImageFiles(Array.from(event.currentTarget.files ?? []).slice(0, 12))
                  }
                  aria-label={t('map.poiSubmit.imageFile')}
                />
                {poiImageFiles.length > 0 ? (
                  <small>
                    {t('map.poiSubmit.imageFileCount', { count: poiImageFiles.length })}
                  </small>
                ) : null}
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
            </form>
            {poiSubmitStatus ? <p className="map-source-note">{poiSubmitStatus}</p> : null}
            <div className="admin-content-actions">
              <button
                className="secondary-action-button is-primary"
                type="submit"
                form={poiSubmitFormId}
                disabled={poiSubmitBusy || publicPoiCategories.length === 0}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload
                </span>
                <span>
                  {poiSubmitBusy ? t('map.poiSubmit.submitting') : t('map.poiSubmit.submit')}
                </span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {routePlanRequirementDialogOpen && routePlanDraft ? (
        <RouteRequirementDialog
          enabledModes={routeTransportModes}
          timeMode={routePlanTimeMode}
          timeValue={routePlanTimeValue}
          t={t}
          onCancel={() => setRoutePlanRequirementDialogOpen(false)}
          onConfirm={({ enabledModes, timeMode, timeValue }) => {
            setRouteTransportModes(enabledModes);
            setRoutePlanTimeMode(timeMode);
            setRoutePlanTimeValue(timeValue);
            setRoutePlanRequirementDialogOpen(false);
          }}
        />
      ) : null}
      {shareTarget ? (
        <MapShareDialog
          locale={locale}
          target={shareTarget}
          t={t}
          onClose={() => setShareTarget(null)}
        />
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
}: Readonly<{
  locale: LocaleCode;
  target: MapShareTarget;
  t: Translate;
  onClose: () => void;
}>) {
  const previewRef = useRef<HTMLElement | null>(null);
  const [busyMode, setBusyMode] = useState<MapShareMode | null>(null);
  const [copyKind, setCopyKind] = useState<MapShareCopyKind>('link');
  const [busyCopy, setBusyCopy] = useState<MapShareCopyKind | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [shortShareUrl, setShortShareUrl] = useState<string | null>(null);
  const [shortShareLinkLoading, setShortShareLinkLoading] = useState(true);
  const payload = useMemo(
    () => buildMapSharePayload(target, t, shortShareUrl ?? undefined),
    [shortShareUrl, t, target],
  );
  const copyOptions = useMemo(
    () => mapShareCopyKinds.filter((kind) => Boolean(getMapShareCopyValue(payload, kind))),
    [payload],
  );
  const selectedCopyKind = copyOptions.includes(copyKind) ? copyKind : copyOptions[0];
  const useWordmarkLogo = locale !== 'en';

  useEffect(() => {
    let cancelled = false;
    setShortShareLinkLoading(true);
    setShortShareUrl(null);
    void createMapShortShareLink(target)
      .then((url) => {
        if (!cancelled) {
          setShortShareUrl(url);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setShortShareLinkLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    let cancelled = false;
    setQrCodeDataUrl('');
    void QRCode.toDataURL(payload.url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 104,
      color: {
        dark: '#263c3a',
        light: '#ffffff',
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrCodeDataUrl('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [payload.url]);

  useEffect(() => {
    if (selectedCopyKind && selectedCopyKind !== copyKind) {
      setCopyKind(selectedCopyKind);
    }
  }, [copyKind, selectedCopyKind]);

  const performShare = async (mode: MapShareMode) => {
    setBusyMode(mode);

    try {
      const status = await runMapShareAction({
        mode,
        payload,
        previewElement: previewRef.current,
        t,
      });
      publishToastRequested({
        dedupeKey: 'map-share-action',
        message: status,
        tone: 'success',
      });
      onClose();
    } catch {
      publishToastRequested({
        dedupeKey: 'map-share-action',
        message: t('map.share.unavailable'),
        tone: 'error',
      });
    } finally {
      setBusyMode(null);
    }
  };

  const performCopy = async () => {
    if (!selectedCopyKind) {
      return;
    }
    const value = getMapShareCopyValue(payload, selectedCopyKind);
    if (!value) {
      return;
    }

    const successMessage = t(mapShareCopySuccessKeys[selectedCopyKind]);
    const kind = selectedCopyKind;
    setBusyCopy(kind);
    try {
      await copyTextToClipboard(value);
      publishToastRequested({
        dedupeKey: 'map-share-action',
        message: successMessage,
        tone: 'success',
      });
    } catch {
      publishToastRequested({
        dedupeKey: 'map-share-action',
        message: t('map.share.unavailable'),
        tone: 'error',
      });
    } finally {
      setBusyCopy(null);
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
              {payload.meta.map((item, index) => (
                <span key={`${item}-${index}`}>{item}</span>
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
            <div className="map-share-preview-footer-copy">
              <span>{t('map.share.footerPrefix')}</span>
              {useWordmarkLogo ? (
                <BrandWordmark />
              ) : (
                <span className="map-share-preview-footer-brand">
                  <BrandSymbol />
                  <strong>Yuchengtong</strong>
                </span>
              )}
              <small>{t('map.share.footerDisclaimer')}</small>
            </div>
            {qrCodeDataUrl ? (
              <img
                className="map-share-preview-qr"
                src={qrCodeDataUrl}
                alt={t('map.share.qrCode')}
              />
            ) : (
              <span className="map-share-preview-qr-placeholder" aria-hidden="true" />
            )}
          </footer>
          <p className="map-share-preview-url">{payload.url}</p>
        </article>
        <div className="map-share-actions" aria-label={t('map.share.actions')}>
          {copyOptions.length > 0 ? (
            <div className="map-share-copy-control">
              <label className="map-share-copy-select">
                <span className="material-symbols-outlined" aria-hidden="true">
                  content_copy
                </span>
                <span>
                  <strong>{t('map.share.copyKind')}</strong>
                  <select
                    value={selectedCopyKind ?? ''}
                    onChange={(event) => setCopyKind(event.currentTarget.value as MapShareCopyKind)}
                    disabled={busyMode !== null || busyCopy !== null}
                    aria-label={t('map.share.copyKind')}
                  >
                    {copyOptions.map((kind) => (
                      <option value={kind} key={kind}>
                        {t(mapShareCopyLabelKeys[kind])}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <button
                className="secondary-action-button"
                type="button"
                aria-busy={
                  busyCopy !== null || (selectedCopyKind === 'link' && shortShareLinkLoading)
                }
                disabled={
                  busyMode !== null ||
                  busyCopy !== null ||
                  !selectedCopyKind ||
                  (selectedCopyKind === 'link' && shortShareLinkLoading)
                }
                onClick={() => void performCopy()}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {busyCopy || (selectedCopyKind === 'link' && shortShareLinkLoading)
                    ? 'progress_activity'
                    : 'content_copy'}
                </span>
                <span>
                  {busyCopy || (selectedCopyKind === 'link' && shortShareLinkLoading)
                    ? t('map.share.processing')
                    : t('map.share.copy')}
                </span>
              </button>
            </div>
          ) : null}
          {mapShareModes.map((mode) => (
            <button
              className={
                mode === 'image' ? 'secondary-action-button is-primary' : 'secondary-action-button'
              }
              type="button"
              key={mode}
              aria-busy={busyMode === mode || (mode === 'link' && shortShareLinkLoading)}
              disabled={
                busyMode !== null ||
                busyCopy !== null ||
                (mode === 'image' && !qrCodeDataUrl) ||
                (mode === 'link' && shortShareLinkLoading)
              }
              onClick={() => void performShare(mode)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {mode === 'link' && shortShareLinkLoading
                  ? 'progress_activity'
                  : mapShareModeIcons[mode]}
              </span>
              <span>
                {busyMode === mode || (mode === 'link' && shortShareLinkLoading)
                  ? t('map.share.processing')
                  : t(mapShareModeLabelKeys[mode])}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

type TransitLineMarker = EndpointGroupMarker & {
  categoryId: 'transit-line';
  geometry: Extract<MapGeometry, { type: 'MultiPoint' }>;
};

type ShapeMarker = LocalizedMapMarker & {
  geometry: Exclude<MapGeometry, { type: 'Point' } | { type: 'MultiPoint' }>;
};

type SidebarMarker = CenterableMarker;

function isCenterableMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is CenterableMarker {
  return getMapGeometryCoordinates(marker.geometry).length > 0;
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
        : ['map-transit-trace', trace.isSelected ? 'is-selected' : ''].filter(Boolean).join(' ');

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
      {kind === 'transit' && trace.transitSegments?.length ? (
        trace.transitSegments.map((segment, index) => (
          <path
            className={`${pathClassName}${
              segment.operationStatus === 'planned' ? ' is-planned' : ''
            }`}
            d={segment.path}
            key={`${trace.id}-transit-segment-${index}`}
            style={{
              stroke: segment.operationStatus === 'planned' ? '#7A8380' : trace.accentColor,
            }}
          >
            <title>{title}</title>
          </path>
        ))
      ) : kind === 'route' && trace.segments?.length ? (
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
      {kind === 'route'
        ? trace.routeRoadSegments?.map((segment) => (
            <path
              className="map-route-road-segment"
              d={segment.path}
              key={segment.id}
              style={{ stroke: segment.color }}
            >
              <title>{segment.label}</title>
            </path>
          ))
        : null}
    </svg>
  );
}

function TransitLineMapDetail({
  direction,
  line,
  lineColor,
  modeProfiles,
  onDirectionChange,
  onFocusStation,
  onSelectStation,
  referenceCoordinate,
  segmentMinutes,
  stops,
  t,
}: Readonly<{
  direction: TransitLineTravelDirection;
  line: TransitOverviewLine;
  lineColor?: string;
  modeProfiles: TransitModeProfileForMap[];
  onDirectionChange: (direction: TransitLineTravelDirection) => void;
  onFocusStation: (stationName: string) => void;
  onSelectStation: (stationName: string) => void;
  referenceCoordinate: [number, number];
  segmentMinutes?: number[];
  stops?: TransitRouteStop[];
  t: Translate;
}>) {
  const stationStops = getDirectionalLineStops(line, direction);
  const [now, setNow] = useState(() => new Date());
  const [selectedStationName, setSelectedStationName] = useState<string | undefined>();
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  const realtimeDepartureTimes = getDirectionalDepartureTimes(line, direction);
  const tripLabels = getDirectionalTripLabels(line, direction);
  const realtimeStops = stops ?? [];
  const realtimeStopNames = useMemo(
    () => realtimeStops.map((stop) => stop.stop.displayStationName ?? stop.stop.stationName),
    [realtimeStops],
  );
  /** 班次实例里的站名是原始中文名，匹配站序时必须使用未本地化的站名。 */
  const realtimeRawStopNames = useMemo(
    () => realtimeStops.map((stop) => stop.stop.stationName),
    [realtimeStops],
  );
  const realtimeStopIndexByName = useMemo(() => {
    const index = new Map<string, number>();
    realtimeStops.forEach((stop, stopIndex) => index.set(stop.stop.stationName, stopIndex));
    return index;
  }, [realtimeStops]);
  const nowMinutes = getBeijingClockMinutes(now);
  // 优先使用已发布班次实例（实际停站与停站时长），缺失时回退到线路发车时刻。
  const realtimeSchedules = useMemo(
    () =>
      buildTransitSchedules({
        departureTimes: realtimeDepartureTimes,
        trips: line.tripInstances,
        stopNames: realtimeRawStopNames,
        segmentMinutes: segmentMinutes ?? [],
        specialTrips: line.specialTripsByDirection?.[direction === 'forward' ? 'down' : 'up'],
      }),
    [
      realtimeDepartureTimes,
      line.tripInstances,
      line.specialTripsByDirection,
      direction,
      realtimeRawStopNames,
      segmentMinutes,
    ],
  );
  const realtimeSnapshot = useMemo(
    () =>
      buildTransitRealtimeSnapshot({
        schedules: realtimeSchedules,
        stopNames: realtimeStopNames,
        segmentMinutes: segmentMinutes ?? [],
        nowMinutes,
      }),
    [nowMinutes, realtimeSchedules, realtimeStopNames, segmentMinutes],
  );
  const vehiclesAtStation = useMemo(() => {
    const groups = new Map<number, TransitRealtimeVehicle[]>();
    for (const vehicle of realtimeSnapshot.vehicles) {
      if (vehicle.status !== 'at_station' || vehicle.stationIndex === undefined) {
        continue;
      }
      const group = groups.get(vehicle.stationIndex) ?? [];
      group.push(vehicle);
      groups.set(vehicle.stationIndex, group);
    }
    return groups;
  }, [realtimeSnapshot.vehicles]);
  const vehiclesInSegment = useMemo(() => {
    const groups = new Map<number, TransitRealtimeVehicle[]>();
    for (const vehicle of realtimeSnapshot.vehicles) {
      if (vehicle.status !== 'in_segment' || vehicle.segmentIndex === undefined) {
        continue;
      }
      const group = groups.get(vehicle.segmentIndex) ?? [];
      group.push(vehicle);
      groups.set(vehicle.segmentIndex, group);
    }
    return groups;
  }, [realtimeSnapshot.vehicles]);
  const selectedStationIndex = selectedStationName
    ? realtimeStopIndexByName.get(selectedStationName)
    : undefined;
  const selectedStationLabel = selectedStationName
    ? (stationStops.find((stop) => stop.stationName === selectedStationName)?.displayStationName ??
      selectedStationName)
    : undefined;
  const defaultSelectedStationName = useMemo(() => {
    if (realtimeStops.length === 0) {
      return undefined;
    }
    let nearest = realtimeStops[0]!;
    for (const stop of realtimeStops) {
      if (
        getCoordinateDistance(stop.center, referenceCoordinate) <
        getCoordinateDistance(nearest.center, referenceCoordinate)
      ) {
        nearest = stop;
      }
    }
    return nearest.stop.stationName;
  }, [referenceCoordinate, realtimeStops]);
  const defaultSelectionKey = `${line.id}:${direction}`;
  const appliedDefaultSelectionKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!defaultSelectedStationName) {
      return;
    }
    if (appliedDefaultSelectionKeyRef.current === defaultSelectionKey) {
      return;
    }
    appliedDefaultSelectionKeyRef.current = defaultSelectionKey;
    setSelectedStationName(defaultSelectedStationName);
    onSelectStation(defaultSelectedStationName);
  }, [defaultSelectedStationName, defaultSelectionKey, onSelectStation]);
  const stationBoard = useMemo(
    () =>
      selectedStationIndex === undefined
        ? []
        : buildTransitStationBoard({
            schedules: realtimeSchedules,
            stationIndex: selectedStationIndex,
            nowMinutes,
          }),
    [nowMinutes, realtimeSchedules, selectedStationIndex],
  );
  const stationDayBoard = useMemo(
    () =>
      selectedStationIndex === undefined
        ? []
        : buildTransitStationBoard({
            schedules: realtimeSchedules,
            stationIndex: selectedStationIndex,
            nowMinutes,
            includePassed: true,
          }),
    [nowMinutes, realtimeSchedules, selectedStationIndex],
  );
  const vehicleIcon = getTransitLineModeIcon(line, modeProfiles);
  const detailColor = lineColor ?? line.color ?? 'var(--yct-color-primary)';
  const forwardDirectionName =
    line.displayLastStationName ??
    line.lastStationName ??
    line.displayStationNames?.at(-1) ??
    line.stationNames.at(-1) ??
    t('lineDetail.lastStation');
  const reverseDirectionName =
    line.displayFirstStationName ??
    line.firstStationName ??
    line.displayStationNames?.[0] ??
    line.stationNames[0] ??
    t('lineDetail.firstStation');

  return (
    <div
      className="map-linear-detail"
      style={
        {
          '--map-line-detail-color': detailColor,
        } as CSSProperties
      }
    >
      <div className="map-line-detail-summary">
        <SegmentedControl
          className="map-line-direction-switch"
          role="tablist"
          ariaLabel={t('lineDetail.directionAria')}
          value={direction}
          onChange={onDirectionChange}
          options={(
            [
              { value: 'forward', name: forwardDirectionName },
              { value: 'reverse', name: reverseDirectionName },
            ] as const
          ).map((option) => ({
            value: option.value,
            label: (
              <span className="material-interaction-label">
                {t('lineDetail.directionTo', { station: formatMarkerDisplayName(option.name) })}
              </span>
            ),
          }))}
        />
        <TransitLineRealtimeSection
          accentColor={detailColor}
          dayBoard={stationDayBoard}
          now={now}
          selectedStationIndex={selectedStationIndex}
          selectedStationLabel={selectedStationLabel}
          snapshot={realtimeSnapshot}
          stationBoard={stationBoard}
          t={t}
          tripCount={realtimeSchedules.length}
          tripLabels={tripLabels}
          vehicleIcon={vehicleIcon}
        />
      </div>
      {stationStops.length > 0 ? (
        <ol className="map-line-station-list">
          {stationStops.map((stop, index) => {
            const realtimeIndex = realtimeStopIndexByName.get(stop.stationName);
            const atStationVehicles =
              realtimeIndex !== undefined ? vehiclesAtStation.get(realtimeIndex) : undefined;
            const segmentVehicles =
              realtimeIndex !== undefined ? vehiclesInSegment.get(realtimeIndex) : undefined;
            const isSelected = selectedStationName === stop.stationName;
            const segmentProgress =
              segmentVehicles && segmentVehicles.length > 0
                ? segmentVehicles.reduce((total, vehicle) => total + vehicle.progress, 0) /
                  segmentVehicles.length
                : undefined;

            return (
              <li
                className={isSelected ? 'is-selected' : ''}
                key={`${stop.stationName}-${stop.sequence}-${index}`}
              >
                <span className="map-line-station-node" aria-hidden="true" />
                {atStationVehicles?.length ? (
                  <TransitLineVehicleBadge
                    t={t}
                    vehicles={atStationVehicles}
                    vehicleIcon={vehicleIcon}
                  />
                ) : null}
                {segmentVehicles?.length && segmentProgress !== undefined ? (
                  <TransitLineVehicleBadge
                    segmentProgress={segmentProgress}
                    t={t}
                    vehicles={segmentVehicles}
                    vehicleIcon={vehicleIcon}
                  />
                ) : null}
                <span className="map-line-station-copy">
                  <span className="map-line-station-main">
                    <button
                      className="map-line-station-button"
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedStationName(stop.stationName);
                        onSelectStation(stop.stationName);
                      }}
                    >
                      {formatMarkerDisplayName(stop.displayStationName ?? stop.stationName)}
                      {stop.oneWay ? (
                        <small>{formatTransitStopOneWayLabel(stop.oneWay, t)}</small>
                      ) : null}
                    </button>
                    {isSelected ? (
                      <button
                        className="map-line-station-poi-button"
                        type="button"
                        aria-label={t('map.lineStation.showPoi')}
                        title={t('map.lineStation.showPoi')}
                        onClick={() => onFocusStation(stop.stationName)}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          location_on
                        </span>
                      </button>
                    ) : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>{t('lineDetail.stationListEmpty')}</p>
      )}
    </div>
  );
}

function TransitLineVehicleBadge({
  segmentProgress,
  t,
  vehicles,
  vehicleIcon,
}: Readonly<{
  segmentProgress?: number;
  t: Translate;
  vehicles: TransitRealtimeVehicle[];
  vehicleIcon: string;
}>) {
  const label = vehicles
    .map((vehicle) =>
      [
        vehicle.serviceNature,
        t('map.lineRealtime.vehicleBadge', {
          count: vehicle.ordinal,
          time: vehicle.departureTime,
        }),
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('；');

  return (
    <span
      className={
        segmentProgress === undefined
          ? 'map-line-vehicle-badge is-station'
          : 'map-line-vehicle-badge is-segment'
      }
      role="img"
      aria-label={label}
      title={label}
      style={
        segmentProgress === undefined
          ? undefined
          : {
              top: `calc(14px + (100% - 14px) * ${Math.max(0, Math.min(1, segmentProgress))})`,
            }
      }
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {vehicleIcon}
      </span>
      {vehicles.length > 1 ? <small>{vehicles.length}</small> : null}
    </span>
  );
}

/** 末班驶离后，下一班仍需等待超过该分钟数时隐藏班次列表并提示末班车已过。 */
const lastTripNoticeWaitMinutes = 60;

function TransitLineRealtimeSection({
  accentColor,
  dayBoard,
  now,
  selectedStationIndex,
  selectedStationLabel,
  snapshot,
  stationBoard,
  t,
  tripCount,
  tripLabels,
  vehicleIcon,
}: Readonly<{
  accentColor: string;
  dayBoard: TransitStationBoardEntry[];
  now: Date;
  selectedStationIndex?: number;
  selectedStationLabel?: string;
  snapshot: TransitRealtimeSnapshot;
  stationBoard: TransitStationBoardEntry[];
  t: Translate;
  tripCount: number;
  tripLabels: Record<string, string>;
  vehicleIcon: string;
}>) {
  const [detailEntry, setDetailEntry] = useState<TransitStationBoardEntry | null>(null);
  const [allTripsOpen, setAllTripsOpen] = useState(false);
  const vehicles = snapshot.vehicles;
  const nowMinutes = getBeijingClockMinutes(now);
  const serviceDayNowMinutes = nowMinutes < 3 * 60 ? nowMinutes + 24 * 60 : nowMinutes;
  const clock = formatTransitClockMinutes(nowMinutes);
  const visibleBoard = stationBoard.slice(0, 3);
  const dayBoardByOrdinal = useMemo(
    () => [...dayBoard].sort((left, right) => left.ordinal - right.ordinal),
    [dayBoard],
  );
  const lastTripEntry = dayBoard.reduce<TransitStationBoardEntry | undefined>(
    (latest, entry) => (latest === undefined || entry.ordinal > latest.ordinal ? entry : latest),
    undefined,
  );
  const lastTripPassed =
    lastTripEntry !== undefined && serviceDayNowMinutes >= lastTripEntry.departureMinutes;
  const nextArrival = stationBoard[0];
  // 末班已驶离后，若下一班（通常是次日首班）还需等待 1 小时以上，列表参考价值有限。
  const shouldShowLastTripNotice =
    lastTripPassed &&
    nextArrival !== undefined &&
    nextArrival.arrivalMinutes - nowMinutes > lastTripNoticeWaitMinutes;
  const activeAtSelectedStationCount =
    selectedStationIndex === undefined
      ? vehicles.length
      : vehicles.filter((vehicle) => {
          const departure = vehicle.stationDepartureMinutes?.[selectedStationIndex];
          return departure !== undefined && nowMinutes < departure;
        }).length;
  const activeVehicle = detailEntry
    ? vehicles.find(
        (vehicle) =>
          vehicle.ordinal === detailEntry.ordinal &&
          vehicle.departureTime === detailEntry.departureTime,
      )
    : undefined;

  return (
    <section className="map-line-realtime" aria-labelledby="map-line-realtime-title">
      <div className="map-line-realtime-head">
        <h3 id="map-line-realtime-title">
          <span className="material-symbols-outlined" aria-hidden="true">
            {vehicleIcon}
          </span>
          {t('map.lineRealtime.title')}
          {selectedStationIndex !== undefined ? (
            <span
              className="map-line-realtime-count"
              title={t('map.lineRealtime.countBadgeAria', {
                active: activeAtSelectedStationCount,
                total: stationBoard.length,
              })}
            >
              {t('map.lineRealtime.countBadge', {
                active: activeAtSelectedStationCount,
                total: stationBoard.length,
              })}
            </span>
          ) : null}
        </h3>
        <span className="map-line-realtime-meta">
          {t('map.lineRealtime.updatedAt', { time: clock })}
        </span>
      </div>
      {tripCount === 0 ? (
        <p className="map-line-realtime-empty">{t('map.lineRealtime.emptySchedule')}</p>
      ) : selectedStationLabel === undefined ? (
        <p className="map-line-realtime-empty">{t('map.lineRealtime.selectStationHint')}</p>
      ) : selectedStationIndex === undefined ? (
        <p className="map-line-realtime-empty">{t('map.lineRealtime.stationNoData')}</p>
      ) : shouldShowLastTripNotice && nextArrival !== undefined ? (
        <p className="map-line-realtime-empty">
          {t(
            nextArrival.arrivalMinutes >= 24 * 60
              ? 'map.lineRealtime.lastTripPassedNextDay'
              : 'map.lineRealtime.lastTripPassed',
            { time: formatTransitClockMinutes(nextArrival.arrivalMinutes) },
          )}
        </p>
      ) : visibleBoard.length === 0 ? (
        <p className="map-line-realtime-empty">{t('map.lineRealtime.noMoreTrips')}</p>
      ) : (
        <>
          <ol className="map-line-realtime-list is-board">
            {visibleBoard.map((entry) => (
              <li key={entry.id}>
                <button
                  className="map-line-realtime-board-item"
                  type="button"
                  onClick={() => setDetailEntry(entry)}
                >
                  <strong className={`is-${entry.status}`}>
                    {getStationBoardStatusText(entry, t)}
                  </strong>
                  <small>
                    {[entry.serviceNature, getStationBoardTimeText(entry, t)]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          <div className="map-line-realtime-actions">
            <button
              className="map-line-realtime-all-trips"
              type="button"
              onClick={() => setAllTripsOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                list
              </span>
              {t('map.lineRealtime.allTrips')}
            </button>
          </div>
        </>
      )}
      {allTripsOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={() => setAllTripsOpen(false)}
            >
              <section
                className="modal-panel map-line-day-board-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="map-line-day-board-title"
                style={{ '--map-line-detail-color': accentColor } as CSSProperties}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="section-heading">
                  <h2 id="map-line-day-board-title">{t('map.lineRealtime.allTrips')}</h2>
                  <button
                    className="icon-action-button"
                    type="button"
                    aria-label={t('map.poi.close')}
                    onClick={() => setAllTripsOpen(false)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
                <p className="map-line-realtime-summary">{selectedStationLabel}</p>
                <ol className="map-line-realtime-list map-line-day-board-list">
                  {dayBoardByOrdinal.map((entry) => (
                    <li key={entry.id}>
                      <button
                        className="map-line-day-board-item"
                        type="button"
                        onClick={() => {
                          setAllTripsOpen(false);
                          setDetailEntry(entry);
                        }}
                      >
                        <span className="map-line-day-board-trip">
                          {[
                            tripLabels[entry.departureTime],
                            entry.serviceNature,
                            t('map.lineRealtime.tripTitlePosition', {
                              current: entry.ordinal,
                              total: tripCount,
                            }),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <strong className={`is-${entry.status}`}>
                          {getStationBoardStatusText(entry, t)}
                        </strong>
                        <small>{getStationBoardTimeText(entry, t)}</small>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            </div>,
            document.body,
          )
        : null}
      {detailEntry && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={() => setDetailEntry(null)}
            >
              <section
                className="modal-panel map-line-trip-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="map-line-trip-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="section-heading">
                  <h2 id="map-line-trip-title">
                    {detailEntry
                      ? [
                          tripLabels[detailEntry.departureTime],
                          detailEntry.serviceNature,
                          t('map.lineRealtime.tripTitlePosition', {
                            current: detailEntry.ordinal,
                            total: tripCount,
                          }),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : null}
                  </h2>
                  <button
                    className="icon-action-button"
                    type="button"
                    aria-label={t('map.poi.close')}
                    onClick={() => setDetailEntry(null)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      close
                    </span>
                  </button>
                </div>
                <dl className="line-attribute-list">
                  <div>
                    <dt>{t('map.lineRealtime.detailDeparture')}</dt>
                    <dd>{detailEntry.departureTime}</dd>
                  </div>
                  <div>
                    <dt>{t('map.lineRealtime.detailPosition')}</dt>
                    <dd>
                      {activeVehicle
                        ? activeVehicle.status === 'at_station'
                          ? t('map.lineRealtime.atStation', {
                              station: activeVehicle.stationName ?? '',
                            })
                          : t('map.lineRealtime.inSegment', {
                              from: activeVehicle.fromStationName ?? '',
                              to: activeVehicle.toStationName ?? '',
                            })
                        : detailEntry.status === 'passed'
                          ? t('map.lineRealtime.stationPassed')
                          : t('map.lineRealtime.detailWaiting')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('map.lineRealtime.detailSelectedStation')}</dt>
                    <dd>{selectedStationLabel ?? ''}</dd>
                  </div>
                  <div>
                    <dt>{t('map.lineRealtime.detailArrival')}</dt>
                    <dd>{formatTransitClockMinutes(detailEntry.arrivalMinutes)}</dd>
                  </div>
                  <div>
                    <dt>{t('map.lineRealtime.detailDepartureAtStation')}</dt>
                    <dd>{formatTransitClockMinutes(detailEntry.departureMinutes)}</dd>
                  </div>
                  <div>
                    <dt>{t('map.lineRealtime.detailStatus')}</dt>
                    <dd>{getStationBoardStatusText(detailEntry, t)}</dd>
                  </div>
                  {detailEntry.routeNote ? (
                    <div>
                      <dt>{t('map.lineRealtime.detailNote')}</dt>
                      <dd>{detailEntry.routeNote}</dd>
                    </div>
                  ) : null}
                  {detailEntry.servedStopCount < detailEntry.totalStopCount ? (
                    <div>
                      <dt>{t('map.lineRealtime.detailStops')}</dt>
                      <dd>
                        {t('map.lineRealtime.detailStopsValue', {
                          served: detailEntry.servedStopCount,
                          total: detailEntry.totalStopCount,
                        })}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function getStationBoardStatusText(entry: TransitStationBoardEntry, t: Translate): string {
  switch (entry.status) {
    case 'waiting':
      return t('map.lineRealtime.boardWaiting');
    case 'arriving':
      return t('map.lineRealtime.boardMinutes', { minutes: entry.minutesToStation ?? 1 });
    case 'arriving_now':
      return t('map.lineRealtime.boardArriving');
    case 'leaving':
      return t('map.lineRealtime.boardLeaving');
    case 'passed':
      return t('map.lineRealtime.stationPassed');
    default:
      return t('map.lineRealtime.boardWaiting');
  }
}

function getStationBoardTimeText(entry: TransitStationBoardEntry, t: Translate): string {
  return entry.status === 'leaving'
    ? t('map.lineRealtime.boardDepartureAt', {
        time: formatTransitClockMinutes(entry.departureMinutes),
      })
    : t('map.lineRealtime.boardArrivalAt', {
        time: formatTransitClockMinutes(entry.arrivalMinutes),
      });
}

function getDirectionalDepartureTimes(
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
): string[] {
  const { down, up } = resolveDirectionalDepartureTimes(line);
  return direction === 'forward' ? down : up;
}

/** 实时公交模块与车辆位置图标沿用线路交通方式图标。 */
function getTransitLineModeIcon(
  line: TransitOverviewLine,
  modeProfiles: readonly TransitModeProfileForMap[],
): string {
  const profileIcon = modeProfiles.find((profile) => profile.mode === line.mode)?.icon;
  if (profileIcon) {
    return profileIcon;
  }
  return (
    routeTransportModeOptions.find((option) => option.mode === line.mode)?.icon ?? 'directions_bus'
  );
}

/** 服务端已按当天抽取好的班次标签，键为首站发车时刻。 */
function getDirectionalTripLabels(
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
): Record<string, string> {
  return direction === 'forward'
    ? (line.tripLabelsByDirection?.down ?? {})
    : (line.tripLabelsByDirection?.up ?? {});
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
  blockedByLinearEndpoints,
  collapsed,
  editingEndpoint,
  enabledModes,
  endpointCandidates,
  endpointQuery,
  mapCenterCoordinates,
  secondaryPoiIndex,
  options,
  sortMode,
  status,
  selectedOptionId,
  timeMode,
  timeValue,
  onEditRequirements,
  iconBaseUrl,
  onBeginEndpointEdit,
  onClear,
  onEndpointQueryChange,
  onSelectOption,
  onSortModeChange,
  onSelectEndpointCandidate,
  onShare,
  onSwapEndpoints,
  onToggleCollapsed,
  onUseMapCenter,
}: Readonly<{
  draft: RoutePlanDraft;
  t: Translate;
  blockedByLinearEndpoints: boolean;
  collapsed: boolean;
  editingEndpoint: RouteEndpointKind | null;
  enabledModes: EnabledRouteTransportModes;
  endpointCandidates: CenterableMarker[];
  endpointQuery: string;
  mapCenterCoordinates: [number, number];
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  options: RoutePlanOption[];
  sortMode: RoutePlanSortMode;
  status: RoutePlanStatus;
  selectedOptionId?: string;
  timeMode: RoutePlanTimeMode;
  timeValue: string;
  onEditRequirements: () => void;
  iconBaseUrl: string;
  onBeginEndpointEdit: (endpoint: RouteEndpointKind) => void;
  onClear: () => void;
  onEndpointQueryChange: (value: string) => void;
  onSelectOption: (optionId: string) => void;
  onSortModeChange: (mode: RoutePlanSortMode) => void;
  onSelectEndpointCandidate: (endpoint: RouteEndpointKind, marker: CenterableMarker) => void;
  onShare: () => void;
  onSwapEndpoints: () => void;
  onToggleCollapsed: () => void;
  onUseMapCenter: () => void;
}>) {
  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? options[0];
  const selectedOptionBadges = selectedOption
    ? getRouteOptionBadges(selectedOption, options, t)
    : [];
  const hasEnabledModes = routeTransportModeOptions.some((mode) => enabledModes[mode.mode]);
  const allModesEnabled = routeTransportModeOptions.every((mode) => enabledModes[mode.mode]);
  const enabledModeLabels = routeTransportModeOptions
    .filter((mode) => enabledModes[mode.mode])
    .map((mode) => getRouteTransportModeLabel(mode.mode, t));
  const requirementModeLabel = allModesEnabled
    ? t('map.route.mode.all')
    : enabledModeLabels.join('、') || t('map.route.requirements.none');
  const requirementTimeLabel =
    timeMode === 'arrival'
      ? timeValue
        ? t('map.route.requirements.arriveBy', { time: timeValue })
        : t('map.route.requirements.arriveWithin')
      : timeValue
        ? t('map.route.requirements.departAt', { time: timeValue })
        : t('map.route.requirements.departNow');
  const isPlanning = status === 'loading' && !editingEndpoint;
  const cardClassName = [
    'map-route-plan-card',
    collapsed ? 'is-collapsed' : '',
    isPlanning ? 'is-loading' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => new Set());
  const [reminderMessage, setReminderMessage] = useState('');
  const selectedOptionCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setExpandedStepIds(new Set());
    setReminderMessage('');
  }, [selectedOption?.id]);

  useEffect(() => {
    if (collapsed) {
      return;
    }
    const element = selectedOptionCardRef.current;
    if (!element) {
      return;
    }
    // 展开后布局才稳定，延迟一帧再滚动到当前方案，避免按折叠态高度计算位置。
    const timer = window.setTimeout(() => {
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [collapsed, selectedOption?.id]);

  const createOptionReminder = async () => {
    if (
      !selectedOption ||
      selectedOption.scheduleStatus !== 'scheduled' ||
      !selectedOption.boardTime
    ) {
      setReminderMessage(t('map.route.reminder.unavailable'));
      return;
    }
    const remindAt = buildRouteOptionReminderAt(selectedOption);
    const lineName = selectedOption.serviceLabels?.[0] ?? selectedOption.title;
    const remindTimeText = formatRouteOptionClock(remindAt);
    // 写入本地提醒前先让用户确认班次与提醒时刻，避免误触。
    const confirmed = await requestConfirmation(
      t('map.route.reminder.confirm', {
        line: lineName,
        time: selectedOption.boardTime,
        remind: remindTimeText,
      }),
      { presentation: 'in-app' },
    );
    if (!confirmed) {
      return;
    }
    const transportMode = selectedOption.modes[0] === 'taxi' ? undefined : selectedOption.modes[0];
    createTripReminder({
      title: t('map.route.reminder.title', {
        line: lineName,
        from: draft.originLabel,
        to: draft.destinationLabel,
      }),
      departure: draft.originLabel,
      arrival: draft.destinationLabel,
      lineName: selectedOption.serviceLabels?.[0],
      transportMode,
      detail: t('map.route.reminder.detail', {
        time: selectedOption.boardTime,
        remind: remindTimeText,
      }),
      remindAt: toLocalDatetimeValue(remindAt),
      source: 'route_plan',
    });
    setReminderMessage(t('map.route.reminder.created', { time: remindTimeText }));
  };

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
    <section className={cardClassName} aria-label={t('map.route.aria')} aria-busy={isPlanning}>
      <div className="map-route-plan-top">
        <div className="map-route-endpoint-list">
          <div className="map-route-endpoint-row">
            <span
              className="material-symbols-outlined map-route-endpoint-icon is-origin"
              aria-hidden="true"
            >
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
      {collapsed && selectedOption ? (
        <div
          className="map-route-plan-peek"
          style={{ '--route-option-color': selectedOption.color } as CSSProperties}
        >
          <div className="map-route-option-summary">
            <span className="material-symbols-outlined map-route-option-icon" aria-hidden="true">
              schedule
            </span>
            <strong>{formatRoutePlanMinutes(selectedOption.estimatedMinutes, t)}</strong>
            <span className="map-route-option-distance">
              <span className="material-symbols-outlined" aria-hidden="true">
                directions_walk
              </span>
              {formatRoutePlanDistance(selectedOption.walkingDistance, t)}
            </span>
          </div>
          {selectedOption.fare ||
          selectedOptionBadges.length > 0 ||
          (selectedOption.scheduleStatus === 'scheduled' && selectedOption.arrivalTime) ? (
            <div className="map-route-option-meta">
              {selectedOption.scheduleStatus === 'scheduled' && selectedOption.arrivalTime ? (
                <span className="map-route-option-schedule">
                  <span>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      flag
                    </span>
                    {t('map.route.arrivalAt', { time: selectedOption.arrivalTime })}
                  </span>
                </span>
              ) : null}
              {selectedOption.fare ? (
                <span className="map-route-option-fare">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    payments
                  </span>
                  {formatRoutePlanFare(selectedOption.fare, t)}
                </span>
              ) : null}
              {selectedOptionBadges.length > 0 ? (
                <span className="map-route-option-badges" aria-label={t('map.route.featuresAria')}>
                  {selectedOptionBadges.map((badge) => (
                    <span className="map-route-option-badge" key={badge}>
                      {badge}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="map-route-option-copy">
            <span
              className="material-symbols-outlined map-route-option-type-icon"
              aria-hidden="true"
            >
              {selectedOption.icon}
            </span>
            <span>
              {selectedOption.title} · {selectedOption.summary}
            </span>
          </p>
        </div>
      ) : null}
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
            <div
              className="map-route-endpoint-candidates"
              aria-label={t('map.route.endpointCandidatesAria')}
            >
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
                      <small>
                        {formatMarkerListDistanceDetail(marker, {
                          coordinates: mapCenterCoordinates,
                          secondaryPoiIndex,
                          t,
                        })}
                      </small>
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
              <div className="map-route-preference-toolbar">
                <button
                  type="button"
                  className="map-route-requirement-bar"
                  aria-label={t('map.route.requirements.edit')}
                  title={t('map.route.requirements.edit')}
                  onClick={onEditRequirements}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    tune
                  </span>
                  <span className="map-route-requirement-text">{requirementModeLabel}</span>
                  <span className="map-route-requirement-divider" aria-hidden="true">
                    ·
                  </span>
                  <span className="map-route-requirement-text is-time">{requirementTimeLabel}</span>
                  <span
                    className="material-symbols-outlined map-route-requirement-edit"
                    aria-hidden="true"
                  >
                    edit
                  </span>
                </button>
                <RoutePlanSortControl mode={sortMode} onChange={onSortModeChange} t={t} />
              </div>
              <div className="map-route-option-list" aria-label={t('map.route.optionsAria')}>
                {blockedByLinearEndpoints ? (
                  <p className="map-route-plan-note">{t('map.route.linearEndpointBlocked')}</p>
                ) : status === 'loading' ? (
                  <p className="map-route-plan-note">{t('map.route.planning')}</p>
                ) : options.length > 0 ? (
                  options.map((option) => {
                    const isSelected = option.id === selectedOption?.id;
                    const optionBadges = getRouteOptionBadges(option, options, t);
                    return (
                      <article
                        className={
                          isSelected ? 'map-route-option-card is-selected' : 'map-route-option-card'
                        }
                        key={option.id}
                        ref={isSelected ? selectedOptionCardRef : undefined}
                        style={{ '--route-option-color': option.color } as CSSProperties}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isSelected}
                        aria-label={`${formatRoutePlanMinutes(option.estimatedMinutes, t)} · ${formatRoutePlanDistance(option.walkingDistance, t)} · ${option.title}`}
                        onClick={(event) => {
                          // 步骤详情等内部交互控件自行处理点击，不触发整卡选路
                          const interactiveAncestor =
                            event.target instanceof Element
                              ? event.target.closest('button, a, input, [role="button"]')
                              : null;
                          if (interactiveAncestor && interactiveAncestor !== event.currentTarget) {
                            return;
                          }
                          onSelectOption(option.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) {
                            return;
                          }
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectOption(option.id);
                          }
                        }}
                      >
                        <div className="map-route-option-summary">
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
                          <span
                            className="material-symbols-outlined map-route-option-expand"
                            aria-hidden="true"
                          >
                            {isSelected ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                          </span>
                        </div>
                        {option.fare || optionBadges.length > 0 ? (
                          <div className="map-route-option-meta">
                            {option.fare ? (
                              <span className="map-route-option-fare">
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  payments
                                </span>
                                {formatRoutePlanFare(option.fare, t)}
                              </span>
                            ) : null}
                            {optionBadges.length > 0 ? (
                              <span
                                className="map-route-option-badges"
                                aria-label={t('map.route.featuresAria')}
                              >
                                {optionBadges.map((badge) => (
                                  <span className="map-route-option-badge" key={badge}>
                                    {badge}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
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
                        {option.scheduleStatus === 'scheduled' && option.boardTime ? (
                          <div className="map-route-option-schedule">
                            <span>
                              <span className="material-symbols-outlined" aria-hidden="true">
                                schedule
                              </span>
                              {t('map.route.rideBoardAt', { time: option.boardTime })}
                            </span>
                            {option.waitMinutes ? (
                              <span>
                                {t('map.route.waitMinutes', { count: option.waitMinutes })}
                              </span>
                            ) : null}
                            {option.arrivalTime ? (
                              <span>
                                <span className="material-symbols-outlined" aria-hidden="true">
                                  flag
                                </span>
                                {t('map.route.arrivalAt', { time: option.arrivalTime })}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {isSelected ? (
                          <ol
                            className="map-route-step-timeline"
                            aria-label={t('map.route.stepsAria')}
                          >
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
                                  step.kind === 'taxi' ||
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
                                          <span
                                            className="material-symbols-outlined"
                                            aria-hidden="true"
                                          >
                                            {isExpanded
                                              ? 'keyboard_arrow_up'
                                              : 'keyboard_arrow_down'}
                                          </span>
                                        </button>
                                      ) : null}
                                    </span>
                                    {canExpand && isExpanded ? (
                                      <ul className="map-route-step-detail-list">
                                        {step.details?.map((detail, detailIndex) => (
                                          <li key={`${stepId}-detail-${detailIndex}`}>
                                            <span
                                              className="material-symbols-outlined"
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
                        {isSelected ? (
                          <div className="map-route-reminder">
                            <button
                              type="button"
                              className="map-route-reminder-button"
                              onClick={() => void createOptionReminder()}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">
                                notifications_active
                              </span>
                              {t('map.route.reminder.create')}
                            </button>
                            {reminderMessage ? (
                              <p className="map-route-reminder-note">{reminderMessage}</p>
                            ) : null}
                          </div>
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

/** 出行需求弹窗：集中确认交通方式与时间要求，确认后才应用到路线规划。 */
function RouteRequirementDialog({
  enabledModes,
  timeMode,
  timeValue,
  onCancel,
  onConfirm,
  t,
}: Readonly<{
  enabledModes: EnabledRouteTransportModes;
  timeMode: RoutePlanTimeMode;
  timeValue: string;
  onCancel: () => void;
  onConfirm: (input: {
    enabledModes: EnabledRouteTransportModes;
    timeMode: RoutePlanTimeMode;
    timeValue: string;
  }) => void;
  t: Translate;
}>) {
  const [draftModes, setDraftModes] = useState<EnabledRouteTransportModes>(enabledModes);
  const [draftTimeMode, setDraftTimeMode] = useState<RoutePlanTimeMode>(timeMode);
  const [draftTimeValue, setDraftTimeValue] = useState(timeValue);
  const allModesEnabled = routeTransportModeOptions.every((mode) => draftModes[mode.mode]);
  const draftModeLabels = routeTransportModeOptions
    .filter((mode) => draftModes[mode.mode])
    .map((mode) => getRouteTransportModeLabel(mode.mode, t));
  const modeSummary = allModesEnabled
    ? t('map.route.mode.all')
    : draftModeLabels.join('、') || t('map.route.requirements.none');

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="modal-panel map-route-requirement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-route-requirement-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id="map-route-requirement-title">{t('map.route.requirements.title')}</h2>
          <button
            className="icon-action-button"
            type="button"
            aria-label={t('map.route.requirements.close')}
            onClick={onCancel}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <section className="map-route-requirement-section">
          <h3>{t('map.route.requirements.modes')}</h3>
          <RouteModeToggleList
            options={routeTransportModeOptions.map((mode) => ({
              mode: mode.mode,
              icon: mode.icon,
              color: mode.color,
              label: getRouteTransportModeLabel(mode.mode, t),
              taxi: mode.mode === 'taxi',
            }))}
            enabledModes={draftModes}
            allModesEnabled={allModesEnabled}
            onToggle={(mode) =>
              setDraftModes((current) => ({
                ...current,
                [mode]: !current[mode as RouteTransportMode],
              }))
            }
            onSetAll={(enabled) =>
              setDraftModes(
                Object.fromEntries(
                  routeTransportModeOptions.map((mode) => [mode.mode, enabled]),
                ) as EnabledRouteTransportModes,
              )
            }
            labels={{
              groupAria: t('map.route.modeAria'),
              all: t('map.route.mode.all'),
              more: (count) => t('map.route.mode.more', { count }),
              collapse: t('map.route.mode.collapse'),
            }}
          />
          <p className="map-route-requirement-hint">{modeSummary}</p>
        </section>
        <section className="map-route-requirement-section">
          <h3>{t('map.route.requirements.time')}</h3>
          <div className="map-route-time-bar">
            <SegmentedControl
              className="map-route-time-mode"
              ariaLabel={t('map.route.time.aria')}
              value={draftTimeMode}
              onChange={(mode) => {
                setDraftTimeMode(mode);
                // 切换口径时按该口径的默认值回填：出发=现在，到达=一小时后。
                setDraftTimeValue(getDefaultRoutePlanTimeValue(mode));
              }}
              options={[
                { value: 'departure', label: t('map.route.time.departMode') },
                { value: 'arrival', label: t('map.route.time.arriveMode') },
              ]}
            />
            <input
              type="time"
              value={draftTimeValue}
              aria-label={t('map.route.time.aria')}
              onChange={(event) => setDraftTimeValue(event.currentTarget.value)}
            />
            {draftTimeMode === 'departure' ? (
              <button
                type="button"
                className="map-route-time-now"
                onClick={() => setDraftTimeValue(getDefaultRoutePlanTimeValue('departure'))}
              >
                {t('map.route.time.now')}
              </button>
            ) : null}
          </div>
        </section>
        <div className="admin-content-actions">
          <button className="secondary-action-button" type="button" onClick={onCancel}>
            {t('map.route.requirements.cancel')}
          </button>
          <button
            className="secondary-action-button is-primary"
            type="button"
            onClick={() =>
              onConfirm({
                enabledModes: draftModes,
                timeMode: draftTimeMode,
                timeValue: draftTimeValue,
              })
            }
          >
            {t('map.route.requirements.confirm')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** 城市公交提醒提前量：提前 15 分钟提醒，最少留 1 分钟。 */
const routeReminderLeadMinutes = 15;

/** 由上车站发车时刻倒推提醒时间；跨凌晨时自动落到下一个自然日。 */
function buildRouteOptionReminderAt(option: RoutePlanOption): Date {
  const match = option.boardTime?.trim().match(/^(\d{1,2}):(\d{2})$/);
  const target = new Date();
  if (match) {
    target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  }
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  const reminder = new Date(target.getTime() - routeReminderLeadMinutes * 60 * 1000);
  const minimum = new Date(Date.now() + 60 * 1000);
  return reminder.getTime() > minimum.getTime() ? reminder : minimum;
}

function formatRouteOptionClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** <input type="datetime-local"> 需要的本地时间字符串。 */
function toLocalDatetimeValue(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

/** 服务日分钟还原为 HH:mm，供时间输入框使用。 */
function formatRoutePlanTimeValue(minutes: number): string {
  const minutesInDay = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutesInDay / 60)).padStart(2, '0')}:${String(minutesInDay % 60).padStart(2, '0')}`;
}

/** 出发时间默认当前时刻，到达时间默认一小时后。 */
function getDefaultRoutePlanTimeValue(mode: RoutePlanTimeMode): string {
  const nowMinutes = normalizeServiceDayMinutes(getBeijingClockMinutes());
  return formatRoutePlanTimeValue(mode === 'arrival' ? nowMinutes + 60 : nowMinutes);
}

function RoutePlanSortControl({
  mode,
  onChange,
  t,
}: Readonly<{
  mode: RoutePlanSortMode;
  onChange: (mode: RoutePlanSortMode) => void;
  t: Translate;
}>) {
  const options: Array<{
    icon: string;
    labelKey: CommonMessageKey;
    value: RoutePlanSortMode;
  }> = [
    { value: 'time', icon: 'schedule', labelKey: 'map.route.sort.time' },
    { value: 'arrival', icon: 'alarm', labelKey: 'map.route.sort.arrival' },
    { value: 'walking', icon: 'directions_walk', labelKey: 'map.route.sort.walking' },
    { value: 'transfers', icon: 'swap_horiz', labelKey: 'map.route.sort.transfers' },
    { value: 'fare', icon: 'payments', labelKey: 'map.route.sort.fare' },
  ];

  return (
    <div className="map-route-sort-control" aria-label={t('map.route.sortAria')}>
      {options.map((option) => {
        const label = t(option.labelKey);
        return (
          <button
            className={mode === option.value ? 'is-active' : ''}
            type="button"
            key={option.value}
            aria-label={label}
            title={label}
            aria-pressed={mode === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {option.icon}
            </span>
            {mode === option.value ? <span className="map-route-sort-label">{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function buildMapSharePayload(
  target: MapShareTarget,
  t: Translate,
  shortShareUrl?: string,
): MapSharePayload {
  if (target.kind === 'marker') {
    const label = formatMarkerDisplayName(target.marker.label);
    const coordinate = getCenterableMarkerPrimaryCoordinate(target.marker);
    const url = shortShareUrl ?? buildMapMarkerShareUrl(target.marker);
    const category = target.marker.categoryId
      ? getMarkerCategoryDisplayName(target.marker.categoryId, t)
      : formatMarkerDetail(target.marker, t);
    const coordinateDisplayText = coordinate ? formatShareCoordinate(coordinate) : '';
    const teleportCommand = coordinate
      ? target.marker.playerLocation?.serverAccountName
        ? `/tp ${target.marker.playerLocation.serverAccountName}`
        : `/tp ${roundCoordinateForParam(coordinate[0])} ~ ${roundCoordinateForParam(coordinate[1])}`
      : undefined;

    return {
      color: 'var(--yct-color-primary)',
      coordinateText: coordinateDisplayText || undefined,
      eyebrow: category,
      icon: 'location_on',
      meta: [formatMarkerDetail(target.marker, t), coordinateDisplayText].filter(Boolean),
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
      teleportCommand,
      url,
    };
  }

  const routeTitle = `${target.draft.originLabel} → ${target.draft.destinationLabel}`;
  const url =
    shortShareUrl ?? buildRoutePlanShareUrl(target.draft, target.enabledModes, target.option?.id);
  const optionSummary = target.option
    ? [
        target.option.title,
        target.option.summary,
        `${formatRoutePlanMinutes(target.option.estimatedMinutes, t)} · ${formatRoutePlanDistance(
          target.option.walkingDistance,
          t,
        )}${target.option.fare ? ` · ${formatRoutePlanFare(target.option.fare, t)}` : ''}`,
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
    coordinateText: formatShareCoordinate(target.draft.destination),
    eyebrow: t('map.route.share'),
    icon: target.option?.icon ?? 'route',
    meta: optionSummary,
    steps,
    text,
    title: routeTitle,
    url,
  };
}

async function createMapShortShareLink(target: MapShareTarget): Promise<string> {
  const body =
    target.kind === 'marker'
      ? { kind: 'marker' as const, markerId: target.marker.id }
      : {
          kind: 'route' as const,
          state: buildCompactRoutePlanShareState(
            target.draft,
            target.enabledModes,
            target.option?.id,
          ),
        };
  const response = await fetch(appPath('/api/map/share-links'), {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Map share link creation failed: ${response.status}`);
  }
  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error('Map share link response is missing url');
  }
  return new URL(payload.url, window.location.origin).toString();
}

function getMapShareCopyValue(
  payload: MapSharePayload,
  kind: MapShareCopyKind,
): string | undefined {
  if (kind === 'link') {
    return payload.url;
  }

  if (kind === 'text') {
    return payload.text;
  }

  if (kind === 'coordinate') {
    return payload.coordinateText;
  }

  return payload.teleportCommand;
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
  return getMarkerCenter(marker) ?? null;
}

function buildMapMarkerShareUrl(marker: CenterableMarker): string {
  const url = new URL(appPath('/map'), window.location.origin);
  const compactParams = new URLSearchParams({ ms: encodeBase64UrlText(marker.id) });
  const readableParams = new URLSearchParams({ m: marker.id });
  url.search =
    compactParams.toString().length < readableParams.toString().length
      ? compactParams.toString()
      : readableParams.toString();
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
      ) ?? formatPoint(destination),
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
    formatCompactCoordinateParam(draft.origin),
    formatCompactCoordinateParam(draft.destination),
    draft.originLabel !== formatPoint(draft.origin) ? draft.originLabel : '',
    draft.destinationLabel !== formatPoint(draft.destination) ? draft.destinationLabel : '',
    draft.originId ?? '',
    draft.destinationId ?? '',
    formatRouteTransportModeMask(modes),
    selectedOptionId ?? '',
  ];
}

function setCompactRoutePlanShareSearchParam(url: URL, state: CompactRoutePlanShareState) {
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
            ? (normalizeMapSharedFocusValue(destinationIdValue) ?? undefined)
            : undefined,
        destinationLabel:
          typeof destinationLabelValue === 'string' && destinationLabelValue.trim()
            ? destinationLabelValue
            : formatPoint(destination),
        origin,
        originId:
          typeof originIdValue === 'string'
            ? (normalizeMapSharedFocusValue(originIdValue) ?? undefined)
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
          ? (normalizeMapSharedFocusValue(selectedOptionIdValue) ?? undefined)
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

function formatCompactCoordinateParam([x, z]: [number, number]): string {
  return `~${Math.round(x * 100).toString(36)}.${Math.round(z * 100).toString(36)}`;
}

function roundCoordinateForParam(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseCoordinateParam(value: string | null): [number, number] | null {
  if (value?.startsWith('~')) {
    const [xValue, zValue] = value.slice(1).split('.');
    const x = xValue ? Number.parseInt(xValue, 36) / 100 : Number.NaN;
    const z = zValue ? Number.parseInt(zValue, 36) / 100 : Number.NaN;
    return Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null;
  }
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

  const selectedModes = value.startsWith('~')
    ? new Set(
        routeTransportModeOptions.flatMap((mode, index) =>
          (Number.parseInt(value.slice(1), 36) & (1 << index)) !== 0 ? [mode.mode] : [],
        ),
      )
    : new Set(value.split(',').map((mode) => mode.trim()));
  for (const mode of routeTransportModeOptions) {
    enabledModes[mode.mode] = selectedModes.has(mode.mode);
  }
  return enabledModes;
}

function formatRouteTransportModeMask(modes: RouteTransportMode[]): string {
  const selected = new Set(modes);
  const mask = routeTransportModeOptions.reduce(
    (value, mode, index) => value | (selected.has(mode.mode) ? 1 << index : 0),
    0,
  );
  return `~${mask.toString(36)}`;
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
          aria-label={t(
            isLinearDetailMarker(marker) ? 'map.poi.nearbyAlongAria' : 'map.poi.nearbyAria',
            { name: marker.label },
          )}
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

interface DirectionalTransitLineRoute {
  marker: TransitLineMarker;
  route: TransitSegmentRouteResolution;
  segmentMinutes: number[];
  stops: TransitRouteStop[];
}

function buildDirectionalTransitLineRoute(
  marker: TransitLineMarker,
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
  pointMarkers: PointMarker[],
  roadGraph?: RoadRouteGraph,
  roadTiming?: MapSpatialProfile['roadTiming'],
  markerRoadAccessIndex?: ReadonlyMap<string, RoadAccessCandidate[]>,
): DirectionalTransitLineRoute | undefined {
  const mode = isRouteTransportMode(line.mode) ? line.mode : undefined;
  const fallbackMarkerById = new Map(
    pointMarkers.map((pointMarker) => [pointMarker.id, pointMarker]),
  );
  const stationMarkerIndex = buildTransitStationMarkerIndex(pointMarkers);
  const stops = getDirectionalLineStops(line, direction)
    .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
      const stationMarker = mode
        ? findTransitStationMarker(stop, stationMarkerIndex, pointMarkers, mode)
        : (stop.stationMarkerIds ?? []).flatMap((markerId) => {
            const pointMarker = fallbackMarkerById.get(markerId);
            return pointMarker ? [pointMarker] : [];
          })[0];
      const center = stationMarker ? getMarkerCenter(stationMarker) : undefined;
      return stationMarker && center ? { center, marker: stationMarker, stop } : undefined;
    })
    .filter((stop): stop is Omit<TransitRouteStop, 'index'> => Boolean(stop))
    .map((stop, index): TransitRouteStop => ({ ...stop, index }));
  if (stops.length < 2) {
    return undefined;
  }

  const route = buildTransitSegmentRoute(
    stops,
    mode ?? 'walk',
    line,
    direction,
    roadGraph,
    markerRoadAccessIndex,
    undefined,
    { fallbackUnresolvedSegments: true },
  );
  const hasResolvedRoute = route.resolved && route.coordinates.length >= 2;
  const realtimeRoute = hasResolvedRoute
    ? route
    : buildStraightTransitRealtimeRoute(stops, line, direction);

  return {
    marker: hasResolvedRoute
      ? {
          ...marker,
          geometry: {
            type: 'MultiPoint',
            coordinates: route.coordinates,
          },
        }
      : marker,
    route: realtimeRoute,
    segmentMinutes: resolveTransitRealtimeSegmentMinutes(
      stops,
      realtimeRoute,
      mode ?? 'walk',
      roadTiming,
    ),
    stops,
  };
}

function buildStraightTransitRealtimeRoute(
  stops: TransitRouteStop[],
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
): TransitSegmentRouteResolution {
  const measurements = stops.slice(1).map((current, index) => {
    const previous = stops[index]!;
    return {
      distance: getCoordinateDistance(previous.center, current.center),
      junctionCount: 0,
      travelMinutes: getConfiguredTransitSegment(line, previous, current, direction)?.travelMinutes,
    };
  });
  return {
    coordinates: stops.map((stop) => stop.center),
    distance: measurements.reduce((total, measurement) => total + measurement.distance, 0),
    measurements,
    resolved: true,
    usesRoadGraph: false,
  };
}

function resolveTransitRealtimeSegmentMinutes(
  stops: TransitRouteStop[],
  route: TransitSegmentRouteResolution,
  mode: RouteTransportMode,
  roadTiming?: MapSpatialProfile['roadTiming'],
): number[] {
  const defaultBusSpeedKmh = roadTiming?.defaultBusSpeedKmh ?? 30;
  const busJunctionDelaySeconds = roadTiming?.busJunctionDelaySeconds ?? 12;
  const segmentCount = Math.max(0, stops.length - 1);
  // 旧数据 travelTime 与工作台、班次标签共用同一套解析：值挂在出发站上，即区间用时。
  const legacyMinutes = resolveLegacySegmentMinutes(
    stops.map((stop) => stop.stop.travelTime),
  ).segmentMinutes;

  return Array.from({ length: segmentCount }, (_, index) => {
    const measurement = route.measurements[index];
    if (
      measurement?.travelMinutes !== undefined &&
      Number.isFinite(measurement.travelMinutes) &&
      measurement.travelMinutes > 0
    ) {
      return Math.max(1, measurement.travelMinutes);
    }

    const legacyMinute = legacyMinutes[index];
    if (legacyMinute !== undefined) {
      return Math.max(1, legacyMinute);
    }

    if (!measurement) {
      return 1;
    }

    const minutes = shouldUseRoadGraphForTransitMode(mode)
      ? estimateVehicleRouteMinutes(
          measurement.distance,
          defaultBusSpeedKmh,
          measurement.junctionCount,
          busJunctionDelaySeconds,
        )
      : estimateRouteMinutes(measurement.distance, getTransitSpeedFactor(mode));
    return Math.max(1, Math.round(minutes));
  });
}

function getDirectionalLineStops(
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
): TransitLineStopForMap[] {
  const sourceStops: TransitLineStopForMap[] =
    line.stationStops && line.stationStops.length > 0
      ? line.stationStops
      : line.stationNames.map((stationName, sequence) => ({
          stationName,
          operationStatus: 'operating' as const,
          displayStationName: line.displayStationNames?.[sequence],
          sequence,
        }));

  const filteredStops = sourceStops
    .filter((stop) => isTransitLineStopVisibleInDirection(stop, direction))
    .map((stop) => {
      const configuredLocationMarkerIds = new Set(
        (stop.stopLocationRefs ?? []).map((ref) => ref.markerId),
      );
      return {
        ...stop,
        stationMarkerIds: [
          ...getTransitStopLocationMarkerIdsForDirection(stop.stopLocationRefs, direction),
          ...(stop.stationMarkerIds ?? []).filter(
            (markerId) => !configuredLocationMarkerIds.has(markerId),
          ),
        ].filter((markerId, index, markerIds) => markerIds.indexOf(markerId) === index),
      };
    });

  const sortedStops = [...filteredStops].sort((left, right) => left.sequence - right.sequence);
  return direction === 'forward' ? sortedStops : sortedStops.reverse();
}

function isTransitLineStopVisibleInDirection(
  stop: TransitLineStopForMap,
  direction: TransitLineTravelDirection,
): boolean {
  return isTransitLineDirectionIncluded(stop.oneWay, direction);
}

function formatTransitStopOneWayLabel(
  oneWay: TransitLineStopForMap['oneWay'],
  t: Translate,
): string {
  // 旧 YCT 数据中 down 表示数据记载方向，up 表示反向。
  return oneWay === 'down' ? t('lineDetail.oneWay.forward') : t('lineDetail.oneWay.reverse');
}

function isPointMarker(marker: MapMarkerSnapshot['markers'][number]): marker is PointMarker {
  return 'sourceLabel' in marker && marker.geometry.type === 'Point';
}

function shouldRenderAsPointPoi(marker: PointMarker): boolean {
  // 道路类点位默认由道路标签层展示；显式选择「不使用图标」时仍要渲染其居中名称标签。
  return marker.categoryId !== 'road' || Boolean(marker.spatial?.hideMarkerIcon);
}

function isEndpointGroupMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is EndpointGroupMarker {
  return (
    'sourceLabel' in marker &&
    marker.categoryId !== 'transit-line' &&
    (marker.geometry.type === 'MultiPoint' || isRoutableLineGeometryMarker(marker))
  );
}

function isShapeMarker(marker: MapMarkerSnapshot['markers'][number]): marker is ShapeMarker {
  return (
    'sourceLabel' in marker &&
    marker.geometry.type !== 'Point' &&
    marker.geometry.type !== 'MultiPoint' &&
    !isEndpointGroupMarker(marker)
  );
}

function isRegionMarker(
  marker: CenterableMarker,
): marker is CenterableMarker & { geometry: RegionGeometry } {
  return (
    marker.geometry.type === 'Rectangle' ||
    marker.geometry.type === 'MultiRectangle' ||
    marker.geometry.type === 'Polygon' ||
    marker.geometry.type === 'MultiPolygon'
  );
}

function isTransitLineMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is TransitLineMarker {
  return (
    'sourceLabel' in marker &&
    marker.geometry.type === 'MultiPoint' &&
    marker.categoryId === 'transit-line'
  );
}

function isRoadEndpointGroupMarker(
  marker: MapMarkerSnapshot['markers'][number],
): marker is EndpointGroupMarker {
  return (
    (marker.geometry.type === 'MultiPoint' || marker.geometry.type === 'LineString') &&
    getRoadMarkerKind(marker) !== undefined
  );
}

function isRoutableNetworkMarker(marker: EndpointGroupMarker): boolean {
  return getRoadMarkerKind(marker) !== undefined || Boolean(marker.spatial?.networkKind);
}

function isRoutableLineGeometryMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return (
    marker.geometry.type === 'LineString' &&
    (getRoadMarkerKind(marker) !== undefined || Boolean(marker.spatial?.networkKind))
  );
}

function isLinearDetailMarker(marker: MapMarkerSnapshot['markers'][number]): boolean {
  return isTransitLineMarker(marker) || isRoadEndpointGroupMarker(marker);
}

function isLinearDetailMarkerId(
  markerId: string | undefined,
  markerIndex: ReadonlyMap<string, CenterableMarker>,
): boolean {
  const marker = markerId ? markerIndex.get(markerId) : undefined;
  return marker ? isLinearDetailMarker(marker) : false;
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

function isMetroStationPoi(
  marker: Pick<MapMarkerSnapshot['markers'][number], 'categoryId'>,
): boolean {
  return marker.categoryId === 'metro-station';
}

function TransitStationInfrastructureDetail({
  details,
  lines,
  t,
}: Readonly<{
  details: TransitStationDetailSnapshot[];
  lines: TransitOverviewLine[];
  t: Translate;
}>) {
  const stationDetailTabs = [...details]
    .sort((left, right) => left.lineName.localeCompare(right.lineName, 'zh-CN', { numeric: true }))
    .flatMap((detail) => {
      const line = lines.find((candidate) => candidate.name === detail.lineName);
      const hasDirectionSpecificLayout = hasDirectionSpecificStationLayout(detail);
      const directions = hasDirectionSpecificLayout
        ? (['downwards', 'upwards'] as const)
        : (['downwards'] as const);
      return directions.map((direction) => ({
        detail,
        direction,
        key: `${detail.sourceId}:${direction}`,
        label: formatStationDetailTabLabel(
          detail.lineName,
          direction,
          line,
          hasDirectionSpecificLayout,
          t,
        ),
      }));
    });
  const [activeTabKey, setActiveTabKey] = useState(stationDetailTabs[0]?.key ?? '');
  const activeTab =
    stationDetailTabs.find((tab) => tab.key === activeTabKey) ?? stationDetailTabs[0];
  if (!activeTab) {
    return null;
  }

  const activeDetail = activeTab.detail;
  const activeDirection = activeTab.direction;
  const activeLine = lines.find((line) => line.name === activeDetail.lineName);
  const hasUpwardsFacilityLayout = hasDifferentUpwardsFacilityLayout(activeDetail);
  const selectedFacilities =
    activeDirection === 'upwards' && hasUpwardsFacilityLayout
      ? (activeDetail.facilitiesUpwards ?? activeDetail.facilities)
      : activeDetail.facilities;
  const shouldFlipTemplate =
    activeDirection === 'upwards' && Boolean(activeDetail.flipTemplateForUpwards);
  return (
    <section
      className="map-metro-station-infrastructure"
      aria-label={t('map.metroInfrastructure.title')}
      style={
        {
          '--map-metro-station-line-color': activeLine?.color ?? 'var(--yct-color-primary)',
        } as CSSProperties
      }
    >
      <div className="map-metro-station-infrastructure-heading">
        <span className="material-symbols-outlined" aria-hidden="true">
          account_tree
        </span>
        <strong>{t('map.metroInfrastructure.title')}</strong>
        <span className="map-metro-station-detail-tabs">
          <span
            className="map-metro-station-line-tabs"
            role="tablist"
            aria-label={t('map.metroInfrastructure.tabsAria')}
          >
            {stationDetailTabs.map((tab) => (
              <button
                className={tab.key === activeTab.key ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab.key === activeTab.key}
                key={tab.key}
                onClick={() => setActiveTabKey(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </span>
        </span>
      </div>
      <article
        className={`map-metro-station-detail${shouldFlipTemplate ? ' is-template-flipped' : ''}`}
      >
        <div className="map-metro-station-detail-title">
          <strong>{activeDetail.lineName}</strong>
          <span>
            {activeDetail.overGround ? t('stationDetail.ground') : t('stationDetail.underground')}
          </span>
        </div>
        {activeDetail.layers.map((layer) => (
          <StationInfrastructureFloor
            activeLine={activeLine}
            detail={activeDetail}
            direction={activeDirection}
            facilities={selectedFacilities}
            isTemplateFlipped={shouldFlipTemplate}
            layer={layer}
            lines={lines}
            t={t}
            onSelectTransfer={(lineName, direction) => {
              const targetDetail = details.find((detail) => detail.lineName === lineName);
              if (!targetDetail) {
                return;
              }
              const targetDirection =
                direction && hasDirectionSpecificStationLayout(targetDetail)
                  ? direction
                  : 'downwards';
              setActiveTabKey(`${targetDetail.sourceId}:${targetDirection}`);
            }}
            canSelectTransfer={(lineName) => details.some((detail) => detail.lineName === lineName)}
            key={`${activeDetail.sourceId}-${layer.floor}-${layer.order ?? 0}`}
          />
        ))}
      </article>
    </section>
  );
}

function StationInfrastructureFloor({
  activeLine,
  detail,
  direction,
  facilities: detailFacilities,
  isTemplateFlipped,
  layer,
  lines,
  t,
  onSelectTransfer,
  canSelectTransfer,
}: Readonly<{
  activeLine: TransitOverviewLine | undefined;
  detail: TransitStationDetailSnapshot;
  direction: 'downwards' | 'upwards';
  facilities: TransitStationDetailSnapshot['facilities'];
  isTemplateFlipped: boolean;
  layer: TransitStationDetailSnapshot['layers'][number];
  lines: TransitOverviewLine[];
  t: Translate;
  onSelectTransfer: (
    lineName: string,
    direction: TransitStationTransferSnapshot['transferDirection'],
  ) => void;
  canSelectTransfer: (lineName: string) => boolean;
}>) {
  const exits = detail.exits.filter(
    (exit) => resolveStationExitFloor(detail, exit.floor, direction) === layer.floor,
  );
  const transfers = detail.transfers.filter((transfer) => transfer.floor === layer.floor);
  const isPlatform = layer.type === 'platform';
  const facilities = isPlatform
    ? detailFacilities.filter((facility) => !facility.floor || facility.floor === layer.floor)
    : detailFacilities.filter((facility) => facility.floor === layer.floor);
  const positionScale = resolveStationDetailPositionScale(activeLine, detailFacilities, transfers);

  return (
    <section className={`map-metro-station-floor${isPlatform ? ' is-platform' : ''}`}>
      <div className="map-metro-station-floor-heading">
        <strong>{layer.floor}</strong>
        <span>{formatStationLayerType(layer.type, t)}</span>
        {isPlatform ? (
          <small>
            {t('map.metroInfrastructure.platformDoors', {
              side: formatStationPlatformSide(detail.platformSide, t),
            })}
          </small>
        ) : null}
      </div>
      {isPlatform ? (
        <StationPlatformSchematic
          activeLine={activeLine}
          currentFloor={layer.floor}
          detail={detail}
          facilities={facilities}
          isTemplateFlipped={isTemplateFlipped}
          t={t}
        />
      ) : null}
      {exits.length > 0 ? (
        <StationExitSchematic exits={exits} isTemplateFlipped={isTemplateFlipped} t={t} />
      ) : null}
      {transfers.length > 0 ? (
        <div className="map-metro-station-transfer-track">
          {transfers.map((transfer, index) => {
            const canSelect = canSelectTransfer(transfer.line);
            const title = `${transfer.line}${
              transfer.transferDirection
                ? ` · ${formatStationTransferDirection(transfer.transferDirection, t)}`
                : transfer.direction
                  ? ` · ${formatStationFacilityDirection(transfer.direction, t)}`
                  : ''
            }`;
            return (
              <button
                className="map-metro-station-transfer-marker"
                type="button"
                disabled={!canSelect}
                key={`${transfer.line}-${index}`}
                style={
                  {
                    '--station-detail-position': `${resolveStationDetailPosition(
                      transfer.location,
                      positionScale,
                    )}%`,
                    '--station-detail-offset': `${(index - (transfers.length - 1) / 2) * 5}px`,
                    '--station-transfer-line-color':
                      lines.find((line) => line.name === transfer.line)?.color ??
                      'var(--yct-color-primary)',
                  } as CSSProperties
                }
                title={title}
                aria-label={
                  canSelect ? t('map.metroInfrastructure.transferAction', { title }) : title
                }
                onClick={() => onSelectTransfer(transfer.line, transfer.transferDirection)}
              >
                {formatStationTransferMarker(transfer.line)}
              </button>
            );
          })}
        </div>
      ) : null}
      {!isPlatform && exits.length === 0 && transfers.length === 0 ? (
        <span className="map-metro-station-floor-empty">
          {t('map.metroInfrastructure.floorEmpty')}
        </span>
      ) : null}
    </section>
  );
}

function StationExitSchematic({
  exits,
  isTemplateFlipped,
  t,
}: Readonly<{
  exits: TransitStationDetailSnapshot['exits'];
  isTemplateFlipped: boolean;
  t: Translate;
}>) {
  const upwardExits = exits.filter((exit) => exit.direction !== 'downwards');
  const downwardExits = exits.filter((exit) => exit.direction === 'downwards');
  const leftExits = isTemplateFlipped ? downwardExits : upwardExits;
  const rightExits = isTemplateFlipped ? upwardExits : downwardExits;
  return (
    <details className="map-metro-station-exit-track">
      <summary className="map-metro-station-exit-summary">
        <span className="is-left">{formatStationExitGroup(leftExits, '←', t)}</span>
        <span className="is-right">{formatStationExitGroup(rightExits, '→', t)}</span>
      </summary>
      <div className="map-metro-station-exit-details">
        <StationExitGroupDetails exits={leftExits} arrow="←" />
        <StationExitGroupDetails exits={rightExits} arrow="→" isRight />
      </div>
    </details>
  );
}

function StationExitGroupDetails({
  exits,
  arrow,
  isRight = false,
}: Readonly<{
  exits: TransitStationDetailSnapshot['exits'];
  arrow: '←' | '→';
  isRight?: boolean;
}>) {
  return (
    <div className={`map-metro-station-exit-group${isRight ? ' is-right' : ' is-left'}`}>
      <span className="map-metro-station-exit-direction" aria-hidden="true">
        {arrow}
      </span>
      <div className="map-metro-station-exit-list">
        {exits.map((exit, index) => {
          const description = formatStationExitDescription(exit);
          return (
            <div className="map-metro-station-exit-row" key={`${exit.code}-${index}`}>
              {isRight ? (
                <>
                  <span className="map-metro-station-exit-description">{description}</span>
                  <strong className="map-metro-station-exit-code">
                    {formatStationExitCode(exit.code)}
                  </strong>
                </>
              ) : (
                <>
                  <strong className="map-metro-station-exit-code">
                    {formatStationExitCode(exit.code)}
                  </strong>
                  <span className="map-metro-station-exit-description">{description}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StationPlatformSchematic({
  activeLine,
  currentFloor,
  detail,
  facilities,
  isTemplateFlipped,
  t,
}: Readonly<{
  activeLine: TransitOverviewLine | undefined;
  currentFloor: string;
  detail: TransitStationDetailSnapshot;
  facilities: TransitStationDetailSnapshot['facilities'];
  isTemplateFlipped: boolean;
  t: Translate;
}>) {
  const carriageCount = resolveStationDetailPositionScale(activeLine, facilities);
  const { lowerFacilities, upperFacilities } = splitStationPlatformFacilities(
    facilities,
    detail,
    currentFloor,
  );
  const firstStation = activeLine?.firstStationName ?? t('map.metroInfrastructure.upwardsTerminus');
  const lastStation = activeLine?.lastStationName ?? t('map.metroInfrastructure.downwardsTerminus');
  const leftDirectionStation = isTemplateFlipped ? lastStation : firstStation;
  const rightDirectionStation = isTemplateFlipped ? firstStation : lastStation;
  return (
    <div className="map-metro-station-platform-schematic">
      <div className="map-metro-station-platform-direction">
        <span>{t('map.metroInfrastructure.towardsLeft', { station: leftDirectionStation })}</span>
        <span>{t('map.metroInfrastructure.towardsRight', { station: rightDirectionStation })}</span>
      </div>
      {upperFacilities.length > 0 ? (
        <StationFacilityTrack
          carriageCount={carriageCount}
          currentFloor={currentFloor}
          detail={detail}
          facilities={upperFacilities}
          isTemplateFlipped={isTemplateFlipped}
          t={t}
        />
      ) : null}
      <div
        className={`map-metro-station-carriages${isTemplateFlipped ? ' is-template-flipped' : ''}`}
        style={{ '--station-carriage-count': carriageCount } as CSSProperties}
      >
        {Array.from({ length: carriageCount }, (_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
      {lowerFacilities.length > 0 ? (
        <StationFacilityTrack
          carriageCount={carriageCount}
          className="is-below-carriages"
          currentFloor={currentFloor}
          detail={detail}
          facilities={lowerFacilities}
          isTemplateFlipped={isTemplateFlipped}
          t={t}
        />
      ) : null}
    </div>
  );
}

function StationFacilityTrack({
  carriageCount,
  className = '',
  currentFloor,
  detail,
  facilities,
  isTemplateFlipped,
  t,
}: Readonly<{
  carriageCount: number;
  className?: string;
  currentFloor: string;
  detail: TransitStationDetailSnapshot;
  facilities: TransitStationDetailSnapshot['facilities'];
  isTemplateFlipped: boolean;
  t: Translate;
}>) {
  return (
    <div className={`map-metro-station-facility-track ${className}`.trim()}>
      {facilities.map((facility, index) => {
        const verticalDirection = resolveStationFacilityVerticalDirection(
          facility,
          detail,
          currentFloor,
        );
        return (
          <span
            className="map-metro-station-facility-icon"
            key={`${facility.type}-${facility.location ?? 'unpositioned'}-${index}`}
            style={
              {
                '--station-detail-position': `${resolveStationDetailPosition(
                  facility.location,
                  carriageCount,
                )}%`,
              } as CSSProperties
            }
            title={`${formatStationFacilityType(facility.type, t)}${
              facility.endFloor
                ? ` · ${t('stationDetail.facilities.toFloor', { floor: facility.endFloor })}`
                : ''
            }${
              facility.direction
                ? ` · ${formatStationFacilityDirection(facility.direction, t)}`
                : ''
            }${facility.oneWay ? ` · ${formatStationFacilityOneWay(facility.oneWay, t)}` : ''}${
              facility.orientation
                ? ` · ${t('map.metroInfrastructure.facing', { orientation: facility.orientation })}`
                : ''
            }`}
          >
            <span
              className={
                shouldFlipStationFacility(facility, detail, currentFloor) !== isTemplateFlipped
                  ? 'map-metro-station-facility-symbols is-flipped'
                  : 'map-metro-station-facility-symbols'
              }
              aria-hidden="true"
            >
              {getStationFacilityIcons(facility.type, verticalDirection).map((icon) =>
                icon.assetName ? (
                  <i
                    className="map-metro-station-facility-asset"
                    key={icon.key}
                    style={
                      {
                        '--map-metro-station-facility-asset': `url("${appPath(
                          `/metro-facilities/plain/${icon.assetName}.svg`,
                        )}")`,
                      } as CSSProperties
                    }
                  />
                ) : (
                  <i className="material-symbols-outlined" key={icon.key}>
                    {icon.symbol}
                  </i>
                ),
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function splitStationPlatformFacilities(
  facilities: TransitStationDetailSnapshot['facilities'],
  detail: TransitStationDetailSnapshot,
  currentFloor: string,
): {
  lowerFacilities: TransitStationDetailSnapshot['facilities'];
  upperFacilities: TransitStationDetailSnapshot['facilities'];
} {
  const upperFacilities: TransitStationDetailSnapshot['facilities'] = [];
  const lowerFacilities: TransitStationDetailSnapshot['facilities'] = [];
  const sameFloorFacilities: TransitStationDetailSnapshot['facilities'] = [];

  for (const facility of facilities) {
    const verticalDirection = resolveStationFacilityVerticalDirection(
      facility,
      detail,
      currentFloor,
    );
    if (verticalDirection === 'upwards') {
      upperFacilities.push(facility);
    } else if (verticalDirection === 'downwards') {
      lowerFacilities.push(facility);
    } else {
      sameFloorFacilities.push(facility);
    }
  }

  if (upperFacilities.length > 0) {
    upperFacilities.push(...sameFloorFacilities);
  } else {
    lowerFacilities.push(...sameFloorFacilities);
  }

  return { lowerFacilities, upperFacilities };
}

function resolveStationFacilityVerticalDirection(
  facility: TransitStationDetailSnapshot['facilities'][number],
  detail: TransitStationDetailSnapshot,
  currentFloor: string,
): 'upwards' | 'downwards' | 'same_floor' {
  const currentLayerIndex = detail.layers.findIndex((layer) => layer.floor === currentFloor);
  const endLayerIndex = detail.layers.findIndex((layer) => layer.floor === facility.endFloor);
  if (currentLayerIndex >= 0 && endLayerIndex >= 0 && endLayerIndex !== currentLayerIndex) {
    return endLayerIndex < currentLayerIndex ? 'upwards' : 'downwards';
  }
  if (facility.direction === 'up' || facility.direction === 'upwards') {
    return 'upwards';
  }
  if (facility.direction === 'down' || facility.direction === 'downwards') {
    return 'downwards';
  }
  return 'same_floor';
}

function formatStationPlatformSide(
  value: TransitStationDetailSnapshot['platformSide'],
  t: Translate,
): string {
  if (value === 'left') return t('map.metroInfrastructure.platformSide.left');
  if (value === 'right') return t('map.metroInfrastructure.platformSide.right');
  if (value === 'both') return t('map.metroInfrastructure.platformSide.both');
  return t('map.metroInfrastructure.platformSide.unknown');
}

function formatStationLayerType(value: string, t: Translate): string {
  const labels: Record<string, CommonMessageKey> = {
    concourse: 'map.metroInfrastructure.layer.concourse',
    platform: 'map.metroInfrastructure.layer.platform',
    transfer: 'map.metroInfrastructure.layer.transfer',
    entrance: 'map.metroInfrastructure.layer.entrance',
    passageway: 'map.metroInfrastructure.layer.passageway',
  };
  return labels[value] ? t(labels[value]) : value;
}

function formatStationFacilityType(value: string, t: Translate): string {
  const labels: Partial<Record<StationFacilityKind, CommonMessageKey>> = {
    toilet: 'map.metroInfrastructure.facility.toilet',
    mens_restroom: 'map.metroInfrastructure.facility.mensRestroom',
    womens_restroom: 'map.metroInfrastructure.facility.womensRestroom',
    family_restroom: 'map.metroInfrastructure.facility.familyRestroom',
    accessible_restroom: 'map.metroInfrastructure.facility.accessibleRestroom',
    third_restroom: 'map.metroInfrastructure.facility.thirdRestroom',
    elevator: 'map.metroInfrastructure.facility.elevator',
    escalator_and_stairs: 'map.metroInfrastructure.facility.escalatorAndStairs',
    stairs: 'map.metroInfrastructure.facility.stairs',
    stairs_two_way: 'map.metroInfrastructure.facility.stairsTwoWay',
    escalator: 'map.metroInfrastructure.facility.escalator',
    platform_door: 'map.metroInfrastructure.facility.platformDoor',
    nursing_room: 'map.metroInfrastructure.facility.nursingRoom',
    police: 'map.metroInfrastructure.facility.police',
    waiting_room: 'map.metroInfrastructure.facility.waitingRoom',
    wheelchair_lift: 'map.metroInfrastructure.facility.wheelchairLift',
    wheelchair: 'map.metroInfrastructure.facility.wheelchair',
    subway: 'map.metroInfrastructure.facility.subway',
    passenger_service_center: 'map.metroInfrastructure.facility.passengerServiceCenter',
    ticket_machine: 'map.metroInfrastructure.facility.ticketMachine',
    meeting_point: 'map.metroInfrastructure.facility.meetingPoint',
    exit: 'map.metroInfrastructure.facility.exit',
  };
  const label = labels[resolveStationFacilityKind(value)];
  return label ? t(label) : value;
}

type StationFacilityKind =
  | 'toilet'
  | 'mens_restroom'
  | 'womens_restroom'
  | 'family_restroom'
  | 'accessible_restroom'
  | 'third_restroom'
  | 'elevator'
  | 'escalator_and_stairs'
  | 'stairs'
  | 'stairs_two_way'
  | 'escalator'
  | 'platform_door'
  | 'nursing_room'
  | 'police'
  | 'waiting_room'
  | 'wheelchair_lift'
  | 'wheelchair'
  | 'subway'
  | 'passenger_service_center'
  | 'ticket_machine'
  | 'meeting_point'
  | 'exit'
  | 'unknown';

interface StationFacilityIcon {
  key: string;
  assetName?: MetroFacilityIconAssetName;
  symbol?: string;
}

function resolveStationFacilityKind(value: string): StationFacilityKind {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, '_');
  if (normalized.includes('escalator_and_stairs')) return 'escalator_and_stairs';
  if (/(?:mens|male|men)_?(?:restroom|toilet)/u.test(normalized)) return 'mens_restroom';
  if (/(?:womens|female|women)_?(?:restroom|toilet)/u.test(normalized)) {
    return 'womens_restroom';
  }
  if (/family_?(?:restroom|toilet)/u.test(normalized)) return 'family_restroom';
  // “无障碍卫生间（男+女+轮椅）”与“家庭卫生间（男+女+小孩）”是两个不同设施，
  // 必须在通用 restroom 兜底之前判定。
  if (/accessible_?(?:restroom|toilet)/u.test(normalized)) return 'accessible_restroom';
  if (/third_?(?:restroom|toilet)/u.test(normalized)) return 'third_restroom';
  if (normalized.includes('wheelchair_lift')) return 'wheelchair_lift';
  if (normalized.includes('nursing_room')) return 'nursing_room';
  if (normalized.includes('waiting_room')) return 'waiting_room';
  if (normalized.includes('passenger_service') || normalized.includes('service_center')) {
    return 'passenger_service_center';
  }
  if (normalized.includes('ticket_machine') || normalized.includes('ticketing')) {
    return 'ticket_machine';
  }
  if (normalized.includes('meeting_point') || normalized.includes('rendezvous')) {
    return 'meeting_point';
  }
  if (normalized.includes('platform_door')) return 'platform_door';
  if (
    /(?:two_way|bidirectional|both_directions?)_?(?:stairs?)|stairs_?(?:two_way|bidirectional)/u.test(
      normalized,
    )
  ) {
    return 'stairs_two_way';
  }
  if (normalized.includes('toilet') || normalized.includes('restroom')) return 'toilet';
  if (normalized.includes('elevator')) return 'elevator';
  if (normalized.includes('stairs')) return 'stairs';
  if (normalized.includes('escalator')) return 'escalator';
  if (normalized.includes('wheelchair') || normalized.includes('accessible')) return 'wheelchair';
  if (normalized.includes('police')) return 'police';
  if (normalized.includes('subway') || normalized.includes('metro')) return 'subway';
  if (normalized.includes('exit')) return 'exit';
  return 'unknown';
}

function getStationFacilityIcons(
  value: string,
  verticalDirection: 'upwards' | 'downwards' | 'same_floor',
): StationFacilityIcon[] {
  const kind = resolveStationFacilityKind(value);
  const stairsAssetName = verticalDirection === 'downwards' ? 'stairs-down' : 'stairs-up';
  if (kind === 'escalator_and_stairs') {
    return [{ key: 'escalator-and-stairs', assetName: 'escalator-and-stairs' }];
  }
  const assets: Partial<Record<StationFacilityKind, MetroFacilityIconAssetName>> = {
    toilet: 'restroom',
    mens_restroom: 'mens-restroom',
    womens_restroom: 'womens-restroom',
    family_restroom: 'family-restroom',
    accessible_restroom: 'accessible-restroom',
    // 本站点设施类型里的 third_restroom 沿用外部项目语义，落到本项目的“家庭卫生间”图标。
    third_restroom: 'family-restroom',
    elevator: 'accessible-elevator',
    stairs: stairsAssetName,
    stairs_two_way: 'stairs-two-way',
    escalator: 'escalator',
    nursing_room: 'nursing-room',
    waiting_room: 'waiting-room',
    wheelchair_lift: 'wheelchair-lift',
    wheelchair: 'wheelchair',
    subway: 'subway',
    passenger_service_center: 'passenger-service-center',
    ticket_machine: 'ticket-machine',
    meeting_point: 'meeting-point',
    exit: 'exit',
  };
  const assetName = assets[kind];
  if (assetName) return [{ key: assetName, assetName }];
  const symbols: Partial<Record<StationFacilityKind, string>> = {
    platform_door: 'door_open',
    police: 'local_police',
    wheelchair: 'accessible',
    unknown: 'location_on',
  };
  const symbol = symbols[kind] ?? 'location_on';
  return [{ key: symbol, symbol }];
}

function hasDifferentUpwardsFacilityLayout(detail: TransitStationDetailSnapshot): boolean {
  return (
    detail.facilitiesUpwards !== undefined &&
    JSON.stringify(detail.facilitiesUpwards) !== JSON.stringify(detail.facilities)
  );
}

function hasDirectionSpecificStationLayout(detail: TransitStationDetailSnapshot): boolean {
  return (
    hasDifferentUpwardsFacilityLayout(detail) ||
    Boolean(detail.swapExitLayers) ||
    Boolean(detail.flipTemplateForUpwards)
  );
}

function formatStationDetailTabLabel(
  lineName: string,
  direction: 'downwards' | 'upwards',
  line: TransitOverviewLine | undefined,
  includeDirection: boolean,
  t: Translate,
): string {
  if (!includeDirection) {
    return lineName;
  }
  const terminal =
    direction === 'upwards'
      ? (line?.firstStationName ?? t('map.metroInfrastructure.upwardsTerminus'))
      : (line?.lastStationName ?? t('map.metroInfrastructure.downwardsTerminus'));
  return t('map.metroInfrastructure.lineTowards', { lineName, terminal });
}

function resolveStationExitFloor(
  detail: TransitStationDetailSnapshot,
  floor: string | undefined,
  direction: 'downwards' | 'upwards',
): string | undefined {
  if (direction !== 'upwards' || !floor || !detail.swapExitLayers) {
    return floor;
  }
  const [firstFloor, secondFloor] = detail.swapExitLayers;
  if (floor === firstFloor) return secondFloor;
  if (floor === secondFloor) return firstFloor;
  return floor;
}

function shouldFlipStationFacility(
  facility: TransitStationDetailSnapshot['facilities'][number],
  detail: TransitStationDetailSnapshot,
  currentFloor: string,
): boolean {
  if (!facility.type.includes('stairs') && !facility.type.includes('escalator')) {
    return false;
  }

  let shouldFlip = facility.direction === 'upwards';
  const currentLayerIndex = detail.layers.findIndex((layer) => layer.floor === currentFloor);
  const endLayerIndex = detail.layers.findIndex((layer) => layer.floor === facility.endFloor);
  if (currentLayerIndex >= 0 && endLayerIndex > currentLayerIndex) {
    shouldFlip = !shouldFlip;
  }
  return shouldFlip;
}

function formatStationTransferMarker(lineName: string): string {
  return lineName.match(/\d+/)?.[0] ?? 'M';
}

function formatStationExitGroup(
  exits: TransitStationDetailSnapshot['exits'],
  arrow: '←' | '→',
  t: Translate,
): string {
  if (exits.length === 0) {
    return '';
  }
  const codes = exits.map((exit) => exit.code).join('/');
  return t(
    arrow === '←'
      ? 'map.metroInfrastructure.exitGroup.left'
      : 'map.metroInfrastructure.exitGroup.right',
    { arrow, codes },
  );
}

function formatStationExitCode(code: string): string {
  const normalized = code.trim();
  return normalized.endsWith('出口') ? normalized : `${normalized}出口`;
}

function formatStationExitDescription(exit: TransitStationDetailSnapshot['exits'][number]): string {
  return [exit.description, exit.orientation].filter(Boolean).join(' · ');
}

function resolveStationDetailPosition(
  location: number | undefined,
  maxPosition: number | undefined,
): number {
  if (location === undefined || !maxPosition || maxPosition <= 0) {
    return 50;
  }
  return Math.max(0, Math.min(100, (location / maxPosition) * 100));
}

function resolveStationDetailPositionScale(
  activeLine: TransitOverviewLine | undefined,
  ...locationGroups: Array<Array<{ location?: number }>>
): number {
  const largestLocation = Math.max(
    0,
    ...locationGroups.flatMap((group) =>
      group.map((item) => (Number.isFinite(item.location) ? Math.ceil(item.location ?? 0) : 0)),
    ),
  );
  return Math.max(6, activeLine?.maxCarCount ?? 0, largestLocation);
}

function formatStationFacilityDirection(value: string, t: Translate): string {
  const labels: Record<string, CommonMessageKey> = {
    up: 'map.metroInfrastructure.direction.up',
    down: 'map.metroInfrastructure.direction.down',
    upwards: 'map.metroInfrastructure.direction.up',
    downwards: 'map.metroInfrastructure.direction.down',
    here: 'map.metroInfrastructure.direction.here',
  };
  return labels[value] ? t(labels[value]) : value;
}

function formatStationTransferDirection(value: 'upwards' | 'downwards', t: Translate): string {
  return t(
    value === 'upwards'
      ? 'map.metroInfrastructure.transferDirection.upwards'
      : 'map.metroInfrastructure.transferDirection.downwards',
  );
}

function formatStationFacilityOneWay(value: string, t: Translate): string {
  const labels: Record<string, CommonMessageKey> = {
    up: 'map.metroInfrastructure.oneWay.up',
    down: 'map.metroInfrastructure.oneWay.down',
    none: 'map.metroInfrastructure.oneWay.both',
  };
  return labels[value] ? t(labels[value]) : value;
}

function groupSecondaryPois(
  links: SecondaryPoiLink[],
  categoryById: ReadonlyMap<string, string>,
  t: Translate,
): SecondaryPoiGroup[] {
  const groups = new Map<string, SecondaryPoiGroup>();

  for (const link of links) {
    const categoryId = link.marker.categoryId?.trim() || 'uncategorized';
    const group = {
      id: `category:${categoryId}`,
      label:
        categoryId === 'uncategorized'
          ? t('map.poi.relatedPlaceFallback')
          : (categoryById.get(categoryId) ?? getMarkerCategoryDisplayName(categoryId, t)),
    };
    const current = groups.get(group.id) ?? { ...group, items: [] };
    current.items.push(link);
    groups.set(group.id, current);
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
}

function formatSecondaryPoiGroupLabel(groupId: string, fallback: string, t: Translate): string {
  if (groupId.startsWith('category:')) {
    return fallback;
  }
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

function MarkerListIcon({
  marker,
  iconBaseUrl,
}: Readonly<{
  marker: SidebarMarker;
  iconBaseUrl: string;
}>) {
  if (marker.playerLocation?.avatarUrl) {
    return (
      <ProgressiveImage
        className={
          marker.playerLocation.presence === 'offline'
            ? 'map-player-list-avatar is-offline'
            : 'map-player-list-avatar'
        }
        src={marker.playerLocation.avatarUrl}
        alt=""
        draggable={false}
        showStatus={false}
      />
    );
  }

  const dynamicSymbol = resolveMarkerDynamicSymbol(marker);
  if (dynamicSymbol) {
    return <DynamicMapMarkerSymbol symbol={dynamicSymbol} />;
  }

  if (marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)) {
    return <img src={toMarkerIconUrl(marker.iconFileName, iconBaseUrl)} alt="" draggable={false} />;
  }

  return (
    <MaterialSymbol
      className="map-marker-list-symbol"
      name={marker.symbolIcon ?? 'location_on'}
      style={{ color: marker.accentColor }}
      aria-hidden="true"
    />
  );
}

function DynamicMapMarkerSymbol({
  symbol,
}: Readonly<{
  symbol: NonNullable<
    NonNullable<MapMarkerSnapshot['markers'][number]['spatial']>['dynamicSymbol']
  >;
}>) {
  return (
    <span
      className={[
        'map-dynamic-symbol',
        `is-${symbol.kind.replace('_', '-')}`,
        symbol.kind === 'highway_ref' && symbol.ref.trim().toUpperCase().startsWith('G')
          ? 'is-g-highway-ref'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--map-dynamic-symbol-background': symbol.backgroundColor,
          '--map-dynamic-symbol-color': symbol.textColor,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {symbol.kind === 'highway_ref' ? <span className="map-dynamic-symbol-highway-bar" /> : null}
      <span className="map-dynamic-symbol-text">{symbol.ref}</span>
    </span>
  );
}

function resolveMarkerDynamicSymbol(
  marker: Pick<
    MapMarkerSnapshot['markers'][number],
    'categoryId' | 'iconFileName' | 'label' | 'spatial'
  >,
):
  | NonNullable<NonNullable<MapMarkerSnapshot['markers'][number]['spatial']>['dynamicSymbol']>
  | undefined {
  if (marker.spatial?.dynamicSymbol) {
    return marker.spatial.dynamicSymbol;
  }
  const baseName = getMarkerIconBaseName(marker.iconFileName);
  const metroExit = /^exit-([a-z0-9-]+)$/i.exec(baseName);
  if (metroExit?.[1]) {
    return { kind: 'metro_exit', ref: metroExit[1].toUpperCase() };
  }
  const highwayRef = /^highway-([a-z0-9-]+)$/i.exec(baseName);
  if (highwayRef?.[1]) {
    return { kind: 'highway_ref', ref: highwayRef[1].toUpperCase() };
  }

  const roadKind = getRoadMarkerKind(marker);
  const roadReference = parseRoadReference(marker.label);
  if (roadKind && roadReference) {
    return {
      kind: roadKind === 'highway' ? 'highway_ref' : 'road_ref',
      ref: roadReference,
    };
  }
  return undefined;
}

function parseRoadReference(label: string): string | undefined {
  const normalized = label.replace(/[\s\u3000]+/g, '').toUpperCase();
  const match =
    /(?:^|[^A-Z0-9])(?:国道|省道|县道|乡道)?([GSXY])[-:]?(\d+[A-Z]?)(?=$|[^A-Z0-9])/.exec(
      normalized,
    );
  return match?.[1] && match[2] ? `${match[1]}${match[2]}` : undefined;
}

function MapPoiImageGallery({
  counterLabel,
  imageAlt,
  imageUrls,
  nextLabel,
  previousLabel,
}: Readonly<{
  counterLabel: (current: number, total: number) => string;
  imageAlt: string;
  imageUrls: string[];
  nextLabel: string;
  previousLabel: string;
}>) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeStartXRef = useRef<number | null>(null);
  const hasMultipleImages = imageUrls.length > 1;
  const imageKey = imageUrls.join('\u0000');

  useEffect(() => {
    setActiveIndex(0);
  }, [imageKey]);

  const showPrevious = () =>
    setActiveIndex((current) => (current - 1 + imageUrls.length) % imageUrls.length);
  const showNext = () => setActiveIndex((current) => (current + 1) % imageUrls.length);
  const finishSwipe = (clientX: number) => {
    const startX = swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (startX === null || Math.abs(clientX - startX) < 36) {
      return;
    }
    if (clientX < startX) {
      showNext();
    } else {
      showPrevious();
    }
  };

  return (
    <div
      className={
        hasMultipleImages ? 'map-poi-detail-gallery is-multiple' : 'map-poi-detail-gallery'
      }
      onPointerDown={(event) => {
        if (hasMultipleImages) {
          swipeStartXRef.current = event.clientX;
        }
      }}
      onPointerUp={(event) => finishSwipe(event.clientX)}
      onPointerCancel={() => {
        swipeStartXRef.current = null;
      }}
    >
      <ProgressiveImage
        className="map-poi-detail-image"
        src={appPath(imageUrls[activeIndex] ?? imageUrls[0])}
        alt={imageAlt}
        loading="lazy"
        draggable={false}
      />
      {hasMultipleImages ? (
        <>
          <button
            className="map-poi-detail-gallery-button is-previous"
            type="button"
            aria-label={previousLabel}
            onClick={showPrevious}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <button
            className="map-poi-detail-gallery-button is-next"
            type="button"
            aria-label={nextLabel}
            onClick={showNext}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              chevron_right
            </span>
          </button>
          <span className="map-poi-detail-gallery-counter">
            {counterLabel(activeIndex + 1, imageUrls.length)}
          </span>
        </>
      ) : null}
    </div>
  );
}

function getMapMarkerImageUrls(marker: MapMarkerSnapshot['markers'][number]): string[] {
  return Array.from(
    new Set([...(marker.imageUrls ?? []), ...(marker.imageUrl ? [marker.imageUrl] : [])]),
  ).filter(Boolean);
}

function filterMarkers<T extends MapMarkerSnapshot['markers'][number]>(
  markers: T[],
  query: string,
): T[] {
  return filterMapMarkers(markers, query);
}

function findPoiAddressRoadMarkers(
  address: string,
  markers: EndpointGroupMarker[],
): EndpointGroupMarker[] {
  const normalizedAddress = normalizeMarkerSearchText(address);
  if (!normalizedAddress) {
    return [];
  }

  return markers
    .filter((marker) => {
      const normalizedLabel = normalizeMarkerSearchText(marker.label);
      return normalizedLabel.length >= 2 && normalizedAddress.includes(normalizedLabel);
    })
    .sort(
      (left, right) =>
        normalizeMarkerSearchText(right.label).length -
          normalizeMarkerSearchText(left.label).length || left.label.localeCompare(right.label),
    );
}

function buildStationConnectionIndex(
  overview: TransitOverviewResponse | null,
  t: Translate,
  pointMarkers: PointMarker[],
): TransitStationConnectionIndex {
  const index: TransitStationConnectionIndex = {
    byName: new Map(),
    byMarkerId: new Map(),
  };
  if (!overview) {
    return index;
  }

  const profileByMode = new Map(
    (overview.modeProfiles ?? []).map((profile) => [profile.mode, profile]),
  );
  const stationMarkerIndex = buildTransitStationMarkerIndex(pointMarkers);

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
    const lineMode = isRouteTransportMode(line.mode) ? line.mode : undefined;

    for (const stationName of line.stationNames ?? []) {
      for (const key of getStationNameMatchKeys(stationName)) {
        addStationConnection(index.byName, key, connection);
      }
    }

    for (const stop of line.stationStops ?? []) {
      const refs = stop.stopLocationRefs ?? [];
      if (refs.length > 0) {
        for (const ref of refs) {
          addStationConnection(index.byMarkerId, ref.markerId, connection);
        }
        continue;
      }

      if (!lineMode) {
        continue;
      }
      const marker = findTransitStationMarker(
        { stationName: stop.stationName, stationMarkerIds: stop.stationMarkerIds },
        stationMarkerIndex,
        pointMarkers,
        lineMode,
      );
      if (marker) {
        addStationConnection(index.byMarkerId, marker.id, connection);
      }
    }
  }

  for (const [key, connections] of index.byName) {
    index.byName.set(key, connections.sort(compareTransitConnections));
  }
  for (const [markerId, connections] of index.byMarkerId) {
    index.byMarkerId.set(markerId, connections.sort(compareTransitConnections));
  }
  return index;
}

function addStationConnection(
  index: Map<string, TransitLineConnection[]>,
  key: string,
  connection: TransitLineConnection,
) {
  const existing = index.get(key) ?? [];
  if (!existing.some((item) => item.id === connection.id)) {
    existing.push(connection);
    index.set(key, existing);
  }
}

function localizeTransitOverview(
  overview: TransitOverviewResponse | null,
  locale: LocaleCode,
): TransitOverviewResponse | null {
  if (!overview || locale === 'zh-CN') {
    return overview;
  }
  return {
    ...overview,
    lines: overview.lines.map((line) => {
      const stationNameMap = new Map(
        (line.stationStops ?? []).map((stop) => [
          stop.stationName,
          resolveLocalizedLabel(stop.stationName, stop.localizedStationName, locale),
        ]),
      );
      return {
        ...line,
        name: resolveLocalizedLabel(line.name, line.localizedName, locale),
        stationNames: line.stationNames,
        displayStationNames: line.stationNames.map((name) => stationNameMap.get(name) ?? name),
        stationStops: line.stationStops?.map((stop) => ({
          ...stop,
          displayStationName: resolveLocalizedLabel(
            stop.stationName,
            stop.localizedStationName,
            locale,
          ),
        })),
        firstStationName: line.firstStationName ? line.firstStationName : undefined,
        lastStationName: line.lastStationName ? line.lastStationName : undefined,
        displayFirstStationName: line.firstStationName
          ? (stationNameMap.get(line.firstStationName) ?? line.firstStationName)
          : undefined,
        displayLastStationName: line.lastStationName
          ? (stationNameMap.get(line.lastStationName) ?? line.lastStationName)
          : undefined,
      };
    }),
  };
}

function resolveLocalizedLabel(
  sourceText: string,
  localizedLabels: LocalizedLabelMap | undefined,
  locale: LocaleCode,
): string {
  const normalizedSourceText = normalizeLegacyMapSourceText(sourceText);
  return locale === 'zh-CN'
    ? normalizedSourceText
    : localizedLabels?.[locale]?.trim() || normalizedSourceText;
}

function findStationConnections(
  marker: MapMarkerSnapshot['markers'][number],
  index: TransitStationConnectionIndex,
): TransitLineConnection[] {
  const directConnections = index.byMarkerId.get(marker.id);
  if (directConnections && directConnections.length > 0) {
    return directConnections;
  }

  // 没有线路明确指定该 POI 时，回退到车站名下的全部线路，
  // 等同于这些线路默认使用车站第一个可用 POI。
  const collected: TransitLineConnection[] = [];
  const seen = new Set<string>();

  for (const key of getMarkerStationNameMatchKeys(marker)) {
    for (const connection of index.byName.get(key) ?? []) {
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

function findTransitStationMarkerForLine(
  markers: PointMarker[],
  stationName: string,
  line: TransitOverviewLine,
  connectionIndex: TransitStationConnectionIndex,
): PointMarker | undefined {
  const stopMarkerIds = dedupeValues(
    (line.stationStops ?? [])
      .filter((stop) =>
        getStationNameMatchKeys(stop.stationName).some((key) =>
          getStationNameMatchKeys(stationName).includes(key),
        ),
      )
      .flatMap((stop) => stop.stationMarkerIds ?? []),
  );
  const lineMode = isRouteTransportMode(line.mode) ? line.mode : 'walk';
  const markerById = new Map(markers.map((marker) => [marker.id, marker] as const));
  const exactBoundMarker = stopMarkerIds
    .map((markerId) => markerById.get(markerId))
    .find((marker): marker is PointMarker =>
      Boolean(marker && matchesTransitMarkerMode(marker, lineMode)),
    );
  if (exactBoundMarker) {
    return exactBoundMarker;
  }

  const stationKeys = new Set(getStationNameMatchKeys(stationName));
  const candidates = markers.filter(
    (marker) =>
      isTransitStationPoi(marker) &&
      matchesTransitMarkerMode(marker, lineMode) &&
      getMarkerStationNameMatchKeys(marker).some((key) => stationKeys.has(key)),
  );

  return (
    candidates.find((marker) =>
      findStationConnections(marker, connectionIndex).some(
        (connection) => connection.id === line.id,
      ),
    ) ?? candidates[0]
  );
}

function findTransitLineStationMarkers(
  markers: PointMarker[],
  line: TransitOverviewLine,
  connectionIndex: TransitStationConnectionIndex,
): PointMarker[] {
  const explicitMarkerIds = new Set(
    (line.stationStops ?? []).flatMap((stop) =>
      (stop.stopLocationRefs ?? []).map((ref) => ref.markerId),
    ),
  );
  const explicitMarkerIdsByStationKey = new Map<string, Set<string>>();
  for (const stop of line.stationStops ?? []) {
    const refs = stop.stopLocationRefs ?? [];
    if (refs.length === 0) {
      continue;
    }
    for (const key of getStationNameMatchKeys(stop.stationName)) {
      const markerIds = explicitMarkerIdsByStationKey.get(key) ?? new Set<string>();
      for (const ref of refs) {
        markerIds.add(ref.markerId);
      }
      explicitMarkerIdsByStationKey.set(key, markerIds);
    }
  }
  const stationKeys = new Set(line.stationNames.flatMap(getStationNameMatchKeys));
  const lineMode = isRouteTransportMode(line.mode) ? line.mode : 'walk';
  return dedupeMarkersById(
    markers.filter((marker) => {
      if (!matchesTransitMarkerMode(marker, lineMode)) {
        return false;
      }
      if (explicitMarkerIds.has(marker.id)) {
        return true;
      }
      if (!isTransitStationPoi(marker)) {
        return false;
      }
      const markerStationKeys = getMarkerStationNameMatchKeys(marker);
      if (!markerStationKeys.some((key) => stationKeys.has(key))) {
        return false;
      }
      // 该线路在这个站已经明确指定了停靠 POI 时，不再高亮同站其他 POI。
      const explicitIdsAtStation = new Set<string>();
      for (const key of markerStationKeys) {
        for (const markerId of explicitMarkerIdsByStationKey.get(key) ?? []) {
          explicitIdsAtStation.add(markerId);
        }
      }
      if (explicitIdsAtStation.size > 0) {
        return explicitIdsAtStation.has(marker.id);
      }
      return findStationConnections(marker, connectionIndex).some(
        (connection) => connection.id === line.id,
      );
    }),
  );
}

function findTransitLineByMarker(
  marker: TransitLineMarker,
  lookup: ReadonlyMap<string, TransitOverviewLine>,
): TransitOverviewLine | undefined {
  const markerLineId = marker.id.replace(/^transit-line-/, '');
  return lookup.get(markerLineId) ?? lookup.get(marker.sourceLabel) ?? lookup.get(marker.label);
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

function getMarkerStationNameMatchKeys(marker: { label: string; sourceLabel?: string }): string[] {
  return dedupeValues([
    ...getStationNameMatchKeys(marker.sourceLabel ?? marker.label),
    ...getStationNameMatchKeys(marker.label),
  ]);
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
    .flatMap((marker) => {
      if (marker.transitOperationStatus === 'closed') {
        return [];
      }
      const [x, z] = marker.geometry.coordinates;
      const forceLabel = Boolean(options?.forceLabelMarkerIds?.has(marker.id));
      const suppressLabel = Boolean(options?.suppressLabelMarkerIds?.has(marker.id));
      const hideIcon = Boolean(marker.spatial?.hideMarkerIcon);
      const priority =
        getMarkerPriorityForBrowseMode(marker, browseMode) +
        (representativePoiIds.has(marker.id) ? representativePoiPriorityBoost : 0) +
        (forceLabel ? 1000 : 0);
      return [
        {
          id: marker.id,
          label: formatMarkerDisplayName(marker.label),
          categoryId: marker.categoryId,
          x,
          z,
          left: size.width / 2 + (x - view.centerX) * scale,
          top: size.height / 2 + (z - view.centerZ) * scale,
          iconUrl: hideIcon
            ? undefined
            : (marker.playerLocation?.avatarUrl ??
              (marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)
                ? toMarkerIconUrl(marker.iconFileName, iconBaseUrl)
                : undefined)),
          dynamicSymbol: hideIcon ? undefined : resolveMarkerDynamicSymbol(marker),
          symbolIcon: hideIcon ? undefined : marker.symbolIcon,
          showLabel: hideIcon
            ? true
            : marker.playerLocation
              ? false
              : forceLabel
                ? true
                : suppressLabel
                  ? false
                  : marker.id === focusedMarkerId ||
                    shouldShowMarkerLabelForBrowseMode(marker, browseMode, priority),
          hideIcon,
          priority,
          roadKind: getRoadMarkerKind(marker),
          playerPresence: marker.playerLocation?.presence,
          isPlayer: marker.categoryId === 'player' && Boolean(marker.playerLocation),
          isCurrentAccount: marker.playerLocation?.isCurrentAccount,
          transitOperationStatus:
            marker.transitOperationStatus === 'planned' ? ('planned' as const) : undefined,
        },
      ];
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

    const orderedCoordinates = getRoadTraceCoordinates(marker);
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
    const transitSegments = marker.transitLineSegments
      ?.map((segment): ProjectedTransitTraceSegment | undefined => {
        if (segment.coordinates.length < 2) {
          return undefined;
        }
        return {
          operationStatus: segment.operationStatus,
          path: buildTracePath(
            segment.coordinates,
            view,
            size,
            traceProjection.left,
            traceProjection.top,
          ),
        };
      })
      .filter((segment): segment is ProjectedTransitTraceSegment => Boolean(segment));

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
        transitSegments,
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
        path: buildTracePath(
          segment.coordinates,
          view,
          size,
          traceProjection.left,
          traceProjection.top,
        ),
      };
    })
    .filter((segment): segment is ProjectedRouteTraceSegment => Boolean(segment));
  const routeRoadSegments = option.roadLabels
    ?.map((segment): ProjectedRouteRoadSegment | undefined => {
      if (segment.coordinates.length < 2) {
        return undefined;
      }

      return {
        color: segment.color ?? routeWalkTraceColor,
        id: segment.id,
        label: segment.label,
        path: buildTracePath(
          segment.coordinates,
          view,
          size,
          traceProjection.left,
          traceProjection.top,
        ),
      };
    })
    .filter((segment): segment is ProjectedRouteRoadSegment => Boolean(segment));
  const labels = projectRouteRoadLabels(option.roadLabels, view, size);

  return {
    id: `route-option-${option.id}`,
    label: option.title,
    labels: labels.length > 0 ? labels : undefined,
    path: traceProjection.path,
    routeRoadSegments:
      routeRoadSegments && routeRoadSegments.length > 0 ? routeRoadSegments : undefined,
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

function buildRouteOverlayVisibility(
  option: RoutePlanOption | undefined,
  draft: RoutePlanDraft | null,
  active: boolean,
):
  | {
      forceLabelMarkerIds: ReadonlySet<string>;
      markerIds: ReadonlySet<string>;
      suppressLabelMarkerIds: ReadonlySet<string>;
    }
  | undefined {
  if (!active || !option) {
    return undefined;
  }

  return {
    forceLabelMarkerIds: new Set(
      dedupeValues(
        [draft?.originId, draft?.destinationId, ...(option.labelMarkerIds ?? [])].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ),
    markerIds: new Set(option.markerIds),
    suppressLabelMarkerIds: new Set(option.suppressLabelMarkerIds ?? []),
  };
}

function projectRouteEndpointMarkers(
  option: RoutePlanOption,
  draft: RoutePlanDraft,
  pointMarkers: PointMarker[],
  view: MapView,
  size: ViewportSize,
): ProjectedMarker[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }

  const pointMarkerIds = new Set(pointMarkers.map((marker) => marker.id));
  const forcedRouteMarkers = pointMarkers.filter((marker) =>
    option.labelMarkerIds?.includes(marker.id),
  );
  const scale = getScale(view.zoom);
  return [
    {
      coordinate: draft.originRaw ?? draft.origin,
      id: draft.originId,
      kind: 'origin' as const,
      label: draft.originLabel,
    },
    {
      coordinate: draft.destinationRaw ?? draft.destination,
      id: draft.destinationId,
      kind: 'destination' as const,
      label: draft.destinationLabel,
    },
  ].flatMap((endpoint): ProjectedMarker[] => {
    if (endpoint.id && pointMarkerIds.has(endpoint.id)) {
      return [];
    }
    if (
      forcedRouteMarkers.some(
        (marker) => getCoordinateDistance(marker.geometry.coordinates, endpoint.coordinate) <= 1,
      )
    ) {
      return [];
    }

    const [x, z] = endpoint.coordinate;
    const left = size.width / 2 + (x - view.centerX) * scale;
    const top = size.height / 2 + (z - view.centerZ) * scale;
    if (left < -80 || left > size.width + 80 || top < -80 || top > size.height + 80) {
      return [];
    }

    return [
      {
        id: `route-result-${endpoint.kind}`,
        label: endpoint.label,
        x,
        z,
        left,
        top,
        symbolIcon: endpoint.kind === 'destination' ? 'flag' : 'location_on',
        showLabel: true,
        hideIcon: false,
        priority: Number.MAX_SAFE_INTEGER,
      },
    ];
  });
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
  return labels.flatMap((label) => {
    const visibleSegments = getVisibleProjectedRouteLabelSegments(
      label.coordinates.map(([x, z]) => ({
        left: size.width / 2 + (x - view.centerX) * scale,
        top: size.height / 2 + (z - view.centerZ) * scale,
      })),
      size,
    );
    const visibleLength = visibleSegments.reduce((total, segment) => total + segment.length, 0);
    if (visibleLength <= 0) {
      return [];
    }
    const position = getProjectedRouteLabelPointAtDistance(visibleSegments, visibleLength / 2);
    if (!position) {
      return [];
    }
    const worldAnchor = screenToWorld(position.left, position.top, view, size);

    return [
      {
        color: label.color,
        id: label.id,
        isVerticalLabel: shouldUseVerticalMapRoadLabel(label.coordinates, [
          worldAnchor.x,
          worldAnchor.z,
        ]),
        label: label.label,
        left: position.left,
        top: position.top,
      },
    ];
  });
}

function applyRouteRoadLabelCollisionVisibility(
  trace: ProjectedRoadTrace | undefined,
  markers: ProjectedMarker[],
): ProjectedRoadTrace | undefined {
  if (!trace?.labels?.length) {
    return trace;
  }

  const acceptedBoxes = markers.map((marker) =>
    getMarkerCollisionBox(createMarkerCollisionItem(marker)),
  );
  const labels = trace.labels.filter((label) => {
    const box = getRouteRoadLabelCollisionBox(label);
    if (acceptedBoxes.some((accepted) => boxesOverlap(accepted, box))) {
      return false;
    }
    acceptedBoxes.push(box);
    return true;
  });

  return { ...trace, labels: labels.length > 0 ? labels : undefined };
}

function getRouteRoadLabelCollisionBox(label: ProjectedRouteRoadLabel): MarkerCollisionBox {
  const labelLength = normalizeMarkerDisplayText(label.label).length;
  const width = label.isVerticalLabel ? 24 : Math.max(42, labelLength * 12);
  const height = label.isVerticalLabel ? Math.max(36, labelLength * 13) : 24;
  return {
    left: label.left - width / 2,
    right: label.left + width / 2,
    top: label.top - height / 2,
    bottom: label.top + height / 2,
  };
}

function getVisibleProjectedRouteLabelSegments(
  points: Array<{ left: number; top: number }>,
  size: ViewportSize,
): Array<{
  start: { left: number; top: number };
  end: { left: number; top: number };
  length: number;
}> {
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

    const length = Math.hypot(
      clipped.end.left - clipped.start.left,
      clipped.end.top - clipped.start.top,
    );
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
      return numerator >= 0;
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
  segments: Array<{
    start: { left: number; top: number };
    end: { left: number; top: number };
    length: number;
  }>,
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

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeMarkerSearchText(value: string): string {
  return normalizeMarkerDisplayText(value)
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

function formatMarkerDisplayName(value: string): string {
  return normalizeMarkerDisplayText(value) || value.trim();
}

function normalizeMarkerDisplayText(value: string): string {
  return value
    .replace(/[|｜]+/g, '')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
}

function normalizeLegacyMapSourceText(value: string): string {
  return value.replace(/[\s\u3000|｜]+/g, '').trim() || value.trim();
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

function normalizeMapVisibleRect(rect: MapVisibleRect, size: ViewportSize): MapVisibleRect {
  if (size.width <= 0 || size.height <= 0) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.right) ||
    !Number.isFinite(rect.bottom) ||
    rect.right <= rect.left ||
    rect.bottom <= rect.top
  ) {
    return { left: 0, top: 0, right: size.width, bottom: size.height };
  }

  const left = clamp(rect.left, 0, Math.max(0, size.width - 1));
  const top = clamp(rect.top, 0, Math.max(0, size.height - 1));
  return {
    left,
    top,
    right: clamp(rect.right, left + 1, size.width),
    bottom: clamp(rect.bottom, top + 1, size.height),
  };
}

function mapVisibleRectsEqual(left: MapVisibleRect, right: MapVisibleRect): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.right - right.right) < 0.5 &&
    Math.abs(left.bottom - right.bottom) < 0.5
  );
}

interface MapOverlayVisibilitySnapshot {
  /** 上一次停稳时可见的标记点及其标签显示状态。 */
  markers: Map<string, boolean>;
  /** 上一次停稳时各线性 POI 的中心与文字标签显示状态。 */
  linearPois: Map<string, { showCenter: boolean; showTextLabel: boolean }>;
  /** 上一次停稳时可见的形状 POI。 */
  shapePois: Set<string>;
}

/**
 * 地图可视范围变化过程中使用的轻量筛选：沿用上一次停稳时的显示结果，
 * 只裁掉已经移出可视范围的覆盖物、不新增标记；结果再交给
 * applyMapOverlayCollisionVisibility 做碰撞裁剪。等视图停稳后再基于全量标记重新决定显示。
 */
function applyMapOverlayPreviousVisibility(
  markers: ProjectedMarker[],
  linearPois: ProjectedLinearPoi[],
  shapePois: ProjectedShapePoi[],
  size: ViewportSize,
  snapshot: MapOverlayVisibilitySnapshot | null,
): {
  markers: ProjectedMarker[];
  linearPois: ProjectedLinearPoi[];
  shapePois: ProjectedShapePoi[];
} {
  const isInsideViewport = (left: number, top: number) =>
    left >= 0 && left <= size.width && top >= 0 && top <= size.height;

  if (!snapshot) {
    return {
      markers: markers.filter((marker) => isInsideViewport(marker.left, marker.top)),
      linearPois: linearPois.filter(
        (marker) =>
          isInsideViewport(marker.left, marker.top) ||
          marker.endpoints.some((endpoint) => isInsideViewport(endpoint.left, endpoint.top)),
      ),
      shapePois: shapePois.filter(
        (shape) =>
          (shape.showLabel || shape.labelMode === 'representative') &&
          isInsideViewport(shape.centerLeft, shape.centerTop),
      ),
    };
  }

  return {
    markers: markers.flatMap((marker) => {
      const showLabel = snapshot.markers.get(marker.id);
      if (showLabel === undefined || !isInsideViewport(marker.left, marker.top)) {
        return [];
      }
      return [{ ...marker, showLabel }];
    }),
    linearPois: linearPois.flatMap((marker) => {
      const state = snapshot.linearPois.get(marker.id);
      if (!state) {
        return [];
      }
      if (
        !isInsideViewport(marker.left, marker.top) &&
        !marker.endpoints.some((endpoint) => isInsideViewport(endpoint.left, endpoint.top))
      ) {
        return [];
      }
      return [{ ...marker, ...state }];
    }),
    shapePois: shapePois.filter(
      (shape) =>
        snapshot.shapePois.has(shape.id) && isInsideViewport(shape.centerLeft, shape.centerTop),
    ),
  };
}

function applyMapOverlayCollisionVisibility(
  markers: ProjectedMarker[],
  linearPois: ProjectedLinearPoi[],
  shapePois: ProjectedShapePoi[],
  size: ViewportSize,
  focusedMarkerId: string | null,
  hideCollidingLabelsOnly: boolean,
  ignoreCollisions: boolean,
): {
  markers: ProjectedMarker[];
  linearPois: ProjectedLinearPoi[];
  shapePois: ProjectedShapePoi[];
} {
  const acceptedBoxes: MarkerCollisionBox[] = [];
  const markerState = new Map(markers.map((marker) => [marker.id, { ...marker }]));
  const linearState = new Map(linearPois.map((marker) => [marker.id, { ...marker }]));
  const shapeState = new Map(shapePois.map((shape) => [shape.id, { ...shape }]));
  const orderedMarkers = [
    ...markers.map((marker) => createMarkerCollisionItem(marker)),
    ...linearPois.flatMap((marker) => createLinearPoiCollisionItem(marker)),
    ...shapePois.map((shape) => createShapePoiCollisionItem(shape)),
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
    const markerVisibleRect = { left: 0, top: 0, right: size.width, bottom: size.height };
    if (
      marker.left < markerVisibleRect.left ||
      marker.left > markerVisibleRect.right ||
      marker.top < markerVisibleRect.top + 18 ||
      marker.top > markerVisibleRect.bottom - 18
    ) {
      hideCollisionItem(marker, markerState, linearState, shapeState);
      continue;
    }

    const box = getMarkerCollisionBox(marker);
    if (
      box.left < markerVisibleRect.left ||
      box.right > markerVisibleRect.right ||
      box.top < markerVisibleRect.top ||
      box.bottom > markerVisibleRect.bottom
    ) {
      hideCollisionItem(marker, markerState, linearState, shapeState);
      continue;
    }

    if (marker.ignoreCollision) {
      continue;
    }

    if (ignoreCollisions) {
      acceptedBoxes.push(box);
      continue;
    }

    if (acceptedBoxes.some((acceptedBox) => boxesOverlap(box, acceptedBox))) {
      if (hideCollidingLabelsOnly) {
        if (marker.id !== focusedMarkerId) {
          hideCollisionItemLabel(marker, markerState, linearState, shapeState);
        }
      } else if (marker.id !== focusedMarkerId) {
        hideCollisionItem(marker, markerState, linearState, shapeState);
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
    shapePois: shapePois.flatMap((shape) => {
      const updated = shapeState.get(shape.id);
      return updated?.showLabel || updated?.labelMode === 'representative' ? [updated] : [];
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
  kind: 'marker' | 'linear' | 'shape';
  id: string;
  label: string;
  left: number;
  top: number;
  priority: number;
  showLabel: boolean;
  hasIcon: boolean;
  isVerticalLabel: boolean;
  centerIcon: boolean;
  centerLabel: boolean;
  ignoreCollision?: boolean;
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
    hasIcon: Boolean(marker.iconUrl || marker.dynamicSymbol || marker.symbolIcon),
    isVerticalLabel: false,
    centerIcon: false,
    centerLabel: marker.hideIcon,
    ignoreCollision: marker.isPlayer,
  };
}

function createLinearPoiCollisionItem(marker: ProjectedLinearPoi): OverlayCollisionItem[] {
  if (
    !marker.showCenter ||
    (!marker.showTextLabel && !marker.iconUrl && !marker.dynamicSymbol && !marker.symbolIcon)
  ) {
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
      hasIcon: Boolean(marker.iconUrl || marker.dynamicSymbol || marker.symbolIcon),
      isVerticalLabel: marker.isVerticalLabel,
      centerIcon: false,
      centerLabel: marker.hideIcon,
    },
  ];
}

function createShapePoiCollisionItem(shape: ProjectedShapePoi): OverlayCollisionItem {
  return {
    kind: 'shape',
    id: shape.id,
    label: shape.label,
    left: shape.centerLeft,
    top: shape.centerTop,
    priority: shape.priority,
    showLabel: shape.showLabel,
    hasIcon: shape.labelMode === 'representative',
    isVerticalLabel: false,
    centerIcon: shape.labelMode === 'representative',
    centerLabel: shape.labelMode === 'label',
  };
}

function hideCollisionItem(
  item: OverlayCollisionItem,
  markerState: Map<string, ProjectedMarker>,
  linearState: Map<string, ProjectedLinearPoi>,
  shapeState: Map<string, ProjectedShapePoi>,
) {
  if (item.kind === 'marker') {
    markerState.delete(item.id);
    return;
  }

  if (item.kind === 'shape') {
    shapeState.delete(item.id);
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
  shapeState: Map<string, ProjectedShapePoi>,
) {
  if (item.kind === 'marker') {
    const marker = markerState.get(item.id);
    if (marker) {
      markerState.set(item.id, { ...marker, showLabel: false });
    }
    return;
  }

  if (item.kind === 'shape') {
    const shape = shapeState.get(item.id);
    if (!shape) {
      return;
    }
    shapeState.set(item.id, {
      ...shape,
      showLabel: shape.labelMode === 'representative',
    });
    return;
  }

  const linear = linearState.get(item.id);
  if (!linear) {
    return;
  }

  if (linear.iconUrl || linear.dynamicSymbol || linear.symbolIcon) {
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

  const left = marker.centerLabel
    ? marker.left - totalWidth / 2
    : marker.centerIcon
      ? marker.left - iconWidth / 2
      : marker.left - 12;
  return {
    left,
    right: left + totalWidth,
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

function boxesOverlap(left: MarkerCollisionBox, right: MarkerCollisionBox): boolean {
  const gap = 4;
  return !(
    left.right + gap <= right.left ||
    right.right + gap <= left.left ||
    left.bottom + gap <= right.top ||
    right.bottom + gap <= left.top
  );
}

function projectShapePoiMarkers(
  markers: ShapeMarker[],
  view: MapView,
  size: ViewportSize,
  perspectiveEnabled = false,
  transitLineColorById: ReadonlyMap<string, string> = new Map(),
  defaultAreaFillOpacity = 0,
): ProjectedShapePoi[] {
  if (size.width <= 0 || size.height <= 0) {
    return [];
  }
  const scale = getScale(view.zoom);
  return markers.flatMap((marker) => {
    const coordinateSets = getShapeGeometryCoordinateSets(marker.geometry);
    const projectedSets = coordinateSets
      .map((set) => ({
        ...set,
        points: set.coordinates.map(([x, z]) => ({
          left: size.width / 2 + (x - view.centerX) * scale,
          top: size.height / 2 + (z - view.centerZ) * scale,
        })),
      }))
      .filter((set) => set.points.length >= (set.closed ? 3 : 2));
    const allPoints = projectedSets.flatMap((set) => set.points);
    const center = getMarkerCenter(marker);
    if (!center || allPoints.length === 0) {
      return [];
    }
    const bounds = getTraceBounds(allPoints);
    if (!traceBoundsIntersectsViewport(bounds, size)) {
      return [];
    }
    const buildPath = (offsetLeft = 0, offsetTop = 0) =>
      projectedSets
        .map((set) => {
          const [first, ...rest] = set.points;
          if (!first) {
            return '';
          }
          return [
            `M ${first.left + offsetLeft} ${first.top + offsetTop}`,
            ...rest.map((point) => `L ${point.left + offsetLeft} ${point.top + offsetTop}`),
            set.closed ? 'Z' : '',
          ]
            .filter(Boolean)
            .join(' ');
        })
        .join(' ');
    const isArea = projectedSets.some((set) => set.closed);
    const geometryCenter = {
      left: size.width / 2 + (center[0] - view.centerX) * scale,
      top: size.height / 2 + (center[1] - view.centerZ) * scale,
    };
    const label = formatMarkerDisplayName(marker.label);
    const boundTransitLineColor = marker.spatial?.style?.lineColorTransitLineIds
      ?.map((lineId) => transitLineColorById.get(lineId))
      .find((color): color is string => Boolean(color));
    const volumeHeight = getMapMarkerVolumeHeight(marker);
    const usePerspective =
      perspectiveEnabled && marker.categoryId !== 'metro-station' && isArea && volumeHeight > 0;
    const perspectiveOffset = usePerspective
      ? Math.min(44, Math.max(5, volumeHeight * Math.max(0.18, scale * 0.32)))
      : 0;
    const path = buildPath(perspectiveOffset * -0.45, perspectiveOffset * -0.75);
    const basePath = usePerspective ? buildPath() : undefined;
    const labelAnchor = isArea
      ? findAreaLabelAnchor(projectedSets, geometryCenter, label)
      : undefined;
    const labelMode = labelAnchor || marker.spatial?.hideMarkerIcon ? 'label' : 'representative';
    return [
      {
        id: marker.id,
        label,
        path,
        basePath,
        isArea,
        isRegionMarker: isRegionMarker(marker),
        accentColor: marker.accentColor,
        fillColor:
          marker.spatial?.style?.fillColor ??
          boundTransitLineColor ??
          (isArea ? getMapAreaFillColor(marker.categoryId) : undefined),
        fillOpacity:
          marker.spatial?.style?.fillOpacity ?? (isArea ? defaultAreaFillOpacity : undefined),
        // 区域描边与填充同源：默认都取分类色，避免出现“蓝色填充 + 青色描边”的混搭。
        strokeColor:
          marker.spatial?.style?.strokeColor ??
          (isArea
            ? (marker.spatial?.style?.fillColor ??
              boundTransitLineColor ??
              getMapAreaFillColor(marker.categoryId))
            : boundTransitLineColor),
        strokeOpacity: marker.spatial?.style?.strokeOpacity,
        centerLeft: (labelAnchor ?? geometryCenter).left - perspectiveOffset * 0.45,
        centerTop: (labelAnchor ?? geometryCenter).top - perspectiveOffset * 0.75,
        labelMode,
        priority: isArea && labelMode === 'label' ? 500 : 18,
        showLabel: true,
      },
    ];
  });
}

function getMapMarkerVolumeHeight(marker: ShapeMarker): number {
  const volume = marker.spatial?.volume;
  if (!volume) {
    return 0;
  }
  if (volume.type === 'ExtrudedRectangle' || volume.type === 'ExtrudedPolygon') {
    return Math.max(0, volume.maxY - volume.minY);
  }
  return volume.volumes.reduce((maximum, item) => Math.max(maximum, item.maxY - item.minY), 0);
}

function projectAdministrativeAreas(
  areas: readonly AdministrativeArea[],
  markers: readonly CenterableMarker[],
  transitLineColorById: ReadonlyMap<string, string>,
  view: MapView,
  size: ViewportSize,
): ProjectedAdministrativeArea[] {
  if (size.width <= 0 || size.height <= 0) return [];
  const scale = getScale(view.zoom);
  return areas.flatMap((area) => {
    if (area.minZoom !== undefined && view.zoom < area.minZoom) {
      return [];
    }
    const sets = getAdministrativeAreaCoordinateSets(area.boundary);
    const projectedSets = sets.map((set) => ({
      closed: true,
      points: set.map(([x, z]) => ({
        left: size.width / 2 + (x - view.centerX) * scale,
        top: size.height / 2 + (z - view.centerZ) * scale,
      })),
    }));
    const points = projectedSets.flatMap((set) => set.points);
    if (points.length === 0 || !traceBoundsIntersectsViewport(getTraceBounds(points), size)) {
      return [];
    }
    const path = projectedSets
      .map((set) => {
        const first = set.points[0];
        if (!first) return '';
        return [
          `M ${first.left} ${first.top}`,
          ...set.points.slice(1).map((point) => `L ${point.left} ${point.top}`),
          'Z',
        ].join(' ');
      })
      .join(' ');
    const geometryCenterCoordinate = getAdministrativeAreaGeometryCenter(sets);
    const geometryCenter = {
      left: size.width / 2 + (geometryCenterCoordinate[0] - view.centerX) * scale,
      top: size.height / 2 + (geometryCenterCoordinate[1] - view.centerZ) * scale,
    };
    const boundPoi = area.labelPositionPoiId
      ? markers.find((marker) => marker.id === area.labelPositionPoiId)
      : undefined;
    const boundPoiPosition = boundPoi ? getMarkerCenter(boundPoi) : undefined;
    const legacyPosition = area.labelPositionPoiId ? undefined : area.labelPosition;
    const fixedPosition = boundPoiPosition ?? legacyPosition;
    const automaticAnchor =
      findAreaLabelAnchor(projectedSets, geometryCenter, area.name) ?? geometryCenter;
    const labelAnchor = fixedPosition
      ? {
          left: size.width / 2 + (fixedPosition[0] - view.centerX) * scale,
          top: size.height / 2 + (fixedPosition[1] - view.centerZ) * scale,
        }
      : automaticAnchor;
    const boundLineColor = area.style?.lineColorTransitLineIds
      ?.map((lineId) => transitLineColorById.get(lineId))
      .find((color): color is string => Boolean(color));
    return [
      {
        area,
        centerLeft: labelAnchor.left,
        centerTop: labelAnchor.top,
        fillColor: area.style?.fillColor ?? boundLineColor,
        path,
        showLabel: view.zoom <= (area.maxZoom ?? ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM),
        strokeColor: area.style?.strokeColor ?? boundLineColor,
      },
    ];
  });
}

function getAdministrativeAreaCoordinateSets(
  geometry: MapGeometry,
): Array<Array<[number, number]>> {
  if (geometry.type === 'Rectangle') return [rectangleBoundsToMapCoordinates(geometry.bounds)];
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.map((bounds) => rectangleBoundsToMapCoordinates(bounds));
  }
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function getAdministrativeAreaGeometryCenter(
  sets: Array<Array<[number, number]>>,
): [number, number] {
  const coordinates = sets.flat();
  if (coordinates.length === 0) return [0, 0];
  const bounds = getCoordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

interface ProjectedShapeCoordinateSet {
  closed: boolean;
  points: Array<{ left: number; top: number }>;
}

function findAreaLabelAnchor(
  projectedSets: ProjectedShapeCoordinateSet[],
  geometryCenter: { left: number; top: number },
  label: string,
): { left: number; top: number } | undefined {
  const closedSets = projectedSets.filter((set) => set.closed && set.points.length >= 3);
  if (closedSets.length === 0) {
    return undefined;
  }

  const dimensions = getAreaLabelDimensions(label);
  const bounds = getTraceBounds(closedSets.flatMap((set) => set.points));
  const candidates = [geometryCenter];
  const gridSize = 15;
  for (let row = 0; row <= gridSize; row += 1) {
    for (let column = 0; column <= gridSize; column += 1) {
      candidates.push({
        left: bounds.minLeft + ((bounds.maxLeft - bounds.minLeft) * column) / gridSize,
        top: bounds.minTop + ((bounds.maxTop - bounds.minTop) * row) / gridSize,
      });
    }
  }

  return candidates
    .filter((candidate) => isLabelBoxInsideArea(candidate, dimensions, closedSets))
    .sort(
      (left, right) =>
        squaredScreenDistance(left, geometryCenter) - squaredScreenDistance(right, geometryCenter),
    )[0];
}

function getAreaLabelDimensions(label: string): { width: number; height: number } {
  return {
    width: Math.max(42, normalizeMarkerDisplayText(label).length * 12 + 4),
    height: 24,
  };
}

function isLabelBoxInsideArea(
  center: { left: number; top: number },
  dimensions: { width: number; height: number },
  sets: ProjectedShapeCoordinateSet[],
): boolean {
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;
  const corners = [
    { left: center.left - halfWidth, top: center.top - halfHeight },
    { left: center.left + halfWidth, top: center.top - halfHeight },
    { left: center.left + halfWidth, top: center.top + halfHeight },
    { left: center.left - halfWidth, top: center.top + halfHeight },
  ];
  return corners.every((point) => isPointInsideProjectedArea(point, sets));
}

function isPointInsideProjectedArea(
  point: { left: number; top: number },
  sets: ProjectedShapeCoordinateSet[],
): boolean {
  let inside = false;
  for (const set of sets) {
    if (isPointInsideProjectedPolygon(point, set.points)) {
      inside = !inside;
    }
  }
  return inside;
}

function isPointInsideProjectedPolygon(
  point: { left: number; top: number },
  polygon: Array<{ left: number; top: number }>,
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    const intersects =
      currentPoint.top > point.top !== previousPoint.top > point.top &&
      point.left <
        ((previousPoint.left - currentPoint.left) * (point.top - currentPoint.top)) /
          (previousPoint.top - currentPoint.top) +
          currentPoint.left;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function squaredScreenDistance(
  left: { left: number; top: number },
  right: { left: number; top: number },
): number {
  const deltaLeft = left.left - right.left;
  const deltaTop = left.top - right.top;
  return deltaLeft * deltaLeft + deltaTop * deltaTop;
}

function getShapeGeometryCoordinateSets(
  geometry: ShapeMarker['geometry'],
): Array<{ closed: boolean; coordinates: Array<[number, number]> }> {
  if (geometry.type === 'LineString') {
    return [{ closed: false, coordinates: geometry.coordinates }];
  }
  if (geometry.type === 'Rectangle') {
    return [{ closed: true, coordinates: rectangleBoundsToMapCoordinates(geometry.bounds) }];
  }
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.map((bounds) => ({
      closed: true,
      coordinates: rectangleBoundsToMapCoordinates(bounds),
    }));
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((coordinates) => ({ closed: true, coordinates }));
  }
  return geometry.coordinates.flatMap((polygon) =>
    polygon.map((coordinates) => ({ closed: true, coordinates })),
  );
}

/** 线状标记只要有一段落在当前视口（含少量余量）就参与道路标签渲染。 */
function linearMarkerIntersectsViewport(
  marker: EndpointGroupMarker,
  view: MapView,
  size: ViewportSize,
): boolean {
  if (size.width <= 0 || size.height <= 0) {
    return false;
  }
  const coordinates = marker.geometry.coordinates;
  if (coordinates.length === 0) {
    return false;
  }

  const scale = getScale(view.zoom);
  return traceBoundsIntersectsViewport(
    getTraceBounds(
      coordinates.map(([x, z]) => ({
        left: size.width / 2 + (x - view.centerX) * scale,
        top: size.height / 2 + (z - view.centerZ) * scale,
      })),
    ),
    size,
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
    const hideMarkerIcon = Boolean(marker.spatial?.hideMarkerIcon);
    const dynamicSymbol = hideMarkerIcon ? undefined : resolveMarkerDynamicSymbol(marker);
    const highwayIconUrl =
      !hideMarkerIcon &&
      !dynamicSymbol &&
      roadKind === 'highway' &&
      marker.iconFileName &&
      isHighwayIconFileName(marker.iconFileName)
        ? toMarkerIconUrl(marker.iconFileName, options.iconBaseUrl)
        : undefined;
    const symbolIcon = roadKind || hideMarkerIcon ? undefined : marker.symbolIcon;
    const showTextLabel = Boolean(label) && !highwayIconUrl;
    const projectedMarker: ProjectedLinearPoi = {
      id: marker.id,
      label,
      left: size.width / 2 + (centerX - view.centerX) * scale,
      top: size.height / 2 + (centerZ - view.centerZ) * scale,
      endpointCount: marker.geometry.coordinates.length,
      accentColor: marker.accentColor,
      iconUrl: highwayIconUrl,
      dynamicSymbol,
      roadKind,
      showCenter: Boolean(label || highwayIconUrl || dynamicSymbol || symbolIcon),
      showTextLabel: Boolean(label) && !dynamicSymbol && !highwayIconUrl,
      isVerticalLabel:
        Boolean(roadKind) && showTextLabel
          ? shouldUseVerticalMapRoadLabel(marker.geometry.coordinates, labelAnchor)
          : false,
      hideIcon: hideMarkerIcon,
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
  visibleRect: MapVisibleRect,
): MapView {
  const center = getMarkerCenter(marker);
  if (!center) {
    return current;
  }
  const coordinates = getMapGeometryCoordinates(marker.geometry);
  return fitCoordinatesToMapView(
    coordinates.length > 0 ? coordinates : [center],
    current,
    size,
    coordinates.length > 1 ? 120 : 0,
    visibleRect,
  );
}

function fitRouteDraftToMapView(
  draft: RoutePlanDraft,
  current: MapView,
  size: ViewportSize,
  visibleRect: MapVisibleRect,
): MapView {
  return fitCoordinatesToMapView(
    [draft.origin, draft.destination],
    current,
    size,
    120,
    visibleRect,
  );
}

// 规划路线取景：先按路线与 POI 中心点算出精确缩放，再把标签的屏幕宽度换算成
// 世界坐标追加到标记点右侧，保证文字标签也落在安全框内。
function fitRoutePlanToMapView(
  option: RoutePlanOption,
  semanticCoordinates: Array<[number, number]>,
  current: MapView,
  size: ViewportSize,
  visibleRect: MapVisibleRect,
): MapView {
  const coordinates = [...option.coordinates, ...semanticCoordinates];
  const baseFit = fitCoordinatesToMapView(
    coordinates,
    current,
    size,
    routePlanFitPadding,
    visibleRect,
    undefined,
    true,
  );
  const labelOverhang = routePlanLabelOverhang / getScale(baseFit.zoom);
  return fitCoordinatesToMapView(
    [
      ...coordinates,
      ...semanticCoordinates.map(([x, z]) => [x + labelOverhang, z] as [number, number]),
    ],
    current,
    size,
    routePlanFitPadding,
    visibleRect,
    undefined,
    true,
  );
}

function fitCoordinatesToMapView(
  coordinates: Array<[number, number]>,
  current: MapView,
  size: ViewportSize,
  padding: number,
  visibleRect: MapVisibleRect,
  maximumZoom?: number,
  exactZoom = false,
): MapView {
  if (coordinates.length === 0) {
    return current;
  }

  const bounds = getCoordinateBounds(coordinates);
  const effectiveRect = normalizeMapVisibleRect(visibleRect, size);
  const visibleSize = {
    width: effectiveRect.right - effectiveRect.left,
    height: effectiveRect.bottom - effectiveRect.top,
  };
  const fittedZoom = getZoomToFitCoordinates(
    coordinates,
    visibleSize,
    padding,
    current.zoom,
    exactZoom,
  );
  const zoom = maximumZoom === undefined ? fittedZoom : Math.min(fittedZoom, maximumZoom);
  const scale = getScale(zoom);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterZ = (bounds.minZ + bounds.maxZ) / 2;
  const visibleCenterX = (effectiveRect.left + effectiveRect.right) / 2;
  const visibleCenterY = (effectiveRect.top + effectiveRect.bottom) / 2;
  return {
    ...current,
    centerX: worldCenterX - (visibleCenterX - size.width / 2) / scale,
    centerZ: worldCenterZ - (visibleCenterY - size.height / 2) / scale,
    zoom,
  };
}

function zoomMapViewAroundScreenPoint(
  current: MapView,
  nextZoom: number,
  size: ViewportSize,
  screenX: number,
  screenY: number,
): MapView {
  if (size.width <= 0 || size.height <= 0 || nextZoom === current.zoom) {
    return current;
  }
  const anchor = screenToWorld(screenX, screenY, current, size);
  const nextScale = getScale(nextZoom);
  return {
    ...current,
    zoom: nextZoom,
    centerX: anchor.x - (screenX - size.width / 2) / nextScale,
    centerZ: anchor.z - (screenY - size.height / 2) / nextScale,
  };
}

function getZoomToFitCoordinates(
  coordinates: Array<[number, number]>,
  size: ViewportSize,
  padding: number,
  fallbackZoom: number,
  exactZoom = false,
): number {
  if (coordinates.length < 2 || size.width <= padding * 2 || size.height <= padding * 2) {
    return Math.max(fallbackZoom, 0);
  }

  const bounds = getCoordinateBounds(coordinates);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxZ - bounds.minZ);
  const scale = Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height);
  const rawZoom = Math.log2(Math.max(scale, 2 ** mapDefaults.minZoom));
  // 普通取景向下取整到 2 的幂；折叠后的精确取景保留小数，避免留白过多导致画面偏小。
  return exactZoom ? clampZoom(Math.round(rawZoom * 100) / 100) : clampZoom(Math.floor(rawZoom));
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

function formatPlayerLocationTimestamp(value: string, locale: LocaleCode): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  const intlLocale = locale === 'en' ? 'en-US' : locale === 'zh-Hant' ? 'zh-TW' : 'zh-CN';
  return new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getScale(zoom: number): number {
  return 2 ** zoom;
}

function getPointerTargetMapMarkerId(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  return target.closest<HTMLElement>('[data-map-marker-id]')?.dataset.mapMarkerId;
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

function formatShareCoordinate([x, z]: [number, number]): string {
  return `${roundCoordinateForParam(x)}, ${roundCoordinateForParam(z)}`;
}

function getMarkerCenter(marker: CenterableMarker): [number, number] | undefined {
  if (marker.geometry.type === 'Point') {
    return marker.geometry.coordinates;
  }

  const coordinates = getMapGeometryCoordinates(marker.geometry);
  if (coordinates.length === 0) {
    return undefined;
  }
  const bounds = getCoordinateBounds(coordinates);
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

/**
 * 道路走向：只有真正乱序的坐标才需要按最近邻重排。
 * 新建的线性道路（LineString）按录入顺序保存；旧道路分类散点也会在接口侧预先排序，
 * 这两类数据再排一次会被重新选起点、把走向打乱甚至反向，因此只在重排后明显更短时才采用。
 */
function getRoadTraceCoordinates(marker: { geometry: MapGeometry }): Array<[number, number]> {
  if (marker.geometry.type === 'LineString') {
    return marker.geometry.coordinates;
  }
  const coordinates = getMapGeometryCoordinates(marker.geometry);
  if (coordinates.length < 3) {
    return coordinates;
  }
  const ordered = orderRoadTracePoints(coordinates);
  const orderedDistance = getCoordinateChainDistance(ordered);
  return orderedDistance < getCoordinateChainDistance(coordinates) * 0.98 ? ordered : coordinates;
}

/**
 * 线性 POI 使用有序折线：道路端点组按道路走向排序，线路直接使用站点顺序。
 */
function getLinearMarkerChain(marker: CenterableMarker): Array<[number, number]> {
  const coordinates = getMapGeometryCoordinates(marker.geometry);
  if (coordinates.length < 2) {
    return coordinates;
  }

  return isRoadEndpointGroupMarker(marker) ? getRoadTraceCoordinates(marker) : coordinates;
}

function findNearestChainEndpoint(
  point: [number, number],
  chain: Array<[number, number]>,
): [number, number] | undefined {
  if (chain.length === 0) {
    return undefined;
  }
  const start = chain[0]!;
  const end = chain[chain.length - 1]!;
  return getCoordinateDistance(point, start) <= getCoordinateDistance(point, end) ? start : end;
}

function sliceCoordinateChainByMileage(
  chain: Array<[number, number]>,
  startMileage: number,
  endMileage: number,
): Array<[number, number]> {
  if (chain.length < 2) {
    return [];
  }

  const total = getCoordinateChainDistance(chain);
  const start = Math.max(0, Math.min(startMileage, total));
  const end = Math.max(0, Math.min(endMileage, total));
  if (end - start < 0.01) {
    return [];
  }

  const result: Array<[number, number]> = [];
  let traveled = 0;
  for (let index = 1; index < chain.length; index += 1) {
    const from = chain[index - 1]!;
    const to = chain[index]!;
    const segmentLength = getCoordinateDistance(from, to);
    const segmentStart = traveled;
    const segmentEnd = traveled + segmentLength;
    traveled = segmentEnd;

    if (segmentEnd < start) {
      continue;
    }
    if (segmentStart > end) {
      break;
    }

    if (result.length === 0) {
      const ratio = segmentLength === 0 ? 0 : Math.max(0, (start - segmentStart) / segmentLength);
      result.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
    }

    if (segmentEnd <= end) {
      result.push(to);
    } else {
      const ratio = segmentLength === 0 ? 0 : (end - segmentStart) / segmentLength;
      result.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
      break;
    }
  }

  return dedupeConsecutiveCoordinates(result);
}

function getMapGeometryCoordinates(geometry: MapGeometry): Array<[number, number]> {
  if (geometry.type === 'Point') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    return geometry.coordinates;
  }
  if (geometry.type === 'Rectangle') {
    return rectangleBoundsToMapCoordinates(geometry.bounds);
  }
  if (geometry.type === 'MultiRectangle') {
    return geometry.rectangles.flatMap(rectangleBoundsToMapCoordinates);
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat();
  }
  return geometry.coordinates.flat(2);
}

function isMarkerInsideRegion(marker: CenterableMarker, region: RegionGeometry): boolean {
  const center = getMarkerCenter(marker);
  return center ? isCoordinateInsideRegion(center, region) : false;
}

function isCoordinateInsideRegion(coordinate: [number, number], region: RegionGeometry): boolean {
  if (region.type === 'Rectangle') {
    return isCoordinateInsideRectangle(coordinate, region.bounds);
  }
  if (region.type === 'MultiRectangle') {
    return region.rectangles.some((bounds) => isCoordinateInsideRectangle(coordinate, bounds));
  }
  if (region.type === 'Polygon') {
    return isCoordinateInsidePolygon(coordinate, region.coordinates);
  }
  return region.coordinates.some((polygon) => isCoordinateInsidePolygon(coordinate, polygon));
}

function isCoordinateInsideRectangle(
  [x, z]: [number, number],
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

function isCoordinateInsidePolygon(
  coordinate: [number, number],
  rings: Array<Array<[number, number]>>,
): boolean {
  let inside = false;
  for (const ring of rings) {
    if (isCoordinateOnRingBoundary(coordinate, ring)) {
      return true;
    }
    if (isCoordinateInsideRing(coordinate, ring)) {
      inside = !inside;
    }
  }
  return inside;
}

function isCoordinateOnRingBoundary(
  coordinate: [number, number],
  ring: Array<[number, number]>,
): boolean {
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (start && end && isCoordinateOnSegment(coordinate, start, end)) {
      return true;
    }
  }
  return false;
}

function isCoordinateOnSegment(
  [x, z]: [number, number],
  [startX, startZ]: [number, number],
  [endX, endZ]: [number, number],
): boolean {
  const cross = (x - startX) * (endZ - startZ) - (z - startZ) * (endX - startX);
  if (Math.abs(cross) > 1e-9) {
    return false;
  }
  return (
    x >= Math.min(startX, endX) &&
    x <= Math.max(startX, endX) &&
    z >= Math.min(startZ, endZ) &&
    z <= Math.max(startZ, endZ)
  );
}

function isCoordinateInsideRing([x, z]: [number, number], ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    const intersects =
      currentPoint[1] > z !== previousPoint[1] > z &&
      x <
        ((previousPoint[0] - currentPoint[0]) * (z - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function rectangleBoundsToMapCoordinates(bounds: {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}): Array<[number, number]> {
  return [
    [bounds.minX, bounds.minZ],
    [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ],
    [bounds.minX, bounds.maxZ],
    [bounds.minX, bounds.minZ],
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
    : getRoadTraceCoordinates(marker);

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

function PoiOperationsMessageList({
  items,
  loading,
  t,
}: Readonly<{
  items: OperationsFeedItem[];
  loading: boolean;
  t: Translate;
}>) {
  if (loading) {
    return <p className="muted map-poi-operations-status">{t('map.poi.operationsLoading')}</p>;
  }

  if (items.length === 0) {
    return <p className="muted map-poi-operations-status">{t('map.poi.operationsEmpty')}</p>;
  }

  return (
    <div className="map-poi-operations-list" aria-label={t('map.poi.operations')}>
      {items.map((item) => (
        <a href={appPath(`/operations/${encodeURIComponent(item.id)}`)} key={item.id}>
          <span className="material-symbols-outlined" aria-hidden="true">
            campaign
          </span>
          <span>
            <small>{[item.categoryId, item.displayDate].filter(Boolean).join(' · ')}</small>
            <strong>{item.title}</strong>
            {item.excerpt ? <span>{item.excerpt}</span> : null}
          </span>
          <span className="material-symbols-outlined" aria-hidden="true">
            chevron_right
          </span>
        </a>
      ))}
    </div>
  );
}

function formatGeometryDetail(marker: CenterableMarker, t: Translate): string {
  if (marker.geometry.type === 'Point') {
    return t('map.geometry.pointMarker');
  }

  if (marker.categoryId === 'transit-line' && marker.geometry.type === 'MultiPoint') {
    return t('map.geometry.transitLineObject', {
      count: marker.geometry.coordinates.length,
    });
  }

  if (marker.geometry.type === 'LineString') {
    return t('map.geometry.lineString', { count: marker.geometry.coordinates.length });
  }

  if (
    marker.geometry.type === 'Rectangle' ||
    marker.geometry.type === 'MultiRectangle' ||
    marker.geometry.type === 'Polygon' ||
    marker.geometry.type === 'MultiPolygon'
  ) {
    return t('map.geometry.region', {
      count: getMapGeometryCoordinates(marker.geometry).length,
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

  if (marker.categoryId === 'transit-line' && marker.geometry.type === 'MultiPoint') {
    return marker.geometry.coordinates.length > 0
      ? t('map.geometry.transitLineDetail', {
          count: marker.geometry.coordinates.length,
        })
      : t('map.geometry.transitLinePending');
  }

  if (marker.geometry.type !== 'MultiPoint') {
    return formatGeometryDetail(marker, t);
  }

  return t('map.geometry.roadEndpointCount', {
    count: marker.geometry.coordinates.length,
  });
}

function formatMarkerListDistanceDetail(
  marker: SidebarMarker,
  reference: {
    coordinates: [number, number];
    secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
    t: Translate;
  },
): string {
  const center = getMarkerCenter(marker);
  if (!center) {
    return formatGeometryDetail(marker, reference.t);
  }

  if (marker.geometry.type === 'MultiPoint' || marker.geometry.type === 'LineString') {
    const coordinates = isRoadEndpointGroupMarker(marker)
      ? getRoadTraceCoordinates(marker)
      : marker.geometry.coordinates;
    return reference.t('map.markerList.fullLength', {
      distance: formatRoutePlanDistance(getCoordinateChainDistance(coordinates), reference.t),
    });
  }

  if (marker.geometry.type !== 'Point') {
    const nearestAccessDistance = (reference.secondaryPoiIndex.get(marker.id) ?? [])
      .filter(isRouteAccessSecondaryPoi)
      .flatMap((link) => {
        const accessCenter = getMarkerCenter(link.marker);
        return accessCenter ? [getCoordinateDistance(accessCenter, reference.coordinates)] : [];
      })
      .sort((left, right) => left - right)[0];
    return formatRoutePlanDistance(
      nearestAccessDistance ?? getCoordinateDistance(center, reference.coordinates),
      reference.t,
    );
  }

  return formatRoutePlanDistance(getCoordinateDistance(center, reference.coordinates), reference.t);
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
