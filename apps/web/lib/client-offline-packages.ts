import type { RectangleBounds } from '@yct/contracts';

const offlinePackageStorageKey = 'yct.offlinePackages.v1';

export type OfflinePackageStatus = 'registered' | 'base_cache_refreshed' | 'refresh_failed';

export interface OfflinePackageRecord {
  packageId: string;
  name: string;
  bounds: RectangleBounds;
  status: OfflinePackageStatus;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt?: string;
  errorMessage?: string;
}

export interface OfflinePackageState {
  packages: OfflinePackageRecord[];
  summary: {
    total: number;
    pending: number;
    refreshed: number;
    failed: number;
    totalArea: number;
  };
}

export function readOfflinePackageState(): OfflinePackageState {
  return createOfflinePackageState(readOfflinePackages());
}

export function createOfflinePackage(input: {
  name: string;
  bounds: RectangleBounds;
}): OfflinePackageRecord {
  const now = new Date().toISOString();
  const record: OfflinePackageRecord = {
    packageId: createPackageId(),
    name: input.name.trim(),
    bounds: normalizeBounds(input.bounds),
    status: 'registered',
    createdAt: now,
    updatedAt: now,
  };

  writeOfflinePackages([record, ...readOfflinePackages()]);
  return record;
}

export function deleteOfflinePackage(packageId: string): void {
  writeOfflinePackages(readOfflinePackages().filter((item) => item.packageId !== packageId));
}

export function updateOfflinePackageStatus(
  packageId: string,
  status: OfflinePackageStatus,
  errorMessage?: string,
): void {
  const now = new Date().toISOString();
  writeOfflinePackages(
    readOfflinePackages().map((item) =>
      item.packageId === packageId
        ? {
            ...item,
            status,
            updatedAt: now,
            lastRefreshedAt: status === 'base_cache_refreshed' ? now : item.lastRefreshedAt,
            errorMessage,
          }
        : item,
    ),
  );
}

export function normalizeBounds(bounds: RectangleBounds): RectangleBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxX: Math.max(bounds.minX, bounds.maxX),
    maxZ: Math.max(bounds.minZ, bounds.maxZ),
  };
}

export function calculateBoundsArea(bounds: RectangleBounds): number {
  const normalized = normalizeBounds(bounds);
  return (
    Math.max(0, normalized.maxX - normalized.minX) * Math.max(0, normalized.maxZ - normalized.minZ)
  );
}

export function formatBounds(bounds: RectangleBounds): string {
  const normalized = normalizeBounds(bounds);
  return `X ${formatCoordinate(normalized.minX)} 至 ${formatCoordinate(
    normalized.maxX,
  )}，Z ${formatCoordinate(normalized.minZ)} 至 ${formatCoordinate(normalized.maxZ)}`;
}

export function offlinePackageStatusLabel(status: OfflinePackageStatus): string {
  const labels: Record<OfflinePackageStatus, string> = {
    registered: '待生成',
    base_cache_refreshed: '基础缓存已刷新',
    refresh_failed: '刷新失败',
  };

  return labels[status];
}

function readOfflinePackages(): OfflinePackageRecord[] {
  const source = window.localStorage.getItem(offlinePackageStorageKey);
  if (!source) {
    return [];
  }

  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      const record = parseOfflinePackageRecord(item);
      return record ? [record] : [];
    });
  } catch {
    return [];
  }
}

function writeOfflinePackages(packages: OfflinePackageRecord[]): void {
  window.localStorage.setItem(offlinePackageStorageKey, JSON.stringify(packages));
}

function createOfflinePackageState(packages: OfflinePackageRecord[]): OfflinePackageState {
  return {
    packages,
    summary: {
      total: packages.length,
      pending: packages.filter((item) => item.status === 'registered').length,
      refreshed: packages.filter((item) => item.status === 'base_cache_refreshed').length,
      failed: packages.filter((item) => item.status === 'refresh_failed').length,
      totalArea: packages.reduce((sum, item) => sum + calculateBoundsArea(item.bounds), 0),
    },
  };
}

function parseOfflinePackageRecord(value: unknown): OfflinePackageRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<OfflinePackageRecord>;
  if (
    typeof source.packageId !== 'string' ||
    typeof source.name !== 'string' ||
    !isOfflinePackageStatus(source.status) ||
    typeof source.createdAt !== 'string' ||
    typeof source.updatedAt !== 'string' ||
    !source.bounds ||
    !isFiniteBounds(source.bounds)
  ) {
    return null;
  }

  return {
    packageId: source.packageId,
    name: source.name,
    bounds: normalizeBounds(source.bounds),
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    lastRefreshedAt:
      typeof source.lastRefreshedAt === 'string' ? source.lastRefreshedAt : undefined,
    errorMessage: typeof source.errorMessage === 'string' ? source.errorMessage : undefined,
  };
}

function isOfflinePackageStatus(value: unknown): value is OfflinePackageStatus {
  return value === 'registered' || value === 'base_cache_refreshed' || value === 'refresh_failed';
}

function isFiniteBounds(value: unknown): value is RectangleBounds {
  const source = value as Partial<RectangleBounds>;
  return (
    typeof source.minX === 'number' &&
    typeof source.minZ === 'number' &&
    typeof source.maxX === 'number' &&
    typeof source.maxZ === 'number' &&
    Number.isFinite(source.minX) &&
    Number.isFinite(source.minZ) &&
    Number.isFinite(source.maxX) &&
    Number.isFinite(source.maxZ)
  );
}

function createPackageId(): string {
  if ('crypto' in window && typeof window.crypto.randomUUID === 'function') {
    return `offline-${window.crypto.randomUUID()}`;
  }

  return `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCoordinate(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 1,
  }).format(value);
}
