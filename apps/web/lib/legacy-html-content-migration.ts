import type {
  ApiItemResponse,
  LegacyHtmlContentMigrationItem,
  LegacyHtmlContentMigrationPreview,
} from '@yct/contracts';
import { parseLegacyContentSource } from '@yct/legacy-import';
import { createApiMeta } from './api-meta';
import { resolveLegacyAssetDisplayUrl, resolveLegacyAssetReference } from './legacy-assets';
import {
  isLegacyDataSourceConfigured,
  LegacyDataSourceNotConfiguredError,
  readLegacyDataSourceFile,
  readLegacyPublicFile,
} from './legacy-data-source';
import { readRuntimeConfig, type RuntimeConfig } from './runtime-config';

export async function readLegacyHtmlContentMigrationPreview(): Promise<
  ApiItemResponse<LegacyHtmlContentMigrationPreview>
> {
  const config = readRuntimeConfig();
  if (!isLegacyDataSourceConfigured(config)) {
    return {
      meta: createApiMeta('not_configured', '旧内容数据源尚未配置。'),
    };
  }

  try {
    const legacyFile = await readLegacyDataSourceFile(config, 'content_data.js');
    const contentItems = parseLegacyContentSource(legacyFile.source, legacyFile.sourcePath);
    const items: LegacyHtmlContentMigrationItem[] = [];

    for (const item of contentItems) {
      const pageUrl = resolveLegacyPageUrl(item.link, config);
      if (!pageUrl) {
        continue;
      }

      const pageFile = await readLegacyPublicFile(config, pathnameToLegacyFileName(pageUrl));
      items.push(
        convertLegacyHtmlPage({
          html: pageFile.source,
          contentId: item.sourceId,
          contentTitle: normalizeLegacyTitle(item.title),
          categoryId: item.categoryId,
          sourceUrl: pageUrl,
          sourcePath: pageFile.sourcePath,
          config,
        }),
      );
    }

    return {
      meta: createApiMeta('ready'),
      item: {
        summary: {
          pageCount: items.length,
          convertedCount: items.filter((item) => item.markdown.trim()).length,
          warningCount: items.reduce((total, item) => total + item.warnings.length, 0),
        },
        items,
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
        error instanceof Error ? error.message : '旧专题页面迁移预览暂不可用。',
      ),
    };
  }
}

function convertLegacyHtmlPage(input: {
  html: string;
  contentId: string;
  contentTitle: string;
  categoryId: string;
  sourceUrl: string;
  sourcePath: string;
  config: RuntimeConfig;
}): LegacyHtmlContentMigrationItem {
  const body = extractHtmlBody(input.html);
  const imageCount = countMatches(body, /<img\b/gi);
  const linkCount = countMatches(body, /<a\b/gi);
  const warnings: string[] = [];
  let markdown = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  markdown = markdown.replace(/<img\b([^>]*)>/gi, (_match, attributes: string) => {
    const src = readHtmlAttribute(attributes, 'src');
    if (!src) {
      warnings.push('存在缺少 src 的图片标签。');
      return '';
    }

    const alt = readHtmlAttribute(attributes, 'alt') ?? '';
    const asset = resolveLegacyAssetReference({
      value: src,
      legacyPublicBaseUrl: input.config.legacyPublicBaseUrl,
      migratedPublicPrefix: input.config.legacyAssetPublicPrefix,
      baseUrl: input.sourceUrl,
    });
    const displayUrl = resolveLegacyAssetDisplayUrl(asset);
    if (!displayUrl) {
      warnings.push(`无法解析图片：${src}`);
      return '';
    }

    return `\n\n![${escapeMarkdownText(alt)}](${displayUrl})\n\n`;
  });

  markdown = markdown.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, attributes: string, labelHtml: string) => {
      const href = readHtmlAttribute(attributes, 'href');
      const label = stripHtml(labelHtml).trim();
      if (!href) {
        return label;
      }

      const url = safeResolveUrl(href, input.sourceUrl);
      return label ? `[${escapeMarkdownText(label)}](${url})` : url;
    },
  );

  markdown = markdown
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_match, text: string) =>
      block(`# ${stripHtml(text).trim()}`),
    )
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_match, text: string) =>
      block(`## ${stripHtml(text).trim()}`),
    )
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_match, text: string) =>
      block(`### ${stripHtml(text).trim()}`),
    )
    .replace(
      /<li\b[^>]*>([\s\S]*?)<\/li>/gi,
      (_match, text: string) => `\n- ${stripHtml(text).trim()}`,
    )
    .replace(/<\/(?:p|div|section|article|header|footer|main|ul|ol)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  markdown = decodeHtmlEntities(markdown)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!markdown) {
    warnings.push('未能从旧 HTML 中提取出正文。');
  }

  return {
    contentId: input.contentId,
    contentTitle: input.contentTitle,
    categoryId: input.categoryId,
    sourceUrl: input.sourceUrl,
    sourcePath: input.sourcePath,
    markdown,
    markdownLength: markdown.length,
    imageCount,
    linkCount,
    warnings,
  };
}

