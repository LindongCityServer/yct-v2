import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readRuntimeConfig } from './runtime-config';

export interface LegacyAssetDownloadReport {
  generatedAt: string;
  dataSource: string;
  summary: {
    total: number;
    downloaded: number;
    updated: number;
    unchanged: number;
    failed: number;
    sizeBytes: number;
  };
  differenceReport?: {
    issueSummary?: Record<string, number>;
    failedDownloads?: Array<{
      id: string;
      sourceUrl: string;
      migratedPath: string;
      filePath: string;
      status: 'failed';
      error?: string;
    }>;
  };
}

export async function readLegacyAssetDownloadReport(): Promise<{
  status: 'ready' | 'not_found' | 'invalid';
  report?: LegacyAssetDownloadReport;
  message?: string;
}> {
  const reportPath = resolveReportPath();

  try {
    const content = await readFile(reportPath, 'utf8');
    const parsed = JSON.parse(content) as LegacyAssetDownloadReport;

    if (!parsed.generatedAt || !parsed.summary) {
      return {
        status: 'invalid',
        message: '旧资源下载报告格式不完整。',
      };
    }

    return {
      status: 'ready',
      report: parsed,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        status: 'not_found',
        message: '尚未生成旧资源下载报告。',
      };
    }

    return {
      status: 'invalid',
      message: error instanceof Error ? error.message : '旧资源下载报告不可读取。',
    };
  }
}

function resolveReportPath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.legacyAssetDownloadReportPath)
    ? config.legacyAssetDownloadReportPath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.legacyAssetDownloadReportPath);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
