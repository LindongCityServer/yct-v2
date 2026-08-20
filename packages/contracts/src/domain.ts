export type ISODateTimeString = string;
export type YctProfileId = string;

export type AccentTone = 'teal' | 'red' | 'gray';
export type ColorSchemePreference = 'light' | 'dark' | 'system';
export type AccentPreferenceMode = 'follow_ldpass' | 'custom';
export type LocaleCode = 'zh-CN' | 'zh-Hant' | 'en';
export type LocalePreference = LocaleCode | 'system';
export type LocalizedLabelMap = Partial<Record<Exclude<LocaleCode, 'zh-CN'>, string>>;
export type TranslatableEntityKind = 'map_marker' | 'transit_line' | 'transit_station';

export interface EntityTranslationRecord {
  entityKind: TranslatableEntityKind;
  entityId: string;
  sourceText: string;
  localizedLabels: LocalizedLabelMap;
  roadSignPinyin?: string;
  materialLineNumber?: string;
  updatedBy: string;
  updatedAt: ISODateTimeString;
}

export type TransportMode =
  'metro' | 'tram' | 'bus' | 'coach' | 'ferry' | 'railway' | 'walk' | 'custom';
export type FareTransportMode = TransportMode | 'taxi';

export type TransitFareQuoteStatus = 'exact' | 'estimated' | 'partial' | 'unavailable';

export type TransitFareRule =
  | 'bus_default_flat'
  | 'bus_configured'
  | 'rail_distance'
  | 'coach_configured'
  | 'ferry_flat'
  | 'taxi_metered'
  | 'configured'
  | 'unconfigured';

export interface TransitFareBreakdownItem {
  modes: FareTransportMode[];
  lineIds: string[];
  lineNames: string[];
  rule: TransitFareRule;
  status: Exclude<TransitFareQuoteStatus, 'partial'>;
  amount?: number;
  distanceKilometers?: number;
  sourceText?: string;
}

export interface TransitFareQuote {
  currency: 'CNY';
  status: TransitFareQuoteStatus;
  totalAmount?: number;
  knownSubtotal: number;
  breakdown: TransitFareBreakdownItem[];
}

export type ContentStatus =
  'draft' | 'pending_review' | 'approved' | 'scheduled' | 'published' | 'rejected' | 'archived';

export type ContentRevisionStatus =
  'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';

export type ContentAssetStatus = 'pending_review' | 'approved' | 'rejected' | 'archived';
export type ContentAssetKind = 'image' | 'attachment';
export type ContentPublishMode = 'immediate' | 'scheduled';
export type OperationsStrongReminderSourceKind = 'manual' | 'content' | 'service_notice';
export type OperationsStrongReminderTone =
  | 'primary'
  | 'metro'
  | 'bus'
  | 'coach'
  | 'tram'
  | 'ferry'
  | 'flight'
  | 'railway'
  | 'custom'
  | 'warning'
  | 'danger';

export interface ContentSummary {
  id: string;
  title: string;
  categoryId: string;
  status: ContentStatus;
  publishedAt?: ISODateTimeString;
  coverImageUrl?: string;
  excerpt?: string;
}

export interface ContentRevision {
  id: string;
  contentId: string;
  title: string;
  categoryId: string;
  markdown: string;
  status: ContentRevisionStatus;
  assetIds: string[];
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  scheduledAt?: ISODateTimeString;
  publishedAt?: ISODateTimeString;
}

export interface ContentAsset {
  id: string;
  contentId?: string;
  revisionId?: string;
  kind: ContentAssetKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  sourceUrl?: string;
  status: ContentAssetStatus;
  uploadedBy: string;
  uploadedAt: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
}

export interface OperationsStrongReminderRule {
  id: string;
  sourceKind: OperationsStrongReminderSourceKind;
  enabled: boolean;
  sortOrder: number;
  tone?: OperationsStrongReminderTone;
  label?: string;
  title?: string;
  summary?: string;
  href?: string;
  contentId?: string;
  startsAt?: ISODateTimeString;
  endsAt?: ISODateTimeString;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  updatedBy?: string;
}

export type ReviewDecision = 'approved' | 'rejected';

export type MapGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint'; coordinates: Array<[number, number]> }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'Rectangle'; bounds: RectangleBounds }
  | { type: 'MultiRectangle'; rectangles: RectangleBounds[] }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };

export interface WorldPosition {
  worldId: string;
  x: number;
  z: number;
  y?: number;
}

export type MapNetworkDirection = 'both' | 'forward' | 'reverse';
export type MapNetworkKind = 'road' | 'pedestrian';
export type MapVerticalConnectorKind = 'ramp' | 'stairs' | 'escalator' | 'elevator';
export type MapTravelMode = 'walk' | 'taxi' | 'bus' | 'coach';
export type MapTraversalBarrierKind = 'blocked_area';

export interface MapTraversalBarrier {
  kind: MapTraversalBarrierKind;
  /** 未指定时阻断所有非显式路网/交通线路的直接穿越。 */
  blockedModes?: MapTravelMode[];
}

export interface MapStyleBinding {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  lineColorTransitLineIds?: string[];
}

export interface MapDynamicSymbol {
  kind: 'metro_exit' | 'road_ref' | 'highway_ref';
  ref: string;
  variant?: string;
  backgroundColor?: string;
  textColor?: string;
}

export type MapVolumeGeometry =
  | {
      type: 'ExtrudedRectangle';
      bounds: RectangleBounds;
      minY: number;
      maxY: number;
    }
  | {
      type: 'MultiExtrudedRectangle';
      volumes: Array<{ bounds: RectangleBounds; minY: number; maxY: number }>;
    }
  | {
      type: 'ExtrudedPolygon';
      coordinates: Array<Array<[number, number]>>;
      minY: number;
      maxY: number;
    }
  | {
      type: 'MultiExtrudedPolygon';
      volumes: Array<{
        coordinates: Array<Array<[number, number]>>;
        minY: number;
        maxY: number;
      }>;
    };

