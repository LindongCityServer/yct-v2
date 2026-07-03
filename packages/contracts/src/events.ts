import type {
  AccentTone,
  ISODateTimeString,
  MapGeometry,
  RectangleBounds,
  ReviewDecision,
  ServiceEntryCategory,
  TicketableServiceKind,
  TransitModeProfile,
  TransitModeSnapshotSummary,
  TravelScheduleServiceProfile,
  TripReminderSource,
  TileProviderSourceKind,
  TransportMode,
  PushNotificationType,
  PushDeliverySourceType,
  PushDeliveryStatus,
  TicketOrderCancellationReason,
  TicketOrderStatus,
  TicketRefundStatus,
  YctProfileId,
} from './domain';

export interface YctDomainEvent<TType extends string, TPayload> {
  eventId: string;
  type: TType;
  occurredAt: ISODateTimeString;
  profileId: YctProfileId;
  actor: {
    type: 'anonymous' | 'user' | 'admin' | 'system' | 'adapter';
    id?: string;
  };
  payload: TPayload;
}

export interface ContentSubmittedPayload {
  contentId: string;
  revisionId: string;
  title: string;
  categoryId: string;
}

export interface ContentReviewedPayload {
  contentId: string;
  revisionId: string;
  decision: ReviewDecision;
  reviewerId: string;
  reason?: string;
}

export interface ContentPublishedPayload {
  contentId: string;
  revisionId: string;
  publishedAt: ISODateTimeString;
}

export interface ContentAssetImportedPayload {
  assetId: string;
  fileName: string;
  url: string;
  sourceUrl?: string;
  sha256?: string;
  referenceCount: number;
}

