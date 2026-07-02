import type {
  ApiItemResponse,
  ContentAsset,
  LegacyAssetManifest,
  LegacyAssetManifestEntry,
  LegacyContentAssetDuplicateGroup,
  LegacyContentAssetInventory,
  LegacyContentAssetInventoryItem,
} from '@yct/contracts';
import { createApiMeta } from './api-meta';
import {
  readLegacyAssetDownloadReport,
  type LegacyAssetDownloadReport,
  type LegacyAssetDownloadReportItem,
} from './legacy-asset-download-report';
import { readLegacyAssetManifest } from './legacy-asset-manifest';

export async function readLegacyContentAssetInventory(): Promise<
  ApiItemResponse<LegacyContentAssetInventory>
> {
  const manifestResponse = await readLegacyAssetManifest();
  const downloadReport = await readLegacyAssetDownloadReport();

  return createLegacyContentAssetInventoryResponse(manifestResponse, downloadReport);
}

export function createLegacyContentAssetInventoryResponse(
  manifestResponse: ApiItemResponse<LegacyAssetManifest>,
  downloadReport: Awaited<ReturnType<typeof readLegacyAssetDownloadReport>>,
): ApiItemResponse<LegacyContentAssetInventory> {
  if (!manifestResponse.item) {
    return {
      meta: manifestResponse.meta,
    };
  }

  if (downloadReport.status !== 'ready' || !downloadReport.report) {
    return {
      meta: createApiMeta(
        downloadReport.status === 'not_found' ? 'not_configured' : 'unavailable',
        downloadReport.message ?? '旧内容资源下载报告不可用。',
      ),
    };
  }

  return {
    meta: createApiMeta('ready'),
    item: buildInventory(manifestResponse.item, downloadReport.report),
  };
}

function buildInventory(
  manifest: LegacyAssetManifest,
  report: LegacyAssetDownloadReport,
): LegacyContentAssetInventory {
  const entriesByResourceKey = groupEntriesByResourceKey(manifest.entries);
  const downloadedItems = (report.items ?? []).filter(
    (item) => item.status !== 'failed' && item.migratedPath,
  );
  const duplicateGroups = buildDuplicateGroups(downloadedItems, entriesByResourceKey);
  const duplicateGroupByAssetId = new Map<string, string>();

  for (const group of duplicateGroups) {
    for (const assetId of group.assetIds) {
      duplicateGroupByAssetId.set(assetId, group.id);
    }
  }

  const items = downloadedItems.map((item): LegacyContentAssetInventoryItem => {
    const assetId = createAssetId(item);
    return {
      asset: createContentAsset(item, assetId, report.generatedAt),
      migratedPath: item.migratedPath,
      sha256: item.sha256,
      references: (entriesByResourceKey.get(resourceKey(item)) ?? []).map((entry) => ({
        entryId: entry.id,
        referenceKind: entry.kind,
        contentId: entry.contentId,
        contentTitle: entry.contentTitle,
        sourcePageUrl: entry.sourcePageUrl,
      })),
      duplicateGroupId: duplicateGroupByAssetId.get(assetId),
    };
  });

  return {
    summary: {
      assetCount: items.length,
      referenceCount: items.reduce((total, item) => total + item.references.length, 0),
      pendingReviewCount: items.filter((item) => item.asset.status === 'pending_review').length,
      approvedCount: items.filter((item) => item.asset.status === 'approved').length,
      rejectedCount: items.filter((item) => item.asset.status === 'rejected').length,
      missingHashCount: items.filter((item) => !item.sha256).length,
      reusedAssetCount: items.filter((item) => item.references.length > 1).length,
      deduplicatedReferenceCount: Math.max(
        items.reduce((total, item) => total + item.references.length, 0) - items.length,
        0,
      ),
      duplicateGroupCount: duplicateGroups.length,
      duplicateAssetCount: duplicateGroups.reduce(
        (total, group) => total + Math.max(group.assetIds.length - 1, 0),
        0,
      ),
      totalSizeBytes: items.reduce((total, item) => total + item.asset.sizeBytes, 0),
    },
    items,
    duplicateGroups,
  };
}

function groupEntriesByResourceKey(
  entries: LegacyAssetManifestEntry[],
): Map<string, LegacyAssetManifestEntry[]> {
  const groups = new Map<string, LegacyAssetManifestEntry[]>();

  for (const entry of entries) {
    if (!entry.downloadable || !entry.migratedPath) {
      continue;
    }

    const key = `${entry.sourceUrl}|${entry.migratedPath}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return groups;
}

function buildDuplicateGroups(
  items: LegacyAssetDownloadReportItem[],
  entriesByResourceKey: Map<string, LegacyAssetManifestEntry[]>,
): LegacyContentAssetDuplicateGroup[] {
  const groupsByHash = new Map<string, LegacyAssetDownloadReportItem[]>();

  for (const item of items) {
    if (!item.sha256) {
      continue;
    }

    groupsByHash.set(item.sha256, [...(groupsByHash.get(item.sha256) ?? []), item]);
  }

  return Array.from(groupsByHash.entries())
    .filter(([, group]) => group.length > 1)
    .map(([sha256, group], index) => ({
      id: `legacy-content-asset-duplicate:${index + 1}`,
      sha256,
      assetIds: group.map(createAssetId),
      migratedPaths: group.map((item) => item.migratedPath),
      sourceUrls: Array.from(new Set(group.map((item) => item.sourceUrl))),
      referenceCount: group.reduce(
        (total, item) => total + (entriesByResourceKey.get(resourceKey(item))?.length ?? 0),
        0,
      ),
    }));
}

function createContentAsset(
  item: LegacyAssetDownloadReportItem,
  assetId: string,
  uploadedAt: string,
): ContentAsset {
  return {
    id: assetId,
    kind: inferAssetKind(item),
    fileName: fileNameFromPath(item.migratedPath),
    mimeType: normalizeContentType(item.contentType) ?? 'application/octet-stream',
    sizeBytes: item.sizeBytes ?? 0,
    url: item.migratedPath,
    sourceUrl: item.sourceUrl,
    status: 'pending_review',
    uploadedBy: 'legacy-migration',
    uploadedAt,
  };
}

function createAssetId(item: LegacyAssetDownloadReportItem): string {
  const hashPart = item.sha256?.slice(0, 12) ?? 'nohash';
  const pathPart = hashString(`${item.sourceUrl}|${item.migratedPath}`);
  return `legacy_content_asset_${hashPart}_${pathPart}`;
}

function inferAssetKind(item: LegacyAssetDownloadReportItem): ContentAsset['kind'] {
  const contentType = normalizeContentType(item.contentType);
  if (contentType?.startsWith('image/')) {
    return 'image';
  }

  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(item.migratedPath)) {
    return 'image';
  }

  return 'attachment';
}

function normalizeContentType(value: string | undefined): string | undefined {
  return value?.split(';', 1)[0]?.trim().toLowerCase() || undefined;
}

function fileNameFromPath(value: string): string {
  const pathname = safeUrlPath(value);
  const fileName = pathname.split('/').filter(Boolean).at(-1);
  return fileName ? safeDecodeURIComponent(fileName) : 'legacy-asset';
}

function resourceKey(item: LegacyAssetDownloadReportItem): string {
  return `${item.sourceUrl}|${item.migratedPath}`;
}

function safeUrlPath(value: string): string {
  try {
    return new URL(value, 'https://yct.local').pathname;
  } catch {
    return value;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function hashString(value: string): string {
  let hash = 5381;
  for (const character of value) {
    hash = (hash * 33) ^ character.charCodeAt(0);
  }

  return (hash >>> 0).toString(36);
}