export interface MapMarkerSpatialMetadata {
  worldId?: string;
  defaultY?: number;
  /** 与二维几何展开后的坐标顺序一致；空值继承 defaultY 或地图默认 Y。 */
  coordinateY?: Array<number | null>;
  networkKind?: MapNetworkKind;
  direction?: MapNetworkDirection;
  allowedModes?: MapTravelMode[];
  verticalConnectorKind?: MapVerticalConnectorKind;
  accessible?: boolean;
  traversalBarrier?: MapTraversalBarrier;
  style?: MapStyleBinding;
  volume?: MapVolumeGeometry;
  dynamicSymbol?: MapDynamicSymbol;
  parentPlaceId?: string;
  stationId?: string;
  ref?: string;
}

export type AdministrativeAreaLevel =
  'country' | 'province' | 'prefecture' | 'county' | 'township' | 'custom';

export type AdministrativeAreaStatus = 'draft' | 'published' | 'archived';

export const ADMINISTRATIVE_AREA_DEFAULT_MAX_ZOOM = 0;

export interface AdministrativeArea {
  id: string;
  code: string;
  name: string;
  level: AdministrativeAreaLevel;
  parentAreaId?: string;
  /** 仅允许 Rectangle、MultiRectangle、Polygon 或 MultiPolygon。 */
  boundary: MapGeometry;
  /** 绑定后标签跟随该 POI 的代表位置；未绑定时自动放在区域内靠近几何中心的位置。 */
  labelPositionPoiId?: string;
  /** @deprecated 兼容旧行政区划固定标签坐标，新数据应使用自动位置或 labelPositionPoiId。 */
  labelPosition?: [number, number];
  style?: MapStyleBinding;
  minZoom?: number;
  maxZoom?: number;
  status: AdministrativeAreaStatus;
  createdAt: ISODateTimeString;
  createdBy: string;
  updatedAt: ISODateTimeString;
  updatedBy: string;
  publishedAt?: ISODateTimeString;
  archivedAt?: ISODateTimeString;
}

export interface RectangleBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export type TaxiLongDistanceSurchargeScope = 'excess_distance' | 'whole_metered_fare';

export interface TaxiFareProfile {
  baseFareCents: number;
  baseDistanceMeters: number;
  incrementDistanceMeters: number;
  incrementFareCents: number;
  longDistanceThresholdMeters: number;
  longDistanceSurchargePermille: number;
  longDistanceSurchargeScope: TaxiLongDistanceSurchargeScope;
}

export interface RailDistanceFareBand {
  maximumDistanceMeters: number;
  fareCents: number;
}

export interface TransitFareProfile {
  busDefaultFareCents: number;
  ferryDefaultFareCents: number;
  railDistanceBands: RailDistanceFareBand[];
}

export interface RoadTimingProfile {
  defaultBusSpeedKmh: number;
  junctionSnapTolerance: number;
  taxiJunctionDelaySeconds: number;
  busJunctionDelaySeconds: number;
}

export interface MapSpatialProfile {
  mapId: string;
  worldId: string;
  worldName: string;
  defaultY: number;
  verticalTolerance: number;
  defaultDrivingSpeedKmh: number;
  roadTiming: RoadTimingProfile;
  taxiFare: TaxiFareProfile;
  transitFare: TransitFareProfile;
  updatedAt?: ISODateTimeString;
  updatedBy?: string;
}

export type TileProviderSourceKind = 'fresh-http' | 'safe-https-static' | 'proxied' | 'custom';

export interface TileFreshness {
  updatedAt?: ISODateTimeString;
  note?: string;
}

export interface TileProviderDescriptor {
  id: string;
  name: string;
  sourceKind: TileProviderSourceKind;
  tileTemplate: string;
  attribution?: string | null;
  freshness?: TileFreshness;
}

export interface PoiIconMapping {
  categoryId: string;
  iconFileNames: string[];
  defaultIconFileName: string;
}

export interface PoiCategory {
  id: string;
  name: string;
  iconMapping: PoiIconMapping;
  acceptsPublicSubmissions: boolean;
  sortOrder: number;
}

export type PoiVisibility = 'private' | 'public_pending_review' | 'public';
export type PoiSubmissionStatus =
  'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';

export interface PoiFacilitySnapshot {
  symbolIcon: string;
  description: string;
}

export interface PoiSubmission {
  id: string;
  profileId: YctProfileId;
  title: string;
  categoryId: string;
  iconFileName?: string;
  description?: string;
  href?: string;
  imageUrls?: string[];
  /** @deprecated 兼容旧消费者，值始终等于 imageUrls 的第一项。 */
  imageUrl?: string;
  geometry: MapGeometry;
  spatial?: MapMarkerSpatialMetadata;
  parentMarkerId?: string;
  floorLabel?: string;
  boundRegionMarkerIds?: string[];
  openingHours?: string;
  address?: string;
  addressRoadMarkerId?: string;
  facilities?: PoiFacilitySnapshot[];
  visibility: PoiVisibility;
  status: PoiSubmissionStatus;
  submittedBy: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
}

export interface TransitLine {
  id: string;
  profileId: YctProfileId;
  mode: TransportMode;
  name: string;
  shortName?: string;
  color?: string;
  stationIds: string[];
  status: 'draft' | 'active' | 'suspended' | 'archived';
}

export interface TransitStation {
  id: string;
  profileId: YctProfileId;
  name: string;
  aliases: string[];
  geometry: Extract<MapGeometry, { type: 'Point' }>;
  servedLineIds: string[];
}

export type TransitDataRevisionStatus =
  | 'imported'
  | 'validation_failed'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'superseded'
  | 'archived';

export type TransitItemApprovalStatus =
  'imported' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';

export type TransitLineStopLocationScope = 'both' | 'up' | 'down';

export interface TransitLineStopLocationRef {
  scope: TransitLineStopLocationScope;
  markerId: string;
  label: string;
  categoryId?: string;
}

