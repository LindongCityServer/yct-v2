import type { AdminContentRecord } from './content-workflow';
import type { StoredContentMetadata } from './content-store';

/** 运营消息工作台的本地草稿；保存时一次性映射为 PUT payload。 */
export interface ContentEditorDraft {
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  scheduledAt?: string;
  metadata: StoredContentMetadata;
}

export function createContentEditorDraft(record: AdminContentRecord): ContentEditorDraft {
  return {
    title: record.revision.title,
    categoryId: record.revision.categoryId,
    markdown: record.revision.markdown,
    assetIds: [...record.revision.assetIds],
    scheduledAt: record.revision.scheduledAt,
    metadata: {
      excerpt: record.metadata.excerpt,
      showInBanner: record.metadata.showInBanner,
      bannerSortOrder: record.metadata.bannerSortOrder,
      customTags: record.metadata.customTags ? [...record.metadata.customTags] : undefined,
      coverColor: record.metadata.coverColor,
      coverImageUrl: record.metadata.coverImageUrl,
      expiresAt: record.metadata.expiresAt,
      relatedPoiMarkerIds: record.metadata.relatedPoiMarkerIds
        ? [...record.metadata.relatedPoiMarkerIds]
        : [],
    },
  };
}

export function toContentDraftPayload(draft: ContentEditorDraft) {
  return {
    title: draft.title.trim(),
    categoryId: draft.categoryId,
    markdown: draft.markdown,
    assetIds: draft.assetIds,
    scheduledAt: draft.scheduledAt,
    excerpt: draft.metadata.excerpt?.trim() || undefined,
    showInBanner: draft.metadata.showInBanner,
    bannerSortOrder: draft.metadata.bannerSortOrder,
    customTags: draft.metadata.customTags,
    coverColor: draft.metadata.coverColor?.trim() || undefined,
    coverImageUrl: draft.metadata.coverImageUrl?.trim() || undefined,
    expiresAt: draft.metadata.expiresAt,
    relatedPoiMarkerIds: draft.metadata.relatedPoiMarkerIds ?? [],
  };
}
