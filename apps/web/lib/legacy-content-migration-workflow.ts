import { randomUUID } from 'node:crypto';
import type {
  LegacyContentMigrationBodyKind,
  LegacyContentMigrationItem,
  LegacyContentMigrationResult,
} from '@yct/contracts';
import { publishDomainEvent } from './app-event-bus';
import { findContentAssetRecordsByPublicPaths } from './content-asset-store';
import {
  createMissingContentRecords,
  listContentRecords,
  type CreateContentRecordInput,
} from './content-store';
import { readLegacyOperationsDetails } from './legacy-content';
import { readLegacyHtmlContentMigrationPreview } from './legacy-html-content-migration';
import { readRuntimeConfig } from './runtime-config';

export class LegacyContentMigrationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyContentMigrationUnavailableError';
  }
}

interface LegacyContentMigrationCandidate {
  contentId: string;
  title: string;
  categoryId: string;
  markdown: string;
  assetIds: string[];
  metadata: CreateContentRecordInput['metadata'];
  bodyKind: LegacyContentMigrationBodyKind;
  warnings: string[];
}

export async function migrateLegacyContent(input: {
  apply: boolean;
  actorId: string;
}): Promise<LegacyContentMigrationResult> {
  const config = readRuntimeConfig();
  if (input.apply && (config.legacyDataSource === 'remote' || !config.legacyDataDir)) {
    throw new LegacyContentMigrationUnavailableError(
      '正式迁移只允许读取服务器本地旧站目录。请设置 YCT_LEGACY_DATA_SOURCE=local 和 YCT_LEGACY_DATA_DIR。',
    );
  }

  const [legacyDetails, htmlPreview, existingRecords] = await Promise.all([
    readLegacyOperationsDetails(),
    readLegacyHtmlContentMigrationPreview(),
    listContentRecords(),
  ]);

  if (legacyDetails.meta.sourceStatus !== 'ready') {
    throw new LegacyContentMigrationUnavailableError(
      legacyDetails.meta.message ?? '旧运营消息数据源不可用。',
    );
  }
  if (htmlPreview.meta.sourceStatus !== 'ready' || !htmlPreview.item) {
    throw new LegacyContentMigrationUnavailableError(
      htmlPreview.meta.message ?? '旧独立内容页面数据源不可用。',
    );
  }

  const htmlByContentId = new Map(
    htmlPreview.item.items.map((item) => [item.contentId, item] as const),
  );
  const baseCandidates = legacyDetails.items.map((item) => {
    const htmlItem = htmlByContentId.get(item.id);
    const htmlMarkdown = htmlItem?.markdown.trim();
    const bodyKind: LegacyContentMigrationBodyKind = htmlMarkdown
      ? 'html_page'
      : 'operations_summary';
    const warnings = [...(htmlItem?.warnings ?? [])];
    if (htmlItem && !htmlMarkdown) {
      warnings.push('旧 HTML 页面正文为空，已回退到运营消息摘要。');
    }

    return {
      contentId: item.id,
      title: item.title,
      categoryId: item.categoryId,
      markdown: htmlMarkdown || buildSummaryMarkdown(item),
      metadata: {
        excerpt: item.excerpt,
        showInBanner: item.showInBanner,
        bannerSortOrder: item.bannerSortOrder,
        customTags: item.customTags,
        coverColor: item.coverColor,
        coverImageUrl: item.coverImageUrl,
        expiresAt: item.expiresAt,
      },
      bodyKind,
      warnings,
    };
  });

  const candidates = await Promise.all(
    baseCandidates.map(async (candidate): Promise<LegacyContentMigrationCandidate> => {
      const assetRecords = await findContentAssetRecordsByPublicPaths(
        [...extractContentAssetPaths(candidate.markdown), candidate.metadata.coverImageUrl].filter(
          (value): value is string => Boolean(value),
        ),
      );
      return {
        ...candidate,
        assetIds: assetRecords.map((record) => record.asset.id),
      };
    }),
  );
  const existingContentIds = new Set(existingRecords.map((record) => record.contentId));

  if (!input.apply) {
    return buildResult({
      mode: 'preview',
      candidates,
      skippedContentIds: existingContentIds,
      createdContentIds: new Set(),
    });
  }

  const batchId = `legacy_content_migration_${randomUUID()}`;
  const creationResult = await createMissingContentRecords(
    candidates.map((candidate) => ({
      contentId: candidate.contentId,
      title: candidate.title,
      categoryId: candidate.categoryId,
      markdown: candidate.markdown,
      assetIds: candidate.assetIds,
      metadata: candidate.metadata,
      actorId: input.actorId,
    })),
  );
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.contentId, candidate] as const),
  );

  for (const record of creationResult.createdRecords) {
    const candidate = candidateById.get(record.contentId);
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'ContentLegacyAdopted',
      actor: {
        type: 'system',
        id: input.actorId,
      },
      payload: {
        contentId: record.contentId,
        revisionId: record.revision.id,
        legacySourceId: record.contentId,
        title: record.revision.title,
        batchId,
        sourceKind: candidate?.bodyKind,
      },
    });
  }

  if (creationResult.createdRecords.length > 0) {
    await publishDomainEvent({
      eventId: `event_${randomUUID()}`,
      type: 'ContentLegacyMigrationCompleted',
      actor: {
        type: 'system',
        id: input.actorId,
      },
      payload: {
        batchId,
        candidateCount: candidates.length,
        createdCount: creationResult.createdRecords.length,
        skippedExistingCount: creationResult.skippedContentIds.length,
        htmlPageCount: candidates.filter((candidate) => candidate.bodyKind === 'html_page').length,
        summaryFallbackCount: candidates.filter(
          (candidate) => candidate.bodyKind === 'operations_summary',
        ).length,
        importedBy: input.actorId,
      },
    });
  }

  return buildResult({
    mode: 'apply',
    batchId,
    candidates,
    skippedContentIds: new Set(creationResult.skippedContentIds),
    createdContentIds: new Set(creationResult.createdRecords.map((record) => record.contentId)),
  });
}

