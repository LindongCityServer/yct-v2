import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { LegacyAssetManifestEntry } from '@yct/contracts';
import { readLegacyAssetManifest } from '../apps/web/lib/legacy-asset-manifest';

interface DownloadReportItem {
  id: string;
  sourceUrl: string;
  migratedPath: string;
  filePath: string;
  status: 'downloaded' | 'updated' | 'unchanged' | 'failed';
  sizeBytes?: number;
  sha256?: string;
  contentType?: string;
  error?: string;
}

const explicitDataSource = process.argv[2]?.trim();
const dataSource =
  explicitDataSource ||
  process.env.YCT_LEGACY_DATA_REMOTE_BASE_URL ||
  'https://yct.shangxiaoguan.top/data';
const isRemoteSource = /^https?:\/\//i.test(dataSource);

configureRuntimeLegacySource(dataSource, isRemoteSource);

const projectRoot = process.cwd();
const publicRoot = resolve(projectRoot, 'apps', 'web', 'public');
const reportPath = resolve(projectRoot, '.yct-data', 'legacy-assets-download-report.json');

const manifestResponse = await readLegacyAssetManifest();
if (!manifestResponse.item) {
  throw new Error(manifestResponse.meta.message ?? '旧内容资源清单不可用。');
}

const downloadEntries = uniqueDownloadEntries(manifestResponse.item.entries);
const report: DownloadReportItem[] = [];

for (const entry of downloadEntries) {
  const item = await downloadEntry(entry);
  report.push(item);
  const statusText =
    item.status === 'failed'
      ? `失败：${item.error}`
      : `${item.status} ${item.sizeBytes ?? 0} bytes`;
  console.log(`${item.sourceUrl} -> ${item.migratedPath} ${statusText}`);
}

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      dataSource,
      summary: summarizeReport(report),
      items: report,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const summary = summarizeReport(report);
console.log(JSON.stringify({ reportPath, ...summary }, null, 2));

if (summary.failed > 0) {
  process.exitCode = 1;
}

function uniqueDownloadEntries(entries: LegacyAssetManifestEntry[]): LegacyAssetManifestEntry[] {
  const seen = new Set<string>();
  const uniqueEntries: LegacyAssetManifestEntry[] = [];

  for (const entry of entries) {
    if (!entry.downloadable || !entry.migratedPath) {
      continue;
    }

    const key = `${entry.sourceUrl}|${entry.migratedPath}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueEntries.push(entry);
  }

  return uniqueEntries;
}

async function downloadEntry(entry: LegacyAssetManifestEntry): Promise<DownloadReportItem> {
  const migratedPath = entry.migratedPath;
  if (!migratedPath) {
    return {
      id: entry.id,
      sourceUrl: entry.sourceUrl,
      migratedPath: '',
      filePath: '',
      status: 'failed',
      error: '缺少 migratedPath。',
    };
  }

  const filePath = targetPathFromMigratedPath(migratedPath);

  try {
    const response = await fetch(entry.sourceUrl, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const sha256 = hashBuffer(buffer);
    const existing = await readExistingHash(filePath);
    await mkdir(dirname(filePath), { recursive: true });

    if (existing === sha256) {
      return {
        id: entry.id,
        sourceUrl: entry.sourceUrl,
        migratedPath,
        filePath,
        status: 'unchanged',
        sizeBytes: buffer.byteLength,
        sha256,
        contentType: response.headers.get('content-type') ?? undefined,
      };
    }

    await writeFile(filePath, buffer);

    return {
      id: entry.id,
      sourceUrl: entry.sourceUrl,
      migratedPath,
      filePath,
      status: existing ? 'updated' : 'downloaded',
      sizeBytes: buffer.byteLength,
      sha256,
      contentType: response.headers.get('content-type') ?? undefined,
    };
  } catch (error) {
    return {
      id: entry.id,
      sourceUrl: entry.sourceUrl,
      migratedPath,
      filePath,
      status: 'failed',
      error: error instanceof Error ? error.message : '未知下载错误。',
    };
  }
}

function targetPathFromMigratedPath(migratedPath: string): string {
  const relativePath = safeDecodeURIComponent(migratedPath.replace(/^\/+/, ''));
  const filePath = resolve(publicRoot, relativePath);
  if (!filePath.startsWith(`${publicRoot}${sep}`)) {
    throw new Error(`资源目标路径越界：${migratedPath}`);
  }

  return filePath;
}

async function readExistingHash(filePath: string): Promise<string | undefined> {
  try {
    return hashBuffer(await readFile(filePath));
  } catch {
    return undefined;
  }
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function summarizeReport(items: DownloadReportItem[]) {
  return {
    total: items.length,
    downloaded: items.filter((item) => item.status === 'downloaded').length,
    updated: items.filter((item) => item.status === 'updated').length,
    unchanged: items.filter((item) => item.status === 'unchanged').length,
    failed: items.filter((item) => item.status === 'failed').length,
    sizeBytes: items.reduce((total, item) => total + (item.sizeBytes ?? 0), 0),
  };
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toLegacyLocalRoot(value: string): string {
  return value.replace(/[\\/]data[\\/]?$/i, '');
}

function toLegacyPublicBaseUrl(value: string): string {
  return value.replace(/\/data\/?$/i, '');
}

function configureRuntimeLegacySource(value: string, remote: boolean): void {
  if (remote) {
    process.env.YCT_LEGACY_DATA_SOURCE = 'remote';
    process.env.YCT_LEGACY_DATA_REMOTE_BASE_URL = value;
    process.env.YCT_LEGACY_PUBLIC_BASE_URL = toLegacyPublicBaseUrl(value);
    return;
  }

  process.env.YCT_LEGACY_DATA_SOURCE = 'local';
  process.env.YCT_LEGACY_DATA_DIR = value;
  process.env.YCT_LEGACY_PUBLIC_BASE_URL = toLegacyLocalRoot(value);
}
