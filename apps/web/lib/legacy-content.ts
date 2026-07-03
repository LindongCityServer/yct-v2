import type {
  ApiListResponse,
  OperationsContentDetail,
  OperationsFeedItem,
  OperationsFeedTag,
} from '@yct/contracts';
import type { LegacyContentImportItemInput } from '@yct/schemas';
import { parseLegacyContentSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import {
  resolveLegacyAssetDisplayUrl,
  resolveLegacyAssetReference,
  rewriteLegacyMarkdownAssets,
} from './legacy-assets';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyDataSourceFile,
} from './legacy-data-source';
import { readRuntimeConfig } from './runtime-config';

const tagKeywords: Array<{ tag: OperationsFeedTag; keywords: string[] }> = [
  { tag: 'metro', keywords: ['地铁', '轨道交通', '线网'] },
  { tag: 'bus', keywords: ['公交', '巴士', '客运'] },
  { tag: 'tram', keywords: ['有轨', '电车', '松山湖'] },
  { tag: 'ferry', keywords: ['轮渡', '渡轮', '航线', '码头'] },
];

export async function readLegacyOperationsFeed(): Promise<ApiListResponse<OperationsFeedItem>> {
  const detailResponse = await readLegacyOperationsDetails();

  return {
    meta: detailResponse.meta,
    items: detailResponse.items.map(
      ({ markdown: _markdown, sourceKind: _sourceKind, ...item }) => item,
    ),
  };
}

export async function readLegacyOperationsDetails(): Promise<
  ApiListResponse<OperationsContentDetail>
> {
  const config = readRuntimeConfig();

  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '内容数据源尚未接入，当前不返回示例数据。'),
      items: [],
    };
  }

  try {
    const legacyFile = await readLegacyDataSourceFile(config, 'content_data.js');
    const importedItems = parseLegacyContentSource(legacyFile.source, legacyFile.sourcePath);
    const items = importedItems.map((item) => mapLegacyContentItem(item, config));

    return {
      meta: createApiMeta('ready'),
      items,
    };
  } catch (error) {
    if (error instanceof LegacyDataSourceNotConfiguredError) {
      return {
        meta: createApiMeta('not_configured', error.message),
        items: [],
      };
    }

    return {
      meta: createApiMeta('unavailable', '旧内容数据读取失败。'),
      items: [],
    };
  }
}

export async function readLegacyOperationDetail(id: string): Promise<{
  meta: ApiListResponse<OperationsContentDetail>['meta'];
  item?: OperationsContentDetail;
}> {
  const details = await readLegacyOperationsDetails();
  return {
    meta: details.meta,
    item: details.items.find((item) => item.id === id),
  };
}

function mapLegacyContentItem(
  item: LegacyContentImportItemInput,
  config: ReturnType<typeof readRuntimeConfig>,
): OperationsContentDetail {
  const coverColor = normalizeCoverColor(item.image);
  const coverImageUrl = coverColor ? undefined : normalizeCoverImageUrl(item.image);
  const legacyImageAsset = coverColor
    ? undefined
    : resolveLegacyAssetReference({
        value: item.image,
        legacyPublicBaseUrl: config.legacyPublicBaseUrl,
        migratedPublicPrefix: config.legacyAssetPublicPrefix,
      });
  const titleSegments = splitLegacyTitleSegments(item.title);
  const normalizedTitle = titleSegments.join('');
  const rewrittenMarkdown = rewriteLegacyMarkdownAssets({
    markdown: item.markdown,
    legacyPublicBaseUrl: config.legacyPublicBaseUrl,
    migratedPublicPrefix: config.legacyAssetPublicPrefix,
  });
  const markdown = isSummaryOnlyLegacyMarkdown(item, rewrittenMarkdown) ? '' : rewrittenMarkdown;

  return {
    id: item.sourceId,
    title: normalizedTitle,
    titleSegments: titleSegments.length > 1 ? titleSegments : undefined,
    categoryId: item.categoryId,
    status: 'published',
    publishedAt: normalizeLegacyDate(item.date),
    displayDate: item.date,
    expiresAt: normalizeLegacyDate(item.expireDate),
    displayExpireDate: item.expireDate,
    excerpt: item.summary,
    showInBanner: Boolean(item.showInBanner),
    tags: inferTags([normalizedTitle, item.summary, item.categoryId].filter(Boolean).join(' ')),
    coverColor,
    coverImageUrl: coverImageUrl ?? resolveLegacyAssetDisplayUrl(legacyImageAsset),
    legacyImagePath: coverColor || coverImageUrl ? undefined : item.image,
    migratedImagePath: legacyImageAsset?.migratedPath,
    legacyImageSourceUrl: legacyImageAsset?.sourceUrl,
    legacyLink: normalizeLegacyLink(item.link, config.legacyPublicBaseUrl),
    legacySourcePath: item.sourcePath,
    markdown,
    sourceKind: 'legacy_content_data',
  };
}

function isSummaryOnlyLegacyMarkdown(
  item: LegacyContentImportItemInput,
  markdown: string,
): boolean {
  const normalizedMarkdown = normalizeBodyText(markdown);
  if (!normalizedMarkdown) {
    return true;
  }

  const comparableTexts = [
    item.summary,
    item.title,
    item.title.replace(/\|+/g, ''),
    '旧内容无独立正文',
  ].map(normalizeBodyText);

  return comparableTexts.some((text) => text && text === normalizedMarkdown);
}

function normalizeBodyText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function splitLegacyTitleSegments(title: string): string[] {
  const segments = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    return segments;
  }

  const normalizedTitle = title.replace(/\|+/g, '').trim();
  return [normalizedTitle || '未命名内容'];
}

function inferTags(text: string): OperationsFeedTag[] {
  return tagKeywords
    .filter((entry) => entry.keywords.some((keyword) => text.includes(keyword)))
    .map((entry) => entry.tag);
}

function normalizeCoverColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  const semanticColorMap: Record<string, string> = {
    '--metro-color': 'var(--yct-color-secondary)',
    '--bus-color': 'var(--yct-color-tertiary)',
    '--tram-color': 'var(--yct-color-tram)',
    '--ferry-color': 'var(--yct-color-ferry)',
    '--local-railway-color': 'var(--yct-color-railway)',
    '--railway-color': 'var(--yct-color-railway)',
    '--coach-color': 'var(--yct-color-coach)',
  };

  if (semanticColorMap[trimmed]) {
    return semanticColorMap[trimmed];
  }

  if (/^var\(--[-_a-zA-Z0-9]+\)$/.test(trimmed)) {
    return trimmed;
  }

  if (/^--[-_a-zA-Z0-9]+$/.test(trimmed)) {
    return `var(${trimmed})`;
  }

  return undefined;
}

function normalizeCoverImageUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || normalizeCoverColor(trimmed)) {
    return undefined;
  }

  return trimmed.startsWith('https://') || trimmed.startsWith('http://') ? trimmed : undefined;
}

function normalizeLegacyLink(value: string | undefined, baseUrl: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function normalizeLegacyDate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized =
    trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : `${trimmed.replace(' ', 'T')}:00.000Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