export interface TransitLineStopSnapshot {
  stationSourceId: string;
  sequence: number;
  oneWay?: 'up' | 'down';
  /** 各方向是否停站；旧数据缺省时按两个方向均停站处理。 */
  stopDirections?: {
    down: boolean;
    up: boolean;
  };
  /** 当前线路在该站按方向使用的具体地图停靠位置。 */
  stopLocationRefs?: TransitLineStopLocationRef[];
  status?: string;
  travelTime?: number;
  platformSide?: string;
  fareZone?: string;
  labelOffset?: {
    x?: number;
    y?: number;
  };
  trainPosition?: number;
}

export type TransitLineSegmentPathMode = 'straight' | 'road';
export type TransitOperationStatus = 'operating' | 'planned' | 'closed';

export interface TransitLineSegmentWaypointSnapshot {
  x: number;
  z: number;
  direction?: 'both' | 'up' | 'down';
  boundPoiMarkerId?: string;
  boundPoiLabel?: string;
}

export interface TransitLineSegmentPathSnapshot {
  fromStationSourceId: string;
  toStationSourceId: string;
  mode: TransitLineSegmentPathMode;
  operationStatus?: TransitOperationStatus;
  travelMinutes?: number;
  waypoints: TransitLineSegmentWaypointSnapshot[];
  note?: string;
}

export type TransitLineRouteMode = 'straight' | 'road';

export type TransitLineRouteNodeSnapshot =
  | {
      kind: 'station';
      stationSourceId: string;
      direction: 'both' | 'up' | 'down';
    }
  | {
      kind: 'waypoint';
      x: number;
      z: number;
      direction: 'both' | 'up' | 'down';
      boundPoiMarkerId?: string;
      boundPoiLabel?: string;
    };

export interface TransitDepartureScheduleRule {
  sourceText: string;
  startTime: string;
  intervalMinutes?: number;
  additionalDepartures?: number;
}

export interface TransitLineSnapshot {
  sourceId: string;
  mode: Exclude<TransportMode, 'walk'>;
  name: string;
  /** 运营状态与审批/发布状态正交；未设置的旧数据按 operating 解释。 */
  operationStatus?: TransitOperationStatus;
  approvalStatus?: TransitItemApprovalStatus;
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
  archivedAt?: ISODateTimeString;
  color?: string;
  /** 地铁/有轨线路可用的最大编组车厢数。 */
  maxCarCount?: number;
  routeMode?: TransitLineRouteMode;
  routeNodes?: TransitLineRouteNodeSnapshot[];
  stationSourceIds: string[];
  stops: TransitLineStopSnapshot[];
  segmentPaths?: TransitLineSegmentPathSnapshot[];
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  departureRules?: TransitDepartureScheduleRule[];
  /** 分别表示按线路站序、按反向站序从首站发车的时刻。 */
  departureTimesByDirection?: {
    down?: string[];
    up?: string[];
  };
  departureRulesByDirection?: {
    down?: TransitDepartureScheduleRule[];
    up?: TransitDepartureScheduleRule[];
  };
  operatingDateRule?: string;
  bookingUrl?: string;
  sourcePath?: string;
}

export interface TransitStationPoiBindingSnapshot {
  markerId: string;
  label: string;
  categoryId?: string;
}

export interface TransitStationSnapshot {
  sourceId: string;
  name: string;
  aliases: string[];
  /** 未开通或关闭的站点可供物料使用，但不得进入公众路线规划。 */
  operationStatus?: TransitOperationStatus;
  diagramX?: number;
  diagramY?: number;
  x?: number;
  y?: number;
  z?: number;
  boundPoiRefs?: TransitStationPoiBindingSnapshot[];
  boundPoiMarkerId?: string;
  boundPoiLabel?: string;
  sourcePath?: string;
}

export interface TransitStationLayerSnapshot {
  floor: string;
  type: string;
  /** 旧数据数组中的稳定层级顺序，0 表示最先声明的楼层。 */
  order?: number;
}

export interface TransitStationFacilitySnapshot {
  type: string;
  /** 沿站台方向的位置，允许精确到四分之一车厢。 */
  location?: number;
  floor?: string;
  endFloor?: string;
  direction?: string;
  oneWay?: string;
  orientation?: string;
}

export interface TransitStationTransferSnapshot {
  line: string;
  floor?: string;
  direction?: string;
  location?: number;
  transferDirection?: 'upwards' | 'downwards';
}

export interface TransitStationExitSnapshot {
  code: string;
  description?: string;
  floor?: string;
  direction?: 'upwards' | 'downwards';
  orientation?: string;
  /** 地点系统中的出口位置参考；不参与文本格式的主字段。 */
  placeMarkerId?: string;
  /** 用于生成出口介绍的附近道路标记，最多保留两条。 */
  roadMarkerIds?: string[];
}

export interface TransitStationDetailSnapshot {
  sourceId: string;
  lineName: string;
  stationName: string;
  overGround?: boolean;
  layers: TransitStationLayerSnapshot[];
  facilities: TransitStationFacilitySnapshot[];
  facilitiesUpwards?: TransitStationFacilitySnapshot[];
  transfers: TransitStationTransferSnapshot[];
  exits: TransitStationExitSnapshot[];
  surroundingStationNames: string[];
  swapExitLayers?: [string, string];
  flipTemplateForUpwards?: boolean;
  /** 站台开门方向，来自线路停靠点 platformSide。 */
  platformSide?: 'left' | 'right' | 'both' | 'none';
  sourcePath?: string;
}

export interface TransitModeSnapshotSummary {
  mode: Exclude<TransportMode, 'walk'>;
  label: string;
  lineCount: number;
  stationCount: number;
}

export type TransitNetworkHealthSuggestionKind =
  | 'connect_components'
  | 'improve_transfer'
  | 'improve_cross_connection'
  | 'reduce_corridor_overlap'
  | 'improve_service_hours'
  | 'improve_station_spacing'
  | 'serve_demand_hotspots'
  | 'improve_place_coverage'
  | 'improve_road_coverage'
  | 'data_quality';

export type TransitNetworkHealthSuggestionPriority = 'info' | 'attention';

