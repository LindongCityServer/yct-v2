export type ISODateTimeString = string;
export type YctProfileId = string;

export type AccentTone = 'teal' | 'red' | 'gray';
export type ColorSchemePreference = 'light' | 'dark' | 'system';
export type AccentPreferenceMode = 'follow_ldpass' | 'custom';

export type TransportMode =
  'metro' | 'tram' | 'bus' | 'coach' | 'ferry' | 'railway' | 'walk' | 'custom';

export type ContentStatus =
  'draft' | 'pending_review' | 'approved' | 'scheduled' | 'published' | 'rejected' | 'archived';

export type ContentRevisionStatus =
  'draft' | 'pending_review' | 'approved' | 'rejected' | 'published' | 'archived';

export type ContentAssetStatus = 'pending_review' | 'approved' | 'rejected' | 'archived';
export type ContentAssetKind = 'image' | 'attachment';
export type ContentPublishMode = 'immediate' | 'scheduled';

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

export type ReviewDecision = 'approved' | 'rejected';

export type MapGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'MultiPoint'; coordinates: Array<[number, number]> }
  | { type: 'LineString'; coordinates: Array<[number, number]> }
  | { type: 'Rectangle'; bounds: RectangleBounds }
  | { type: 'MultiRectangle'; rectangles: RectangleBounds[] }
  | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> }
  | { type: 'MultiPolygon'; coordinates: Array<Array<Array<[number, number]>>> };

export interface RectangleBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
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

export interface PoiSubmission {
  id: string;
  profileId: YctProfileId;
  title: string;
  categoryId: string;
  geometry: MapGeometry;
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

export interface TransitLineStopSnapshot {
  stationSourceId: string;
  sequence: number;
  oneWay?: 'up' | 'down';
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

export interface TransitLineSnapshot {
  sourceId: string;
  mode: Exclude<TransportMode, 'walk'>;
  name: string;
  color?: string;
  stationSourceIds: string[];
  stops: TransitLineStopSnapshot[];
  operator?: string;
  fare?: string;
  firstLastBus?: {
    first?: string;
    last?: string;
  };
  departureTimes?: string[];
  bookingUrl?: string;
  sourcePath?: string;
}

export interface TransitStationSnapshot {
  sourceId: string;
  name: string;
  aliases: string[];
  diagramX?: number;
  diagramY?: number;
  x?: number;
  z?: number;
  sourcePath?: string;
}

export interface TransitStationLayerSnapshot {
  floor: string;
  type: string;
}

export interface TransitStationFacilitySnapshot {
  type: string;
  location?: number;
  floor?: string;
  endFloor?: string;
  direction?: string;
  oneWay?: string;
}

export interface TransitStationTransferSnapshot {
  line: string;
  floor?: string;
  direction?: string;
  location?: number;
}

export interface TransitStationExitSnapshot {
  code: string;
  description?: string;
  floor?: string;
  direction?: 'upwards' | 'downwards';
}

export interface TransitStationDetailSnapshot {
  sourceId: string;
  lineName: string;
  stationName: string;
  overGround?: boolean;
  layers: TransitStationLayerSnapshot[];
  facilities: TransitStationFacilitySnapshot[];
  transfers: TransitStationTransferSnapshot[];
  exits: TransitStationExitSnapshot[];
  surroundingStationNames: string[];
  sourcePath?: string;
}

export interface TransitModeSnapshotSummary {
  mode: Exclude<TransportMode, 'walk'>;
  label: string;
  lineCount: number;
  stationCount: number;
}

export interface TransitModeProfile {
  mode: Exclude<TransportMode, 'walk'>;
  label: string;
  color: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
  updatedAt?: ISODateTimeString;
  updatedBy?: string;
}

export interface TransitDataValidationResult {
  checkedAt: ISODateTimeString;
  errorCount: number;
  warningCount: number;
  errors: string[];
  warnings: string[];
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

export interface TravelTripInstance {
  tripInstanceId: string;
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
  sourceFiles: string[];
  serviceDate?: string;
  notice?: string;
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
