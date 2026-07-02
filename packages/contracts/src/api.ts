import type { ContentAsset, ContentSummary, ISODateTimeString, ServiceEntry } from './domain';

export type DataSourceStatus = 'ready' | 'not_configured' | 'unavailable';

export interface ApiMeta {
  generatedAt: ISODateTimeString;
  sourceStatus: DataSourceStatus;
  message?: string;
}

export interface ApiListResponse<TItem> {
  meta: ApiMeta;
  items: TItem[];
}

export interface ApiItemResponse<TItem> {
  meta: ApiMeta;
  item?: TItem;
}

export type OperationsFeedTag = 'metro' | 'bus' | 'tram' | 'ferry';

export interface OperationsFeedItem extends ContentSummary {
  titleSegments?: string[];
  displayDate?: string;
  expiresAt?: string;
  displayExpireDate?: string;
  showInBanner: boolean;
  tags: OperationsFeedTag[];
  coverColor?: string;
  coverImageUrl?: string;
  legacyImagePath?: string;
  migratedImagePath?: string;
  legacyImageSourceUrl?: string;
  legacyLink?: string;
  legacySourcePath?: string;
}

export interface OperationsContentDetail extends OperationsFeedItem {
  markdown: string;
  sourceKind: 'legacy_content_data' | 'local_content_store';
}

export interface ServiceEntryGroup {
  categoryId: ServiceEntry['categoryId'];
  title: string;
  items: ServiceEntry[];
}

export type LegacyAssetReferenceKind = 'content_cover' | 'legacy_page' | 'html_asset' | 'html_link';
export type LegacyAssetOriginKind = 'legacy_origin' | 'external';
export type LegacyAssetManifestIssueKind =
  | 'external_reference'
  | 'not_downloadable'
  | 'missing_migrated_path'
  | 'missing_local_file'
  | 'duplicate_reference'
  | 'duplicate_resource';
export type LegacyAssetManifestIssueSeverity = 'info' | 'warning' | 'error';

export interface LegacyAssetManifestEntry {
  id: string;
  kind: LegacyAssetReferenceKind;
  contentId: string;
  contentTitle: string;
  originalValue: string;
  sourceUrl: string;
  sourceOrigin: string;
  originKind: LegacyAssetOriginKind;
  migratedPath?: string;
  sourcePageUrl?: string;
  downloadable: boolean;
}

export interface LegacyAssetManifestIssue {
  id: string;
  kind: LegacyAssetManifestIssueKind;
  severity: LegacyAssetManifestIssueSeverity;
  message: string;
  entryId?: string;
  duplicateOfEntryId?: string;
  relatedEntryIds?: string[];
  contentId?: string;
  contentTitle?: string;
  sourceUrl?: string;
  migratedPath?: string;
  sourcePageUrl?: string;
  occurrenceCount?: number;
}

export interface LegacyAssetDuplicateResource {
  id: string;
  sourceUrl: string;
  migratedPath: string;
  entryIds: string[];
  contentIds: string[];
  contentTitles: string[];
  occurrenceCount: number;
}

export interface LegacyAssetManifest {
  summary: {
    contentCount: number;
    pageCount: number;
    rawReferenceCount: number;
    referenceCount: number;
    downloadableCount: number;
    sameOriginCount: number;
    externalCount: number;
    notDownloadableCount: number;
    missingMigratedPathCount: number;
    missingLocalFileCount: number;
    duplicateReferenceCount: number;
    duplicateResourceCount: number;
    issueCount: number;
    byKind: Record<LegacyAssetReferenceKind, number>;
  };
  entries: LegacyAssetManifestEntry[];
  issues: LegacyAssetManifestIssue[];
  duplicateResources: LegacyAssetDuplicateResource[];
  sourceFiles: string[];
}

export interface LegacyContentAssetReference {
  entryId: string;
  referenceKind: LegacyAssetReferenceKind;
  contentId: string;
  contentTitle: string;
  sourcePageUrl?: string;
}

export interface LegacyContentAssetInventoryItem {
  asset: ContentAsset;
  migratedPath: string;
  sha256?: string;
  references: LegacyContentAssetReference[];
  duplicateGroupId?: string;
}

export interface LegacyContentAssetDuplicateGroup {
  id: string;
  sha256: string;
  assetIds: string[];
  migratedPaths: string[];
  sourceUrls: string[];
  referenceCount: number;
}

export interface LegacyContentAssetInventory {
  summary: {
    assetCount: number;
    referenceCount: number;
    pendingReviewCount: number;
    approvedCount: number;
    rejectedCount: number;
    missingHashCount: number;
    reusedAssetCount: number;
    deduplicatedReferenceCount: number;
    duplicateGroupCount: number;
    duplicateAssetCount: number;
    totalSizeBytes: number;
  };
  items: LegacyContentAssetInventoryItem[];
  duplicateGroups: LegacyContentAssetDuplicateGroup[];
}

export interface LegacyHtmlContentMigrationItem {
  contentId: string;
  contentTitle: string;
  sourceUrl: string;
  sourcePath: string;
  markdown: string;
  markdownLength: number;
  imageCount: number;
  linkCount: number;
  warnings: string[];
}

export interface LegacyHtmlContentMigrationPreview {
  summary: {
    pageCount: number;
    convertedCount: number;
    warningCount: number;
  };
  items: LegacyHtmlContentMigrationItem[];
}
