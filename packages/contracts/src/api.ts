import type { ContentSummary, ISODateTimeString, ServiceEntry } from './domain';

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

export interface LegacyAssetManifestEntry {
  id: string;
  kind: LegacyAssetReferenceKind;
  contentId: string;
  contentTitle: string;
  originalValue: string;
  sourceUrl: string;
  migratedPath?: string;
  sourcePageUrl?: string;
  downloadable: boolean;
}

export interface LegacyAssetManifest {
  summary: {
    contentCount: number;
    pageCount: number;
    referenceCount: number;
    downloadableCount: number;
  };
  entries: LegacyAssetManifestEntry[];
  sourceFiles: string[];
}
