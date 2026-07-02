import { readFile } from 'node:fs/promises';
import type { LegacyContentImportItemInput } from '@yct/schemas';
import { legacyContentImportItemSchema } from '@yct/schemas';
import { evaluateLegacyDataFile } from './evaluate';
import { buildLegacySourceId } from './ids';

interface LegacyContentRecord {
  title?: string;
  image?: string;
  link?: string;
  date?: string;
  expireDate?: string;
  releaseTime?: string;
  summary?: string;
  category?: string;
  showInBanner?: boolean;
}

export async function parseLegacyContentFile(
  filePath: string,
): Promise<LegacyContentImportItemInput[]> {
  const source = await readFile(filePath, 'utf8');
  return parseLegacyContentSource(source, filePath);
}

export function parseLegacyContentSource(
  source: string,
  sourcePath: string,
): LegacyContentImportItemInput[] {
  const records = evaluateLegacyDataFile<LegacyContentRecord[]>(source, 'contentData');

  return records.map((record, index) =>
    legacyContentImportItemSchema.parse({
      sourceId: buildLegacySourceId('content', record.title ?? 'untitled', index),
      title: record.title ?? `未命名内容 ${index + 1}`,
      categoryId: record.category ?? 'uncategorized',
      markdown: buildLegacyContentMarkdown(record),
      sourcePath,
      summary: record.summary,
      image: record.image,
      link: record.link,
      date: record.releaseTime ?? record.date,
      expireDate: record.expireDate,
      showInBanner: record.showInBanner,
    }),
  );
}

function buildLegacyContentMarkdown(record: LegacyContentRecord): string {
  const lines = [record.summary?.trim()].filter(Boolean) as string[];

  if (record.link?.trim()) {
    lines.push('');
    lines.push(`[查看原始链接](${record.link.trim()})`);
  }

  if (record.image?.trim() && !record.image.trim().startsWith('#')) {
    lines.push('');
    lines.push(`原始图片：${record.image.trim()}`);
  }

  return lines.join('\n') || record.title?.trim() || '旧内容待补正文';
}
