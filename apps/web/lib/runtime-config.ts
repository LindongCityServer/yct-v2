export interface RuntimeConfig {
  siteUrl: string;
  ldpassBaseUrl?: string;
  ldpassClientId?: string;
  adminStorePath: string;
  contentStorePath: string;
  serviceEntryStorePath: string;
  transitDataStorePath: string;
  transitModeProfileStorePath: string;
  poiSubmissionStorePath: string;
  tileFreshHttpTemplate?: string;
  tileSafeHttpsStaticTemplate?: string;
  unminedMapBaseUrl: string;
  markerBdslmBaseUrl?: string;
  markerBdslmTimeoutMs: number;
  legacyDataSource: 'auto' | 'local' | 'remote';
  legacyDataDir?: string;
  legacyDataRemoteBaseUrl: string;
  legacyPublicBaseUrl: string;
  legacyAssetPublicPrefix: string;
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
    adminStorePath:
      emptyToUndefined(process.env.YCT_ADMIN_STORE_PATH) ?? '.yct-data/admin-memberships.json',
    contentStorePath:
      emptyToUndefined(process.env.YCT_CONTENT_STORE_PATH) ?? '.yct-data/content-store.json',
    serviceEntryStorePath:
      emptyToUndefined(process.env.YCT_SERVICE_ENTRY_STORE_PATH) ??
      '.yct-data/service-entry-store.json',
    transitDataStorePath:
      emptyToUndefined(process.env.YCT_TRANSIT_DATA_STORE_PATH) ??
      '.yct-data/transit-data-store.json',
    transitModeProfileStorePath:
      emptyToUndefined(process.env.YCT_TRANSIT_MODE_PROFILE_STORE_PATH) ??
      '.yct-data/transit-mode-profile-store.json',
    poiSubmissionStorePath:
      emptyToUndefined(process.env.YCT_POI_SUBMISSION_STORE_PATH) ??
      '.yct-data/poi-submission-store.json',
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
    legacyPublicBaseUrl:
      emptyToUndefined(process.env.YCT_LEGACY_PUBLIC_BASE_URL) ?? 'https://yct.shangxiaoguan.top',
    legacyAssetPublicPrefix:
      emptyToUndefined(process.env.YCT_LEGACY_ASSET_PUBLIC_PREFIX) ?? '/legacy-assets',
    poiIconCandidates: parsePoiIconCandidates(process.env.YCT_POI_ICON_CANDIDATES),
  };
}

function parseLegacyDataSource(value: string | undefined): RuntimeConfig['legacyDataSource'] {
  const trimmed = value?.trim();
  return trimmed === 'local' || trimmed === 'remote' || trimmed === 'auto' ? trimmed : 'auto';
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