export type TransitNetworkHealthSuggestionDimension =
  'topology' | 'operations' | 'scale' | 'places' | 'demand' | 'data_quality';

export type TransitNetworkHealthPlaceCategory =
  'residence' | 'employment' | 'education' | 'medical' | 'daily_life' | 'leisure' | 'transport';

export interface TransitNetworkHealthOperatorRanks {
  stationCount: number;
  lineCount: number;
  averageConnectivity: number;
  connectivityWeight: number;
  averageLinesPerSegment: number;
  scheduleCoverageRate: number;
  averageServiceSpanMinutes: number;
}

export interface TransitNetworkHealthOperatorStats {
  operator: string;
  modes: Array<Exclude<TransportMode, 'walk'>>;
  lineCount: number;
  stationCount: number;
  topologySegmentCount: number;
  sharedSegmentCount: number;
  averageConnectivity: number;
  connectivityWeight: number;
  averageLinesPerSegment: number;
  transferStationCount: number;
  componentCount: number;
  scheduledLineCount: number;
  scheduleCoverageRate: number;
  averageServiceSpanMinutes: number;
  earlyStartLineCount: number;
  lateEndLineCount: number;
  ranks: TransitNetworkHealthOperatorRanks;
}

export interface TransitNetworkHealthOperatingStats {
  scheduledLineCount: number;
  scheduleCoverageRate: number;
  averageServiceSpanMinutes: number;
  shortestServiceSpanMinutes: number;
  longestServiceSpanMinutes: number;
  earlyStartLineCount: number;
  lateEndLineCount: number;
}

export interface TransitNetworkHealthSpatialStats {
  locatedStationCount: number;
  stationLocationCoverageRate: number;
  locatedSegmentCount: number;
  approximateRouteLength: number;
  averageStationSpacing: number;
  networkSpanArea: number;
  roadCount: number;
  roadNodeCount: number;
  coveredRoadNodeCount: number;
  roadNodeCoverageRate: number;
  catchmentRadius: number;
}

export interface TransitNetworkHealthPlaceCategoryStats {
  category: TransitNetworkHealthPlaceCategory;
  label: string;
  placeCount: number;
  coveredPlaceCount: number;
  coverageRate: number;
  nearbyPlacesPerStation: number;
}

export interface TransitNetworkHealthDemandHotspot {
  stationName: string;
  mode: Exclude<TransportMode, 'walk'>;
  nearbyPlaceCount: number;
  demandProxyScore: number;
  leadingCategories: string[];
}

export interface TransitNetworkHealthPotentialDemandHotspot {
  placeName: string;
  nearbyPlaceCount: number;
  demandProxyScore: number;
  leadingCategories: string[];
  servedByNetwork: boolean;
}

export interface TransitNetworkHealthPlanningStats {
  sourcePlaceCount: number;
  analyzedPlaceCount: number;
  coveredPlaceCount: number;
  placeCoverageRate: number;
  totalDemandProxyScore: number;
  attainedDemandProxyScore: number;
  demandAttainmentRate: number;
  averageDemandProxyScore: number;
  placeCategories: TransitNetworkHealthPlaceCategoryStats[];
  demandHotspots: TransitNetworkHealthDemandHotspot[];
  potentialDemandHotspots: TransitNetworkHealthPotentialDemandHotspot[];
}

export type TransitNetworkHealthSuggestionTargetKind =
  'operator' | 'line' | 'station' | 'segment' | 'place' | 'category' | 'road';

export interface TransitNetworkHealthSuggestionTarget {
  kind: TransitNetworkHealthSuggestionTargetKind;
  label: string;
  detail?: string;
}

export interface TransitNetworkHealthSuggestion {
  id: string;
  kind: TransitNetworkHealthSuggestionKind;
  dimension: TransitNetworkHealthSuggestionDimension;
  priority: TransitNetworkHealthSuggestionPriority;
  operators?: string[];
  title: string;
  detail: string;
  evidence: string;
  targetLabel?: string;
  targets?: TransitNetworkHealthSuggestionTarget[];
  targetCount?: number;
}

export interface TransitNetworkHealthScopeStats {
  lineCount: number;
  topologyLineCount: number;
  stationCount: number;
  topologySegmentCount: number;
  sharedSegmentCount: number;
  transferStationCount: number;
  stationIdentityFallbackCount: number;
  incompleteLineCount: number;
  operating: TransitNetworkHealthOperatingStats;
  spatial: TransitNetworkHealthSpatialStats;
  planning: TransitNetworkHealthPlanningStats;
  operators: TransitNetworkHealthOperatorStats[];
  suggestions: TransitNetworkHealthSuggestion[];
}

export interface TransitNetworkHealthModeStats extends TransitNetworkHealthScopeStats {
  mode: Exclude<TransportMode, 'walk'>;
  label: string;
  color: string;
  icon: string;
}

export interface TransitNetworkHealthAnalysisSource {
  id: 'topology' | 'operations' | 'places' | 'roads';
  label: string;
  detail: string;
  status: 'ready' | 'partial' | 'unavailable';
}

export interface TransitNetworkHealthReport extends TransitNetworkHealthScopeStats {
  analyzedAt: ISODateTimeString;
  sourceMessage?: string;
  planningSourceMessage?: string;
  analysisSources: TransitNetworkHealthAnalysisSource[];
  modes: TransitNetworkHealthModeStats[];
}

export interface TransitModeProfile {
  mode: Exclude<TransportMode, 'walk'>;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
  showPlannedSegments: boolean;
  updatedAt?: ISODateTimeString;
  updatedBy?: string;
}

export interface TransitDataValidationResult {
  checkedAt: ISODateTimeString;
  errorCount: number;
  warningCount: number;
  errors: string[];
  issues?: TransitDataValidationIssue[];
  warnings: string[];
}

export interface TransitDataValidationIssue {
  count: number;
  examples: string[];
  kind:
    | 'broken_line'
    | 'duplicate_station_name'
    | 'missing_world_coordinate'
    | 'one_way_station'
    | 'orphan_station';
  message: string;
  severity: 'error' | 'warning';
}

