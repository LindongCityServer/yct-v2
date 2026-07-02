import type {
  ApiItemResponse,
  LegacyAssetDuplicateResource,
  LegacyAssetManifest,
  LegacyAssetManifestEntry,
  LegacyAssetManifestIssue,
  LegacyAssetReferenceKind,
} from '@yct/contracts';
import type { LegacyContentImportItemInput } from '@yct/schemas';
import { parseLegacyContentSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import { legacyMigratedAssetExists, resolveLegacyAssetReference } from './legacy-assets';
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
  sourceOrigin: string;
  originKind: LegacyAssetManifestEntry['originKind'];
  migratedPath?: string;
  sourcePageUrl?: string;
  downloadable: boolean;
}

interface FinalizedLegacyEntries {
  entries: LegacyAssetManifestEntry[];
  duplicateReferenceCount: number;
  duplicateReferenceIssues: LegacyAssetManifestIssue[];
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

    const finalized = finalizeEntries(pendingEntries);
    const duplicateResources = findDuplicateResources(finalized.entries);
    const issues = [
      ...finalized.duplicateReferenceIssues,
      ...buildManifestIssues(finalized.entries, duplicateResources),
    ];
    const entries = finalized.entries;

    return {
      meta: createApiMeta('ready'),
      item: {
        summary: {
          contentCount: contentItems.length,
          pageCount,
          rawReferenceCount: pendingEntries.length,
          referenceCount: entries.length,
          downloadableCount: entries.filter((entry) => entry.downloadable).length,
          sameOriginCount: entries.filter((entry) => entry.originKind === 'legacy_origin').length,
          externalCount: entries.filter((entry) => entry.originKind === 'external').length,
          notDownloadableCount: entries.filter((entry) => !entry.downloadable).length,
          missingMigratedPathCount: entries.filter(
            (entry) => entry.downloadable && !entry.migratedPath,
          ).length,
          missingLocalFileCount: entries.filter(
            (entry) =>
              entry.downloadable &&
              entry.migratedPath &&
              !legacyMigratedAssetExists(entry.migratedPath),
          ).length,
          duplicateReferenceCount: finalized.duplicateReferenceCount,
          duplicateResourceCount: duplicateResources.reduce(
            (total, item) => total + Math.max(item.occurrenceCount - 1, 0),
            0,
          ),
          issueCount: issues.length,
          byKind: countEntriesByKind(entries),
        },
        entries,
        issues,
        duplicateResources,
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

  if (!asset) {
    return undefined;
  }
  const originKind = getAssetOriginKind(asset.sourceUrl, config);

  return {
    kind: 'content_cover',
    contentId: item.sourceId,
    contentTitle,
    originalValue: asset.originalValue,
    sourceUrl: asset.sourceUrl,
    sourceOrigin: new URL(asset.sourceUrl).origin,
    originKind,
    migratedPath: originKind === 'legacy_origin' ? asset.migratedPath : undefined,
    downloadable: originKind === 'legacy_origin',
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

  if (!asset) {
    return undefined;
  }
  const sourceUrl = stripHash(asset.sourceUrl);
  const originKind = getAssetOriginKind(sourceUrl, config);
  const kind: LegacyAssetReferenceKind =
    originKind === 'legacy_origin' && isLegacyContentHtmlPage(sourceUrl, config)
      ? 'legacy_page'
      : 'html_link';

  return {
    kind,
    contentId: item.sourceId,
    contentTitle,
    originalValue: asset.originalValue,
    sourceUrl,
    sourceOrigin: new URL(sourceUrl).origin,
    originKind,
    migratedPath: originKind === 'legacy_origin' ? asset.migratedPath : undefined,
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

  if (!asset) {
    return undefined;
  }

  const sourceUrl = stripHash(asset.sourceUrl);
  const originKind = getAssetOriginKind(sourceUrl, input.config);
  const kind: LegacyAssetReferenceKind = isHtmlLikePath(sourceUrl) ? 'html_link' : 'html_asset';

  return {
    kind,
    contentId: input.contentId,
    contentTitle: input.contentTitle,
    originalValue: asset.originalValue,
    sourceUrl,
    sourceOrigin: new URL(sourceUrl).origin,
    originKind,
    migratedPath: originKind === 'legacy_origin' ? asset.migratedPath : undefined,
    sourcePageUrl: input.pageUrl,
    downloadable: originKind === 'legacy_origin' && kind === 'html_asset',
  };
}

function finalizeEntries(entries: PendingLegacyReference[]): FinalizedLegacyEntries {
  const seen = new Map<string, LegacyAssetManifestEntry>();
  const uniqueEntries: LegacyAssetManifestEntry[] = [];
  const duplicateReferenceIssues: LegacyAssetManifestIssue[] = [];

  for (const entry of entries) {
    const key = `${entry.kind}|${entry.contentId}|${entry.sourcePageUrl ?? ''}|${entry.sourceUrl}`;
    const duplicateOf = seen.get(key);
    if (duplicateOf) {
      duplicateReferenceIssues.push({
        id: `legacy-asset-issue:duplicate-reference:${duplicateReferenceIssues.length + 1}`,
        kind: 'duplicate_reference',
        severity: 'info',
        message: `重复引用已合并到 ${duplicateOf.id}。`,
        duplicateOfEntryId: duplicateOf.id,
        contentId: entry.contentId,
        contentTitle: entry.contentTitle,
        sourceUrl: entry.sourceUrl,
        migratedPath: entry.migratedPath,
        sourcePageUrl: entry.sourcePageUrl,
      });
      continue;
    }

    const manifestEntry = {
      id: `legacy-asset:${uniqueEntries.length + 1}`,
      ...entry,
    };
    seen.set(key, manifestEntry);
    uniqueEntries.push(manifestEntry);
  }

  return {
    entries: uniqueEntries,
    duplicateReferenceCount: duplicateReferenceIssues.length,
    duplicateReferenceIssues,
  };
}

function buildManifestIssues(
  entries: LegacyAssetManifestEntry[],
  duplicateResources: LegacyAssetDuplicateResource[],
): LegacyAssetManifestIssue[] {
  const issues: LegacyAssetManifestIssue[] = [];

  for (const entry of entries) {
    if (entry.originKind === 'external') {
      issues.push(
        createEntryIssue(
          issues,
          entry,
          'external_reference',
          'info',
          '外链资源不会由旧站资源下载脚本自动落盘。',
        ),
      );
    }

    if (!entry.downloadable) {
      issues.push(
        createEntryIssue(
          issues,
          entry,
          'not_downloadable',
          'info',
          '该引用不是当前批量下载候选，需要保留链接或后续单独迁移。',
        ),
      );
      continue;
    }

    if (!entry.migratedPath) {
      issues.push(
        createEntryIssue(
          issues,
          entry,
          'missing_migrated_path',
          'warning',
          '下载候选缺少同站迁移目标路径。',
        ),
      );
      continue;
    }

    if (!legacyMigratedAssetExists(entry.migratedPath)) {
      issues.push(
        createEntryIssue(
          issues,
          entry,
          'missing_local_file',
          'warning',
          '本地 legacy-assets 中尚未找到该资源文件。',
        ),
      );
    }
  }

  for (const duplicate of duplicateResources) {
    issues.push({
      id: `legacy-asset-issue:${issues.length + 1}`,
      kind: 'duplicate_resource',
      severity: 'info',
      message: `同一资源被 ${duplicate.occurrenceCount} 个引用复用，迁移时应共享同一个落盘文件。`,
      entryId: duplicate.entryIds[0],
      relatedEntryIds: duplicate.entryIds.slice(1),
      sourceUrl: duplicate.sourceUrl,
      migratedPath: duplicate.migratedPath,
      occurrenceCount: duplicate.occurrenceCount,
    });
  }

  return issues;
}

function createEntryIssue(
  issues: LegacyAssetManifestIssue[],
  entry: LegacyAssetManifestEntry,
  kind: LegacyAssetManifestIssue['kind'],
  severity: LegacyAssetManifestIssue['severity'],
  message: string,
): LegacyAssetManifestIssue {
  return {
    id: `legacy-asset-issue:${issues.length + 1}`,
    kind,
    severity,
    message,
    entryId: entry.id,
    contentId: entry.contentId,
    contentTitle: entry.contentTitle,
    sourceUrl: entry.sourceUrl,
    migratedPath: entry.migratedPath,
    sourcePageUrl: entry.sourcePageUrl,
  };
}

function findDuplicateResources(
  entries: LegacyAssetManifestEntry[],
): LegacyAssetDuplicateResource[] {
  const groups = new Map<string, LegacyAssetManifestEntry[]>();

  for (const entry of entries) {
    if (!entry.downloadable || !entry.migratedPath) {
      continue;
    }

    const key = `${entry.sourceUrl}|${entry.migratedPath}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group, index) => ({
      id: `legacy-asset-duplicate:${index + 1}`,
      sourceUrl: group[0].sourceUrl,
      migratedPath: group[0].migratedPath ?? '',
      entryIds: group.map((entry) => entry.id),
      contentIds: Array.from(new Set(group.map((entry) => entry.contentId))),
      contentTitles: Array.from(new Set(group.map((entry) => entry.contentTitle))),
      occurrenceCount: group.length,
    }));
}

function countEntriesByKind(
  entries: LegacyAssetManifestEntry[],
): Record<LegacyAssetReferenceKind, number> {
  return {
    content_cover: entries.filter((entry) => entry.kind === 'content_cover').length,
    legacy_page: entries.filter((entry) => entry.kind === 'legacy_page').length,
    html_asset: entries.filter((entry) => entry.kind === 'html_asset').length,
    html_link: entries.filter((entry) => entry.kind === 'html_link').length,
  };
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

function getAssetOriginKind(
  sourceUrl: string,
  config: RuntimeConfig,
): LegacyAssetManifestEntry['originKind'] {
  return isSameLegacyOrigin(sourceUrl, config) ? 'legacy_origin' : 'external';
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