export interface ContentAssetUploadedPayload {
  assetId: string;
  fileName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ContentAssetReviewedPayload {
  assetId: string;
  decision: ReviewDecision;
  reviewerId: string;
  reason?: string;
}

export interface PoiSubmittedPayload {
  poiId: string;
  revisionId?: string;
  title?: string;
  categoryId: string;
  geometry: MapGeometry;
}

export interface PoiReviewedPayload {
  poiId: string;
  revisionId?: string;
  decision: ReviewDecision;
  reviewerId: string;
  reason?: string;
}

export interface PoiPublishedPayload {
  poiId: string;
  categoryId: string;
  geometry: MapGeometry;
  publishedAt: ISODateTimeString;
}

export interface TransitDataRevisionSubmittedPayload {
  datasetId: string;
  revisionId: string;
  dataKind: Exclude<TransportMode, 'walk'> | 'schedule' | 'transit_dataset';
  sourceProviderId: string;
  summary: {
    lineCount: number;
    stationCount: number;
  };
}

export interface TransitDataRevisionImportedPayload {
  datasetId: string;
  revisionId: string;
  sourceProviderId: string;
  sourceFiles: string[];
  summary: TransitModeSnapshotSummary[];
}

export interface TransitDataRevisionReviewedPayload {
  datasetId: string;
  revisionId: string;
  decision: ReviewDecision;
  reviewerId: string;
  reason?: string;
}

export interface TransitDataRevisionPublishedPayload {
  datasetId: string;
  revisionId: string;
  publishedAt: ISODateTimeString;
}

export interface TransitModeProfileUpdatedPayload {
  modes: TransitModeProfile[];
  updatedBy: string;
  updatedAt: ISODateTimeString;
}

export interface TileProviderSelectedPayload {
  providerId: string;
  sourceKind: TileProviderSourceKind;
  reason: 'default' | 'mixed-content-risk' | 'admin-override' | 'profile-config';
}

export interface TripReminderScheduledPayload {
  reminderId: string;
  userId?: string;
  localDeviceId?: string;
  title?: string;
  source?: TripReminderSource;
  remindAt: ISODateTimeString;
}

export interface TripReminderDeletedPayload {
  userId: string;
  reminderIds: string[];
  source?: TripReminderSource;
  deletedAt: ISODateTimeString;
  reason: 'user_requested' | 'legacy_sync_consent_revoked' | 'system';
}

export interface PushPreferenceUpdatedPayload {
  userId: string;
  enabledTypes: PushNotificationType[];
  quietHoursEnabled: boolean;
}

export interface PushDeviceSubscribedPayload {
  userId: string;
  subscriptionId: string;
  endpointHost: string;
}

export interface PushDeviceSubscriptionRevokedPayload {
  userId: string;
  subscriptionId: string;
  revokedAt: ISODateTimeString;
}

export interface PushDeliveryQueuedPayload {
  deliveryId: string;
  userId: string;
  sourceType: PushDeliverySourceType;
  sourceId: string;
  dueAt: ISODateTimeString;
}

export interface PushDeliveryCompletedPayload {
  deliveryId: string;
  userId: string;
  subscriptionId?: string;
  status: PushDeliveryStatus;
  completedAt: ISODateTimeString;
  errorCode?: string;
}

export interface OfflinePackageRequestedPayload {
  userId: string;
  packageId: string;
  bounds: RectangleBounds;
}

export interface OfflinePackageRequestDeletedPayload {
  userId: string;
  packageId: string;
  deletedAt: ISODateTimeString;
}

export interface LdpassThemeScheduleSyncedPayload {
  activeTone: AccentTone;
  startsAt: ISODateTimeString;
  endsAt?: ISODateTimeString;
}

export interface LdpassUserLinkedPayload {
  yctUserLinkId: string;
  ldpassUserId: string;
  usernameSnapshot: string;
  serverAccountVerifiedSnapshot: boolean;
}

export interface YctSessionStartedPayload {
  ldpassUserId: string;
  authenticated: boolean;
  readonly: boolean;
}

export interface YctSessionEndedPayload {
  ldpassUserId?: string;
  reason: 'user_logout' | 'state_invalid' | 'session_expired' | 'system';
}

export interface ServiceEntrySubmittedPayload {
  serviceEntryId: string;
  title: string;
  categoryId: ServiceEntryCategory;
  href: string;
}

export interface ServiceEntryReviewedPayload {
  serviceEntryId: string;
  decision: ReviewDecision;
  reviewerId: string;
  reason?: string;
}

export interface ServiceEntryPublishedPayload {
  serviceEntryId: string;
  categoryId: ServiceEntryCategory;
  href: string;
  publishedAt: ISODateTimeString;
}

export interface TravelSchedulePublishedPayload {
  scheduleServiceId: string;
  serviceKind: TicketableServiceKind;
  revisionId: string;
  publishedAt: ISODateTimeString;
  tripInstanceCount: number;
}

export interface TravelScheduleServiceProfileUpdatedPayload {
  services: TravelScheduleServiceProfile[];
  updatedBy: string;
  updatedAt: ISODateTimeString;
}

export interface TicketInventoryHeldPayload {
  inventoryHoldId: string;
  tripInstanceId: string;
  fareProductId: string;
  userId: string;
  quantity: number;
  expiresAt: ISODateTimeString;
}

export interface TicketInventoryHoldExpiredPayload {
  inventoryHoldId: string;
  tripInstanceId: string;
  releasedQuantity: number;
  expiredAt: ISODateTimeString;
}

export interface TicketOrderCreatedPayload {
  orderId: string;
  userId: string;
  ldpassUserId: string;
  scheduleId: string;
  serviceKind?: TicketableServiceKind;
  tripInstanceId?: string;
  fareProductId?: string;
  inventoryHoldId?: string;
  passengerCount?: number;
  status?: TicketOrderStatus;
}

export interface TicketIssuedPayload {
  orderId: string;
  ticketId: string;
  ldpassPassId?: string;
  actionLinkId?: string;
  issuedAt: ISODateTimeString;
}

export interface TicketRedemptionLinkedPayload {
  orderId: string;
  ldpassPassId?: string;
  actionLinkId?: string;
  redemptionRequestId?: string;
}

export interface TicketCheckedInPayload {
  orderId: string;
  ticketId: string;
  stationId?: string;
  checkedInAt: ISODateTimeString;
  redemptionRequestId?: string;
}

export interface TicketRefundRequestedPayload {
  orderId: string;
  ticketId: string;
  requestedAt: ISODateTimeString;
  reason?: string;
}

export interface TicketRefundCompletedPayload {
  orderId: string;
  ticketId: string;
  refundedAt: ISODateTimeString;
  amount?: number;
  status?: TicketRefundStatus;
}

export interface TicketOrderCancelledPayload {
  orderId: string;
  cancelledAt: ISODateTimeString;
  reason: TicketOrderCancellationReason;
}

export interface LdpassTicketStatusSyncedPayload {
  orderId: string;
  externalStatus: string;
  syncedAt: ISODateTimeString;
}

export interface AdminInitializedPayload {
  adminMembershipId: string;
  ldpassUserId: string;
  role: 'super_admin';
}

export type YctEventPayloadMap = {
  ContentSubmitted: ContentSubmittedPayload;
  ContentReviewed: ContentReviewedPayload;
  ContentPublished: ContentPublishedPayload;
  ContentAssetImported: ContentAssetImportedPayload;
  ContentAssetUploaded: ContentAssetUploadedPayload;
  ContentAssetReviewed: ContentAssetReviewedPayload;
  PoiSubmitted: PoiSubmittedPayload;
  PoiReviewed: PoiReviewedPayload;
  PoiPublished: PoiPublishedPayload;
  TransitDataRevisionImported: TransitDataRevisionImportedPayload;
  TransitDataRevisionSubmitted: TransitDataRevisionSubmittedPayload;
  TransitDataRevisionReviewed: TransitDataRevisionReviewedPayload;
  TransitDataRevisionPublished: TransitDataRevisionPublishedPayload;
  TransitModeProfileUpdated: TransitModeProfileUpdatedPayload;
  TileProviderSelected: TileProviderSelectedPayload;
  TripReminderScheduled: TripReminderScheduledPayload;
  TripReminderDeleted: TripReminderDeletedPayload;
  PushPreferenceUpdated: PushPreferenceUpdatedPayload;
  PushDeviceSubscribed: PushDeviceSubscribedPayload;
  PushDeviceSubscriptionRevoked: PushDeviceSubscriptionRevokedPayload;
  PushDeliveryQueued: PushDeliveryQueuedPayload;
  PushDeliveryCompleted: PushDeliveryCompletedPayload;
  OfflinePackageRequested: OfflinePackageRequestedPayload;
  OfflinePackageRequestDeleted: OfflinePackageRequestDeletedPayload;
  LdpassThemeScheduleSynced: LdpassThemeScheduleSyncedPayload;
  LdpassUserLinked: LdpassUserLinkedPayload;
  YctSessionStarted: YctSessionStartedPayload;
  YctSessionEnded: YctSessionEndedPayload;
  ServiceEntrySubmitted: ServiceEntrySubmittedPayload;
  ServiceEntryReviewed: ServiceEntryReviewedPayload;
  ServiceEntryPublished: ServiceEntryPublishedPayload;
  TravelSchedulePublished: TravelSchedulePublishedPayload;
  TravelScheduleServiceProfileUpdated: TravelScheduleServiceProfileUpdatedPayload;
  TicketInventoryHeld: TicketInventoryHeldPayload;
  TicketInventoryHoldExpired: TicketInventoryHoldExpiredPayload;
  TicketOrderCreated: TicketOrderCreatedPayload;
  TicketOrderCancelled: TicketOrderCancelledPayload;
  TicketIssued: TicketIssuedPayload;
  TicketRedemptionLinked: TicketRedemptionLinkedPayload;
  TicketCheckedIn: TicketCheckedInPayload;
  TicketRefundRequested: TicketRefundRequestedPayload;
  TicketRefundCompleted: TicketRefundCompletedPayload;
  LdpassTicketStatusSynced: LdpassTicketStatusSyncedPayload;
  AdminInitialized: AdminInitializedPayload;
};

export type YctEventType = keyof YctEventPayloadMap;

export type YctEvent<TType extends YctEventType = YctEventType> = {
  [K in YctEventType]: YctDomainEvent<K, YctEventPayloadMap[K]>;
}[TType];
