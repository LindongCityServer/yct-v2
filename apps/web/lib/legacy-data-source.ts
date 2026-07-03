import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { RuntimeConfig } from './runtime-config';

export class LegacyDataSourceNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyDataSourceNotConfiguredError';
  }
}

export interface LegacyDataSourceFile {
  source: string;
  sourcePath: string;
  origin: 'local' | 'remote';
}

export function isLegacyDataSourceConfigured(config: RuntimeConfig): boolean {
  return config.legacyDataSource !== 'local' || Boolean(config.legacyDataDir);
}

export async function readLegacyDataSourceFile(
  config: RuntimeConfig,
  fileName: string,
): Promise<LegacyDataSourceFile> {
  if (shouldUseLocalLegacySource(config)) {
    if (!config.legacyDataDir) {
      throw new LegacyDataSourceNotConfiguredError(
        '旧数据源设置为 local，但未配置 YCT_LEGACY_DATA_DIR。',
      );
    }

    const filePath = join(/*turbopackIgnore: true*/ config.legacyDataDir, fileName);
    return {
      source: await readFile(filePath, 'utf8'),
      sourcePath: filePath,
      origin: 'local',
    };
  }

  const sourceUrl = joinLegacyDataUrl(config.legacyDataRemoteBaseUrl, fileName);
  const response = await fetchLegacySource(sourceUrl, config.legacyDataFetchTimeoutMs);

  if (!response.ok) {
    throw new Error(`旧站数据文件读取失败：${sourceUrl} (${response.status})`);
  }

  return {
    source: await response.text(),
    sourcePath: sourceUrl,
    origin: 'remote',
  };
}

export async function readLegacyPublicFile(
  config: RuntimeConfig,
  fileName: string,
): Promise<LegacyDataSourceFile> {
  if (shouldUseLocalLegacySource(config)) {
    if (!config.legacyDataDir) {
      throw new LegacyDataSourceNotConfiguredError(
        '旧数据源设置为 local，但未配置 YCT_LEGACY_DATA_DIR。',
      );
    }

    const legacyRoot =
      basename(config.legacyDataDir).toLowerCase() === 'data'
        ? dirname(config.legacyDataDir)
        : config.legacyDataDir;
    const filePath = join(/*turbopackIgnore: true*/ legacyRoot, fileName);
    return {
      source: await readFile(filePath, 'utf8'),
      sourcePath: filePath,
      origin: 'local',
    };
  }

  const sourceUrl = joinLegacyDataUrl(config.legacyPublicBaseUrl, fileName);
  const response = await fetchLegacySource(sourceUrl, config.legacyDataFetchTimeoutMs);

  if (!response.ok) {
    throw new Error(`旧站公开文件读取失败：${sourceUrl} (${response.status})`);
  }

  return {
    source: await response.text(),
    sourcePath: sourceUrl,
    origin: 'remote',
  };
}

function shouldUseLocalLegacySource(config: RuntimeConfig): boolean {
  if (config.legacyDataSource === 'remote') {
    return false;
  }

  if (config.legacyDataSource === 'local') {
    return true;
  }

  return Boolean(config.legacyDataDir);
}

function joinLegacyDataUrl(baseUrl: string, fileName: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${fileName.replace(/^\/+/, '')}`;
}

async function fetchLegacySource(sourceUrl: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(sourceUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