export interface TransitDataRevision {
  revisionId: string;
  datasetId: string;
  profileId: YctProfileId;
  status: TransitDataRevisionStatus;
  sourceProviderId: string;
  sourcePath: string;
  sourceFiles: string[];
  summary: TransitModeSnapshotSummary[];
  lines: TransitLineSnapshot[];
  stations: TransitStationSnapshot[];
  stationDetails?: TransitStationDetailSnapshot[];
  validation: TransitDataValidationResult;
  importedBy: string;
  importedAt: ISODateTimeString;
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
  supersededAt?: ISODateTimeString;
}

export interface TransitServiceNotice {
  id: string;
  mode: Exclude<TransportMode, 'walk'>;
  title: string;
  periodText: string;
  reason: string;
  startsAt?: ISODateTimeString;
  endsAt?: ISODateTimeString;
  sourcePath?: string;
}

export interface TransitScreenStation {
  stationId: string;
  name: string;
  sourcePath?: string;
}

export interface TransitScreenTrip {
  sourceId: string;
  tripId: string;
  departureTime: string;
  lineName: string;
  stationNames: string[];
  fare?: string;
  operator?: string;
  bookingUrl?: string;
  runtimeText?: string;
  sourcePath?: string;
}

export interface TransitScreenGate {
  sourceId: string;
  stationId: string;
  lineName: string;
  gate: string;
  sourcePath?: string;
}

export interface TransitScreenRuntimeSegment {
  sourceId: string;
  lineName: string;
  fromStationName: string;
  toStationName: string;
  durationMinutes: number;
  fareReduction?: string;
  sourcePath?: string;
}

export interface TransitScreenSnapshot {
  stations: TransitScreenStation[];
  trips: TransitScreenTrip[];
  gates: TransitScreenGate[];
  runtimeSegments: TransitScreenRuntimeSegment[];
  notice?: string;
  sourceFiles: string[];
}

export type TicketableServiceKind = 'coach' | 'ferry' | 'flight' | 'railway' | 'custom';
export type TravelScheduleServiceStatus = 'active' | 'not_connected' | 'planned';
export type TravelTripAvailability =
  'query_only' | 'booking_reference' | 'ticketing_unavailable' | 'not_connected';

export interface TravelScheduleServiceProfile {
  kind: TicketableServiceKind;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
  updatedAt?: ISODateTimeString;
  updatedBy?: string;
}

export interface TravelScheduleServiceSummary {
  serviceId: string;
  kind: TicketableServiceKind;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
  status: TravelScheduleServiceStatus;
  tripCount: number;
  stationCount: number;
  message?: string;
}

export interface TravelTripStopTime {
  stationName: string;
  isStop: boolean;
  arrivalTime?: string;
  departureTime?: string;
  arrivalDayOffset?: number;
  departureDayOffset?: number;
  dwellMinutes?: number;
}

export interface TravelTripInstance {
  tripInstanceId: string;
  approvalStatus?: TransitItemApprovalStatus;
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
  archivedAt?: ISODateTimeString;
  tripCode?: string;
  serviceId?: string;
  serviceKind: TicketableServiceKind;
  serviceLabel: string;
  departureTime: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  lineName: string;
  routeNote?: string;
  stationNames: string[];
  stopTimes?: TravelTripStopTime[];
  timingSource?: 'manual' | 'road_segment';
  originStationName?: string;
  destinationStationName?: string;
  fareText?: string;
  operator?: string;
  bookingUrl?: string;
  runtimeText?: string;
  gateText?: string;
  vehicleTypeText?: string;
  vehicleModelText?: string;
  operatingDays?: string[];
  availability: TravelTripAvailability;
  ticketing?: TravelTicketingAvailability;
  sourcePath?: string;
}

export type TravelScheduleHistoryReason = 'saved' | 'reminder';

export interface TravelScheduleHistoryItem {
  id: string;
  tripInstanceId: string;
  tripCode?: string;
  serviceKind: TicketableServiceKind;
  serviceLabel: string;
  lineName: string;
  departureTime: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  stationNames: string[];
  originStationName?: string;
  destinationStationName?: string;
  fareText?: string;
  operator?: string;
  gateText?: string;
  vehicleTypeText?: string;
  vehicleModelText?: string;
  operatingDays?: string[];
  lastReason: TravelScheduleHistoryReason;
  recordedAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  reminderCreatedAt?: ISODateTimeString;
}

export type TravelScheduleTimeScope = 'all' | 'upcoming' | 'past';

export interface TravelScheduleQuery {
  serviceKind?: TicketableServiceKind | 'all';
  query?: string;
  stationName?: string;
  originStationName?: string;
  destinationStationName?: string;
  serviceDate?: string;
  timeScope?: TravelScheduleTimeScope;
}

export interface TravelScheduleQueryResult {
  services: TravelScheduleServiceSummary[];
  trips: TravelTripInstance[];
  serviceNotices?: TransitServiceNotice[];
  stationOptions: string[];
  /** 地图路由适配器提供的同城异站换乘候选。 */
  transferOptions?: TravelJourneyTransferOption[];
  sourceFiles: string[];
  serviceDate?: string;
  notice?: string;
}

export type TravelJourneyTicketingStatus = 'order_available' | 'partially_available' | 'query_only';

export interface TravelJourneyTransferOption {
  fromStationName: string;
  toStationName: string;
  mode: MapTravelMode;
  modeLabel: string;
  routeDistanceBlocks?: number;
  bufferMinutes: number;
  totalMinutes: number;
}

export interface TravelJourneyTransfer {
  fromStationName: string;
  toStationName: string;
  mode: MapTravelMode;
  modeLabel: string;
  routeDistanceBlocks?: number;
  bufferMinutes: number;
  transferMinutes: number;
}

