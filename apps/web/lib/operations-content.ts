import type {
  ApiListResponse,
  OperationsContentDetail,
  OperationsFeedItem,
  OperationsFeedTag,
} from '@yct/contracts';
import { createApiMeta } from './api-meta';
import { listPublishedContentRecords } from './content-store';
import {
  readLegacyOperationDetail,
  readLegacyOperationsDetails,
  readLegacyOperationsFeed,
} from './legacy-content';

const tagKeywords: Array<{ tag: OperationsFeedTag; keywords: string[] }> = [
  { tag: 'metro', keywords: ['地铁', '轨道交通', '线网'] },
  { tag: 'bus', keywords: ['公交', '巴士', '客运'] },
  { tag: 'tram', keywords: ['有轨', '电车', '松山湖'] },
  { tag: 'ferry', keywords: ['轮渡', '渡轮', '航线', '码头'] },
];

export async function readOperationsFeed(): Promise<ApiListResponse<OperationsFeedItem>> {
  const [localDetails, legacyFeed] = await Promise.all([
    readLocalOperationsDetails(),
    readLegacyOperationsFeed(),
  ]);
  const localItems = localDetails.items.map(
    ({ markdown: _markdown, sourceKind: _sourceKind, ...item }) => item,
  );

  return {
    meta: createApiMeta(
      localItems.length > 0 || legacyFeed.items.length > 0 ? 'ready' : legacyFeed.meta.sourceStatus,
      legacyFeed.meta.message,
    ),
    items: [...localItems, ...legacyFeed.items].sort(comparePublishedAtDesc),
  };
}

export async function readOperationDetail(id: string): Promise<{
  meta: ApiListResponse<OperationsContentDetail>['meta'];
  item?: OperationsContentDetail;
}> {
  const localDetails = await readLocalOperationsDetails();
  const localItem = localDetails.items.find((item) => item.id === id);

  if (localItem) {
    return {
      meta: localDetails.meta,
      item: localItem,
    };
  }

  return readLegacyOperationDetail(id);
}

export async function readOperationsDetails(): Promise<ApiListResponse<OperationsContentDetail>> {
  const [localDetails, legacyDetails] = await Promise.all([
    readLocalOperationsDetails(),
    readLegacyOperationsDetails(),
  ]);

  return {
    meta: createApiMeta(
      localDetails.items.length > 0 || legacyDetails.items.length > 0
        ? 'ready'
        : legacyDetails.meta.sourceStatus,
      legacyDetails.meta.message,
    ),
    items: [...localDetails.items, ...legacyDetails.items].sort(comparePublishedAtDesc),
  };
}

async function readLocalOperationsDetails(): Promise<ApiListResponse<OperationsContentDetail>> {
  const records = await listPublishedContentRecords();

  return {
    meta: createApiMeta('ready'),
    items: records.map((record) => {
      const publishedAt = record.revision.publishedAt ?? record.updatedAt;
      const titleSegments = splitTitleSegments(record.revision.title);
      const title = titleSegments.join('');

      return {
        id: record.contentId,
        title,
        titleSegments: titleSegments.length > 1 ? titleSegments : undefined,
        categoryId: record.revision.categoryId,
        status: 'published',
        publishedAt,
        displayDate: publishedAt.slice(0, 10),
        expiresAt: record.metadata.expiresAt,
        displayExpireDate: record.metadata.expiresAt?.slice(0, 10),
        excerpt: record.metadata.excerpt ?? buildExcerpt(record.revision.markdown),
        showInBanner: record.metadata.showInBanner,
        tags: inferTags(
          [title, record.metadata.excerpt, record.revision.categoryId].filter(Boolean).join(' '),
        ),
        coverColor: record.metadata.coverColor,
        coverImageUrl: record.metadata.coverImageUrl,
        markdown: record.revision.markdown,
        sourceKind: 'local_content_store',
      };
    }),
  };
}

function splitTitleSegments(title: string): string[] {
  const segments = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : [title.trim() || '未命名内容'];
}

function buildExcerpt(markdown: string): string | undefined {
  const firstParagraph = markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[#*_`>\-[\]()]/g, '').trim())
    .find(Boolean);

  if (!firstParagraph) {
    return undefined;
  }

  return firstParagraph.length > 120 ? `${firstParagraph.slice(0, 120)}...` : firstParagraph;
}

function inferTags(text: string): OperationsFeedTag[] {
  return tagKeywords
    .filter((entry) => entry.keywords.some((keyword) => text.includes(keyword)))
    .map((entry) => entry.tag);
}

function comparePublishedAtDesc(left: OperationsFeedItem, right: OperationsFeedItem): number {
  return toTime(right.publishedAt) - toTime(left.publishedAt);
}

function toTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
