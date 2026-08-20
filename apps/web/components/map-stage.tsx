'use client';

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
import { useSearchParams } from 'next/navigation';
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFontEmbedCSS, toBlob } from 'html-to-image';
import LZString from 'lz-string';
import QRCode from 'qrcode';
import { appPath } from '../lib/app-paths';
import { publishAdminDataChanged } from '../lib/client-admin-data-events';
import { publishLoginRequiredForResponse } from '../lib/client-auth-events';
import { publishToastRequested } from '../lib/client-toast-events';
import { readMapFavoriteMarkerIds, writeMapFavoriteMarkerIds } from '../lib/client-map-favorites';
import {
  publishMapNearbySearchScopeChanged,
  publishMapRoutePanelVisibilityChanged,
  publishMapShortcutContextChanged,
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
import { MaterialSymbol } from './material-symbol';

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

interface TransitOverviewLine {
  id: string;
  mode: string;
  name: string;
  operationStatus?: 'operating' | 'planned' | 'closed';
  localizedName?: LocalizedLabelMap;
  color?: string;
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  routeMode?: TransitLineRouteMode;
  routeNodes?: TransitLineRouteNodeSnapshot[];
  segmentPaths?: TransitLineSegmentPathSnapshot[];
  stationCount?: number;
  maxCarCount?: number;
  stationNames: string[];
  displayStationNames?: string[];
  stationStops?: TransitLineStopForMap[];
  firstStationName?: string;
  lastStationName?: string;
  displayFirstStationName?: string;
  displayLastStationName?: string;
  sourcePath?: string;
}

interface TransitLineStopForMap {
  stationSourceId?: string;
  stationName: string;
  operationStatus?: 'operating' | 'planned' | 'closed';
  displayStationName?: string;
  localizedStationName?: LocalizedLabelMap;
  stationMarkerIds?: string[];
  stopLocationRefs?: TransitLineStopLocationRef[];
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
  showPlannedSegments?: boolean;
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

type RouteTransportMode =
  'walk' | 'taxi' | 'bus' | 'metro' | 'tram' | 'coach' | 'ferry' | 'railway';
type TransitRouteTransportMode = Exclude<RouteTransportMode, 'walk' | 'taxi'>;
type RoutePlanSortMode = 'time' | 'walking' | 'transfers' | 'fare';

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
  modes: RouteTransportMode[];
  serviceLabels?: string[];
  labelMarkerIds?: string[];
  estimatedDistance: number;
  estimatedMinutes: number;
  fare?: TransitFareQuote;
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
  roadId: string;
}

interface RoutePlanStep {
  kind: 'place' | 'walk' | 'taxi' | 'transit' | 'transfer';
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
  kind: 'walk' | 'taxi' | 'transit' | 'transfer';
}

interface RoadRouteNode {
  id: string;
  coordinate: [number, number];
  y: number;
  roadId: string;
  roadLabel: string;
}

interface RoadRouteEdge {
  coordinates: Array<[number, number]>;
  distance: number;
  kind: 'connection' | 'road';
  label: string;
  allowedModes: MapTravelMode[];
  roadId?: string;
  to: string;
}

interface RoadRouteSegment {
  end: [number, number];
  endIsRoadTerminus: boolean;
  endNodeId: string;
  id: string;
  allowedModes: MapTravelMode[];
  direction: MapNetworkDirection;
  roadId: string;
  roadLabel: string;
  start: [number, number];
  startY: number;
  startIsRoadTerminus: boolean;
  startNodeId: string;
  endY: number;
  verticalConnector: boolean;
}

interface RoadRouteGraph {
  adjacency: Map<string, RoadRouteEdge[]>;
  defaultY: number;
  worldId: string;
  nodes: RoadRouteNode[];
  nodesById: Map<string, RoadRouteNode>;
  roadSegments: RoadRouteSegment[];
  verticalTolerance: number;
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
  roadId?: string;
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
  allowedModes: MapTravelMode[];
  coordinate: [number, number];
  direction: MapNetworkDirection;
  distanceToPoint: number;
  endDistance: number;
  endNodeId: string;
  roadId: string;
  roadLabel: string;
  startDistance: number;
  startNodeId: string;
  y: number;
}

interface RoutePlanningCache {
  accessCandidatesByPair: Map<string, RoadAccessCandidate[]>;
  pathByNodePair: Map<string, RoadRoutePath | undefined>;
  roadRouteByPair: Map<string, ResolvedRoadRoute | null>;
  traversalBarriers: RouteTraversalBarrier[];
}

interface RoadRoutingSnapshot {
  graph?: RoadRouteGraph;
  markerRoadAccessIndex: Map<string, RoadAccessCandidate[]>;
}

type RoadRoutingStatus = 'loading' | 'ready';

type RoadRouteStrategy =
  'shortest' | 'fewer-turns' | 'fewest-segments' | 'alternative-1' | 'alternative-2';

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

interface ResolvedRoadRoute {
  coordinates: Array<[number, number]>;
  details: RoutePlanStepDetail[];
  distance: number;
  junctionCount: number;
  roadSegments: RoadRouteInstructionSegment[];
}

interface RoadRouteAccessOptions {
  destinationAccessCandidates?: RoadAccessCandidate[];
  originAccessCandidates?: RoadAccessCandidate[];
}

interface ResolvedWalkRoute {
  blockedByTraversalBarrier: boolean;
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
  parent: CenterableMarker;
}

interface SecondaryPoiGroup {
  id: string;
  label: string;
  items: SecondaryPoiLink[];
}

interface SecondaryPoiParentLink {
  childLabel: string;
  marker: PointMarker;
  parent: CenterableMarker;
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

const defaultRouteTransportModes: EnabledRouteTransportModes = {
  walk: true,
  taxi: true,
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
  image: 'image',
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

const routeTransportModeOptions: RouteTransportModeOption[] = [
  { mode: 'walk', icon: 'directions_walk', color: 'var(--yct-color-text-secondary)' },
  { mode: 'taxi', icon: 'local_taxi', color: '#FFD400' },
  { mode: 'bus', icon: 'directions_bus', color: 'var(--yct-color-tertiary)' },
  { mode: 'metro', icon: 'subway', color: 'var(--yct-color-secondary)' },
  { mode: 'tram', icon: 'tram', color: 'var(--yct-color-tram)' },
  { mode: 'coach', icon: 'airport_shuttle', color: 'var(--yct-color-coach)' },
  { mode: 'ferry', icon: 'directions_boat', color: 'var(--yct-color-ferry)' },
  { mode: 'railway', icon: 'train', color: 'var(--yct-color-railway)' },
];

const routeWalkTraceColor = 'var(--yct-color-primary)';
const routeTaxiTraceColor = '#FFD400';
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
const markerRoadAccessProjectionRange = 50;
const playerRouteRecalculationDistance = 128;
const mapDefaults = {
  minZoom: -7,
  maxZoom: 3,
  defaultZoom: 0,
  centerX: -945,
  centerZ: -876,
};

type PoiDetailTab = 'summary' | 'facilities' | 'operations';

export function MapStage() {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
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

    async function loadMapData() {
      setLoadStatus('loading');

      try {
        const [tileResult, markerResult, categoryResult, spatialProfileResult, areaResult] =
          await Promise.all([
            fetch(appPath('/api/map/tile-providers'), { cache: 'no-store' }),
            fetch(appPath('/api/map/markers'), { cache: 'no-store' }),
            fetch(appPath('/api/map/poi-categories'), { cache: 'no-store' }),
            fetch(appPath('/api/map/spatial-profile'), { cache: 'no-store' }).catch(() => null),
            fetch(appPath('/api/map/administrative-areas'), { cache: 'no-store' }).catch(
              () => null,
            ),
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
          setMarkerResponse(markerData);
          setCategoryResponse(categoryData);
          setMapSpatialProfile(spatialProfileData.profile ?? null);
          setAdministrativeAreas(areaData.items ?? []);
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

    async function loadTransitOverview() {
      try {
        const [overviewResponse, stationDetailsResponse] = await Promise.all([
          fetch(appPath('/api/transit/overview'), { cache: 'no-store' }),
          fetch(appPath('/api/transit/station-details'), { cache: 'no-store' }),
        ]);
        const [overviewData, stationDetailsData] = await Promise.all([
          overviewResponse.json() as Promise<TransitOverviewResponse>,
          stationDetailsResponse.json() as Promise<TransitStationDetailsResponse>,
        ]);
        if (!cancelled && overviewResponse.ok) {
          setTransitOverview(overviewData);
        }
        if (!cancelled && stationDetailsResponse.ok) {
          setTransitStationDetails(stationDetailsData.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setTransitOverview(null);
          setTransitStationDetails([]);
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
    () => buildStationConnectionIndex(localizedTransitOverview, t),
    [localizedTransitOverview, t],
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
  const sidebarMarkers = useMemo(() => {
    const queryMode = Boolean(markerQuery.trim());
    const nearbyMode = !queryMode && nearbySearchCenter;
    const source = queryMode
      ? [
          ...filteredTransitLineMarkers,
          ...filteredEndpointGroupMarkers,
          ...filteredShapeMarkers,
          ...filteredPointMarkers,
        ]
      : nearbyMode
        ? [...endpointGroupMarkers, ...shapeMarkers, ...pointMarkers].filter(
            (marker) => marker.id !== nearbySearchCenter.markerId,
          )
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

  const routePlanCalculationKey = routePlanDraft
    ? buildRoutePlanCalculationKey(routePlanDraft, routeTransportModes)
    : null;
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
        : endpointGroupMarkers
            .filter((marker) => {
              const roadKind = getRoadMarkerKind(marker);
              return Boolean(roadKind);
            })
            .slice(0, browseMode === 'satellite' ? 80 : 80);
    const combined = focusedLinearMarker
      ? [focusedLinearMarker]
      : [...queryMatched, ...roadLabelSource];

    return dedupeMarkersById(combined)
      .filter((marker) => marker.geometry.coordinates.length > 0)
      .slice(0, 40);
  }, [
    browseMode,
    editingRouteEndpoint,
    endpointGroupMarkers,
    focusedMarker,
    focusedMarkerId,
    linearFeaturesVisible,
    markerQuery,
    routeEndpointQuery,
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
      ),
    [
      browseMode,
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
  const {
    markers: projectedMarkers,
    linearPois: projectedLinearPois,
    shapePois: projectedShapePois,
  } = useMemo(
    () =>
      applyMapOverlayCollisionVisibility(
        rawProjectedMarkers,
        rawProjectedLinearPois,
        rawProjectedShapePois,
        viewportSize,
        focusedMarkerId,
        Boolean(markerQuery.trim()),
        mapView.zoom >= mapDefaults.maxZoom,
      ),
    [
      focusedMarkerId,
      markerQuery,
      mapView.zoom,
      rawProjectedLinearPois,
      rawProjectedMarkers,
      rawProjectedShapePois,
      viewportSize,
    ],
  );
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
  const focusedDirectionalTransitLineMarker = useMemo(
    () =>
      focusedTransitLineMarker && focusedTransitLine
        ? buildDirectionalTransitLineMarker(
            focusedTransitLineMarker,
            focusedTransitLine,
            focusedTransitLineDirection,
            pointMarkers,
            roadRoutingGraph,
          )
        : undefined,
    [
      focusedTransitLine,
      focusedTransitLineDirection,
      focusedTransitLineMarker,
      pointMarkers,
      roadRoutingGraph,
    ],
  );
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
    if (!routeChanged && routeManuallyZoomedRef.current) {
      return;
    }
    if (routeChanged) {
      routeManuallyZoomedRef.current = false;
    }

    const markerIds = new Set(selectedRouteOption.markerIds);
    const semanticCoordinates = pointMarkers
      .filter((marker) => markerIds.has(marker.id))
      .map((marker) => getMarkerCenter(marker))
      .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
    setMapView((current) => {
      const fitted = fitCoordinatesToMapView(
        [...selectedRouteOption.coordinates, ...semanticCoordinates],
        current,
        viewportSize,
        160,
        effectiveMapVisibleRect,
        routeChanged ? undefined : current.zoom,
      );
      return fitted;
    });
  }, [
    effectiveMapVisibleRect,
    pointMarkers,
    routePlanDraft,
    routeResultActive,
    selectedRouteOption,
    viewportSize,
  ]);

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

  useEffect(
    () =>
      subscribeMapViewShortcutRequested(({ command }) => {
        if (command === 'focus_search') {
          setMarkerListExpanded(true);
          searchInputRef.current?.focus();
          return;
        }
        resetView();
      }),
    [resetView],
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
  }, [appliedSharedRoutePlanKey, effectiveMapVisibleRect, sharedRoutePlan, viewportSize]);

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

  const createRoutePlanDraft = (marker: CenterableMarker) => {
    const destination = getMarkerCenter(marker);
    if (!destination) {
      return;
    }
    const origin = preferredCurrentLocation;

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

    setNearbySearchCenter({
      markerId: marker.id,
      label: formatMarkerDisplayName(marker.label),
      coordinates: center,
    });
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
            collapsed={routePlanCollapsed}
            editingEndpoint={editingRouteEndpoint}
            enabledModes={routeTransportModes}
            endpointCandidates={routeEndpointCandidates}
            endpointQuery={routeEndpointQuery}
            options={currentRoutePlanOptions}
            sortMode={routePlanSortMode}
            status={currentRoutePlanStatus}
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
            onSortModeChange={setRoutePlanSortMode}
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
              ) : null}
            </div>
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
                    {markerListCategoryId === 'player'
                      ? t('map.categoryName.player')
                      : markerQuery.trim()
                        ? t('map.markerList.results')
                        : nearbySearchCenter
                          ? t('map.markerList.nearby', { name: nearbySearchCenter.label })
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
                        <span>{t('map.nearby.note', { name: nearbySearchCenter.label })}</span>
                        <button
                          className="map-nearby-search-exit"
                          type="button"
                          onClick={() => setNearbySearchCenter(null)}
                        >
                          {t('map.nearby.exit')}
                        </button>
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
                                {t(
                                  scope === 'outside'
                                    ? 'map.nearby.scopeOutside'
                                    : 'map.nearby.scopeInside',
                                )}
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
                          const distanceDetail = formatMarkerListDistanceDetail(marker, {
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
                  label={focusedTransitLine ? '编辑线路' : '编辑 POI'}
                />
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
                        {label}
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
                      onDirectionChange={(direction) =>
                        setTransitLineDirectionSelection({
                          direction,
                          lineId: focusedTransitLine.id,
                        })
                      }
                      onFocusStation={(stationName) =>
                        focusTransitStationStop(focusedTransitLine, stationName)
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
                                        {categoryId === 'all'
                                          ? t('map.poi.filterAll')
                                          : (categoryById.get(categoryId) ??
                                            getMarkerCategoryDisplayName(categoryId, t))}
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
                                          {floorLabel === 'all'
                                            ? t('map.poi.filterAll')
                                            : floorLabel}
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
                {projectedShapePois.map((shape) => {
                  const source = shapeOverlaySource.find((marker) => marker.id === shape.id);
                  return source ? (
                    <button
                      className={[
                        'map-shape-poi-center',
                        `is-${shape.labelMode}`,
                        shape.isArea ? 'is-area-poi' : '',
                        shape.id === focusedMarkerId ? 'is-selected' : '',
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
                          '--shape-poi-color': shape.accentColor,
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
            {visibleProjectedLinearPois.map((marker) => {
              const sourceMarker = linearOverlaySource.find((item) => item.id === marker.id);
              const focusLinearMarker = () => {
                if (sourceMarker) {
                  handleMapMarkerClick(sourceMarker);
                }
              };

              return (
                <div className="map-linear-poi" key={marker.id}>
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
            {visibleProjectedMarkers.map((marker) => (
              <button
                className={[
                  'map-marker-dot',
                  !marker.isPlayer && (marker.showLabel || marker.id === focusedMarkerId)
                    ? 'has-label'
                    : '',
                  !marker.iconUrl ? 'has-fallback-icon' : '',
                  marker.id === focusedMarkerId ? 'is-selected' : '',
                  marker.roadKind ? `is-${marker.roadKind}` : '',
                  marker.playerPresence === 'offline' ? 'is-offline' : '',
                  marker.isPlayer ? 'is-player' : '',
                  marker.isCurrentAccount ? 'is-current-account' : '',
                  marker.transitOperationStatus === 'planned' ? 'is-transit-planned' : '',
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
          <div
            className="map-browse-mode-control"
            role="tablist"
            aria-label={t('map.layer.modeAria')}
          >
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
            {browseMode !== 'satellite' ? (
              <label className="map-layer-toggle">
                <span className="material-symbols-outlined" aria-hidden="true">
                  view_in_ar
                </span>
                <span>
                  <strong>{t('map.layer.perspective')}</strong>
                  <small>
                    {perspective2_5dVisible
                      ? t('map.layer.perspectiveVisible')
                      : t('map.layer.perspectiveHidden')}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={perspective2_5dVisible}
                  onChange={(event) => setPerspective2_5dVisible(event.currentTarget.checked)}
                />
              </label>
            ) : null}
            <label className="map-layer-toggle">
              <span className="material-symbols-outlined" aria-hidden="true">
                person_pin_circle
              </span>
              <span>
                <strong>{t('map.layer.players')}</strong>
                <small>
                  {playersVisible ? t('map.layer.playersVisible') : t('map.layer.playersHidden')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={playersVisible}
                onChange={(event) => setPlayersVisible(event.currentTarget.checked)}
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
              <button
                className="secondary-action-button is-primary"
                type="submit"
                disabled={poiSubmitBusy || publicPoiCategories.length === 0}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  upload
                </span>
                <span>
                  {poiSubmitBusy ? t('map.poiSubmit.submitting') : t('map.poiSubmit.submit')}
                </span>
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
                <img src={appPath('/icons/yct-logo-wordmark.svg')} alt="雨城通" />
              ) : (
                <span className="map-share-preview-footer-brand">
                  <img src={appPath('/icons/yct-logo.svg')} alt="" aria-hidden="true" />
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

type LocalizedMapMarker = MapMarkerSnapshot['markers'][number] & { sourceLabel: string };

type PointMarker = LocalizedMapMarker & {
  geometry: Extract<MapMarkerSnapshot['markers'][number]['geometry'], { type: 'Point' }>;
};

type LinearMarkerGeometry = Extract<MapGeometry, { type: 'MultiPoint' | 'LineString' }>;

type EndpointGroupMarker = LocalizedMapMarker & {
  geometry: LinearMarkerGeometry;
};

type TransitLineMarker = EndpointGroupMarker & {
  categoryId: 'transit-line';
  geometry: Extract<MapGeometry, { type: 'MultiPoint' }>;
};

type ShapeMarker = LocalizedMapMarker & {
  geometry: Exclude<MapGeometry, { type: 'Point' } | { type: 'MultiPoint' }>;
};

type RegionGeometry = Extract<
  MapGeometry,
  { type: 'Rectangle' | 'MultiRectangle' | 'Polygon' | 'MultiPolygon' }
>;

interface RouteTraversalBarrier {
  blockedModes: MapTravelMode[];
  geometry: RegionGeometry;
  id: string;
}

type CenterableMarker = LocalizedMapMarker;

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
  onDirectionChange,
  onFocusStation,
  t,
}: Readonly<{
  direction: TransitLineTravelDirection;
  line: TransitOverviewLine;
  lineColor?: string;
  onDirectionChange: (direction: TransitLineTravelDirection) => void;
  onFocusStation: (stationName: string) => void;
  t: Translate;
}>) {
  const stationStops = getDirectionalLineStops(line, direction);
  const firstStationName =
    stationStops[0]?.displayStationName ?? line.displayFirstStationName ?? line.firstStationName;
  const lastStationName =
    stationStops[stationStops.length - 1]?.displayStationName ??
    line.displayLastStationName ??
    line.lastStationName;
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
          <dd>{formatFareTextWithoutCurrencyUnit(line.fare) ?? t('lineDetail.toBeAdded')}</dd>
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
          onClick={() => onDirectionChange('forward')}
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
          onClick={() => onDirectionChange('reverse')}
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
              <button
                className="map-line-station-button"
                type="button"
                onClick={() => onFocusStation(stop.stationName)}
              >
                {formatMarkerDisplayName(stop.displayStationName ?? stop.stationName)}
                {stop.oneWay ? <small>{formatTransitStopOneWayLabel(stop.oneWay, t)}</small> : null}
              </button>
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
  sortMode,
  status,
  selectedOptionId,
  iconBaseUrl,
  onBeginEndpointEdit,
  onClear,
  onEndpointQueryChange,
  onSetAllModes,
  onSelectOption,
  onSortModeChange,
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
  sortMode: RoutePlanSortMode;
  status: RoutePlanStatus;
  selectedOptionId?: string;
  iconBaseUrl: string;
  onBeginEndpointEdit: (endpoint: RouteEndpointKind) => void;
  onClear: () => void;
  onEndpointQueryChange: (value: string) => void;
  onSetAllModes: (enabled: boolean) => void;
  onSelectOption: (optionId: string) => void;
  onSortModeChange: (mode: RoutePlanSortMode) => void;
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
              <div className="map-route-preference-toolbar">
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
                    aria-label={t('map.route.mode.all')}
                    title={t('map.route.mode.all')}
                    aria-pressed={allModesEnabled}
                    onClick={() => onSetAllModes(!allModesEnabled)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {allModesEnabled ? 'check_box' : 'select_check_box'}
                    </span>
                  </button>
                  {visibleRouteTransportModes.map((mode) => {
                    const modeLabel = getRouteTransportModeLabel(mode.mode, t);
                    return (
                      <button
                        className={[
                          enabledModes[mode.mode] ? 'is-active' : '',
                          mode.mode === 'taxi' ? 'is-taxi' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        type="button"
                        key={mode.mode}
                        aria-label={modeLabel}
                        title={modeLabel}
                        aria-pressed={enabledModes[mode.mode]}
                        onClick={() => onToggleMode(mode.mode)}
                        style={{ '--route-mode-color': mode.color } as CSSProperties}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {mode.icon}
                        </span>
                      </button>
                    );
                  })}
                  {collapsibleModeCount > 0 ? (
                    <button
                      className={
                        collapsedModesHaveEnabled
                          ? 'map-route-mode-toggle-more is-active'
                          : 'map-route-mode-toggle-more'
                      }
                      type="button"
                      aria-label={
                        modeListExpanded
                          ? t('map.route.mode.collapse')
                          : t('map.route.mode.more', { count: collapsibleModeCount })
                      }
                      title={
                        modeListExpanded
                          ? t('map.route.mode.collapse')
                          : t('map.route.mode.more', { count: collapsibleModeCount })
                      }
                      aria-expanded={modeListExpanded}
                      onClick={() => setModeListExpanded((value) => !value)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {modeListExpanded ? 'keyboard_arrow_up' : 'more_horiz'}
                      </span>
                    </button>
                  ) : null}
                </div>
                <RoutePlanSortControl mode={sortMode} onChange={onSortModeChange} t={t} />
              </div>
              <div className="map-route-option-list" aria-label={t('map.route.optionsAria')}>
                {status === 'loading' ? (
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
                          <span
                            className="material-symbols-outlined map-route-option-expand"
                            aria-hidden="true"
                          >
                            {isSelected ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
                          </span>
                        </button>
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
          </button>
        );
      })}
    </div>
  );
}

function buildRoutePlanOptions(input: {
  defaultDrivingSpeedKmh: number;
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
  roadTiming?: MapSpatialProfile['roadTiming'];
  taxiFare?: MapSpatialProfile['taxiFare'];
  transitFare?: MapSpatialProfile['transitFare'];
  traversalBarriers: RouteTraversalBarrier[];
}): RoutePlanOption[] {
  const roadGraph = input.roadGraph;
  const routeCache = createRoutePlanningCache(input.traversalBarriers);
  const draft = resolveRoutePlanDraftAccessPoints(
    input.draft,
    input.secondaryPoiIndex,
    input.secondaryPoiParentIndex,
    roadGraph,
    routeCache,
    input.t,
  );
  const options: RoutePlanOption[] = [];
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
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
    const acceptedWalkRoutes: ResolvedWalkRoute[] = [];
    const directDistance = directWalkRoute.distance + endpointAccessDistance;
    const directMinutes =
      estimateResolvedWalkRouteMinutes(directWalkRoute) +
      estimateRouteMinutes(endpointAccessDistance, 72);
    const directCoordinates = buildRouteTraceCoordinates(draft, directWalkRoute.coordinates);
    const directRoadLabels = createRouteRoadLabelsFromSegments(directWalkRoute.roadSegments);
    if (!directWalkRoute.blockedByTraversalBarrier) {
      acceptedWalkRoutes.push(directWalkRoute);
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
        modes: ['walk'],
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
    }

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
      acceptedWalkRoutes.push(fewerTurnWalkRoute);
      const fewerTurnDistance = fewerTurnWalkRoute.distance + endpointAccessDistance;
      const fewerTurnMinutes =
        estimateResolvedWalkRouteMinutes(fewerTurnWalkRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const fewerTurnCoordinates = buildRouteTraceCoordinates(
        draft,
        fewerTurnWalkRoute.coordinates,
      );
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
        modes: ['walk'],
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

    const fewestSegmentWalkRoute = buildWalkRouteBetweenCoordinates(
      draft.origin,
      draft.destination,
      roadGraph,
      routeCache,
      input.t,
      directWalkAccessOptions,
      'fewest-segments',
    );
    if (shouldAddAlternativeWalkRoute(directWalkRoute, fewestSegmentWalkRoute)) {
      acceptedWalkRoutes.push(fewestSegmentWalkRoute);
      const fewestSegmentDistance = fewestSegmentWalkRoute.distance + endpointAccessDistance;
      const fewestSegmentMinutes =
        estimateResolvedWalkRouteMinutes(fewestSegmentWalkRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const fewestSegmentCoordinates = buildRouteTraceCoordinates(
        draft,
        fewestSegmentWalkRoute.coordinates,
      );
      options.push({
        id: 'walk-fewest-segments',
        title: input.t('map.route.walkFewestSegments'),
        summary: `${formatRoutePlanDistance(fewestSegmentDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'conversion_path',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates: fewestSegmentCoordinates,
        traceSegments: [createRouteTraceSegment('walk', fewestSegmentCoordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(fewestSegmentWalkRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: fewestSegmentDistance,
        estimatedMinutes: fewestSegmentMinutes,
        transferCount: 0,
        walkingDistance: fewestSegmentDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(fewestSegmentWalkRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(fewestSegmentWalkRoute.distance, 64),
                input.t,
              ),
            }),
            fewestSegmentWalkRoute.details,
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

    for (const [alternativeIndex, strategy] of [
      [1, 'alternative-1'],
      [2, 'alternative-2'],
    ] as const) {
      const alternativeRoute = buildWalkRouteBetweenCoordinates(
        draft.origin,
        draft.destination,
        roadGraph,
        routeCache,
        input.t,
        directWalkAccessOptions,
        strategy,
      );
      if (!shouldAddDiversifiedWalkRoute(directWalkRoute, alternativeRoute, acceptedWalkRoutes)) {
        continue;
      }
      acceptedWalkRoutes.push(alternativeRoute);

      const distance = alternativeRoute.distance + endpointAccessDistance;
      const minutes =
        estimateResolvedWalkRouteMinutes(alternativeRoute) +
        estimateRouteMinutes(endpointAccessDistance, 72);
      const coordinates = buildRouteTraceCoordinates(draft, alternativeRoute.coordinates);
      options.push({
        id: `walk-alternative-${alternativeIndex}`,
        title: input.t(
          alternativeIndex === 1 ? 'map.route.walkAlternativeOne' : 'map.route.walkAlternativeTwo',
        ),
        summary: `${formatRoutePlanDistance(distance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'alt_route',
        color:
          routeTransportModeOptions.find((option) => option.mode === 'walk')?.color ??
          'var(--yct-color-text-secondary)',
        coordinates,
        traceSegments: [createRouteTraceSegment('walk', coordinates)],
        roadLabels: createRouteRoadLabelsFromSegments(alternativeRoute.roadSegments),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['walk'],
        estimatedDistance: distance,
        estimatedMinutes: minutes,
        transferCount: 0,
        walkingDistance: distance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createRouteEndpointAccessSteps(draft, 'origin', input.t),
          createRouteWalkStep(
            input.t('map.route.walkRoadWithDistance', {
              distance: formatRoutePlanDistance(alternativeRoute.distance, input.t),
              duration: formatRouteStepMinutes(
                estimateRouteMinutes(alternativeRoute.distance, 64),
                input.t,
              ),
            }),
            alternativeRoute.details,
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

  if (input.enabledModes.taxi && roadGraph) {
    const taxiOptionKeys = new Set<string>();
    const acceptedTaxiSegments: RoadRouteInstructionSegment[][] = [];
    for (const taxiStrategy of [
      'fewest-segments',
      'shortest',
      'alternative-1',
      'alternative-2',
    ] as const) {
      const drivingRoute = findRoadRouteBetweenCoordinates(
        draft.origin,
        draft.destination,
        roadGraph,
        routeCache,
        input.t,
        {
          destinationAccessCandidates: destinationRoadAccessCandidates,
          originAccessCandidates: originRoadAccessCandidates,
        },
        taxiStrategy,
        'taxi',
      );
      if (!drivingRoute) {
        continue;
      }
      if (isRoadRouteDirectAccessBlocked(drivingRoute, routeCache.traversalBarriers, 'walk')) {
        continue;
      }

      const taxiRoute = splitTaxiRoadRoute(draft, drivingRoute);
      if (taxiRoute.taxiDistance <= 0 || taxiRoute.taxiCoordinates.length < 2) {
        continue;
      }
      const taxiOptionKey = taxiRoute.taxiSegments
        .map((segment) => segment.roadId ?? segment.label)
        .join('|');
      if (taxiOptionKeys.has(taxiOptionKey)) {
        continue;
      }
      if (
        (taxiStrategy === 'alternative-1' || taxiStrategy === 'alternative-2') &&
        !isRoadRouteTopologicallyDistinct(taxiRoute.taxiSegments, acceptedTaxiSegments)
      ) {
        continue;
      }
      taxiOptionKeys.add(taxiOptionKey);
      acceptedTaxiSegments.push(taxiRoute.taxiSegments);

      const drivingSpeedBlocksPerMinute = Math.max(1, (input.defaultDrivingSpeedKmh * 1000) / 60);
      const taxiMinutes = estimateVehicleRouteMinutes(
        taxiRoute.taxiDistance,
        input.defaultDrivingSpeedKmh,
        drivingRoute.junctionCount,
        input.roadTiming?.taxiJunctionDelaySeconds ?? 8,
      );
      const taxiAccessMinutes = estimateRouteMinutes(taxiRoute.walkingDistance, 72);
      options.push({
        id:
          taxiStrategy === 'shortest'
            ? 'taxi-direct'
            : taxiStrategy === 'fewest-segments'
              ? 'taxi-fewest-segments'
              : `taxi-${taxiStrategy}`,
        title: input.t(
          taxiStrategy === 'shortest'
            ? 'map.route.taxiDirect'
            : taxiStrategy === 'fewest-segments'
              ? 'map.route.taxiFewestSegments'
              : taxiStrategy === 'alternative-1'
                ? 'map.route.taxiAlternativeOne'
                : 'map.route.taxiAlternativeTwo',
        ),
        summary: `${formatRoutePlanDistance(taxiRoute.taxiDistance, input.t)} · ${input.t(
          'map.route.summary.roadEstimate',
        )}`,
        icon: 'local_taxi',
        color: routeTaxiTraceColor,
        coordinates: taxiRoute.coordinates,
        traceSegments: taxiRoute.traceSegments,
        roadLabels: createRouteRoadLabelsFromSegments(taxiRoute.taxiSegments, routeTaxiTraceColor),
        markerIds: getRouteEndpointMarkerIds(draft),
        modes: ['taxi'],
        estimatedDistance: taxiRoute.taxiDistance + taxiRoute.walkingDistance,
        estimatedMinutes: taxiMinutes + taxiAccessMinutes,
        fare: input.taxiFare ? quoteTaxiFare(taxiRoute.taxiDistance, input.taxiFare) : undefined,
        transferCount: 0,
        walkingDistance: taxiRoute.walkingDistance,
        steps: [
          createRoutePlaceStep(input.t('map.route.depart', { name: draft.originLabel }), 'origin'),
          ...createTaxiRoadAccessSteps(taxiRoute.originWalkDistance, 'origin', input.t),
          createRouteTaxiStep(
            input.t('map.route.taxiWithDistance', {
              distance: formatRoutePlanDistance(taxiRoute.taxiDistance, input.t),
              duration: formatRouteStepMinutes(taxiMinutes, input.t),
            }),
            buildRoadRouteStepDetails(
              taxiRoute.taxiSegments,
              input.t,
              'taxi',
              drivingSpeedBlocksPerMinute,
            ),
          ),
          ...createTaxiRoadAccessSteps(taxiRoute.destinationWalkDistance, 'destination', input.t),
          createRoutePlaceStep(
            input.t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
        ],
        note: input.t('map.route.taxiNote', {
          speed: Math.round(input.defaultDrivingSpeedKmh),
        }),
      });
    }
  }

  options.push(...buildTransitRoutePlanOptions({ ...input, draft, roadGraph, routeCache }));

  return prepareRoutePlanOptions(options);
}

function createRoutePlanningCache(traversalBarriers: RouteTraversalBarrier[]): RoutePlanningCache {
  return {
    accessCandidatesByPair: new Map(),
    pathByNodePair: new Map(),
    roadRouteByPair: new Map(),
    traversalBarriers,
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
  if (fewerTurns > directTurns) {
    return false;
  }

  return fewerTurnRoute.distance <= directRoute.distance * 1.55 + 240;
}

function shouldAddAlternativeWalkRoute(
  directRoute: ResolvedWalkRoute,
  alternativeRoute: ResolvedWalkRoute,
): boolean {
  if (!directRoute.usesRoadGraph || !alternativeRoute.usesRoadGraph) {
    return false;
  }
  if (areCoordinateChainsEquivalent(directRoute.coordinates, alternativeRoute.coordinates)) {
    return false;
  }
  const directTurns = countRoadRouteTurns(directRoute.roadSegments ?? []);
  const alternativeTurns = countRoadRouteTurns(alternativeRoute.roadSegments ?? []);
  return (
    alternativeTurns <= directTurns + 1 &&
    alternativeRoute.distance <= directRoute.distance * 1.4 + 180
  );
}

function shouldAddDiversifiedWalkRoute(
  directRoute: ResolvedWalkRoute,
  candidate: ResolvedWalkRoute,
  acceptedRoutes: readonly ResolvedWalkRoute[],
): boolean {
  if (
    candidate.blockedByTraversalBarrier ||
    !directRoute.usesRoadGraph ||
    !candidate.usesRoadGraph ||
    candidate.distance > directRoute.distance * 1.85 + 320
  ) {
    return false;
  }

  const candidateSegments = candidate.roadSegments ?? [];
  return acceptedRoutes.every(
    (accepted) =>
      getRoadRouteSegmentOverlapRatio(candidateSegments, accepted.roadSegments ?? []) <= 0.82,
  );
}

function isRoadRouteTopologicallyDistinct(
  candidate: readonly RoadRouteInstructionSegment[],
  acceptedRoutes: readonly RoadRouteInstructionSegment[][],
): boolean {
  const candidateDistance = getRoadInstructionSegmentsDistance(candidate);
  const shortestAcceptedDistance = Math.min(
    ...acceptedRoutes.map(getRoadInstructionSegmentsDistance),
  );
  if (
    Number.isFinite(shortestAcceptedDistance) &&
    candidateDistance > shortestAcceptedDistance * 1.85 + 500
  ) {
    return false;
  }
  return acceptedRoutes.every(
    (accepted) => getRoadRouteSegmentOverlapRatio(candidate, accepted) <= 0.82,
  );
}

function getRoadRouteSegmentOverlapRatio(
  left: readonly RoadRouteInstructionSegment[],
  right: readonly RoadRouteInstructionSegment[],
): number {
  const leftEdges = collectRoadInstructionEdgeLengths(left);
  const rightEdges = collectRoadInstructionEdgeLengths(right);
  const leftDistance = sumMapValues(leftEdges);
  const rightDistance = sumMapValues(rightEdges);
  const comparableDistance = Math.min(leftDistance, rightDistance);
  if (comparableDistance <= 0) {
    return 0;
  }

  let sharedDistance = 0;
  for (const [key, distance] of leftEdges) {
    sharedDistance += Math.min(distance, rightEdges.get(key) ?? 0);
  }
  return sharedDistance / comparableDistance;
}

function collectRoadInstructionEdgeLengths(
  segments: readonly RoadRouteInstructionSegment[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const segment of segments) {
    if (segment.kind !== 'road' && segment.kind !== 'connection') {
      continue;
    }
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1];
      const to = segment.coordinates[index];
      if (!from || !to) {
        continue;
      }
      const fromKey = `${from[0].toFixed(1)},${from[1].toFixed(1)}`;
      const toKey = `${to[0].toFixed(1)},${to[1].toFixed(1)}`;
      const key = fromKey < toKey ? `${fromKey}>${toKey}` : `${toKey}>${fromKey}`;
      result.set(key, (result.get(key) ?? 0) + getCoordinateDistance(from, to));
    }
  }
  return result;
}

function getRoadInstructionSegmentsDistance(
  segments: readonly RoadRouteInstructionSegment[],
): number {
  return segments.reduce(
    (total, segment) =>
      total +
      (segment.kind === 'road' || segment.kind === 'connection'
        ? getCoordinateChainDistance(segment.coordinates)
        : 0),
    0,
  );
}

function sumMapValues(values: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const value of values.values()) {
    total += value;
  }
  return total;
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

function buildRoutePlanCalculationKey(
  draft: RoutePlanDraft,
  enabledModes: EnabledRouteTransportModes,
): string {
  return JSON.stringify({
    destination: draft.destination,
    destinationId: draft.destinationId,
    destinationLabel: draft.destinationLabel,
    modes: routeTransportModeOptions.map(({ mode }) => [mode, enabledModes[mode]]),
    origin: draft.origin,
    originId: draft.originId,
    originLabel: draft.originLabel,
  });
}

function updateRoutePlanDraftPlayerEndpoints(
  draft: RoutePlanDraft,
  pointMarkers: PointMarker[],
): RoutePlanDraft {
  let nextDraft = draft;

  for (const endpoint of ['origin', 'destination'] as const) {
    const markerId = endpoint === 'origin' ? nextDraft.originId : nextDraft.destinationId;
    if (!markerId) {
      continue;
    }

    const marker = pointMarkers.find(
      (candidate) => candidate.id === markerId && candidate.playerLocation,
    );
    if (!marker) {
      continue;
    }

    const latestCoordinate = marker.geometry.coordinates;
    const previousCoordinate =
      endpoint === 'origin'
        ? (nextDraft.originRaw ?? nextDraft.origin)
        : (nextDraft.destinationRaw ?? nextDraft.destination);
    if (
      getCoordinateDistance(previousCoordinate, latestCoordinate) < playerRouteRecalculationDistance
    ) {
      continue;
    }

    if (nextDraft === draft) {
      nextDraft = { ...draft };
    }

    if (endpoint === 'origin') {
      nextDraft.origin = latestCoordinate;
      if (nextDraft.originRaw) {
        nextDraft.originRaw = latestCoordinate;
      }
    } else {
      nextDraft.destination = latestCoordinate;
      if (nextDraft.destinationRaw) {
        nextDraft.destinationRaw = latestCoordinate;
      }
    }
  }

  return nextDraft;
}

function isPlayerLocationMarkerId(markerId: string | undefined): markerId is string {
  return Boolean(markerId?.startsWith('player-location-'));
}

function getRouteOptionLimit(enabledModes: EnabledRouteTransportModes): number {
  const enabledCount = routeTransportModeOptions.filter(
    (option) => enabledModes[option.mode],
  ).length;
  return Math.min(16, Math.max(6, enabledCount + 5));
}

function selectRoutePlanOptions(
  options: RoutePlanOption[],
  enabledModes: EnabledRouteTransportModes,
  limit: number,
  sortMode: RoutePlanSortMode,
): RoutePlanOption[] {
  const sorted = [...options].sort((left, right) => compareRoutePlanOptions(left, right, sortMode));
  const selected = new Map<string, RoutePlanOption>();

  for (const { mode } of routeTransportModeOptions) {
    if (!enabledModes[mode]) {
      continue;
    }
    const representative = sorted.find((option) => option.modes.includes(mode));
    if (representative) {
      selected.set(representative.id, representative);
    }
  }
  for (const option of sorted) {
    if (selected.size >= limit) {
      break;
    }
    selected.set(option.id, option);
  }

  return Array.from(selected.values())
    .sort((left, right) => compareRoutePlanOptions(left, right, sortMode))
    .slice(0, limit);
}

function prepareRoutePlanOptions(options: RoutePlanOption[]): RoutePlanOption[] {
  const deduped = mergeEquivalentTransitRouteOptions(options);
  return deduped.filter(
    (candidate) =>
      !deduped.some(
        (other) =>
          other.id !== candidate.id &&
          haveEquivalentRouteModes(other, candidate) &&
          dominatesRouteOption(other, candidate),
      ),
  );
}

function mergeEquivalentTransitRouteOptions(options: RoutePlanOption[]): RoutePlanOption[] {
  const mergedByKey = new Map<string, RoutePlanOption>();
  const result: RoutePlanOption[] = [];

  for (const option of options) {
    if (!option.serviceLabels?.length) {
      result.push(option);
      continue;
    }

    const key = JSON.stringify({
      fare: option.fare
        ? [option.fare.status, option.fare.totalAmount, option.fare.knownSubtotal]
        : null,
      markerIds: option.markerIds,
      minutes: option.estimatedMinutes,
      modes: [...option.modes].sort(),
      transfers: option.transferCount,
      walking: Math.round(option.walkingDistance),
    });
    const existing = mergedByKey.get(key);
    if (!existing) {
      const initial = { ...option, serviceLabels: [...option.serviceLabels] };
      mergedByKey.set(key, initial);
      result.push(initial);
      continue;
    }

    existing.serviceLabels = dedupeValues([
      ...(existing.serviceLabels ?? []),
      ...option.serviceLabels,
    ]);
    const summaryDetail = existing.summary.split(' · ').slice(1).join(' · ');
    existing.summary = `${formatMergedRouteServiceLabels(existing.serviceLabels)}${
      summaryDetail ? ` · ${summaryDetail}` : ''
    }`;
  }

  return result;
}

function formatMergedRouteServiceLabels(labels: string[]): string {
  if (labels.length <= 3) {
    return labels.join(' / ');
  }
  return `${labels.slice(0, 3).join(' / ')} +${labels.length - 3}`;
}

function haveEquivalentRouteModes(left: RoutePlanOption, right: RoutePlanOption): boolean {
  return [...left.modes].sort().join(',') === [...right.modes].sort().join(',');
}

function dominatesRouteOption(left: RoutePlanOption, right: RoutePlanOption): boolean {
  if (
    left.modes.length === 1 &&
    (left.modes[0] === 'walk' || left.modes[0] === 'taxi') &&
    !areCoordinateChainsEquivalent(left.coordinates, right.coordinates)
  ) {
    return false;
  }
  const noWorse =
    left.estimatedMinutes <= right.estimatedMinutes &&
    left.walkingDistance <= right.walkingDistance &&
    left.transferCount <= right.transferCount;
  const strictlyBetter =
    left.estimatedMinutes < right.estimatedMinutes ||
    left.walkingDistance < right.walkingDistance ||
    left.transferCount < right.transferCount;
  return noWorse && strictlyBetter;
}

function compareRoutePlanOptions(
  left: RoutePlanOption,
  right: RoutePlanOption,
  mode: RoutePlanSortMode = 'time',
): number {
  const criteria: Record<RoutePlanSortMode, Array<(option: RoutePlanOption) => number>> = {
    time: [
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
      (option) => option.transferCount,
    ],
    walking: [
      (option) => option.walkingDistance,
      (option) => option.estimatedMinutes,
      (option) => option.transferCount,
    ],
    transfers: [
      (option) => option.transferCount,
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
    ],
    fare: [
      getSortableRouteFare,
      (option) => option.estimatedMinutes,
      (option) => option.walkingDistance,
    ],
  };
  for (const readValue of criteria[mode]) {
    const difference = readValue(left) - readValue(right);
    if (difference !== 0) {
      return difference;
    }
  }
  return (
    left.estimatedDistance - right.estimatedDistance ||
    left.title.localeCompare(right.title, 'zh-CN')
  );
}

function getSortableRouteFare(option: RoutePlanOption): number {
  if (!option.fare || option.fare.status === 'unavailable') {
    return Number.POSITIVE_INFINITY;
  }
  return option.fare.totalAmount ?? option.fare.knownSubtotal;
}

function splitTaxiRoadRoute(
  draft: RoutePlanDraft,
  route: ResolvedRoadRoute,
): {
  coordinates: Array<[number, number]>;
  destinationWalkDistance: number;
  originWalkDistance: number;
  taxiCoordinates: Array<[number, number]>;
  taxiDistance: number;
  taxiSegments: RoadRouteInstructionSegment[];
  traceSegments: RoutePlanTraceSegment[];
  walkingDistance: number;
} {
  const firstTaxiSegmentIndex = route.roadSegments.findIndex(isTaxiRoadSegment);
  let lastTaxiSegmentIndex = -1;
  for (let index = route.roadSegments.length - 1; index >= 0; index -= 1) {
    const segment = route.roadSegments[index];
    if (segment && isTaxiRoadSegment(segment)) {
      lastTaxiSegmentIndex = index;
      break;
    }
  }
  const originWalkSegments = route.roadSegments.slice(0, firstTaxiSegmentIndex);
  const taxiSegments = route.roadSegments.slice(firstTaxiSegmentIndex, lastTaxiSegmentIndex + 1);
  const destinationWalkSegments = route.roadSegments.slice(lastTaxiSegmentIndex + 1);
  const originWalkCoordinates = dedupeConsecutiveCoordinates([
    ...(draft.originRaw ? [draft.originRaw] : []),
    ...flattenRouteSegmentCoordinates(originWalkSegments),
  ]);
  const taxiCoordinates = flattenRouteSegmentCoordinates(taxiSegments);
  const destinationWalkCoordinates = dedupeConsecutiveCoordinates([
    ...flattenRouteSegmentCoordinates(destinationWalkSegments),
    ...(draft.destinationRaw ? [draft.destinationRaw] : []),
  ]);
  const originWalkDistance = getCoordinateChainDistance(originWalkCoordinates);
  const destinationWalkDistance = getCoordinateChainDistance(destinationWalkCoordinates);
  const taxiDistance = taxiSegments.reduce(
    (total, segment) => total + getCoordinateChainDistance(segment.coordinates),
    0,
  );
  const traceSegments = [
    originWalkCoordinates.length >= 2
      ? createRouteTraceSegment('walk', originWalkCoordinates)
      : undefined,
    taxiCoordinates.length >= 2
      ? createRouteTraceSegment('taxi', taxiCoordinates, routeTaxiTraceColor)
      : undefined,
    destinationWalkCoordinates.length >= 2
      ? createRouteTraceSegment('walk', destinationWalkCoordinates)
      : undefined,
  ].filter((segment): segment is RoutePlanTraceSegment => Boolean(segment));

  return {
    coordinates: dedupeConsecutiveCoordinates(
      traceSegments.flatMap((segment) => segment.coordinates),
    ),
    destinationWalkDistance,
    originWalkDistance,
    taxiCoordinates,
    taxiDistance,
    taxiSegments,
    traceSegments,
    walkingDistance: originWalkDistance + destinationWalkDistance,
  };
}

function isTaxiRoadSegment(segment: RoadRouteInstructionSegment): boolean {
  return segment.kind === 'road' || segment.kind === 'connection';
}

function flattenRouteSegmentCoordinates(
  segments: readonly RoadRouteInstructionSegment[],
): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  for (const segment of segments) {
    appendRouteSegmentCoordinates(coordinates, segment.coordinates);
  }
  return coordinates;
}

function getRouteOptionBadges(
  option: RoutePlanOption,
  options: RoutePlanOption[],
  t: Translate,
): string[] {
  const badges: string[] = [];
  const minEstimatedMinutes = Math.min(...options.map((item) => item.estimatedMinutes));
  const minTransferCount = Math.min(...options.map((item) => item.transferCount));
  const minWalkingDistance = Math.min(...options.map((item) => item.walkingDistance));

  if (option.estimatedMinutes === minEstimatedMinutes) {
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
  roadGraph: RoadRouteGraph | undefined,
  routeCache: RoutePlanningCache,
  t: Translate,
): RoutePlanDraft {
  if (
    draft.originId &&
    draft.destinationId &&
    areRouteEndpointsParentAndChild(draft.originId, draft.destinationId, secondaryPoiParentIndex)
  ) {
    return draft;
  }

  const originCandidates = listRouteEndpointAccessPoints({
    endpointCoordinate: draft.origin,
    endpointId: draft.originId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
  });
  const destinationCandidates = listRouteEndpointAccessPoints({
    endpointCoordinate: draft.destination,
    endpointId: draft.destinationId,
    secondaryPoiIndex,
    secondaryPoiParentIndex,
  });

  const pairs = originCandidates.flatMap((origin) =>
    destinationCandidates.map((destination) => {
      const betweenAccessPoints = buildWalkRouteBetweenCoordinates(
        origin.coordinate,
        destination.coordinate,
        roadGraph,
        routeCache,
        t,
      ).distance;
      const originAccessDistance = origin.accessId
        ? isDirectTraversalBlocked(
            draft.origin,
            origin.coordinate,
            routeCache.traversalBarriers,
            'walk',
          )
          ? Number.POSITIVE_INFINITY
          : getCoordinateDistance(draft.origin, origin.coordinate)
        : 0;
      const destinationAccessDistance = destination.accessId
        ? isDirectTraversalBlocked(
            draft.destination,
            destination.coordinate,
            routeCache.traversalBarriers,
            'walk',
          )
          ? Number.POSITIVE_INFINITY
          : getCoordinateDistance(draft.destination, destination.coordinate)
        : 0;
      const endpointAccessDistance = originAccessDistance + destinationAccessDistance;
      return {
        destination,
        directionDistance:
          getCoordinateDistance(origin.coordinate, draft.destination) +
          getCoordinateDistance(destination.coordinate, draft.origin),
        origin,
        totalWalkingDistance: betweenAccessPoints + endpointAccessDistance,
      };
    }),
  );
  pairs.sort(
    (left, right) =>
      left.totalWalkingDistance - right.totalWalkingDistance ||
      left.directionDistance - right.directionDistance,
  );
  const selected = pairs.find((pair) => Number.isFinite(pair.totalWalkingDistance));
  const origin = selected?.origin ?? { coordinate: draft.origin };
  const destination = selected?.destination ?? { coordinate: draft.destination };

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

interface RouteEndpointAccessPoint {
  coordinate: [number, number];
  accessId?: string;
  accessLabel?: string;
}

function listRouteEndpointAccessPoints(input: {
  endpointCoordinate: [number, number];
  endpointId?: string;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  secondaryPoiParentIndex: ReadonlyMap<string, SecondaryPoiParentLink>;
}): RouteEndpointAccessPoint[] {
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
    return [{ coordinate: input.endpointCoordinate }];
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
    return [{ coordinate: input.endpointCoordinate }];
  }

  const candidates: RouteEndpointAccessPoint[] = childPois.flatMap((link) => {
    const coordinate = getMarkerCenter(link.marker);
    return coordinate
      ? [
          {
            coordinate,
            accessId: link.marker.id,
            accessLabel: link.childLabel || formatMarkerDisplayName(link.marker.label),
          },
        ]
      : [];
  });

  return candidates.length > 0 ? candidates : [{ coordinate: input.endpointCoordinate }];
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

  return (
    !link.marker.iconFileName && /出入口|入口|出口|[东西南北]门|正门|侧门|大门|门岗/.test(text)
  );
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
  let activeLabel: RoutePlanRoadLabel | undefined;

  for (const segment of segments ?? []) {
    if (segment.kind !== 'road' || segment.coordinates.length < 2) {
      activeLabel = undefined;
      continue;
    }

    const label = formatMarkerDisplayName(segment.label);
    if (!label) {
      activeLabel = undefined;
      continue;
    }

    const roadId = segment.roadId ?? `road:${normalizeMarkerSearchText(label)}`;
    const previousCoordinate = activeLabel?.coordinates.at(-1);
    const firstCoordinate = segment.coordinates[0];
    if (
      activeLabel &&
      activeLabel.roadId === roadId &&
      previousCoordinate &&
      firstCoordinate &&
      areCoordinatesClose(previousCoordinate, firstCoordinate)
    ) {
      activeLabel.coordinates = dedupeConsecutiveCoordinates([
        ...activeLabel.coordinates,
        ...segment.coordinates,
      ]);
      continue;
    }

    activeLabel = {
      color,
      coordinates: [...segment.coordinates],
      id: `route-road-label-${encodeURIComponent(roadId)}-${labels.length}`,
      label,
      roadId,
    };
    labels.push(activeLabel);
  }

  return labels.filter((label) => getCoordinateChainDistance(label.coordinates) > 0);
}

function combineRouteRoadLabels(
  ...groups: Array<RoutePlanRoadLabel[] | undefined>
): RoutePlanRoadLabel[] {
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
  const accessLabel =
    endpoint === 'origin' ? draft.originAccessLabel : draft.destinationAccessLabel;
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

function buildRoadRouteGraph(
  roadMarkers: EndpointGroupMarker[],
  junctionSnapTolerance: number,
  mapDefaultY: number,
  verticalTolerance: number,
  worldId: string,
): RoadRouteGraph | undefined {
  const nodes: RoadRouteNode[] = [];
  const adjacency = new Map<string, RoadRouteEdge[]>();
  const baseRoadSegments: RoadRouteSegment[] = [];
  const markerById = new Map(roadMarkers.map((marker) => [marker.id, marker]));

  for (const marker of roadMarkers) {
    if (marker.spatial?.worldId && marker.spatial.worldId !== worldId) {
      continue;
    }
    if (marker.geometry.coordinates.length < 2) {
      continue;
    }

    const roadLabel = formatMarkerDisplayName(marker.label);
    const coordinates = orderRoadTracePoints(marker.geometry.coordinates);
    const coordinateYs = resolveRoadCoordinateYs(marker, coordinates, mapDefaultY);
    coordinates.forEach((coordinate, index) => {
      const node: RoadRouteNode = {
        id: `${marker.id}:${index}`,
        coordinate,
        y: coordinateYs[index] ?? mapDefaultY,
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
          endY: current.y,
          endIsRoadTerminus: index === roadNodes.length - 1,
          endNodeId: current.id,
          id: `${previous.id}->${current.id}`,
          allowedModes: resolveRoadAllowedModes(markerById.get(previous.roadId)),
          direction: markerById.get(previous.roadId)?.spatial?.direction ?? 'both',
          roadId: previous.roadId,
          roadLabel: previous.roadLabel,
          start: previous.coordinate,
          startY: previous.y,
          startIsRoadTerminus: index === 1,
          startNodeId: previous.id,
          verticalConnector: Boolean(
            markerById.get(previous.roadId)?.spatial?.verticalConnectorKind,
          ),
        });
      }
    }
  }

  const baseRoadSegmentsById = new Map(baseRoadSegments.map((segment) => [segment.id, segment]));
  const connectionCandidates = collectRoadConnectionCandidates(
    baseRoadSegments,
    junctionSnapTolerance,
  );
  const segmentPointsById = new Map<
    string,
    Array<{ coordinate: [number, number]; nodeId: string; ratio: number }>
  >();
  const resolvedConnections: Array<{
    allowedModes: MapTravelMode[];
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
      y: interpolateNumber(segment.startY, segment.endY, getRoadSegmentRatio(segment, coordinate)),
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
    const leftY = interpolateNumber(
      leftSegment.startY,
      leftSegment.endY,
      getRoadSegmentRatio(leftSegment, candidate.leftCoordinate),
    );
    const rightY = interpolateNumber(
      rightSegment.startY,
      rightSegment.endY,
      getRoadSegmentRatio(rightSegment, candidate.rightCoordinate),
    );
    const allowedModes = intersectRoadAllowedModes(
      leftSegment.allowedModes,
      rightSegment.allowedModes,
    );
    if (Math.abs(leftY - rightY) > verticalTolerance || allowedModes.length === 0) {
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
      allowedModes,
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

      if (
        Math.abs(previousNode.y - currentNode.y) > verticalTolerance &&
        !segment.verticalConnector
      ) {
        continue;
      }
      roadSegments.push({
        allowedModes: segment.allowedModes,
        direction: segment.direction,
        end: current.coordinate,
        endY: currentNode.y,
        endIsRoadTerminus: segment.endIsRoadTerminus && current.ratio === 1,
        endNodeId: current.nodeId,
        id: `${segment.id}:${index - 1}`,
        roadId: segment.roadId,
        roadLabel: segment.roadLabel,
        start: previous.coordinate,
        startY: previousNode.y,
        startIsRoadTerminus: segment.startIsRoadTerminus && previous.ratio === 0,
        startNodeId: previous.nodeId,
        verticalConnector: segment.verticalConnector,
      });
      addRoadRouteGraphEdge(adjacency, previousNode, currentNode, {
        allowedModes: segment.allowedModes,
        coordinates: [previous.coordinate, current.coordinate],
        direction: segment.direction,
        distance: getCoordinateDistance(previous.coordinate, current.coordinate),
        kind: 'road',
        label: segment.roadLabel,
        roadId: segment.roadId,
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
      allowedModes: connection.allowedModes,
      coordinates: [connection.leftCoordinate, connection.rightCoordinate],
      direction: 'both',
      distance: connection.distance,
      kind: 'connection',
      label: connection.rightRoadLabel,
      reverseLabel: connection.leftRoadLabel,
    });
  }

  return {
    adjacency,
    defaultY: mapDefaultY,
    nodes,
    nodesById,
    roadSegments,
    verticalTolerance,
    worldId,
  };
}

function resolveRoadCoordinateYs(
  marker: EndpointGroupMarker,
  orderedCoordinates: Array<[number, number]>,
  mapDefaultY: number,
): number[] {
  const defaultY = marker.spatial?.defaultY ?? mapDefaultY;
  const yByCoordinate = new Map(
    marker.geometry.coordinates.map((coordinate, index) => [
      `${coordinate[0]}:${coordinate[1]}`,
      marker.spatial?.coordinateY?.[index] ?? defaultY,
    ]),
  );
  return orderedCoordinates.map(
    (coordinate) => yByCoordinate.get(`${coordinate[0]}:${coordinate[1]}`) ?? defaultY,
  );
}

function resolveRoadAllowedModes(marker: EndpointGroupMarker | undefined): MapTravelMode[] {
  if (marker?.spatial?.allowedModes?.length) {
    return marker.spatial.allowedModes;
  }
  return marker?.spatial?.networkKind === 'pedestrian'
    ? ['walk']
    : ['walk', 'taxi', 'bus', 'coach'];
}

function intersectRoadAllowedModes(
  left: readonly MapTravelMode[],
  right: readonly MapTravelMode[],
): MapTravelMode[] {
  const rightModes = new Set(right);
  return left.filter((mode) => rightModes.has(mode));
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio;
}

function collectRoadConnectionCandidates(
  roadSegments: RoadRouteSegment[],
  junctionSnapTolerance: number,
): RoadConnectionCandidate[] {
  const segmentsById = new Map(roadSegments.map((segment) => [segment.id, segment]));
  return collectMapRoadConnectionProjections(roadSegments, junctionSnapTolerance).flatMap(
    (candidate) => {
      const left = segmentsById.get(candidate.leftSegmentId);
      const right = segmentsById.get(candidate.rightSegmentId);
      return left && right
        ? [
            {
              distance: candidate.distance,
              leftCoordinate: candidate.leftCoordinate,
              leftRoadLabel: left.roadLabel,
              leftSegmentId: left.id,
              rightCoordinate: candidate.rightCoordinate,
              rightRoadLabel: right.roadLabel,
              rightSegmentId: right.id,
            },
          ]
        : [];
    },
  );
}

function createRouteTaxiStep(label: string, details?: RoutePlanStepDetail[]): RoutePlanStep {
  return {
    kind: 'taxi',
    label,
    details: details?.length ? details : [createRouteStepDetail('local_taxi', label)],
  };
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

function getRoadSegmentRatio(segment: RoadRouteSegment, coordinate: [number, number]): number {
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
    allowedModes: MapTravelMode[];
    coordinates: Array<[number, number]>;
    direction: MapNetworkDirection;
    distance: number;
    kind: 'connection' | 'road';
    label: string;
    roadId?: string;
    reverseLabel?: string;
  },
) {
  if (input.direction !== 'reverse') {
    adjacency.get(from.id)?.push({
      allowedModes: input.allowedModes,
      coordinates: input.coordinates,
      distance: input.distance,
      kind: input.kind,
      label: input.label,
      roadId: input.roadId,
      to: to.id,
    });
  }
  if (input.direction !== 'forward') {
    adjacency.get(to.id)?.push({
      allowedModes: input.allowedModes,
      coordinates: [...input.coordinates].reverse() as Array<[number, number]>,
      distance: input.distance,
      kind: input.kind,
      label: input.reverseLabel ?? input.label,
      roadId: input.roadId,
      to: from.id,
    });
  }
}

function findRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  strategy: RoadRouteStrategy = 'shortest',
  travelMode: MapTravelMode = 'walk',
): RoadRoutePath | undefined {
  if (strategy === 'alternative-1' || strategy === 'alternative-2') {
    return findDiversifiedRoadRoutePath(
      graph,
      originId,
      destinationId,
      travelMode,
      strategy === 'alternative-1' ? 1 : 2,
    );
  }
  if (strategy === 'fewest-segments') {
    return findFewestSegmentRoadRoutePath(graph, originId, destinationId, travelMode);
  }
  if (strategy === 'fewer-turns') {
    return findFewerTurnRoadRoutePath(graph, originId, destinationId, travelMode);
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
      if (!edge.allowedModes.includes(travelMode)) {
        continue;
      }
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
      roadId: edge.roadId,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function findDiversifiedRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
  alternativeIndex: number,
): RoadRoutePath | undefined {
  const shortest = findRoadRoutePath(graph, originId, destinationId, 'shortest', travelMode);
  if (!shortest) {
    return undefined;
  }

  const previousPaths = [shortest];
  for (let index = 0; index < alternativeIndex; index += 1) {
    const penalizedEdgeKeys = new Set<string>();
    const penalizedRoadIds = new Set<string>();
    for (const path of previousPaths) {
      collectRoadRoutePathPenaltyKeys(path, graph, penalizedEdgeKeys, penalizedRoadIds);
    }
    const nextPath = findPenalizedRoadRoutePath(
      graph,
      originId,
      destinationId,
      travelMode,
      penalizedEdgeKeys,
      penalizedRoadIds,
    );
    if (!nextPath) {
      return undefined;
    }
    previousPaths.push(nextPath);
  }

  return previousPaths.at(-1);
}

function findPenalizedRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
  penalizedEdgeKeys: ReadonlySet<string>,
  penalizedRoadIds: ReadonlySet<string>,
): RoadRoutePath | undefined {
  if (originId === destinationId) {
    return findRoadRoutePath(graph, originId, destinationId, 'shortest', travelMode);
  }

  const scores = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    scores.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    const currentId = findNearestUnvisitedRoadRouteNode(unvisited, scores);
    if (!currentId) {
      break;
    }
    if (currentId === destinationId) {
      break;
    }
    unvisited.delete(currentId);
    const currentScore = scores.get(currentId) ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(currentScore)) {
      break;
    }

    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!edge.allowedModes.includes(travelMode) || !unvisited.has(edge.to)) {
        continue;
      }
      const exactEdgePenalty = penalizedEdgeKeys.has(getRoadRouteEdgeKey(currentId, edge))
        ? edge.distance * 6 + 240
        : 0;
      const sameRoadPenalty =
        edge.roadId && penalizedRoadIds.has(edge.roadId) ? edge.distance * 1.5 : 0;
      const nextScore = currentScore + edge.distance + exactEdgePenalty + sameRoadPenalty;
      if (nextScore < (scores.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        scores.set(edge.to, nextScore);
        previous.set(edge.to, currentId);
      }
    }
  }

  if (!Number.isFinite(scores.get(destinationId) ?? Number.POSITIVE_INFINITY)) {
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
  pathIds.reverse();

  const nodes = pathIds
    .map((id) => graph.nodesById.get(id))
    .filter((node): node is RoadRouteNode => Boolean(node));
  if (nodes.length < 2) {
    return undefined;
  }

  const coordinates: Array<[number, number]> = [];
  const segments: RoadRouteInstructionSegment[] = [];
  let distance = 0;
  for (let index = 1; index < pathIds.length; index += 1) {
    const fromId = pathIds[index - 1];
    const toId = pathIds[index];
    const edge = fromId ? graph.adjacency.get(fromId)?.find((item) => item.to === toId) : undefined;
    if (!edge) {
      return undefined;
    }
    appendRouteSegmentCoordinates(coordinates, edge.coordinates);
    distance += edge.distance;
    segments.push({
      coordinates: edge.coordinates,
      kind: edge.kind,
      label: edge.label,
      roadId: edge.roadId,
    });
  }

  return { coordinates, distance, nodes, segments };
}

function collectRoadRoutePathPenaltyKeys(
  path: RoadRoutePath,
  graph: RoadRouteGraph,
  edgeKeys: Set<string>,
  roadIds: Set<string>,
): void {
  for (let index = 1; index < path.nodes.length; index += 1) {
    const fromId = path.nodes[index - 1]?.id;
    const toId = path.nodes[index]?.id;
    const edge = fromId ? graph.adjacency.get(fromId)?.find((item) => item.to === toId) : undefined;
    if (!fromId || !edge) {
      continue;
    }
    edgeKeys.add(getRoadRouteEdgeKey(fromId, edge));
    if (edge.roadId) {
      roadIds.add(edge.roadId);
    }
  }
}

function getRoadRouteEdgeKey(fromId: string, edge: RoadRouteEdge): string {
  return `${fromId}>${edge.to}|${edge.roadId ?? edge.label}|${edge.kind}`;
}

function findFewestSegmentRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
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

  const segmentWeight = 100_000;
  const distances = new Map<string, number>();
  const segmentCounts = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) {
    distances.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
    segmentCounts.set(node.id, node.id === originId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    let currentId: string | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const nodeId of unvisited) {
      const count = segmentCounts.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      const score = count * segmentWeight + distance;
      if (score < bestScore) {
        bestScore = score;
        currentId = nodeId;
      }
    }
    if (!currentId || !Number.isFinite(bestScore)) {
      break;
    }
    unvisited.delete(currentId);
    if (currentId === destinationId) {
      break;
    }

    const currentCount = segmentCounts.get(currentId) ?? Number.POSITIVE_INFINITY;
    const currentDistance = distances.get(currentId) ?? Number.POSITIVE_INFINITY;
    for (const edge of graph.adjacency.get(currentId) ?? []) {
      if (!edge.allowedModes.includes(travelMode) || !unvisited.has(edge.to)) {
        continue;
      }
      const nextCount = currentCount + 1;
      const nextDistance = currentDistance + edge.distance;
      const nextScore = nextCount * segmentWeight + nextDistance;
      const existingCount = segmentCounts.get(edge.to) ?? Number.POSITIVE_INFINITY;
      const existingDistance = distances.get(edge.to) ?? Number.POSITIVE_INFINITY;
      if (nextScore < existingCount * segmentWeight + existingDistance) {
        segmentCounts.set(edge.to, nextCount);
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
      roadId: edge.roadId,
    });
  }
  return { coordinates, distance, nodes, segments };
}

function findFewerTurnRoadRoutePath(
  graph: RoadRouteGraph,
  originId: string,
  destinationId: string,
  travelMode: MapTravelMode,
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
      if (!edge.allowedModes.includes(travelMode)) {
        continue;
      }
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
      roadId: edge.roadId,
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
  travelMode: 'walk' | 'taxi' = 'walk',
  blocksPerMinute = 64,
): RoutePlanStepDetail[] {
  const groups: Array<{
    distance: number;
    end: [number, number];
    label: string;
    kind: RoadRouteInstructionSegment['kind'];
    start: [number, number];
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

    const vector: [number, number] = [end[0] - start[0], end[1] - start[1]];
    const lastGroup = groups.at(-1);
    if (
      lastGroup &&
      lastGroup.label === segment.label &&
      ((lastGroup.kind === 'road' && segment.kind === 'road') ||
        (lastGroup.kind === 'connection' && segment.kind === 'road'))
    ) {
      lastGroup.distance += distance;
      lastGroup.kind = 'road';
      lastGroup.end = end;
      lastGroup.vector = vector;
    } else {
      groups.push({
        distance,
        end,
        kind: segment.kind,
        label: segment.label,
        start,
        vector,
      });
    }
  }

  return compactShortRoadInstructionGroups(groups).map((group, index, compactedGroups) =>
    createRouteStepDetail(
      index === 0
        ? travelMode === 'taxi'
          ? 'local_taxi'
          : 'directions_walk'
        : getTurnInstructionIcon(compactedGroups[index - 1]?.vector, group.vector),
      formatRoadRouteStepLabel(group.kind, group.label, t),
      `${formatRoutePlanDistance(group.distance, t)} ${formatRouteStepMinutes(
        estimateRouteMinutes(
          group.distance,
          travelMode === 'taxi'
            ? blocksPerMinute
            : group.kind === 'road' || group.kind === 'connection'
              ? 64
              : 72,
        ),
        t,
      )}`,
      'process',
    ),
  );
}

function compactShortRoadInstructionGroups(
  groups: Array<{
    distance: number;
    end: [number, number];
    label: string;
    kind: RoadRouteInstructionSegment['kind'];
    start: [number, number];
    vector: [number, number];
  }>,
): typeof groups {
  const compacted = groups.map((group) => ({ ...group }));
  const shortSegmentDistance = 24;
  for (let index = 1; index < compacted.length - 1; index += 1) {
    const current = compacted[index];
    const next = compacted[index + 1];
    if (
      !current ||
      !next ||
      current.distance > shortSegmentDistance ||
      (current.kind !== 'road' && current.kind !== 'connection') ||
      (next.kind !== 'road' && next.kind !== 'connection')
    ) {
      continue;
    }

    // 很短的中间路段只会制造一次“刚转弯又转弯”的噪声，合并到下一条指令。
    next.distance += current.distance;
    next.start = current.start;
    next.vector = [next.end[0] - next.start[0], next.end[1] - next.start[1]];
    compacted.splice(index, 1);
    index -= 1;
  }
  return compacted;
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
  if (
    roadRoute &&
    !isRoadRouteDirectAccessBlocked(roadRoute, routeCache?.traversalBarriers ?? [], 'walk')
  ) {
    return {
      blockedByTraversalBarrier: false,
      coordinates: roadRoute.coordinates,
      distance: roadRoute.distance,
      details: roadRoute.details,
      roadSegments: roadRoute.roadSegments,
      usesRoadGraph: true,
    };
  }

  const distance = getCoordinateDistance(origin, destination);
  const blockedByTraversalBarrier = isDirectTraversalBlocked(
    origin,
    destination,
    routeCache?.traversalBarriers ?? [],
    'walk',
  );
  const minutes = estimateRouteMinutes(distance, 72);
  return {
    blockedByTraversalBarrier,
    coordinates: [origin, destination],
    distance: blockedByTraversalBarrier ? Number.POSITIVE_INFINITY : distance,
    details: blockedByTraversalBarrier
      ? []
      : [
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

function isDirectTraversalBlocked(
  origin: [number, number],
  destination: [number, number],
  barriers: RouteTraversalBarrier[],
  mode: MapTravelMode,
): boolean {
  return barriers.some(
    (barrier) =>
      barrier.blockedModes.includes(mode) &&
      doesCoordinateSegmentCrossRegion(origin, destination, barrier.geometry),
  );
}

function isRoadRouteDirectAccessBlocked(
  route: ResolvedRoadRoute,
  barriers: RouteTraversalBarrier[],
  mode: MapTravelMode,
): boolean {
  return route.roadSegments.some(
    (segment) =>
      (segment.kind === 'approach' || segment.kind === 'depart') &&
      segment.coordinates.some((coordinate, index) => {
        const next = segment.coordinates[index + 1];
        return Boolean(next && isDirectTraversalBlocked(coordinate, next, barriers, mode));
      }),
  );
}

function doesCoordinateSegmentCrossRegion(
  origin: [number, number],
  destination: [number, number],
  region: RegionGeometry,
): boolean {
  if (isCoordinateInsideRegion(origin, region) || isCoordinateInsideRegion(destination, region)) {
    return true;
  }

  return getRegionBoundaryRings(region).some((ring) => {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const start = ring[previous];
      const end = ring[index];
      if (start && end && doCoordinateSegmentsIntersect(origin, destination, start, end)) {
        return true;
      }
    }
    return false;
  });
}

function getRegionBoundaryRings(region: RegionGeometry): Array<Array<[number, number]>> {
  if (region.type === 'Rectangle') {
    return [rectangleBoundsToMapCoordinates(region.bounds)];
  }
  if (region.type === 'MultiRectangle') {
    return region.rectangles.map(rectangleBoundsToMapCoordinates);
  }
  if (region.type === 'Polygon') {
    return region.coordinates;
  }
  return region.coordinates.flat();
}

function doCoordinateSegmentsIntersect(
  firstStart: [number, number],
  firstEnd: [number, number],
  secondStart: [number, number],
  secondEnd: [number, number],
): boolean {
  const firstSideStart = getCoordinateOrientation(firstStart, firstEnd, secondStart);
  const firstSideEnd = getCoordinateOrientation(firstStart, firstEnd, secondEnd);
  const secondSideStart = getCoordinateOrientation(secondStart, secondEnd, firstStart);
  const secondSideEnd = getCoordinateOrientation(secondStart, secondEnd, firstEnd);

  if (firstSideStart * firstSideEnd < 0 && secondSideStart * secondSideEnd < 0) {
    return true;
  }
  return (
    (firstSideStart === 0 && isCoordinateOnSegment(secondStart, firstStart, firstEnd)) ||
    (firstSideEnd === 0 && isCoordinateOnSegment(secondEnd, firstStart, firstEnd)) ||
    (secondSideStart === 0 && isCoordinateOnSegment(firstStart, secondStart, secondEnd)) ||
    (secondSideEnd === 0 && isCoordinateOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function getCoordinateOrientation(
  [originX, originZ]: [number, number],
  [targetX, targetZ]: [number, number],
  [pointX, pointZ]: [number, number],
): -1 | 0 | 1 {
  const cross = (targetX - originX) * (pointZ - originZ) - (targetZ - originZ) * (pointX - originX);
  if (Math.abs(cross) <= 1e-9) {
    return 0;
  }
  return cross < 0 ? -1 : 1;
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
    blockedByTraversalBarrier: input.externalRoute.blockedByTraversalBarrier,
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
    roadSegments: input.externalRoute.roadSegments,
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
    blockedByTraversalBarrier: input.externalRoute.blockedByTraversalBarrier,
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
    roadSegments: input.externalRoute.roadSegments,
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

interface TransitSegmentRouteMeasurement {
  distance: number;
  junctionCount: number;
  travelMinutes?: number;
}

interface TransitSegmentRouteResolution {
  coordinates: Array<[number, number]>;
  distance: number;
  measurements: TransitSegmentRouteMeasurement[];
  resolved: boolean;
  usesRoadGraph: boolean;
}

type RailFareDistanceGraph = ReadonlyMap<string, ReadonlyMap<string, number>>;

interface TransitLineDirectionCandidate {
  color: string;
  direction: 'forward' | 'reverse';
  icon: string;
  line: TransitOverviewLine;
  mode: RouteTransportModeOption & { mode: TransitRouteTransportMode };
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
  roadTiming?: MapSpatialProfile['roadTiming'];
  routeCache: RoutePlanningCache;
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>;
  t: Translate;
  transitFare?: MapSpatialProfile['transitFare'];
  transitLines: TransitOverviewLine[];
}): RoutePlanOption[] {
  const profileByMode = new Map(input.modeProfiles.map((profile) => [profile.mode, profile]));
  const stationMarkerIndex = buildTransitStationMarkerIndex(input.pointMarkers);
  const lineCandidates: TransitLineDirectionCandidate[] = [];
  const railFareDistanceGraph = buildRailFareDistanceGraph(
    input.transitLines,
    input.pointMarkers,
    stationMarkerIndex,
  );

  for (const mode of routeTransportModeOptions) {
    if (!isTransitRouteTransportMode(mode.mode) || !input.enabledModes[mode.mode]) {
      continue;
    }

    const profile = profileByMode.get(mode.mode);
    for (const line of input.transitLines.filter((item) => item.mode === mode.mode)) {
      if ((line.operationStatus ?? 'operating') !== 'operating') {
        continue;
      }
      for (const direction of ['forward', 'reverse'] as const) {
        const stops = getDirectionalLineStops(line, direction)
          .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
            const marker = findTransitStationMarker(
              stop,
              stationMarkerIndex,
              input.pointMarkers,
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
          mode: { ...mode, mode: mode.mode },
          modeLabel: getRouteTransportModeLabel(mode.mode, input.t),
          stops,
          terminalName:
            stops.at(-1)?.stop.displayStationName ??
            line.displayLastStationName ??
            line.lastStationName ??
            line.name,
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
        input.roadTiming,
        input.transitFare,
        railFareDistanceGraph,
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
    input.roadTiming,
    input.transitFare,
    railFareDistanceGraph,
  );

  return [...directOptions, ...transferOptions].sort(compareRoutePlanOptions);
}

function buildRailFareDistanceGraph(
  lines: TransitOverviewLine[],
  pointMarkers: PointMarker[],
  stationMarkerIndex: Map<string, PointMarker[]>,
): RailFareDistanceGraph {
  const graph = new Map<string, Map<string, number>>();
  const addEdge = (leftId: string, rightId: string, distance: number) => {
    const left = graph.get(leftId) ?? new Map<string, number>();
    const right = graph.get(rightId) ?? new Map<string, number>();
    left.set(rightId, Math.min(left.get(rightId) ?? Number.POSITIVE_INFINITY, distance));
    right.set(leftId, Math.min(right.get(leftId) ?? Number.POSITIVE_INFINITY, distance));
    graph.set(leftId, left);
    graph.set(rightId, right);
  };

  for (const line of lines) {
    if (
      (line.operationStatus ?? 'operating') !== 'operating' ||
      !isContinuousRailRouteMode(line.mode as RouteTransportMode)
    ) {
      continue;
    }
    const mode = line.mode as 'metro' | 'tram';
    const stops = getDirectionalLineStops(line, 'forward')
      .map((stop): Omit<TransitRouteStop, 'index'> | undefined => {
        const marker = findTransitStationMarker(stop, stationMarkerIndex, pointMarkers, mode);
        const center = marker ? getMarkerCenter(marker) : undefined;
        return marker && center ? { center, marker, stop } : undefined;
      })
      .filter((stop): stop is Omit<TransitRouteStop, 'index'> => Boolean(stop))
      .map((stop, index): TransitRouteStop => ({ ...stop, index }));
    for (let index = 1; index < stops.length; index += 1) {
      const previous = stops[index - 1];
      const current = stops[index];
      if (!previous || !current) {
        continue;
      }
      if (getTransitSegmentOperationStatus(line, previous, current) !== 'operating') {
        continue;
      }
      const configured = getConfiguredTransitSegment(line, previous, current, 'forward');
      const distance = getCoordinateChainDistance([
        previous.center,
        ...(configured?.waypoints ?? []),
        current.center,
      ]);
      addEdge(previous.marker.id, current.marker.id, Math.max(0, distance));
    }
  }
  return graph;
}

function findRailFareDistance(
  graph: RailFareDistanceGraph | undefined,
  originId: string,
  destinationId: string,
): number | undefined {
  if (!graph?.has(originId) || !graph.has(destinationId)) {
    return undefined;
  }
  const distances = new Map<string, number>([[originId, 0]]);
  const unvisited = new Set(graph.keys());
  while (unvisited.size > 0) {
    let currentId: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const id of unvisited) {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentId = id;
        currentDistance = distance;
      }
    }
    if (!currentId || !Number.isFinite(currentDistance)) {
      return undefined;
    }
    if (currentId === destinationId) {
      return currentDistance;
    }
    unvisited.delete(currentId);
    for (const [nextId, edgeDistance] of graph.get(currentId) ?? []) {
      if (!unvisited.has(nextId)) {
        continue;
      }
      const nextDistance = currentDistance + edgeDistance;
      if (nextDistance < (distances.get(nextId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(nextId, nextDistance);
      }
    }
  }
  return undefined;
}

function isContinuousRailRouteMode(mode: RouteTransportMode): mode is 'metro' | 'tram' {
  return mode === 'metro' || mode === 'tram';
}

function buildDirectTransitLineOption(
  candidate: TransitLineDirectionCandidate,
  draft: RoutePlanDraft,
  t: Translate,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
  secondaryPoiIndex: ReadonlyMap<string, SecondaryPoiLink[]>,
  roadGraph?: RoadRouteGraph,
  routeCache?: RoutePlanningCache,
  roadTiming?: MapSpatialProfile['roadTiming'],
  transitFare?: MapSpatialProfile['transitFare'],
  railFareDistanceGraph?: RailFareDistanceGraph,
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
  if (!areTransitStopsOperating(candidate.line, segmentStops)) {
    return undefined;
  }
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
  if (accessRoute.blockedByTraversalBarrier || egressRoute.blockedByTraversalBarrier) {
    return undefined;
  }
  const accessDistance = accessRoute.distance;
  const egressDistance = egressRoute.distance;
  const endpointAccessDistance = getRouteEndpointAccessDistance(draft);
  const transitRoute = buildTransitSegmentRoute(
    segmentStops,
    candidate.mode.mode,
    candidate.line,
    candidate.direction,
    roadGraph,
    markerRoadAccessIndex,
    routeCache,
  );
  if (requiresTransitRoadRoute(candidate.mode.mode, candidate.line) && !transitRoute.resolved) {
    return undefined;
  }
  const transitDistance = transitRoute.distance;
  const chargeableTransitDistance = isContinuousRailRouteMode(candidate.mode.mode)
    ? (findRailFareDistance(
        railFareDistanceGraph,
        originStop.marker.id,
        destinationStop.marker.id,
      ) ?? transitDistance)
    : transitDistance;
  const fare = quoteTransitRouteFare(
    [
      {
        mode: candidate.mode.mode,
        lineId: candidate.line.id,
        lineName: candidate.line.name,
        distanceBlocks: chargeableTransitDistance,
        configuredFareText: candidate.line.fare,
      },
    ],
    transitFare,
  );
  const accessMinutes = estimateResolvedWalkRouteMinutes(accessRoute);
  const egressMinutes = estimateResolvedWalkRouteMinutes(egressRoute);
  const endpointAccessMinutes = estimateRouteMinutes(endpointAccessDistance, 72);
  const transitMinutes = estimateTransitSegmentMinutes(
    segmentStops,
    transitRoute,
    candidate.mode.mode,
    roadTiming,
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
    createRouteTraceSegment('transit', transitRoute.coordinates, candidate.color),
    createRouteTraceSegment('walk', [
      ...egressRoute.coordinates,
      ...(draft.destinationRaw ? [draft.destinationRaw] : []),
    ]),
  ]);
  const labelMarkerIds = dedupeValues([originStop.marker.id, destinationStop.marker.id]);
  const transitStopAccessMarkerIds = dedupeValues([
    ...(accessRoute.markerIds ?? []),
    ...(egressRoute.markerIds ?? []),
  ]);
  const suppressLabelMarkerIds = [
    ...segmentStops.map((stop) => stop.marker.id),
    ...transitStopAccessMarkerIds,
  ].filter((id) => !labelMarkerIds.includes(id));
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
    modes: [candidate.mode.mode],
    serviceLabels: [candidate.line.name],
    labelMarkerIds,
    suppressLabelMarkerIds,
    estimatedDistance: endpointAccessDistance + accessDistance + egressDistance + transitDistance,
    estimatedMinutes,
    fare,
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
        t
          ? t('map.route.arrive', { name: draft.destinationLabel })
          : `到达 ${draft.destinationLabel}`,
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
  roadTiming?: MapSpatialProfile['roadTiming'],
  transitFare?: MapSpatialProfile['transitFare'],
  railFareDistanceGraph?: RailFareDistanceGraph,
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
      if (
        !areTransitStopsOperating(originCandidate.candidate.line, firstSegment) ||
        !areTransitStopsOperating(destinationCandidate.candidate.line, secondSegment)
      ) {
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
      if (
        accessRoute.blockedByTraversalBarrier ||
        egressRoute.blockedByTraversalBarrier ||
        transferRoute.blockedByTraversalBarrier
      ) {
        continue;
      }
      const accessDistance = accessRoute.distance;
      const egressDistance = egressRoute.distance;
      const firstTransitRoute = buildTransitSegmentRoute(
        firstSegment,
        originCandidate.candidate.mode.mode,
        originCandidate.candidate.line,
        originCandidate.candidate.direction,
        roadGraph,
        markerRoadAccessIndex,
        routeCache,
      );
      const secondTransitRoute = buildTransitSegmentRoute(
        secondSegment,
        destinationCandidate.candidate.mode.mode,
        destinationCandidate.candidate.line,
        destinationCandidate.candidate.direction,
        roadGraph,
        markerRoadAccessIndex,
        routeCache,
      );
      if (
        (requiresTransitRoadRoute(
          originCandidate.candidate.mode.mode,
          originCandidate.candidate.line,
        ) &&
          !firstTransitRoute.resolved) ||
        (requiresTransitRoadRoute(
          destinationCandidate.candidate.mode.mode,
          destinationCandidate.candidate.line,
        ) &&
          !secondTransitRoute.resolved)
      ) {
        continue;
      }
      const firstTransitDistance = firstTransitRoute.distance;
      const secondTransitDistance = secondTransitRoute.distance;
      const usesContinuousRailFare =
        isContinuousRailRouteMode(originCandidate.candidate.mode.mode) &&
        isContinuousRailRouteMode(destinationCandidate.candidate.mode.mode);
      const continuousRailFareDistance = usesContinuousRailFare
        ? findRailFareDistance(
            railFareDistanceGraph,
            originCandidate.originStop.marker.id,
            destinationCandidate.destinationStop.marker.id,
          )
        : undefined;
      const fare = quoteTransitRouteFare(
        [
          {
            mode: originCandidate.candidate.mode.mode,
            lineId: originCandidate.candidate.line.id,
            lineName: originCandidate.candidate.line.name,
            distanceBlocks: continuousRailFareDistance ?? firstTransitDistance,
            configuredFareText: originCandidate.candidate.line.fare,
          },
          {
            mode: destinationCandidate.candidate.mode.mode,
            lineId: destinationCandidate.candidate.line.id,
            lineName: destinationCandidate.candidate.line.name,
            distanceBlocks: continuousRailFareDistance === undefined ? secondTransitDistance : 0,
            configuredFareText: destinationCandidate.candidate.line.fare,
          },
        ],
        transitFare,
      );
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
        firstTransitRoute,
        originCandidate.candidate.mode.mode,
        roadTiming,
      );
      const secondTransitMinutes = estimateTransitSegmentMinutes(
        secondSegment,
        secondTransitRoute,
        destinationCandidate.candidate.mode.mode,
        roadTiming,
      );
      const firstStationSpan = Math.max(
        1,
        transfer.fromStop.index - originCandidate.originStop.index,
      );
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
      const transitStopAccessMarkerIds = dedupeValues([
        ...(accessRoute.markerIds ?? []),
        ...(transferRoute.markerIds ?? []),
        ...(egressRoute.markerIds ?? []),
      ]);
      const suppressLabelMarkerIds = dedupeValues([
        ...firstSegment.map((stop) => stop.marker.id),
        ...secondSegment.map((stop) => stop.marker.id),
        ...transitStopAccessMarkerIds,
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
        modes: dedupeValues([
          originCandidate.candidate.mode.mode,
          destinationCandidate.candidate.mode.mode,
        ]),
        serviceLabels: [
          `${originCandidate.candidate.line.name} → ${destinationCandidate.candidate.line.name}`,
        ],
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
        fare,
        transferCount: 1,
        walkingDistance:
          endpointAccessDistance + accessDistance + egressDistance + transferDistance,
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
          createRoutePlaceStep(
            t('map.route.arrive', { name: draft.destinationLabel }),
            'destination',
          ),
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
    for (const key of getMarkerStationNameMatchKeys(marker)) {
      const current = index.get(key) ?? [];
      current.push(marker);
      index.set(key, current);
    }
  }
  return index;
}

function findTransitStationMarker(
  stop: Pick<TransitLineStopForMap, 'stationName' | 'stationMarkerIds'>,
  stationMarkerIndex: Map<string, PointMarker[]>,
  pointMarkers: PointMarker[],
  mode: RouteTransportMode,
): PointMarker | undefined {
  const boundMarker = (stop.stationMarkerIds ?? [])
    .map((markerId) => pointMarkers.find((marker) => marker.id === markerId))
    .find((marker): marker is PointMarker =>
      Boolean(marker && matchesTransitMarkerMode(marker, mode)),
    );
  if (boundMarker) {
    return boundMarker;
  }

  for (const key of getStationNameMatchKeys(stop.stationName)) {
    const marker = stationMarkerIndex
      .get(key)
      ?.find((item) => matchesTransitMarkerMode(item, mode));
    if (marker) {
      return marker;
    }
  }
  return undefined;
}

function matchesTransitMarkerMode(marker: PointMarker, mode: RouteTransportMode): boolean {
  return (
    isTransitRouteTransportMode(mode) && isTransitPoiMarkerCompatibleWithStation(marker, [mode])
  );
}

function isTransitRouteTransportMode(mode: RouteTransportMode): mode is TransitRouteTransportMode {
  return mode !== 'walk' && mode !== 'taxi';
}

function createTaxiRoadAccessSteps(
  distance: number,
  endpoint: RouteEndpointKind,
  t: Translate,
): RoutePlanStep[] {
  if (distance <= 0.01) {
    return [];
  }
  const duration = formatRouteStepMinutes(estimateRouteMinutes(distance, 72), t);
  return [
    createRouteWalkStep(
      t(endpoint === 'origin' ? 'map.route.taxiWalkToPickup' : 'map.route.taxiWalkFromDropoff', {
        distance: formatRoutePlanDistance(distance, t),
        duration,
      }),
    ),
  ];
}

function findNearestRouteLineStop(
  point: [number, number],
  stops: TransitRouteStop[],
): TransitRouteStop | undefined {
  return stops
    .filter((stop) => (stop.stop.operationStatus ?? 'operating') === 'operating')
    .sort(
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
    if (
      stop.index > input.toEndIndex ||
      (stop.stop.operationStatus ?? 'operating') !== 'operating'
    ) {
      continue;
    }
    toStopsByMarkerId.set(stop.marker.id, stop);
  }

  return input.fromCandidate.stops
    .filter(
      (stop) =>
        stop.index >= input.fromStartIndex &&
        (stop.stop.operationStatus ?? 'operating') === 'operating',
    )
    .map((fromStop) => {
      const toStop = toStopsByMarkerId.get(fromStop.marker.id);
      return toStop ? { fromStop, toStop } : undefined;
    })
    .filter((pair): pair is { fromStop: TransitRouteStop; toStop: TransitRouteStop } =>
      Boolean(pair),
    )
    .sort(
      (left, right) =>
        left.fromStop.index + left.toStop.index - (right.fromStop.index + right.toStop.index),
    )[0];
}

function buildTransitStopStepDetails(stops: TransitRouteStop[]): RoutePlanStepDetail[] {
  return stops
    .slice(1, -1)
    .map((stop) =>
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
  line: TransitOverviewLine,
  direction: 'forward' | 'reverse',
  roadGraph?: RoadRouteGraph,
  markerRoadAccessIndex?: ReadonlyMap<string, RoadAccessCandidate[]>,
  routeCache?: RoutePlanningCache,
): TransitSegmentRouteResolution {
  if (stops.length < 2) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: 0,
      measurements: [],
      resolved: true,
      usesRoadGraph: false,
    };
  }

  const hasConfiguredLineGeometry = Boolean(line.segmentPaths?.length || line.routeNodes?.length);
  if (
    !hasConfiguredLineGeometry &&
    line.routeMode !== 'road' &&
    (!shouldUseRoadGraphForTransitMode(mode) || !roadGraph)
  ) {
    return {
      coordinates: stops.map((stop) => stop.center),
      distance: getTransitSegmentDistance(stops),
      measurements: buildStraightTransitSegmentMeasurements(stops),
      resolved: true,
      usesRoadGraph: false,
    };
  }

  const coordinates: Array<[number, number]> = [];
  let distance = 0;
  const measurements: TransitSegmentRouteMeasurement[] = [];
  let usesRoadGraph = false;
  let resolved = true;

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (!previous || !current) {
      continue;
    }

    const configuredSegment = getConfiguredTransitSegment(line, previous, current, direction);
    const controlCoordinates = [
      previous.center,
      ...(configuredSegment?.waypoints ?? []),
      current.center,
    ];
    const shouldFollowRoad =
      shouldUseRoadGraphForTransitMode(mode) ||
      configuredSegment?.mode === 'road' ||
      (!configuredSegment && line.routeMode === 'road');
    const roadResolution = shouldFollowRoad
      ? resolveTransitRoadControlPoints({
          controlCoordinates,
          current,
          markerRoadAccessIndex,
          previous,
          roadGraph,
          routeCache,
          travelMode: mode === 'coach' ? 'coach' : 'bus',
        })
      : undefined;
    if (shouldFollowRoad && !roadResolution?.resolved) {
      resolved = false;
      return {
        coordinates: [],
        distance: 0,
        measurements,
        resolved: false,
        usesRoadGraph,
      };
    }
    const segmentCoordinates = roadResolution?.coordinates ?? controlCoordinates;
    appendRouteSegmentCoordinates(coordinates, segmentCoordinates);
    distance += roadResolution?.distance ?? getCoordinateChainDistance(segmentCoordinates);
    measurements.push({
      distance: roadResolution?.distance ?? getCoordinateChainDistance(segmentCoordinates),
      junctionCount: roadResolution?.junctionCount ?? 0,
      travelMinutes: configuredSegment?.travelMinutes,
    });
    usesRoadGraph ||= Boolean(roadResolution?.resolved);
  }

  return {
    coordinates: dedupeConsecutiveCoordinates(coordinates),
    distance,
    measurements,
    resolved,
    usesRoadGraph,
  };
}

function resolveTransitRoadControlPoints(input: {
  controlCoordinates: Array<[number, number]>;
  current: TransitRouteStop;
  markerRoadAccessIndex?: ReadonlyMap<string, RoadAccessCandidate[]>;
  previous: TransitRouteStop;
  roadGraph?: RoadRouteGraph;
  routeCache?: RoutePlanningCache;
  travelMode: Extract<MapTravelMode, 'bus' | 'coach'>;
}): {
  coordinates: Array<[number, number]>;
  distance: number;
  junctionCount: number;
  resolved: boolean;
} {
  if (!input.roadGraph) {
    return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
  }

  const coordinates: Array<[number, number]> = [];
  let distance = 0;
  let junctionCount = 0;
  for (let index = 1; index < input.controlCoordinates.length; index += 1) {
    const origin = input.controlCoordinates[index - 1];
    const destination = input.controlCoordinates[index];
    if (!origin || !destination) {
      continue;
    }
    const accessOptions: RoadRouteAccessOptions = {};
    if (index === 1 && input.markerRoadAccessIndex) {
      accessOptions.originAccessCandidates = getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        input.previous.marker.id,
      );
    }
    if (index === input.controlCoordinates.length - 1 && input.markerRoadAccessIndex) {
      accessOptions.destinationAccessCandidates = getIndexedMarkerRoadAccessCandidates(
        input.markerRoadAccessIndex,
        input.current.marker.id,
      );
    }
    const route = findRoadRouteBetweenCoordinates(
      origin,
      destination,
      input.roadGraph,
      input.routeCache,
      undefined,
      accessOptions,
      'shortest',
      input.travelMode,
    );
    if (!route) {
      return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
    }
    const roadSegments = route.roadSegments.filter(isTaxiRoadSegment);
    const roadCoordinates = flattenRouteSegmentCoordinates(roadSegments);
    const roadDistance = roadSegments.reduce(
      (total, segment) => total + getCoordinateChainDistance(segment.coordinates),
      0,
    );
    if (roadCoordinates.length < 2 || roadDistance <= 0.01) {
      return { coordinates: [], distance: 0, junctionCount: 0, resolved: false };
    }
    appendRouteSegmentCoordinates(coordinates, roadCoordinates);
    distance += roadDistance;
    junctionCount += route.junctionCount;
  }

  return {
    coordinates: dedupeConsecutiveCoordinates(coordinates),
    distance,
    junctionCount,
    resolved: true,
  };
}

function buildStraightTransitSegmentMeasurements(
  stops: TransitRouteStop[],
): TransitSegmentRouteMeasurement[] {
  return stops.slice(1).flatMap((current, index) => {
    const previous = stops[index];
    return previous
      ? [
          {
            distance: getCoordinateDistance(previous.center, current.center),
            junctionCount: 0,
          },
        ]
      : [];
  });
}

function requiresTransitRoadRoute(mode: RouteTransportMode, line: TransitOverviewLine): boolean {
  return shouldUseRoadGraphForTransitMode(mode) || line.routeMode === 'road';
}

function getConfiguredTransitSegment(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
  direction: 'forward' | 'reverse',
):
  | {
      mode: TransitLineRouteMode;
      operationStatus: 'operating' | 'planned' | 'closed';
      travelMinutes?: number;
      waypoints: Array<[number, number]>;
    }
  | undefined {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  if (!fromStationSourceId || !toStationSourceId) {
    return undefined;
  }
  const operationStatus = getTransitSegmentOperationStatus(line, previous, current);
  const configuredPath = getTransitLineSegmentPath(line, previous, current);

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
        operationStatus,
        travelMinutes: configuredPath?.travelMinutes,
        waypoints: filterTransitRouteNodeWaypoints(pendingWaypoints, direction),
      };
    }
    if (segmentStartId === toStationSourceId && node.stationSourceId === fromStationSourceId) {
      return {
        mode: line.routeMode ?? 'straight',
        operationStatus,
        travelMinutes: configuredPath?.travelMinutes,
        waypoints: filterTransitRouteNodeWaypoints(pendingWaypoints, direction).reverse(),
      };
    }
    segmentStartId = node.stationSourceId;
    pendingWaypoints = [];
  }

  const reversePath =
    configuredPath?.fromStationSourceId === toStationSourceId &&
    configuredPath.toStationSourceId === fromStationSourceId;
  if (configuredPath) {
    const waypoints = filterTransitSegmentWaypoints(configuredPath.waypoints, direction).map(
      (waypoint) => [waypoint.x, waypoint.z] as [number, number],
    );
    return {
      mode: configuredPath.mode,
      operationStatus: configuredPath.operationStatus ?? 'operating',
      travelMinutes: configuredPath.travelMinutes,
      waypoints: reversePath ? waypoints.reverse() : waypoints,
    };
  }

  return undefined;
}

function areTransitStopsOperating(line: TransitOverviewLine, stops: TransitRouteStop[]): boolean {
  const originStop = stops[0];
  const destinationStop = stops.at(-1);
  if (
    (line.operationStatus ?? 'operating') !== 'operating' ||
    !originStop ||
    !destinationStop ||
    (originStop.stop.operationStatus ?? 'operating') !== 'operating' ||
    (destinationStop.stop.operationStatus ?? 'operating') !== 'operating'
  ) {
    return false;
  }
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (!previous || !current) {
      continue;
    }
    if (getTransitSegmentOperationStatus(line, previous, current) !== 'operating') {
      return false;
    }
  }
  return true;
}

function getTransitSegmentOperationStatus(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
): 'operating' | 'planned' | 'closed' {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  if (!fromStationSourceId || !toStationSourceId) {
    return 'operating';
  }
  const path = (line.segmentPaths ?? []).find(
    (candidate) =>
      (candidate.fromStationSourceId === fromStationSourceId &&
        candidate.toStationSourceId === toStationSourceId) ||
      (candidate.fromStationSourceId === toStationSourceId &&
        candidate.toStationSourceId === fromStationSourceId),
  );
  const statuses = [line.operationStatus ?? 'operating', path?.operationStatus ?? 'operating'];
  return statuses.includes('closed')
    ? 'closed'
    : statuses.includes('planned')
      ? 'planned'
      : 'operating';
}

function filterTransitSegmentWaypoints(
  waypoints: TransitLineSegmentPathSnapshot['waypoints'],
  direction: TransitLineTravelDirection,
): TransitLineSegmentPathSnapshot['waypoints'] {
  return waypoints.filter((waypoint) =>
    isTransitLineDirectionIncluded(waypoint.direction, direction),
  );
}

function filterTransitRouteNodeWaypoints(
  nodes: TransitLineRouteNodeSnapshot[],
  direction: TransitLineTravelDirection,
): Array<[number, number]> {
  return nodes.flatMap((node) =>
    node.kind === 'waypoint' && isTransitLineDirectionIncluded(node.direction, direction)
      ? ([[node.x, node.z]] as Array<[number, number]>)
      : [],
  );
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
  travelMode: MapTravelMode = 'walk',
): ResolvedRoadRoute | undefined {
  const routeCacheKey = getRoadRouteCacheKey(
    origin,
    destination,
    accessOptions,
    strategy,
    travelMode,
  );
  const cachedRoute = routeCache?.roadRouteByPair.get(routeCacheKey);
  if (cachedRoute !== undefined) {
    return cachedRoute ?? undefined;
  }

  const originAccessCandidates =
    accessOptions?.originAccessCandidates !== undefined
      ? accessOptions.originAccessCandidates
      : findRoadAccessCandidates(origin, destination, graph, routeCache, 12, travelMode);
  const destinationAccessCandidates =
    accessOptions?.destinationAccessCandidates !== undefined
      ? accessOptions.destinationAccessCandidates
      : findRoadAccessCandidates(destination, origin, graph, routeCache, 12, travelMode);
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
        travelMode,
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
            travelMode,
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

  if (strategy === 'fewest-segments') {
    return route.roadSegments.length * 100_000 + route.distance;
  }

  if (strategy === 'alternative-1' || strategy === 'alternative-2') {
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
  travelMode: MapTravelMode = 'walk',
): RoadAccessCandidate[] {
  const accessCacheKey = `${travelMode}:${formatCoordinateCacheKey(point)}->${formatCoordinateCacheKey(target)}:${limit}`;
  const cachedCandidates = routeCache?.accessCandidatesByPair.get(accessCacheKey);
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const scoredCandidates = graph.roadSegments
    .filter((segment) => segment.allowedModes.includes(travelMode))
    .map((segment) => {
      const projection = projectPointToRoadSegment(point, segment);
      const directionPenalty = getRoadAccessDirectionPenalty(point, target, projection.coordinate);
      return {
        ...projection,
        score: projection.distanceToPoint + directionPenalty,
      };
    })
    .filter((candidate) => Math.abs(candidate.y - graph.defaultY) <= graph.verticalTolerance);
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
  travelMode: MapTravelMode = 'walk',
): string {
  return [
    strategy,
    travelMode,
    `${formatCoordinateCacheKey(origin)}->${formatCoordinateCacheKey(destination)}`,
    formatRoadAccessCandidatesCacheKey(accessOptions?.originAccessCandidates),
    formatRoadAccessCandidatesCacheKey(accessOptions?.destinationAccessCandidates),
  ].join('|');
}

function formatRoadAccessCandidatesCacheKey(candidates: RoadAccessCandidate[] | undefined): string {
  if (candidates === undefined) {
    return '*';
  }
  if (candidates.length === 0) {
    return 'none';
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
  const y = interpolateNumber(segment.startY, segment.endY, ratio);
  const totalDistance = getCoordinateDistance(segment.start, segment.end);
  const startDistance = totalDistance * ratio;
  return {
    allowedModes: segment.allowedModes,
    coordinate,
    direction: segment.direction,
    distanceToPoint: getCoordinateDistance(point, coordinate),
    endDistance: totalDistance - startDistance,
    endNodeId: segment.endNodeId,
    roadId: segment.roadId,
    roadLabel: segment.roadLabel,
    startDistance,
    startNodeId: segment.startNodeId,
    y,
  };
}

function buildMarkerRoadAccessIndex(
  markers: PointMarker[],
  graph: RoadRouteGraph,
): Map<string, RoadAccessCandidate[]> {
  const index = new Map<string, RoadAccessCandidate[]>();
  for (const marker of markers) {
    if (marker.spatial?.worldId && marker.spatial.worldId !== graph.worldId) {
      continue;
    }
    const center = getMarkerCenter(marker);
    if (!center) {
      continue;
    }

    const candidates = buildMarkerRoadAccessCandidates(
      center,
      graph,
      marker.addressRoadMarkerId,
      marker.spatial?.coordinateY?.[0] ?? marker.spatial?.defaultY ?? graph.defaultY,
    );
    if (candidates.length > 0) {
      index.set(marker.id, candidates);
    }
  }
  return index;
}

function getTransitLineSegmentPath(
  line: TransitOverviewLine,
  previous: TransitRouteStop,
  current: TransitRouteStop,
): TransitLineSegmentPathSnapshot | undefined {
  const fromStationSourceId = previous.stop.stationSourceId;
  const toStationSourceId = current.stop.stationSourceId;
  return (line.segmentPaths ?? []).find(
    (candidate) =>
      (candidate.fromStationSourceId === fromStationSourceId &&
        candidate.toStationSourceId === toStationSourceId) ||
      (candidate.fromStationSourceId === toStationSourceId &&
        candidate.toStationSourceId === fromStationSourceId),
  );
}

function buildMarkerRoadAccessCandidates(
  point: [number, number],
  graph: RoadRouteGraph,
  requiredRoadId?: string,
  pointY = graph.defaultY,
): RoadAccessCandidate[] {
  const nearestByRoad = new Map<string, RoadAccessCandidate>();
  for (const segment of graph.roadSegments) {
    if (requiredRoadId && segment.roadId !== requiredRoadId) {
      continue;
    }
    const projection = projectPointToRoadSegment(point, segment);
    if (Math.abs(projection.y - pointY) > graph.verticalTolerance) {
      continue;
    }
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

function getRoadAccessDirectionPenalty(
  point: [number, number],
  target: [number, number],
  accessPoint: [number, number],
): number {
  const accessVector: [number, number] = [accessPoint[0] - point[0], accessPoint[1] - point[1]];
  const targetVector: [number, number] = [target[0] - point[0], target[1] - point[1]];
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
  travelMode: MapTravelMode = 'walk',
):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      junctionCount: number;
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
  if (
    !originAccess.allowedModes.includes(travelMode) ||
    !isRoadAccessDirectionAllowed(originAccess, destinationAccess, travelMode)
  ) {
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
      roadId: originAccess.roadId,
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
  const distance = originAccess.distanceToPoint + roadDistance + destinationAccess.distanceToPoint;

  return {
    coordinates,
    details: buildRoadRouteStepDetails(instructionSegments, t),
    distance,
    junctionCount: 0,
    roadSegments: instructionSegments,
  };
}

function isRoadAccessDirectionAllowed(
  origin: RoadAccessCandidate,
  destination: RoadAccessCandidate,
  travelMode: MapTravelMode,
): boolean {
  if (!origin.allowedModes.includes(travelMode) || !destination.allowedModes.includes(travelMode)) {
    return false;
  }
  const delta = destination.startDistance - origin.startDistance;
  return (
    Math.abs(delta) <= 0.01 ||
    origin.direction === 'both' ||
    (origin.direction === 'forward' && delta > 0) ||
    (origin.direction === 'reverse' && delta < 0)
  );
}

function canEnterRoadNodeFromAccess(
  access: RoadAccessCandidate,
  nodeId: string,
  travelMode: MapTravelMode,
): boolean {
  if (!access.allowedModes.includes(travelMode)) {
    return false;
  }
  return (
    access.direction === 'both' ||
    (access.direction === 'forward' && nodeId === access.endNodeId) ||
    (access.direction === 'reverse' && nodeId === access.startNodeId)
  );
}

function canLeaveRoadNodeToAccess(
  access: RoadAccessCandidate,
  nodeId: string,
  travelMode: MapTravelMode,
): boolean {
  if (!access.allowedModes.includes(travelMode)) {
    return false;
  }
  return (
    access.direction === 'both' ||
    (access.direction === 'forward' && nodeId === access.startNodeId) ||
    (access.direction === 'reverse' && nodeId === access.endNodeId)
  );
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
  travelMode: MapTravelMode;
}):
  | {
      coordinates: Array<[number, number]>;
      details: RoutePlanStepDetail[];
      distance: number;
      junctionCount: number;
      roadSegments: RoadRouteInstructionSegment[];
    }
  | undefined {
  const originNode = input.graph.nodesById.get(input.originNodeId);
  const destinationNode = input.graph.nodesById.get(input.destinationNodeId);
  if (!originNode || !destinationNode) {
    return undefined;
  }
  if (
    !canEnterRoadNodeFromAccess(input.originAccess, input.originNodeId, input.travelMode) ||
    !canLeaveRoadNodeToAccess(input.destinationAccess, input.destinationNodeId, input.travelMode)
  ) {
    return undefined;
  }

  const pathCacheKey = `${input.strategy}:${input.travelMode}:${input.originNodeId}->${input.destinationNodeId}`;
  if (!input.pathCache.has(pathCacheKey)) {
    input.pathCache.set(
      pathCacheKey,
      findRoadRoutePath(
        input.graph,
        input.originNodeId,
        input.destinationNodeId,
        input.strategy,
        input.travelMode,
      ),
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
      roadId: input.originAccess.roadId,
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
      roadId: input.destinationAccess.roadId,
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
    junctionCount: countRoadPathJunctions(roadPath, input.graph),
    roadSegments: instructionSegments,
  };
}

function countRoadPathJunctions(path: RoadRoutePath, graph: RoadRouteGraph): number {
  const junctionCoordinates = new Set<string>();
  for (const node of path.nodes) {
    if ((graph.adjacency.get(node.id)?.length ?? 0) < 3) {
      continue;
    }
    junctionCoordinates.add(formatCoordinateCacheKey(node.coordinate));
  }
  return junctionCoordinates.size;
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
      : '公交/客运站间只沿旧地图道路中心线生成，并仅在中心线平面相交处推断路口；无法连通的候选已排除。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。'
    : t
      ? t('map.route.transitNote.fallbackRoad')
      : '公交/客运站间要求沿道路行驶；当前路网缺失或不连通时不会生成该候选。站间耗时优先使用后台区间用时，其次使用旧数据 travelTime。';
}

function getTransitSegmentDistance(stops: TransitRouteStop[]): number {
  return stops.slice(1).reduce((total, stop, index) => {
    const previous = stops[index];
    return previous ? total + getCoordinateDistance(previous.center, stop.center) : total;
  }, 0);
}

function estimateTransitSegmentMinutes(
  stops: TransitRouteStop[],
  route: TransitSegmentRouteResolution,
  mode: RouteTransportMode,
  roadTiming?: MapSpatialProfile['roadTiming'],
): number {
  const configuredMinutes = route.measurements.map((measurement) => measurement.travelMinutes);
  if (
    configuredMinutes.length === route.measurements.length &&
    configuredMinutes.every(
      (minutes): minutes is number =>
        typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0,
    )
  ) {
    return Math.max(1, Math.round(configuredMinutes.reduce((total, value) => total + value, 0)));
  }

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

  if (segmentTravelTime > 0 && configuredMinutes.every((minutes) => minutes === undefined)) {
    return Math.max(1, Math.round(segmentTravelTime));
  }

  const defaultBusSpeedKmh = roadTiming?.defaultBusSpeedKmh ?? 30;
  const busJunctionDelaySeconds = roadTiming?.busJunctionDelaySeconds ?? 12;
  const estimatedMinutes = route.measurements.reduce((total, measurement) => {
    if (measurement.travelMinutes !== undefined) {
      return total + measurement.travelMinutes;
    }
    if (shouldUseRoadGraphForTransitMode(mode)) {
      return (
        total +
        estimateVehicleRouteMinutes(
          measurement.distance,
          defaultBusSpeedKmh,
          measurement.junctionCount,
          busJunctionDelaySeconds,
        )
      );
    }
    return total + estimateRouteMinutes(measurement.distance, getTransitSpeedFactor(mode));
  }, 0);
  return Math.max(1, Math.round(estimatedMinutes));
}

function dedupeValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getRouteEndpointMarkerIds(draft: RoutePlanDraft): string[] {
  return dedupeValues(
    [draft.originId, draft.originAccessId, draft.destinationId, draft.destinationAccessId].filter(
      (id): id is string => Boolean(id),
    ),
  );
}

function getRouteEndpointRoadAccessCandidates(
  draft: RoutePlanDraft,
  endpoint: RouteEndpointKind,
  markerRoadAccessIndex: ReadonlyMap<string, RoadAccessCandidate[]>,
): RoadAccessCandidate[] | undefined {
  const markerId =
    endpoint === 'origin'
      ? (draft.originAccessId ?? draft.originId)
      : (draft.destinationAccessId ?? draft.destinationId);
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

function estimateVehicleRouteMinutes(
  distance: number,
  speedKmh: number,
  junctionCount: number,
  junctionDelaySeconds: number,
): number {
  const speedBlocksPerMinute = Math.max(1, (speedKmh * 1000) / 60);
  const movingMinutes = Math.max(0, distance) / speedBlocksPerMinute;
  const junctionMinutes = (Math.max(0, junctionCount) * Math.max(0, junctionDelaySeconds)) / 60;
  return Math.max(1, Math.round(movingMinutes + junctionMinutes));
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

function formatRoutePlanFare(fare: TransitFareQuote, t?: Translate): string {
  if (fare.status === 'unavailable') {
    return t ? t('map.route.fare.unavailable') : '票价待确认';
  }

  const amount = formatRouteFareAmount(fare.totalAmount ?? fare.knownSubtotal);
  if (fare.status === 'estimated') {
    return t ? t('map.route.fare.estimated', { amount }) : `预计 ${amount}`;
  }
  if (fare.status === 'partial') {
    return t ? t('map.route.fare.partial', { amount }) : `已知 ${amount} 起`;
  }
  return t ? t('map.route.fare.exact', { amount }) : amount;
}

function formatRouteFareAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/u, '');
}

function formatRouteStepMinutes(minutes: number, t?: Translate): string {
  const count = Math.max(1, Math.round(minutes));
  return t ? t('map.route.duration.step', { count }) : `${count}分钟`;
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

function buildDirectionalTransitLineMarker(
  marker: TransitLineMarker,
  line: TransitOverviewLine,
  direction: TransitLineTravelDirection,
  pointMarkers: PointMarker[],
  roadGraph?: RoadRouteGraph,
): TransitLineMarker {
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
    return marker;
  }

  const route = buildTransitSegmentRoute(stops, mode ?? 'walk', line, direction, roadGraph);
  if (route.coordinates.length < 2) {
    return marker;
  }

  return {
    ...marker,
    geometry: {
      type: 'MultiPoint',
      coordinates: route.coordinates,
    },
  };
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
  return marker.categoryId !== 'road';
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
    <div className="map-metro-station-exit-track">
      <span className="is-left">
        {formatStationExitGroup(leftExits, '←', t)}
        {formatStationExitDescriptions(leftExits)}
      </span>
      <span className="is-right">
        {formatStationExitGroup(rightExits, '→', t)}
        {formatStationExitDescriptions(rightExits)}
      </span>
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
    third_restroom: 'map.metroInfrastructure.facility.thirdRestroom',
    elevator: 'map.metroInfrastructure.facility.elevator',
    escalator_and_stairs: 'map.metroInfrastructure.facility.escalatorAndStairs',
    stairs: 'map.metroInfrastructure.facility.stairs',
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
  | 'third_restroom'
  | 'elevator'
  | 'escalator_and_stairs'
  | 'stairs'
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
  if (/(?:third|family)_?(?:restroom|toilet)/u.test(normalized)) return 'third_restroom';
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
    third_restroom: 'third-restroom',
    elevator: 'accessible-elevator',
    stairs: stairsAssetName,
    escalator: 'escalator',
    nursing_room: 'nursing-room',
    waiting_room: 'waiting-room',
    wheelchair_lift: 'wheelchair-lift',
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

function formatStationExitDescriptions(
  exits: TransitStationDetailSnapshot['exits'],
): string | null {
  const descriptions = exits
    .filter((exit) => exit.description || exit.orientation)
    .map((exit) => {
      const details = [exit.description, exit.orientation].filter(Boolean).join(' · ');
      return `${exit.code}：${details}`;
    });
  return descriptions.length > 0 ? `（${descriptions.join('；')}）` : null;
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

function buildSecondaryPoiIndex(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Map<string, SecondaryPoiLink[]> {
  const parentMarkerById = new Map(parentMarkers.map((marker) => [marker.id, marker]));
  const declaredParentLinks = resolveSecondaryPoiLinks(markers, parentMarkers, placeRelationIndex);
  const boundRegionLinks = markers.flatMap((marker) =>
    (marker.boundRegionMarkerIds ?? []).flatMap((regionMarkerId) => {
      const parent =
        parentMarkerById.get(regionMarkerId) ??
        parentMarkers.find((candidate) =>
          getEquivalentMapPlaceMarkerIds(candidate.id, placeRelationIndex).has(regionMarkerId),
        );
      if (!parent || parent.id === marker.id) {
        return [];
      }
      return [
        {
          childLabel:
            marker.secondaryLabel ??
            parseSecondaryPoiName(marker.sourceLabel ?? marker.label)?.childName ??
            formatMarkerDisplayName(marker.label),
          marker,
          parent,
        },
      ];
    }),
  );
  const index = new Map<string, Map<string, SecondaryPoiLink>>();
  const links = [...declaredParentLinks, ...boundRegionLinks];
  for (const link of links) {
    for (const parentId of getEquivalentMapPlaceMarkerIds(link.parent.id, placeRelationIndex)) {
      const values = index.get(parentId) ?? new Map<string, SecondaryPoiLink>();
      if (!values.has(link.marker.id)) {
        values.set(link.marker.id, link);
      }
      index.set(parentId, values);
    }
  }

  const sortedIndex = new Map<string, SecondaryPoiLink[]>();
  for (const [parentId, parentLinks] of index) {
    sortedIndex.set(parentId, sortSecondaryPoiLinks([...parentLinks.values()]));
  }

  return sortedIndex;
}

function buildSecondaryPoiParentIndex(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Map<string, SecondaryPoiParentLink> {
  return new Map(
    resolveSecondaryPoiLinks(markers, parentMarkers, placeRelationIndex).map((link) => [
      link.marker.id,
      { childLabel: link.childLabel, marker: link.marker, parent: link.parent },
    ]),
  );
}

function resolveSecondaryPoiLinks(
  markers: PointMarker[],
  parentMarkers: CenterableMarker[],
  placeRelationIndex: MapPlaceRelationIndex<CenterableMarker>,
): Array<SecondaryPoiLink & { parent: CenterableMarker }> {
  const markersByName = new Map<string, CenterableMarker[]>();
  const markerById = new Map(parentMarkers.map((marker) => [marker.id, marker]));
  for (const marker of parentMarkers) {
    const key = normalizeMarkerSearchText(marker.sourceLabel ?? marker.label);
    const values = markersByName.get(key) ?? [];
    values.push(marker);
    markersByName.set(key, values);
  }

  const links: Array<SecondaryPoiLink & { parent: CenterableMarker }> = [];
  for (const marker of markers) {
    const explicitParent = marker.parentMarkerId
      ? resolveCanonicalMapPlaceMarker(
          markerById.get(marker.parentMarkerId) ??
            parentMarkers.find((candidate) =>
              getEquivalentMapPlaceMarkerIds(candidate.id, placeRelationIndex).has(
                marker.parentMarkerId ?? '',
              ),
            ) ??
            marker,
          placeRelationIndex,
        )
      : undefined;
    if (explicitParent && explicitParent.id !== marker.id) {
      links.push({
        childLabel:
          marker.secondaryLabel ??
          parseSecondaryPoiName(marker.sourceLabel ?? marker.label)?.childName ??
          formatMarkerDisplayName(marker.label),
        marker,
        parent: explicitParent,
      });
      continue;
    }

    const declaredParentLabel = marker.parentLabel?.trim();
    if (declaredParentLabel) {
      const parentCandidates = dedupeEquivalentMapPlaceMarkers(
        markersByName.get(normalizeMarkerSearchText(declaredParentLabel)) ?? [],
        placeRelationIndex,
      ).filter((candidate) => candidate.id !== marker.id && !isBusStopPoi(candidate));
      const parent = parentCandidates ? findNearestParentPoi(marker, parentCandidates) : undefined;
      if (parent) {
        links.push({
          childLabel: marker.secondaryLabel ?? formatMarkerDisplayName(marker.label),
          marker,
          parent,
        });
        continue;
      }
    }

    const parsed = parseSecondaryPoiName(marker.sourceLabel ?? marker.label);
    if (!parsed) {
      continue;
    }

    const parentCandidates = dedupeEquivalentMapPlaceMarkers(
      markersByName.get(normalizeMarkerSearchText(parsed.parentName)) ?? [],
      placeRelationIndex,
    ).filter((candidate) => candidate.id !== marker.id && !isBusStopPoi(candidate));
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

function parseSecondaryPoiName(
  label: string,
): { parentName: string; childName: string } | undefined {
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
  candidates: CenterableMarker[],
): CenterableMarker | undefined {
  return candidates
    .flatMap((candidate) => {
      const center = getMarkerCenter(candidate);
      return center
        ? [{ candidate, distance: getCoordinateDistance(child.geometry.coordinates, center) }]
        : [];
    })
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
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
      <img
        className={
          marker.playerLocation.presence === 'offline'
            ? 'map-player-list-avatar is-offline'
            : 'map-player-list-avatar'
        }
        src={marker.playerLocation.avatarUrl}
        alt=""
        draggable={false}
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
      <img
        className="map-poi-detail-image"
        src={appPath(imageUrls[activeIndex] ?? imageUrls[0])}
        alt={imageAlt}
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
  index: Map<string, TransitLineConnection[]>,
): TransitLineConnection[] {
  const collected: TransitLineConnection[] = [];
  const seen = new Set<string>();

  for (const key of getMarkerStationNameMatchKeys(marker)) {
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

function findTransitStationMarkerForLine(
  markers: PointMarker[],
  stationName: string,
  line: TransitOverviewLine,
  connectionIndex: Map<string, TransitLineConnection[]>,
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
  connectionIndex: Map<string, TransitLineConnection[]>,
): PointMarker[] {
  const boundMarkerIds = new Set(
    (line.stationStops ?? []).flatMap((stop) => stop.stationMarkerIds ?? []),
  );
  const stationKeys = new Set(line.stationNames.flatMap(getStationNameMatchKeys));
  const lineMode = isRouteTransportMode(line.mode) ? line.mode : 'walk';
  return dedupeMarkersById(
    markers.filter(
      (marker) =>
        matchesTransitMarkerMode(marker, lineMode) &&
        (boundMarkerIds.has(marker.id) ||
          (isTransitStationPoi(marker) &&
            getMarkerStationNameMatchKeys(marker).some((key) => stationKeys.has(key)) &&
            findStationConnections(marker, connectionIndex).some(
              (connection) => connection.id === line.id,
            ))),
    ),
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
          iconUrl:
            marker.playerLocation?.avatarUrl ??
            (marker.iconFileName && !isTransparentRoadIcon(marker.iconFileName)
              ? toMarkerIconUrl(marker.iconFileName, iconBaseUrl)
              : undefined),
          dynamicSymbol: resolveMarkerDynamicSymbol(marker),
          symbolIcon: marker.symbolIcon,
          showLabel: marker.playerLocation
            ? false
            : forceLabel
              ? true
              : suppressLabel
                ? false
                : marker.id === focusedMarkerId ||
                  shouldShowMarkerLabelForBrowseMode(marker, browseMode, priority),
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

function squaredDistance(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
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
    centerLabel: false,
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
      centerLabel: false,
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
    const labelMode = labelAnchor ? 'label' : 'representative';
    return [
      {
        id: marker.id,
        label,
        path,
        basePath,
        isArea,
        isRegionMarker: isRegionMarker(marker),
        accentColor: marker.accentColor,
        fillColor: marker.spatial?.style?.fillColor ?? boundTransitLineColor,
        fillOpacity: marker.spatial?.style?.fillOpacity,
        strokeColor: marker.spatial?.style?.strokeColor ?? boundTransitLineColor,
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
    const dynamicSymbol = resolveMarkerDynamicSymbol(marker);
    const highwayIconUrl =
      !dynamicSymbol &&
      roadKind === 'highway' &&
      marker.iconFileName &&
      isHighwayIconFileName(marker.iconFileName)
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
      dynamicSymbol,
      roadKind,
      showCenter: Boolean(label || highwayIconUrl || dynamicSymbol || symbolIcon),
      showTextLabel: Boolean(label) && !dynamicSymbol && !highwayIconUrl,
      isVerticalLabel:
        Boolean(roadKind) && showTextLabel
          ? shouldUseVerticalMapRoadLabel(marker.geometry.coordinates, labelAnchor)
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

function fitCoordinatesToMapView(
  coordinates: Array<[number, number]>,
  current: MapView,
  size: ViewportSize,
  padding: number,
  visibleRect: MapVisibleRect,
  maximumZoom?: number,
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
  const fittedZoom = getZoomToFitCoordinates(coordinates, visibleSize, padding, current.zoom);
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
    const rawCoordinates = marker.geometry.coordinates;
    const coordinates = isRoadEndpointGroupMarker(marker)
      ? orderRoadTracePoints(rawCoordinates)
      : rawCoordinates;
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