export interface TravelJourneyLeg {
  tripInstanceId: string;
  tripCode?: string;
  serviceKind: TicketableServiceKind;
  serviceLabel: string;
  lineName: string;
  fromStationName: string;
  toStationName: string;
  departureTime: string;
  arrivalTime?: string;
  departureDayOffset: number;
  arrivalDayOffset?: number;
  stationCount: number;
  ticketingStatus: TravelTicketingAvailabilityStatus;
}

export interface TravelJourneyOption {
  journeyId: string;
  serviceDate: string;
  originStationName: string;
  destinationStationName: string;
  departureTime: string;
  arrivalTime?: string;
  departureDayOffset: number;
  arrivalDayOffset?: number;
  durationMinutes?: number;
  transferCount: number;
  ticketingStatus: TravelJourneyTicketingStatus;
  legs: TravelJourneyLeg[];
  transfers: TravelJourneyTransfer[];
}

export interface TravelJourneyPlanResult {
  serviceDate: string;
  originStationName: string;
  destinationStationName: string;
  journeys: TravelJourneyOption[];
  searchedTripCount: number;
}

export type TravelScheduleConflictKind =
  'time_order' | 'station_headway' | 'trip_overtake' | 'missing_time';

export interface TravelScheduleConflict {
  conflictId: string;
  kind: TravelScheduleConflictKind;
  severity: 'error' | 'warning';
  message: string;
  stationName?: string;
  tripInstanceIds: string[];
}

export type TravelScheduleRevisionStatus =
  | 'imported'
  | 'validation_failed'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'superseded'
  | 'archived';

export interface TravelScheduleValidationIssue {
  count: number;
  examples: string[];
  kind:
    | 'no_active_service'
    | 'no_trips'
    | 'service_without_trips'
    | 'source_unavailable'
    | 'trip_without_station';
  message: string;
  severity: 'error' | 'warning';
}

export interface TravelScheduleValidationResult {
  checkedAt: ISODateTimeString;
  errorCount: number;
  warningCount: number;
  errors: string[];
  issues?: TravelScheduleValidationIssue[];
  warnings: string[];
}

export interface TravelScheduleRevision {
  revisionId: string;
  scheduleServiceId: string;
  profileId: YctProfileId;
  status: TravelScheduleRevisionStatus;
  sourceProviderId: string;
  sourceFiles: string[];
  services: TravelScheduleServiceSummary[];
  trips: TravelTripInstance[];
  serviceNotices?: TransitServiceNotice[];
  stationOptions: string[];
  notice?: string;
  validation: TravelScheduleValidationResult;
  importedBy: string;
  importedAt: ISODateTimeString;
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
  supersededAt?: ISODateTimeString;
}

export type TravelFareCurrency = 'CNY' | 'SERVER_CREDIT' | 'CUSTOM';
export type TravelFareProductStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type TicketInventoryPoolStatus = 'draft' | 'active' | 'suspended' | 'archived';
export type TicketInventoryHoldStatus = 'held' | 'confirmed' | 'expired' | 'cancelled' | 'released';
export type TicketOrderStatus =
  | 'draft'
  | 'pending_issue'
  | 'issued'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded'
  | 'expired'
  | 'manual_review';
export type TicketStatus =
  | 'pending_issue'
  | 'issued'
  | 'redemption_linked'
  | 'checked_in'
  | 'cancelled'
  | 'refunded'
  | 'expired'
  | 'manual_review';
export type TicketRefundStatus =
  'requested' | 'approved' | 'rejected' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type TicketOrderCancellationReason =
  'user_cancelled' | 'inventory_expired' | 'issue_failed' | 'admin_cancelled' | 'system';
export type TravelTicketingAvailabilityStatus =
  | 'order_available'
  | 'legacy_reference_only'
  | 'fare_not_configured'
  | 'inventory_not_configured'
  | 'sold_out'
  | 'service_not_connected'
  | 'trip_not_found'
  | 'ticketing_unavailable';

export interface TravelFareProduct {
  fareProductId: string;
  serviceKind: TicketableServiceKind;
  serviceId?: string;
  tripInstanceId?: string;
  name: string;
  priceAmount: number;
  currency: TravelFareCurrency;
  status: TravelFareProductStatus;
  rules: Record<string, unknown>;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  sourcePath?: string;
}

export interface TicketInventoryPool {
  inventoryPoolId: string;
  serviceKind: TicketableServiceKind;
  tripInstanceId: string;
  fareProductId: string;
  totalCapacity?: number;
  availableCapacity?: number;
  status: TicketInventoryPoolStatus;
  updatedAt: ISODateTimeString;
}

export interface TravelFareProductSummary {
  fareProductId: string;
  name: string;
  priceAmount: number;
  currency: TravelFareCurrency;
}

export interface TicketInventoryPoolSummary {
  inventoryPoolId: string;
  fareProductId: string;
  totalCapacity?: number;
  availableCapacity?: number;
}

export interface TravelTicketingAvailability {
  tripInstanceId: string;
  serviceKind?: TicketableServiceKind;
  status: TravelTicketingAvailabilityStatus;
  orderSupported: boolean;
  requiresLogin: boolean;
  message: string;
  fareProducts: TravelFareProductSummary[];
  inventoryPools: TicketInventoryPoolSummary[];
  availableCapacity?: number;
  bookingUrl?: string;
  checkedAt: ISODateTimeString;
}

export interface TicketInventoryHold {
  inventoryHoldId: string;
  inventoryPoolId: string;
  tripInstanceId: string;
  fareProductId: string;
  userId: string;
  ldpassUserId: string;
  quantity: number;
  status: TicketInventoryHoldStatus;
  heldAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
  confirmedAt?: ISODateTimeString;
  releasedAt?: ISODateTimeString;
  orderId?: string;
}

export interface TicketOrder {
  orderId: string;
  userId: string;
  ldpassUserId: string;
  serviceKind: TicketableServiceKind;
  tripInstanceId: string;
  fareProductId: string;
  inventoryHoldId?: string;
  passengerCount: number;
  status: TicketOrderStatus;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  issuedAt?: ISODateTimeString;
  checkedInAt?: ISODateTimeString;
  completedAt?: ISODateTimeString;
  cancelledAt?: ISODateTimeString;
  cancellationReason?: TicketOrderCancellationReason;
  refundRequestedAt?: ISODateTimeString;
  refundedAt?: ISODateTimeString;
  legacyOrderId?: string;
  journeyOrderId?: string;
  journeyLegIndex?: number;
}

