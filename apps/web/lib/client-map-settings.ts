const mapTileProviderStorageKey = 'yct.mapTileProvider.v1';

export function readSelectedMapTileProviderId(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(mapTileProviderStorageKey)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function writeSelectedMapTileProviderId(providerId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const normalized = providerId.trim();
    if (normalized) {
      window.localStorage.setItem(mapTileProviderStorageKey, normalized);
    } else {
      window.localStorage.removeItem(mapTileProviderStorageKey);
    }
  } catch {
    // 浏览器隐私模式或存储配额异常时，保留当前会话内选择即可。
  }
}
