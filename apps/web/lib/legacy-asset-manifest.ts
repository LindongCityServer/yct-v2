import type {
  ApiItemResponse,
  LegacyAssetManifest,
  LegacyAssetManifestEntry,
  LegacyAssetReferenceKind,
} from '@yct/contracts';
import type { LegacyContentImportItemInput } from '@yct/schemas';
import { parseLegacyContentSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import { resolveLegacyAssetReference } from './legacy-assets';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyDataSourceFile,
  readLegacyPublicFile,
} from './legacy-data-source';
import { readRuntimeConfig, type RuntimeConfig } from './runtime-config';

interface PendingLegacyReference {
  kind: LegacyAssetReferenceKind;
  contentId: string;
  contentTitle: string;
  originalValue: string;
  sourceUrl: string;
  migratedPath?: string;
  sourcePageUrl?: string;
  downloadable: boolean;
}

export async function readLegacyAssetManifest(): Promise<ApiItemResponse<LegacyAssetManifest>> {
  const config = readRuntimeConfig();

  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧内容资源数据源尚未配置。'),
    };
  }

  try {
    const legacyFile = await readLegacyDataSourceFile(config, 'content_data.js');
    const contentItems = parseLegacyContentSource(legacyFile.source, legacyFile.sourcePath);
    const pendingEntries: PendingLegacyReference[] = [];
    const sourceFiles = new Set([legacyFile.sourcePath]);
    let pageCount = 0;

    for (const item of contentItems) {
      const contentId = item.sourceId;
      const contentTitle = normalizeLegacyTitle(item.title);
      const coverEntry = createContentCoverEntry(item, config, contentTitle);
      if (coverEntry) {
        pendingEntries.push(coverEntry);
      }

      const pageEntry = createLegacyPageEntry(item, config, contentTitle);
      if (pageEntry) {
        pendingEntries.push(pageEntry);
      }

      if (pageEntry && isLegacyContentHtmlPage(pageEntry.sourceUrl, config)) {
        const htmlFile = await readLegacyHtmlPage(config, pageEntry.sourceUrl);
        sourceFiles.add(htmlFile.sourcePath);
        pageCount += 1;
        pendingEntries.push(
          ...scanLegacyHtmlReferences({
            html: htmlFile.source,
            pageUrl: pageEntry.sourceUrl,
            contentId,
            contentTitle,
            config,
          }),
        );
      }
    }

    const entries = finalizeEntries(pendingEntries);

    return {
      meta: createApiMeta('ready'),
      item: {
        summary: {
          contentCount: contentItems.length,
          pageCount,
          referenceCount: entries.length,
          downloadableCount: entries.filter((entry) => entry.downloadable).length,
        },
        entries,
        sourceFiles: Array.from(sourceFiles),
      },
    };
  } catch (error) {
    if (error instanceof LegacyDataSourceNotConfiguredError) {
      return {
        meta: createApiMeta('not_configured', error.message),
      };
    }

    return {
      meta: createApiMeta(
        'unavailable',
        error instanceof Error ? error.message : '旧内容资源清单暂不可用。',
      ),
    };
  }
}

function createContentCoverEntry(
  item: LegacyContentImportItemInput,
  config: RuntimeConfig,
  contentTitle: string,
): PendingLegacyReference | undefined {
  if (isLegacyColorToken(item.image)) {
    return undefined;
  }

  const asset = resolveLegacyAssetReference({
    value: item.image,
    legacyPublicBaseUrl: config.legacyPublicBaseUrl,
    migratedPublicPrefix: config.legacyAssetPublicPrefix,
  });

  if (!asset || !isSameLegacyOrigin(asset.sourceUrl, config)) {
    return undefined;
  }

  return {
    kind: 'content_cover',
    contentId: item.sourceId,
    contentTitle,
    originalValue: asset.originalValue,
    sourceUrl: asset.sourceUrl,
    migratedPath: asset.migratedPath,
    downloadable: true,
  };
}

function createLegacyPageEntry(
  item: LegacyContentImportItemInput,
  config: RuntimeConfig,
  contentTitle: string,
): PendingLegacyReference | undefined {
  const asset = resolveLegacyAssetReference({
    value: item.link,
    legacyPublicBaseUrl: config.legacyPublicBaseUrl,
    migratedPublicPrefix: config.legacyAssetPublicPrefix,
  });

  if (!asset || !isSameLegacyOrigin(asset.sourceUrl, config)) {
    return undefined;
  }

  return {
    kind: 'legacy_page',
    contentId: item.sourceId,
    contentTitle,
    originalValue: asset.originalValue,
    sourceUrl: stripHash(asset.sourceUrl),
    migratedPath: asset.migratedPath,
    downloadable: false,
  };
}