function resolveLegacyPageUrl(
  value: string | undefined,
  config: RuntimeConfig,
): string | undefined {
  const asset = resolveLegacyAssetReference({
    value,
    legacyPublicBaseUrl: config.legacyPublicBaseUrl,
    migratedPublicPrefix: config.legacyAssetPublicPrefix,
  });
  if (!asset || !isLegacyContentHtmlPage(asset.sourceUrl, config)) {
    return undefined;
  }

  return stripHash(asset.sourceUrl);
}

function isLegacyContentHtmlPage(sourceUrl: string, config: RuntimeConfig): boolean {
  if (new URL(sourceUrl).origin !== new URL(config.legacyPublicBaseUrl).origin) {
    return false;
  }

  return /^\/content\/.+\.html?$/i.test(safeDecodePath(new URL(sourceUrl).pathname));
}

function pathnameToLegacyFileName(sourceUrl: string): string {
  return safeDecodePath(new URL(sourceUrl).pathname.replace(/^\/+/, ''));
}

function extractHtmlBody(html: string): string {
  return (
    extractElementByClass(html, 'content-container') ??
    /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ??
    html
  );
}

function extractElementByClass(html: string, className: string): string | undefined {
  const startTagPattern = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let startMatch: RegExpExecArray | null;

  while ((startMatch = startTagPattern.exec(html)) !== null) {
    if (!hasHtmlClass(startMatch[2] ?? '', className)) {
      continue;
    }

    const tagName = startMatch[1].toLowerCase();
    const contentStart = startTagPattern.lastIndex;
    const closeIndex = findClosingTagIndex(html, tagName, contentStart);
    if (closeIndex > contentStart) {
      return html.slice(contentStart, closeIndex);
    }
  }

  return undefined;
}

function hasHtmlClass(attributes: string, className: string): boolean {
  const classValue = readHtmlAttribute(attributes, 'class');
  return Boolean(classValue?.split(/\s+/).includes(className));
}

function findClosingTagIndex(html: string, tagName: string, fromIndex: number): number {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = fromIndex;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    if (match[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        return match.index;
      }
      continue;
    }

    if (!match[0].endsWith('/>')) {
      depth += 1;
    }
  }

  return -1;
}

function readHtmlAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i');
  const match = pattern.exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ''));
}

function block(value: string): string {
  return value.trim() ? `\n\n${value.trim()}\n\n` : '';
}

function countMatches(value: string, pattern: RegExp): number {
  return Array.from(value.matchAll(pattern)).length;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function escapeMarkdownText(value: string): string {
  return decodeHtmlEntities(value).replace(/[[\]]/g, '\\$&');
}

function safeResolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function stripHash(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  url.hash = '';
  return url.toString();
}

function normalizeLegacyTitle(title: string): string {
  const normalized = title
    .split(/\|+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('');

  return normalized || title.replace(/\|+/g, '').trim() || '未命名内容';
}

function safeDecodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
