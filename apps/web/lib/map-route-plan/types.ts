import type {
  LocalizedLabelMap,
  MapGeometry,
  MapMarkerSnapshot,
  MapNetworkDirection,
  MapTravelMode,
  TransitFareQuote,
  TransitLineRouteMode,
  TransitLineRouteNodeSnapshot,
  TransitLineSegmentPathSnapshot,
  TransitLineSpecialTripSnapshot,
  TransitLineStopLocationRef,
} from '@yct/contracts';
import type { CommonMessageKey } from '../client-i18n';
import type { TransitTripInstance } from '../transit-realtime';

/** 与 useI18n 的 t 结构一致，供服务端注入自己的翻译器。 */
export type Translate = (key: CommonMessageKey, values?: Record<string, string | number>) => string;

export interface TransitOverviewLine {
  id: string;
  mode: string;
  name: string;
  operationStatus?: 'operating' | 'planned' | 'closed';
  localizedName?: LocalizedLabelMap;
  color?: string;
  operator?: string;
  operatorUrl?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  departureTimesByDirection?: {
    down?: string[];
    up?: string[];
  };
  /** 当日已解析的班次标签，键为首站发车时刻（HH:mm）。 */
  tripLabelsByDirection?: {
    down?: Record<string, string>;
    up?: Record<string, string>;
  };
  /** 线路规则中的特殊班次标注，键为首站发车时刻（HH:mm）。 */
  specialTripsByDirection?: {
    down?: Record<string, TransitLineSpecialTripSnapshot>;
    up?: Record<string, TransitLineSpecialTripSnapshot>;
  };
  /** 已发布班次实例（仅实时公交接口附加）。 */
  tripInstances?: TransitTripInstance[];
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

export interface TransitLineStopForMap {
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

export interface TransitModeProfileForMap {
  mode: string;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
  showPlannedSegments?: boolean;
}

export interface RoutePlanDraft {
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

export type RouteEndpointKind = 'origin' | 'destination';

export type RouteTransportMode =
  'walk' | 'taxi' | 'bus' | 'metro' | 'tram' | 'coach' | 'ferry' | 'railway';
export type TransitRouteTransportMode = Exclude<RouteTransportMode, 'walk' | 'taxi'>;
export type RoutePlanSortMode = 'time' | 'walking' | 'transfers' | 'fare';

export interface RouteTransportModeOption {
  mode: RouteTransportMode;
  icon: string;
  color: string;
}

export type EnabledRouteTransportModes = Record<RouteTransportMode, boolean>;

export interface RoutePlanOption {
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

export interface RoutePlanRoadLabel {
  color?: string;
  coordinates: Array<[number, number]>;
  id: string;
  label: string;
  roadId: string;
}

export interface RoutePlanStep {
  kind: 'place' | 'walk' | 'taxi' | 'transit' | 'transfer';
  color?: string;
  details?: RoutePlanStepDetail[];
  label: string;
  icon?: string;
  role?: 'origin' | 'destination' | 'boarding' | 'alighting' | 'transfer';
}

export interface RoutePlanStepDetail {
  icon: string;
  kind?: 'process' | 'place_origin' | 'place_pass' | 'place_destination';
  label: string;
  meta?: string;
}

export interface RoutePlanTraceSegment {
  color: string;
  coordinates: Array<[number, number]>;
  kind: 'walk' | 'taxi' | 'transit' | 'transfer';
}

export interface RoadRouteNode {
  id: string;
  coordinate: [number, number];
  y: number;
  roadId: string;
  roadLabel: string;
}

export interface RoadRouteEdge {
  coordinates: Array<[number, number]>;
  distance: number;
  kind: 'connection' | 'road';
  label: string;
  allowedModes: MapTravelMode[];
  roadId?: string;
  to: string;
}

export interface RoadRouteSegment {
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

export interface RoadRouteGraph {
  adjacency: Map<string, RoadRouteEdge[]>;
  defaultY: number;
  worldId: string;
  nodes: RoadRouteNode[];
  nodesById: Map<string, RoadRouteNode>;
  roadSegments: RoadRouteSegment[];
  verticalTolerance: number;
}

export interface RoadRoutePath {
  coordinates: Array<[number, number]>;
  distance: number;
  nodes: RoadRouteNode[];
  segments: RoadRouteInstructionSegment[];
}

export interface RoadRouteInstructionSegment {
  coordinates: Array<[number, number]>;
  kind: 'approach' | 'connection' | 'depart' | 'road';
  label: string;
  roadId?: string;
}

export interface RoadConnectionCandidate {
  distance: number;
  leftCoordinate: [number, number];
  leftRoadLabel: string;
  leftSegmentId: string;
  rightCoordinate: [number, number];
  rightRoadLabel: string;
  rightSegmentId: string;
}

export interface RoadAccessCandidate {
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

export interface RoutePlanningCache {
  accessCandidatesByPair: Map<string, RoadAccessCandidate[]>;
  pathByNodePair: Map<string, RoadRoutePath | undefined>;
  roadRouteByPair: Map<string, ResolvedRoadRoute | null>;
  traversalBarriers: RouteTraversalBarrier[];
}

export type RoadRouteStrategy =
  'shortest' | 'fewer-turns' | 'fewest-segments' | 'alternative-1' | 'alternative-2';

export interface ResolvedRoadRoute {
  coordinates: Array<[number, number]>;
  details: RoutePlanStepDetail[];
  distance: number;
  junctionCount: number;
  roadSegments: RoadRouteInstructionSegment[];
}

export interface RoadRouteAccessOptions {
  destinationAccessCandidates?: RoadAccessCandidate[];
  originAccessCandidates?: RoadAccessCandidate[];
}

export interface ResolvedWalkRoute {
  blockedByTraversalBarrier: boolean;
  coordinates: Array<[number, number]>;
  details: RoutePlanStepDetail[];
  distance: number;
  markerIds?: string[];
  roadSegments?: RoadRouteInstructionSegment[];
  usesRoadGraph: boolean;
}

export interface SecondaryPoiLink {
  childLabel: string;
  marker: PointMarker;
  parent: CenterableMarker;
}

export interface SecondaryPoiParentLink {
  childLabel: string;
  marker: PointMarker;
  parent: CenterableMarker;
}

export type LocalizedMapMarker = MapMarkerSnapshot['markers'][number] & { sourceLabel: string };

export type PointMarker = LocalizedMapMarker & {
  geometry: Extract<MapMarkerSnapshot['markers'][number]['geometry'], { type: 'Point' }>;
};

export type LinearMarkerGeometry = Extract<MapGeometry, { type: 'MultiPoint' | 'LineString' }>;

export type EndpointGroupMarker = LocalizedMapMarker & {
  geometry: LinearMarkerGeometry;
};

export type RegionGeometry = Extract<
  MapGeometry,
  { type: 'Rectangle' | 'MultiRectangle' | 'Polygon' | 'MultiPolygon' }
>;

export interface RouteTraversalBarrier {
  blockedModes: MapTravelMode[];
  geometry: RegionGeometry;
  id: string;
}

export type CenterableMarker = LocalizedMapMarker;

export const routeTransportModeOptions: RouteTransportModeOption[] = [
  { mode: 'walk', icon: 'directions_walk', color: 'var(--yct-color-text-secondary)' },
  { mode: 'taxi', icon: 'local_taxi', color: '#FFD400' },
  { mode: 'bus', icon: 'directions_bus', color: 'var(--yct-color-tertiary)' },
  { mode: 'metro', icon: 'subway', color: 'var(--yct-color-secondary)' },
  { mode: 'tram', icon: 'tram', color: 'var(--yct-color-tram)' },
  { mode: 'coach', icon: 'airport_shuttle', color: 'var(--yct-color-coach)' },
  { mode: 'ferry', icon: 'directions_boat', color: 'var(--yct-color-ferry)' },
  { mode: 'railway', icon: 'train', color: 'var(--yct-color-railway)' },
];

export const routeWalkTraceColor = 'var(--yct-color-primary)';
export const routeTaxiTraceColor = '#FFD400';

export const markerRoadAccessProjectionRange = 50;

export const playerRouteRecalculationDistance = 128;
