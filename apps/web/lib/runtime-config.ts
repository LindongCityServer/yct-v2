import type { PushNotificationType } from '@yct/contracts';
import { appPath } from './app-paths';

export interface RuntimeConfig {
  siteUrl: string;
  ldpassBaseUrl?: string;
  ldpassClientId?: string;
  yctUserLinkStorePath: string;
  adminStorePath: string;
  contentStorePath: string;
  contentAssetStorePath: string;
  contentAssetUploadDir: string;
  serviceEntryStorePath: string;
  transitDataStorePath: string;
  transitModeProfileStorePath: string;
  travelServiceProfileStorePath: string;
  ticketingCatalogStorePath: string;
  poiSubmissionStorePath: string;
  offlinePackageStorePath: string;
  eventOutboxStorePath: string;
  notificationPreferenceStorePath: string;
  pushSubscriptionStorePath: string;
  pushDeliveryStorePath: string;
  webPushSubject?: string;
  webPushPublicKey?: string;
  webPushPrivateKey?: string;
  pushDefaultEnabledTypes: PushNotificationType[];
  pushDeliveryMinIntervalMs: number;
  internalTaskToken?: string;
  tripReminderStorePath: string;
  tileFreshHttpTemplate?: string;
  tileSafeHttpsStaticTemplate?: string;
  unminedMapBaseUrl: string;
  markerBdslmBaseUrl?: string;
  markerBdslmTimeoutMs: number;
  legacyDataSource: 'auto' | 'local' | 'remote';
  legacyDataDir?: string;
  legacyDataRemoteBaseUrl: string;
  legacyDataFetchTimeoutMs: number;
  legacyPublicBaseUrl: string;
  flightDataUrl: string;
  legacyAssetPublicPrefix: string;
  legacyAssetDownloadReportPath: string;
  poiIconCandidates: Array<{
    categoryHint: string;
    fileName: string;
  }>;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readRuntimeConfig(): RuntimeConfig {
  return {
    siteUrl: emptyToUndefined(process.env.YCT_PUBLIC_SITE_URL) ?? 'http://localhost:3000',
    ldpassBaseUrl: emptyToUndefined(process.env.LDPASS_BASE_URL),
    ldpassClientId: emptyToUndefined(process.env.LDPASS_CLIENT_ID),
    yctUserLinkStorePath:
      emptyToUndefined(process.env.YCT_USER_LINK_STORE_PATH) ?? '.yct-data/yct-user-links.json',
    adminStorePath:
      emptyToUndefined(process.env.YCT_ADMIN_STORE_PATH) ?? '.yct-data/admin-memberships.json',
    contentStorePath:
      emptyToUndefined(process.env.YCT_CONTENT_STORE_PATH) ?? '.yct-data/content-store.json',
    contentAssetStorePath:
      emptyToUndefined(process.env.YCT_CONTENT_ASSET_STORE_PATH) ??
      '.yct-data/content-asset-store.json',
    contentAssetUploadDir:
      emptyToUndefined(process.env.YCT_CONTENT_ASSET_UPLOAD_DIR) ??
      'apps/web/public/content-assets',
    serviceEntryStorePath:
      emptyToUndefined(process.env.YCT_SERVICE_ENTRY_STORE_PATH) ??
      '.yct-data/service-entry-store.json',
    transitDataStorePath:
      emptyToUndefined(process.env.YCT_TRANSIT_DATA_STORE_PATH) ??
      '.yct-data/transit-data-store.json',
    transitModeProfileStorePath:
      emptyToUndefined(process.env.YCT_TRANSIT_MODE_PROFILE_STORE_PATH) ??
      '.yct-data/transit-mode-profile-store.json',
    travelServiceProfileStorePath:
      emptyToUndefined(process.env.YCT_TRAVEL_SERVICE_PROFILE_STORE_PATH) ??
      '.yct-data/travel-service-profile-store.json',
    ticketingCatalogStorePath:
      emptyToUndefined(process.env.YCT_TICKETING_CATALOG_STORE_PATH) ??
      '.yct-data/ticketing-catalog-store.json',
    poiSubmissionStorePath:
      emptyToUndefined(process.env.YCT_POI_SUBMISSION_STORE_PATH) ??
      '.yct-data/poi-submission-store.json',
    offlinePackageStorePath:
      emptyToUndefined(process.env.YCT_OFFLINE_PACKAGE_STORE_PATH) ??
      '.yct-data/offline-package-store.json',
    eventOutboxStorePath:
      emptyToUndefined(process.env.YCT_EVENT_OUTBOX_STORE_PATH) ??
      '.yct-data/event-outbox-store.json',
    notificationPreferenceStorePath:
      emptyToUndefined(process.env.YCT_NOTIFICATION_PREFERENCE_STORE_PATH) ??
      '.yct-data/notification-preference-store.json',
    pushSubscriptionStorePath:
      emptyToUndefined(process.env.YCT_PUSH_SUBSCRIPTION_STORE_PATH) ??
      '.yct-data/push-subscription-store.json',
    pushDeliveryStorePath:
      emptyToUndefined(process.env.YCT_PUSH_DELIVERY_STORE_PATH) ??
      '.yct-data/push-delivery-store.json',
    webPushSubject: emptyToUndefined(process.env.YCT_WEB_PUSH_SUBJECT),
    webPushPublicKey:
      emptyToUndefined(process.env.YCT_WEB_PUSH_PUBLIC_KEY) ??
      emptyToUndefined(process.env.NEXT_PUBLIC_YCT_WEB_PUSH_PUBLIC_KEY),
    webPushPrivateKey: emptyToUndefined(process.env.YCT_WEB_PUSH_PRIVATE_KEY),
    pushDefaultEnabledTypes: parsePushNotificationTypes(
      emptyToUndefined(process.env.YCT_PUSH_DEFAULT_ENABLED_TYPES) ??
        emptyToUndefined(process.env.NEXT_PUBLIC_YCT_PUSH_DEFAULT_ENABLED_TYPES),
    ),
    pushDeliveryMinIntervalMs: parseNonNegativeInteger(
      process.env.YCT_PUSH_DELIVERY_MIN_INTERVAL_MS,
      5 * 60 * 1000,
    ),
    internalTaskToken: emptyToUndefined(process.env.YCT_INTERNAL_TASK_TOKEN),
    tripReminderStorePath:
      emptyToUndefined(process.env.YCT_TRIP_REMINDER_STORE_PATH) ??
      '.yct-data/trip-reminder-store.json',
    tileFreshHttpTemplate: emptyToUndefined(process.env.YCT_TILE_FRESH_HTTP_TEMPLATE),
    tileSafeHttpsStaticTemplate: emptyToUndefined(process.env.YCT_TILE_SAFE_HTTPS_STATIC_TEMPLATE),
    unminedMapBaseUrl:
      emptyToUndefined(process.env.YCT_UNMINED_MAP_BASE_URL) ?? 'https://map.shangxiaoguan.top/',
    markerBdslmBaseUrl: emptyToUndefined(process.env.YCT_MARKER_BDSLM_BASE_URL),
    markerBdslmTimeoutMs: Number(process.env.YCT_MARKER_BDSLM_TIMEOUT_MS ?? 6000),
    legacyDataSource: parseLegacyDataSource(process.env.YCT_LEGACY_DATA_SOURCE),
    legacyDataDir: emptyToUndefined(process.env.YCT_LEGACY_DATA_DIR),
    legacyDataRemoteBaseUrl:
      emptyToUndefined(process.env.YCT_LEGACY_DATA_REMOTE_BASE_URL) ??
      'https://yct.shangxiaoguan.top/data',
    legacyDataFetchTimeoutMs: parsePositiveInteger(
      process.env.YCT_LEGACY_DATA_FETCH_TIMEOUT_MS,
      8000,
    ),
    legacyPublicBaseUrl:
      emptyToUndefined(process.env.YCT_LEGACY_PUBLIC_BASE_URL) ?? 'https://yct.shangxiaoguan.top',
    flightDataUrl:
      emptyToUndefined(process.env.YCT_FLIGHT_DATA_URL) ??
      'https://haojin.guanmu233.cn/data/flight_data.txt',
    legacyAssetPublicPrefix:
      emptyToUndefined(process.env.YCT_LEGACY_ASSET_PUBLIC_PREFIX) ?? appPath('/legacy-assets'),
    legacyAssetDownloadReportPath:
      emptyToUndefined(process.env.YCT_LEGACY_ASSET_DOWNLOAD_REPORT_PATH) ??
      '.yct-data/legacy-assets-download-report.json',
    poiIconCandidates: parsePoiIconCandidates(process.env.YCT_POI_ICON_CANDIDATES),
  };
}

function parseLegacyDataSource(value: string | undefined): RuntimeConfig['legacyDataSource'] {
  const trimmed = value?.trim();
  return trimmed === 'local' || trimmed === 'remote' || trimmed === 'auto' ? trimmed : 'auto';
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function parsePushNotificationTypes(value: string | undefined): PushNotificationType[] {
  const allTypes: PushNotificationType[] = ['trip', 'operations', 'ticket', 'check_in'];
  const trimmed = emptyToUndefined(value);
  if (!trimmed) {
    return allTypes;
  }

  const validTypes = new Set<PushNotificationType>(allTypes);
  const parsed = Array.from(
    new Set(
      trimmed
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is PushNotificationType =>
          validTypes.has(item as PushNotificationType),
        ),
    ),
  );

  return parsed.length > 0 ? parsed : allTypes;
}

function parsePoiIconCandidates(value: string | undefined): RuntimeConfig['poiIconCandidates'] {
  const trimmed = emptyToUndefined(value);
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(';')
    .map((group) => group.trim())
    .filter(Boolean)
    .flatMap((group) => {
      const [categoryHint, fileNamesText] = group.split(':', 2);
      const category = categoryHint?.trim();
      if (!category || !fileNamesText) {
        return [];
      }

      return fileNamesText
        .split(',')
        .map((fileName) => fileName.trim())
        .filter(Boolean)
        .map((fileName) => ({
          categoryHint: category,
          fileName,
        }));
    });
}