function buildResult(input: {
  mode: LegacyContentMigrationResult['mode'];
  batchId?: string;
  candidates: LegacyContentMigrationCandidate[];
  skippedContentIds: Set<string>;
  createdContentIds: Set<string>;
}): LegacyContentMigrationResult {
  const items: LegacyContentMigrationItem[] = input.candidates.map((candidate) => ({
    contentId: candidate.contentId,
    title: candidate.title,
    categoryId: candidate.categoryId,
    bodyKind: candidate.bodyKind,
    markdownLength: candidate.markdown.length,
    assetCount: candidate.assetIds.length,
    warnings: candidate.warnings,
    status: input.createdContentIds.has(candidate.contentId)
      ? 'created'
      : input.skippedContentIds.has(candidate.contentId)
        ? 'skipped_existing'
        : 'ready',
  }));

  return {
    mode: input.mode,
    batchId: input.batchId,
    summary: {
      candidateCount: items.length,
      htmlPageCount: items.filter((item) => item.bodyKind === 'html_page').length,
      summaryFallbackCount: items.filter((item) => item.bodyKind === 'operations_summary').length,
      createdCount: items.filter((item) => item.status === 'created').length,
      skippedExistingCount: items.filter((item) => item.status === 'skipped_existing').length,
      warningCount: items.reduce((total, item) => total + item.warnings.length, 0),
    },
    items,
  };
}

function buildSummaryMarkdown(
  item: Awaited<ReturnType<typeof readLegacyOperationsDetails>>['items'][number],
): string {
  const body = item.markdown.trim() || item.excerpt?.trim() || item.title.trim();
  const legacyLink = item.legacyLink?.trim();
  if (!legacyLink || body.includes(legacyLink)) {
    return body;
  }

  return `${body}\n\n原始链接：[查看旧内容](${legacyLink})`;
}

function extractContentAssetPaths(markdown: string): string[] {
  const paths: string[] = [];
  const imagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(markdown)) !== null) {
    const source = match[1]?.trim();
    if (source) {
      paths.push(source);
    }
  }

  return Array.from(new Set(paths));
}
