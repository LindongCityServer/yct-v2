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
  if (!rawValue || rawValue.startsWith('#')) {
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
  return input.markdown.replace(/(原始图片：)(\\S+)/g, (_match, label: string, value: string) => {
    const asset = resolveLegacyAssetReference({
      value,
      legacyPublicBaseUrl: input.legacyPublicBaseUrl,
      migratedPublicPrefix: input.migratedPublicPrefix,
    });

    return asset ? `${label}${asset.migratedPath}` : `${label}${value}`;
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function joinPublicPath(prefix: string, pathname: string): string {
  const cleanPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${cleanPrefix}${cleanPath}`.replace(/\\/g, '/');
}
