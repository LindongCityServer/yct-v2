import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { appBasePath } from './app-paths';

export interface LegacyAssetReference {
  originalValue: string;
  sourceUrl: string;
  migratedPath: string;
}

export function resolveLegacyAssetReference(input: {
  value?: string;
  legacyPublicBaseUrl: string;
  migratedPublicPrefix: string;
  baseUrl?: string;
}): LegacyAssetReference | undefined {
  const rawValue = input.value?.trim();
  if (!rawValue || isLegacyColorTokenValue(rawValue)) {
    return undefined;
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawValue, input.baseUrl ?? ensureTrailingSlash(input.legacyPublicBaseUrl));
  } catch {
    return undefined;
  }

  if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
    return undefined;
  }

  const migratedPath = joinPublicPath(input.migratedPublicPrefix, sourceUrl.pathname);
  return {
    originalValue: rawValue,
    sourceUrl: sourceUrl.toString(),
    migratedPath,
  };
}

export function rewriteLegacyMarkdownAssets(input: {
  markdown: string;
  legacyPublicBaseUrl: string;
  migratedPublicPrefix: string;
}): string {
  return input.markdown.replace(/(原始图片：)(\S+)/g, (_match, label: string, value: string) => {
    const asset = resolveLegacyAssetReference({
      value,
      legacyPublicBaseUrl: input.legacyPublicBaseUrl,
      migratedPublicPrefix: input.migratedPublicPrefix,
    });

    const displayUrl = resolveLegacyAssetDisplayUrl(asset);
    return displayUrl ? `${label}${displayUrl}` : `${label}${value}`;
  });
}

export function resolveLegacyAssetDisplayUrl(
  asset: LegacyAssetReference | undefined,
): string | undefined {
  if (!asset) {
    return undefined;
  }

  return legacyMigratedAssetExists(asset.migratedPath) ? asset.migratedPath : asset.sourceUrl;
}

export function legacyMigratedAssetExists(migratedPath: string): boolean {
  const filePath = legacyPublicFilePathFromMigratedPath(migratedPath);
  return filePath ? existsSync(filePath) : false;
}

export function legacyPublicFilePathFromMigratedPath(migratedPath: string): string | undefined {
  const publicPath = normalizeMigratedPublicPath(migratedPath);
  if (!publicPath) {
    return undefined;
  }

  const publicRoot = resolveWebPublicRoot();
  const relativePath = safeDecodeURIComponent(publicPath.replace(/^\/+/, ''));
  const filePath = resolve(publicRoot, relativePath);
  if (!filePath.startsWith(`${publicRoot}${sep}`)) {
    return undefined;
  }

  return filePath;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function joinPublicPath(prefix: string, pathname: string): string {
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${cleanPrefix}${cleanPath}`.replace(/\\/g, '/');
}

function isLegacyColorTokenValue(value: string): boolean {
  return (
    /^#[0-9A-Fa-f]{3,8}$/.test(value) ||
    /^var\(--[-_a-zA-Z0-9]+\)$/.test(value) ||
    /^--[-_a-zA-Z0-9]+$/.test(value)
  );
}

function normalizeMigratedPublicPath(migratedPath: string): string | undefined {
  const trimmed = migratedPath.trim();
  if (!trimmed) {
    return undefined;
  }

  let pathname: string;
  try {
    pathname = new URL(trimmed, 'https://yct.local').pathname;
  } catch {
    return undefined;
  }

  if (appBasePath && (pathname === appBasePath || pathname.startsWith(`${appBasePath}/`))) {
    pathname = pathname.slice(appBasePath.length) || '/';
  }

  if (!pathname.startsWith('/legacy-assets/')) {
    return undefined;
  }

  return pathname;
}

function resolveWebPublicRoot(): string {
  const cwdPublicRoot = resolve(process.cwd(), 'public');
  if (existsSync(cwdPublicRoot)) {
    return cwdPublicRoot;
  }

  return resolve(process.cwd(), 'apps', 'web', 'public');
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
