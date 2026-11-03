import type { MapHistoryVersionDescriptor, MapTileCoverage, TileZoomRange } from '@yct/contracts';
import { mapHistoryVersionConfigSchema } from '@yct/schemas';
import { appPath } from './app-paths';

/** 服务端登记的版本配置；tileTemplate 只在服务端使用，不下发给客户端。 */
export interface MapHistoryVersionConfig extends MapHistoryVersionDescriptor {
  tileTemplate: string;
}

export interface MapHistoryView {
  centerX: number;
  centerZ: number;
  zoom: number;
}

export interface MapHistoryZoomBounds {
  minZoom: number;
  maxZoom: number;
}

export type MapHistoryNotice =
  'unknown-version' | 'archived-version' | 'invalid-view' | 'view-clamped';

export interface MapHistoryParamState {
  requestedVersionId: string | null;
  version: MapHistoryVersionDescriptor | null;
  view: MapHistoryView;
  notice: MapHistoryNotice | null;
}

export const mapHistoryParams = ['hv', 'hx', 'hz', 'hzoom'] as const;

const historyVersionIdPattern = /^[a-z0-9-]{1,64}$/;
const maxCoordinateMagnitude = 10_000_000;
const maxHistoryVersions = 50;

/** 解析 `YCT_TILE_HISTORY_VERSIONS`。逐项校验，坏项被忽略并记录原因。 */
export function parseMapHistoryVersions(raw: string | undefined): {
  versions: MapHistoryVersionConfig[];
  issues: string[];
} {
  if (!raw || !raw.trim()) {
    return { versions: [], issues: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { versions: [], issues: ['历史瓦片配置不是合法 JSON'] };
  }

  if (!Array.isArray(parsed)) {
    return { versions: [], issues: ['历史瓦片配置必须是数组'] };
  }

  if (parsed.length > maxHistoryVersions) {
    return { versions: [], issues: [`历史瓦片配置最多 ${maxHistoryVersions} 个版本`] };
  }

  const issues: string[] = [];
  const versions: MapHistoryVersionConfig[] = [];
  const seenIds = new Set<string>();

  parsed.forEach((entry, index) => {
    const result = mapHistoryVersionConfigSchema.safeParse(entry);
    if (!result.success) {
      const reason = result.error.issues[0];
      issues.push(
        `第 ${index + 1} 个版本无效${reason ? `：${reason.path.join('.') || '配置'} ${reason.message}` : ''}`,
      );
      return;
    }

    if (seenIds.has(result.data.id)) {
      issues.push(`历史版本 id 重复：${result.data.id}`);
      return;
    }

    seenIds.add(result.data.id);
    versions.push(result.data);
  });

  return { versions, issues };
}

/** 去掉 tileTemplate，得到可以公开下发的元数据。 */
export function toMapHistoryVersionDescriptor(
  version: MapHistoryVersionConfig,
): MapHistoryVersionDescriptor {
  return {
    id: version.id,
    name: version.name,
    worldDataDate: version.worldDataDate,
    dateNote: version.dateNote,
    coverage: version.coverage,
    zoomRange: version.zoomRange,
    status: version.status,
  };
}

/**
 * 可切换版本：仅 active，已知日期按日期升序，日期未知的按配置顺序排在最后。
 * 日期未知的版本仍可查看，但不参与上一期/下一期。
 */
export function sortActiveHistoryVersions<T extends MapHistoryVersionDescriptor>(
  versions: T[],
): T[] {
  const active = versions.filter((version) => version.status === 'active');
  const known = active
    .filter((version) => version.worldDataDate !== null)
    .sort((a, b) => a.worldDataDate!.localeCompare(b.worldDataDate!));
  const unknown = active.filter((version) => version.worldDataDate === null);
  return [...known, ...unknown];
}

/** 上一期/下一期；越过边界返回 null（对应按钮禁用）。 */
export function pickAdjacentHistoryVersion<T extends MapHistoryVersionDescriptor>(
  versions: T[],
  currentId: string | null,
  direction: -1 | 1,
): T | null {
  const navigable = sortActiveHistoryVersions(versions).filter(
    (version) => version.worldDataDate !== null,
  );
  const index =
    currentId === null ? -1 : navigable.findIndex((version) => version.id === currentId);
  if (index < 0) {
    return null;
  }

  return navigable[index + direction] ?? null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (min > max) {
    return value;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * 切版本时把视图收进该版本声明的覆盖范围与缩放范围。
 * 超出时返回 clamped=true，由界面提示，不做静默处理。
 */
export function clampViewToHistoryVersion(
  view: MapHistoryView,
  version: MapHistoryVersionDescriptor,
  bounds: MapHistoryZoomBounds,
): { view: MapHistoryView; clamped: boolean } {
  const minZoom = clampNumber(version.zoomRange.minZoom, bounds.minZoom, bounds.maxZoom);
  const maxZoom = clampNumber(version.zoomRange.maxZoom, bounds.minZoom, bounds.maxZoom);
  const zoom = clampNumber(view.zoom, minZoom, maxZoom);
  const centerX = clampNumber(view.centerX, version.coverage.minX, version.coverage.maxX);
  const centerZ = clampNumber(view.centerZ, version.coverage.minZ, version.coverage.maxZ);
  const clamped = zoom !== view.zoom || centerX !== view.centerX || centerZ !== view.centerZ;

  return { view: { centerX, centerZ, zoom }, clamped };
}

function parseFiniteParam(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isCoordinateInRange(value: number): boolean {
  return Math.abs(value) <= maxCoordinateMagnitude;
}

/**
 * 读取分享链接里的历史视图参数。
 * 版本不存在/已下架：回退当前地图并返回 notice；视图参数非法：保留版本、回到默认视图。
 */
export function readMapHistoryParams(
  params: { get(name: string): string | null },
  versions: MapHistoryVersionDescriptor[],
  defaults: MapHistoryView,
  bounds: MapHistoryZoomBounds,
): MapHistoryParamState {
  const requestedVersionId = params.get('hv');
  const defaultState: MapHistoryParamState = {
    requestedVersionId,
    version: null,
    view: defaults,
    notice: null,
  };

  if (requestedVersionId === null) {
    return defaultState;
  }

  if (!historyVersionIdPattern.test(requestedVersionId)) {
    return { ...defaultState, notice: 'unknown-version' };
  }

  const version = versions.find((item) => item.id === requestedVersionId);
  if (!version) {
    return { ...defaultState, notice: 'unknown-version' };
  }

  if (version.status === 'archived') {
    return { ...defaultState, notice: 'archived-version' };
  }

  const rawView = {
    centerX: parseFiniteParam(params.get('hx')),
    centerZ: parseFiniteParam(params.get('hz')),
    zoom: parseFiniteParam(params.get('hzoom')),
  };
  const hasInvalidViewParam =
    (rawView.centerX === null && params.get('hx') !== null) ||
    (rawView.centerZ === null && params.get('hz') !== null) ||
    (rawView.zoom === null && params.get('hzoom') !== null) ||
    (rawView.centerX !== null && !isCoordinateInRange(rawView.centerX)) ||
    (rawView.centerZ !== null && !isCoordinateInRange(rawView.centerZ));

  if (hasInvalidViewParam) {
    const clampedDefaults = clampViewToHistoryVersion(defaults, version, bounds);
    return {
      requestedVersionId,
      version,
      view: clampedDefaults.view,
      notice: 'invalid-view',
    };
  }

  const view: MapHistoryView = {
    centerX: rawView.centerX ?? defaults.centerX,
    centerZ: rawView.centerZ ?? defaults.centerZ,
    zoom: rawView.zoom ?? defaults.zoom,
  };
  const clamped = clampViewToHistoryVersion(view, version, bounds);

  return {
    requestedVersionId,
    version,
    view: clamped.view,
    notice: clamped.clamped ? 'view-clamped' : null,
  };
}

/** 历史视图分享参数；坐标保留 1 位小数，足够复现视口且链接可读。 */
export function setMapHistoryParams(
  params: URLSearchParams,
  versionId: string,
  view: MapHistoryView,
): void {
  params.set('hv', versionId);
  params.set('hx', roundShareValue(view.centerX));
  params.set('hz', roundShareValue(view.centerZ));
  params.set('hzoom', roundShareValue(view.zoom));
}

export function clearMapHistoryParams(params: URLSearchParams): void {
  for (const name of mapHistoryParams) {
    params.delete(name);
  }
}

export function buildMapHistoryShareUrl(
  versionId: string,
  view: MapHistoryView,
  origin: string,
): string {
  const url = new URL(appPath('/map'), origin);
  setMapHistoryParams(url.searchParams, versionId, view);
  return url.toString();
}

/** 客户端与单元测试共用的瓦片 URL：version 是缓存隔离的第一维度。 */
export function buildMapHistoryTileProxyTemplate(versionId: string): string {
  return appPath(
    `/api/map/tile-proxy?version=${encodeURIComponent(versionId)}&z={z}&x={x}&y={y}&xd={xd}&yd={yd}`,
  );
}

export function buildMapHistoryTileCacheKey(
  versionId: string,
  tileZoom: number,
  tileX: number,
  tileZ: number,
): string {
  return `history:${versionId}:${tileZoom}:${tileX}:${tileZ}`;
}

/** 历史模式只渲染该版本自己的瓦片：这里不接收任何 fallback 模板。 */
export function isHistoryTileInCoverage(
  tileX: number,
  tileZ: number,
  tileZoom: number,
  coverage: MapTileCoverage,
): boolean {
  const worldSize = 256 / 2 ** tileZoom;
  const minX = tileX * worldSize;
  const maxX = (tileX + 1) * worldSize;
  const minZ = tileZ * worldSize;
  const maxZ = (tileZ + 1) * worldSize;

  return (
    maxX > coverage.minX && minX < coverage.maxX && maxZ > coverage.minZ && minZ < coverage.maxZ
  );
}

/**
 * 历史瓦片响应头：ETag 前缀版本号，避免上游复用同一文件时被其他版本命中；
 * 历史快照不可变，允许长缓存。
 */
export function createHistoryTileHeaders(
  versionId: string,
  options: { upstreamEtag?: string | null; contentType?: string } = {},
): Headers {
  const etagSeed = options.upstreamEtag
    ? options.upstreamEtag
        .replace(/^W\//, '')
        .replace(/"/g, '')
        .replace(/[^a-zA-Z0-9-]/g, '')
    : 'tile';
  const headers = new Headers({
    'Content-Type': options.contentType ?? 'image/png',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: `W/"yct-history-${versionId}-${etagSeed}"`,
    'X-YCT-Tile-Version': versionId,
  });
  return headers;
}

/** 历史模式缺图：明确 404 + no-store，让客户端显示占位而不是回退当前瓦片。 */
export function createHistoryTileEmptyResponse(versionId: string | null, reason: string): Response {
  const headers = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-YCT-Tile-Empty': reason,
  });
  if (versionId) {
    headers.set('X-YCT-Tile-Version', versionId);
  }
  return new Response('', { status: 404, headers });
}

function roundShareValue(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}