async function readLegacyHtmlPage(config: RuntimeConfig, sourceUrl: string) {
  const url = new URL(sourceUrl);
  return readLegacyPublicFile(config, safeDecodePath(url.pathname.replace(/^\/+/, '')));
}

function scanLegacyHtmlReferences(input: {
  html: string;
  pageUrl: string;
  contentId: string;
  contentTitle: string;
  config: RuntimeConfig;
}): PendingLegacyReference[] {
  const entries: PendingLegacyReference[] = [];
  const attributePattern = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi;
  const cssUrlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]+))\s*\)/gi;

  for (const match of input.html.matchAll(attributePattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    const entry = createHtmlReferenceEntry({ ...input, value });
    if (entry) {
      entries.push(entry);
    }
  }

  for (const match of input.html.matchAll(cssUrlPattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    const entry = createHtmlReferenceEntry({ ...input, value });
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function createHtmlReferenceEntry(input: {
  value?: string;
  pageUrl: string;
  contentId: string;
  contentTitle: string;
  config: RuntimeConfig;
}): PendingLegacyReference | undefined {
  const value = input.value?.trim();
  if (!value || shouldSkipHtmlReference(value)) {
    return undefined;
  }

  const asset = resolveLegacyAssetReference({
    value,
    legacyPublicBaseUrl: input.config.legacyPublicBaseUrl,
    migratedPublicPrefix: input.config.legacyAssetPublicPrefix,
    baseUrl: input.pageUrl,
  });

  if (!asset || !isSameLegacyOrigin(asset.sourceUrl, input.config)) {
    return undefined;
  }

  const sourceUrl = stripHash(asset.sourceUrl);
  const kind: LegacyAssetReferenceKind = isHtmlLikePath(sourceUrl) ? 'html_link' : 'html_asset';

  return {
    kind,
    contentId: input.contentId,
    contentTitle: input.contentTitle,
    originalValue: asset.originalValue,
    sourceUrl,
    migratedPath: asset.migratedPath,
    sourcePageUrl: input.pageUrl,
    downloadable: kind === 'html_asset',
  };
}

function finalizeEntries(entries: PendingLegacyReference[]): LegacyAssetManifestEntry[] {
  const seen = new Set<string>();
  const uniqueEntries: LegacyAssetManifestEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.kind}|${entry.contentId}|${entry.sourcePageUrl ?? ''}|${entry.sourceUrl}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueEntries.push({
      id: `legacy-asset:${uniqueEntries.length + 1}`,
      ...entry,
    });
  }

  return uniqueEntries;
}

function normalizeLegacyTitle(title: string): string {
  const normalized = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('');

  return normalized || title.replace(/\|+/g, '').trim() || '未命名内容';
}

function isLegacyColorToken(value: string | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(
    trimmed &&
    (/^#[0-9A-Fa-f]{6}$/.test(trimmed) ||
      /^var\(--[-_a-zA-Z0-9]+\)$/.test(trimmed) ||
      /^--[-_a-zA-Z0-9]+$/.test(trimmed)),
  );
}

function isLegacyContentHtmlPage(sourceUrl: string, config: RuntimeConfig): boolean {
  if (!isSameLegacyOrigin(sourceUrl, config)) {
    return false;
  }

  const url = new URL(sourceUrl);
  return /^\/content\/.+\.html?$/i.test(safeDecodePath(url.pathname));
}

function isSameLegacyOrigin(sourceUrl: string, config: RuntimeConfig): boolean {
  return new URL(sourceUrl).origin === new URL(config.legacyPublicBaseUrl).origin;
}

function shouldSkipHtmlReference(value: string): boolean {
  return /^(#|javascript:|data:|mailto:|tel:)/i.test(value);
}

function isHtmlLikePath(sourceUrl: string): boolean {
  const pathname = safeDecodePath(new URL(sourceUrl).pathname);
  return /\.html?$/i.test(pathname) || !/\.[a-z0-9]{1,8}$/i.test(pathname);
}

function stripHash(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.hash = '';
  return url.toString();
}

function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