export interface TicketRecord {
  ticketId: string;
  orderId: string;
  userId: string;
  ldpassUserId: string;
  status: TicketStatus;
  ldpassPassId?: string;
  actionLinkId?: string;
  redemptionRequestId?: string;
  issuedAt?: ISODateTimeString;
  checkedInAt?: ISODateTimeString;
  cancelledAt?: ISODateTimeString;
  refundedAt?: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface TicketOrderDraftResult {
  order: TicketOrder;
  inventoryHold: TicketInventoryHold;
  fareProduct: TravelFareProductSummary;
  ticketing: TravelTicketingAvailability;
}

export interface TicketOrderListItem {
  order: TicketOrder;
  inventoryHold?: TicketInventoryHold;
}

export interface TicketRefundRequest {
  refundRequestId: string;
  orderId: string;
  ticketId: string;
  userId: string;
  status: TicketRefundStatus;
  reason?: string;
  amount?: number;
  requestedAt: ISODateTimeString;
  reviewedAt?: ISODateTimeString;
  completedAt?: ISODateTimeString;
  failedAt?: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type ServiceEntryStatus =
  'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';
export type ServiceEntryCategory = 'operations' | 'server_sites' | 'toolbox' | 'other';
export type ServiceEntryOpenMode = 'same_tab' | 'new_tab';

export type MaterialTemplateStatus = 'draft' | 'published' | 'archived';
export type MaterialTemplateFamily = 'road_sign' | 'address_sign' | 'bus_stop' | 'custom';
export type MaterialTemplateFieldKind = 'text' | 'number' | 'select' | 'color';
export type MaterialDraftStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
export type MaterialSourceKind =
  'manual' | 'transit_line' | 'transit_station' | 'map_location' | 'road_coordinate';

export type MaterialTransitNetworkPathKind =
  'simple' | 'diagonal' | 'perpendicular' | 'rotate-perpendicular' | 'unknown';

export interface MaterialTransitNetworkNode {
  id: string;
  kind: 'station' | 'junction';
  names: string[];
  x: number;
  y: number;
  lineKeys: string[];
  lineColors: string[];
}

export interface MaterialTransitNetworkEdge {
  id: string;
  source: string;
  target: string;
  lineKeys: string[];
  colors: string[];
  pathKind: MaterialTransitNetworkPathKind;
  startFrom?: 'from' | 'to';
  offsetFrom?: number;
  offsetTo?: number;
  roundCornerFactor?: number;
}

export interface MaterialTransitNetworkLineName {
  lineKey: string;
  name: string;
  secondaryName?: string;
}

/**
 * 物料渲染使用的只读线网几何快照。导入时会丢弃 RMP 图片和站点视觉属性，
 * 只保留坐标、拓扑、换乘线路标识与颜色。
 */
export interface MaterialTransitNetworkSnapshot {
  format: 'rmp';
  version: number;
  nodes: MaterialTransitNetworkNode[];
  edges: MaterialTransitNetworkEdge[];
  lineNames?: MaterialTransitNetworkLineName[];
}

export interface MaterialTransitNetworkProject {
  id: string;
  ownerId: string;
  fileName: string;
  snapshot: MaterialTransitNetworkSnapshot;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface MaterialTextFitConfig {
  maxWidth: number;
  fontSize: number;
  defaultScaleX?: number;
  maxLetterSpacing?: number;
  additionalFields?: Array<{
    fieldKey: string;
    fontSize: number;
  }>;
}

export interface MaterialGlyphConfig {
  renderer:
    | 'nostalgic_digits'
    | 'nostalgic_address_number'
    | 'chill_jinshu_vertical'
    | 'transit_station_list'
    | 'transit_horizontal_station_list'
    | 'transit_route_map'
    | 'metro_wayfinding';
  layoutWidth: number;
  layoutHeight: number;
  fontSize?: number;
  maxLetterSpacing?: number;
  suffixFieldKey?: string;
  currentIndexFieldKey?: string;
  colorFieldKey?: string;
}

export interface MaterialTemplateField {
  key: string;
  label: string;
  kind: MaterialTemplateFieldKind;
  required?: boolean;
  defaultValue?: string;
  userEditable?: boolean;
  serverOverride?: boolean;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: Array<{
    value: string;
    label: string;
  }>;
  selectVariableValues?: Record<string, Record<string, string>>;
  textFit?: MaterialTextFitConfig;
  glyph?: MaterialGlyphConfig;
}

export interface MaterialTypographyRule {
  minDesignSpeedKph: number;
  maxDesignSpeedKph: number;
  primaryTextHeightMm: number;
  secondaryTextHeightMm?: number;
  captionTextHeightMm?: number;
}

export interface MaterialTypographyProfile {
  designSpeedFieldKey: string;
  rules: MaterialTypographyRule[];
}

export interface MaterialCanvasConfig {
  widthM: number;
  heightM: number;
  pxPerMeter: number;
  alignToTile: boolean;
  tileSizePx: number;
}

export interface MaterialTemplateVersion {
  version: number;
  status: MaterialTemplateStatus;
  title: string;
  description?: string;
  family: MaterialTemplateFamily;
  source: string;
  fields: MaterialTemplateField[];
  typographyProfile?: MaterialTypographyProfile;
  defaultCanvas: MaterialCanvasConfig;
  createdBy: string;
  createdAt: ISODateTimeString;
  publishedBy?: string;
  publishedAt?: ISODateTimeString;
  archivedAt?: ISODateTimeString;
}

export interface MaterialTemplateRecord {
  id: string;
  versions: MaterialTemplateVersion[];
}

export interface MaterialDraft {
  id: string;
  /** 客户端本地草稿的稳定幂等键。 */
  clientDraftId?: string;
  templateId: string;
  templateVersion: number;
  input: Record<string, string>;
  canvas: MaterialCanvasConfig;
  status: MaterialDraftStatus;
  createdBy: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
}

export interface MaterialExportAuditRecord {
  id: string;
  actorId: string;
  templateId: string;
  templateVersion: number;
  sourceKind: MaterialSourceKind;
  sourceRef?: string;
  draftId?: string;
  inputHash: string;
  canvas: MaterialCanvasConfig;
  outputWidthPx: number;
  outputHeightPx: number;
  outputSha256: string;
  requestedAt: ISODateTimeString;
}

export interface ServiceEntry {
  id: string;
  title: string;
  description?: string;
  categoryId: ServiceEntryCategory;
  icon: string;
  href: string;
  openMode: ServiceEntryOpenMode;
  status: ServiceEntryStatus;
  sortOrder: number;
  submittedBy?: string;
  submittedAt?: ISODateTimeString;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewReason?: string;
  publishedAt?: ISODateTimeString;
}

export type LegacyImportKind =
  'content' | 'transit_lines' | 'transit_stations' | 'transit_schedules' | 'poi';
export type LegacyImportStatus = 'created' | 'validated' | 'failed' | 'submitted' | 'published';

export interface LegacyImportBatch {
  id: string;
  profileId: YctProfileId;
  kind: LegacyImportKind;
  sourcePath: string;
  sourceProviderId: string;
  status: LegacyImportStatus;
  itemCount: number;
  errorCount: number;
  createdAt: ISODateTimeString;
  validatedAt?: ISODateTimeString;
}

export type TripReminderSource = 'manual' | 'route_plan' | 'schedule' | 'ticket' | 'legacy_order';
export type TripReminderStatus =
  | 'scheduled'
  | 'notification_queued'
  | 'notified'
  | 'sent'
  | 'ongoing'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface TripReminderRouteSnapshot {
  departure?: string;
  arrival?: string;
  lineName?: string;
  transportMode?: Exclude<TransportMode, 'walk'> | 'walk' | 'flight';
  detail?: string;
}

export interface TripReminder {
  id: string;
  userId?: string;
  localDeviceId?: string;
  title: string;
  source: TripReminderSource;
  remindAt: ISODateTimeString;
  status: TripReminderStatus;
  route?: TripReminderRouteSnapshot;
  legacyOrderId?: string;
  createdAt?: ISODateTimeString;
  updatedAt?: ISODateTimeString;
  completedAt?: ISODateTimeString;
  syncedAt?: ISODateTimeString;
}

export interface UserBadgeSourceCount {
  source: 'notifications' | 'orders' | 'admin_reviews' | 'account_status';
  count: number;
}

export interface MergedUserBadge {
  total: number;
  hasAccountStatusWarning: boolean;
  sources: UserBadgeSourceCount[];
}

export interface OfflineRectanglePackage {
  id: string;
  userId: string;
  name: string;
  bounds: RectangleBounds;
  sizeBytes?: number;
  updatedAt?: ISODateTimeString;
}

export type PushNotificationType = 'trip' | 'operations' | 'ticket' | 'check_in';

export interface PushQuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface UserPushPreference {
  userId: string;
  ldpassUserId: string;
  enabled: boolean;
  enabledTypes: PushNotificationType[];
  quietHours: PushQuietHours;
  updatedAt: ISODateTimeString;
}

export interface UserLocalePreference {
  userId: string;
  ldpassUserId: string;
  locale: LocalePreference;
  resolvedLocale: LocaleCode;
  updatedAt: ISODateTimeString;
}

export interface UserMapFavorites {
  userId: string;
  ldpassUserId: string;
  markerIds: string[];
  updatedAt: ISODateTimeString;
}

export interface TicketJourneyDraftResult {
  journeyOrderId: string;
  journeyId: string;
  serviceDate?: string;
  orders: TicketOrderDraftResult[];
  expiresAt: ISODateTimeString;
}

export type CompactMapRouteShareState = [
  origin: string,
  destination: string,
  originLabel: string,
  destinationLabel: string,
  originId: string,
  destinationId: string,
  modes: string,
  selectedOptionId: string,
];

export type MapShareLinkTarget =
  | {
      kind: 'marker';
      markerId: string;
    }
  | {
      kind: 'route';
      state: CompactMapRouteShareState;
    };

export interface MapShareLink {
  id: string;
  target: MapShareLinkTarget;
  createdAt: ISODateTimeString;
}

export type PushDeviceSubscriptionStatus = 'active' | 'revoked';

export interface PushDeviceSubscription {
  subscriptionId: string;
  userId: string;
  ldpassUserId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  status: PushDeviceSubscriptionStatus;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  lastSeenAt: ISODateTimeString;
  revokedAt?: ISODateTimeString;
}

export type PushDeliveryStatus =
  'queued' | 'deferred' | 'sent' | 'failed' | 'skipped' | 'cancelled';
export type PushDeliverySourceType = 'trip_reminder' | 'operations' | 'ticket' | 'check_in';

export interface PushDeliveryPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushDelivery {
  deliveryId: string;
  sourceKey: string;
  sourceType: PushDeliverySourceType;
  sourceId: string;
  userId: string;
  subscriptionId?: string;
  notificationType: PushNotificationType;
  status: PushDeliveryStatus;
  payload: PushDeliveryPayload;
  dueAt: ISODateTimeString;
  attempts: number;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
  sentAt?: ISODateTimeString;
  failedAt?: ISODateTimeString;
  deferredUntil?: ISODateTimeString;
  skippedAt?: ISODateTimeString;
  cancelledAt?: ISODateTimeString;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface SettingsBootstrap {
  brand: {
    name: '雨城通';
    englishName: 'Yuchengtong';
    abbreviation: 'YCT';
    iconUrl: string;
    wordmarkUrl: string;
  };
  integrations: {
    ldpassConfigured: boolean;
    tileProvidersConfigured: boolean;
  };
  pwa: {
    installCopy: string;
    offlinePackageMode: 'custom_rectangle';
  };
}
