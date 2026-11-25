import { appPath } from './app-paths';
import {
  metroWayfindingIconOptions,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityIconAssetName,
  type MetroWayfindingElement,
  type MetroWayfindingLayout,
} from './metro-wayfinding';
import {
  parseSvgMarkup,
  type MetroWayfindingSvgAssets,
  type MetroWayfindingSvgMarkup,
} from './metro-wayfinding-svg';

/**
 * 浏览器端的导视牌 SVG 素材缓存。
 *
 * 与服务端 `material-glyphs.ts` 读取本地文件不同，这里从 public 资源按需拉取，
 * 但解析与渲染完全复用 `metro-wayfinding-svg.ts`，保证画布与导出图同源。
 */

type AssetKind = 'symbol' | 'facility' | 'arrow';

interface AssetRequest {
  kind: AssetKind;
  key: string;
  url: string;
}

const symbolMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();
const facilityMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();
const arrowMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();
const pendingRequests = new Map<string, Promise<void>>();

function collectAssetRequests(layout: MetroWayfindingLayout): AssetRequest[] {
  const rowCount = layout.mode === 'double' ? 2 : 1;
  const requests: AssetRequest[] = [];
  const visit = (element: MetroWayfindingElement) => {
    if (element.type === 'facility') {
      const icon =
        metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
        metroWayfindingIconOptions[0]!;
      const assetName = resolveMetroFacilityIconAssetName(
        element.iconId,
        element.direction,
        element.variant,
      );
      if (assetName) {
        const framed = element.frameShape === 'rectangle' && element.frameFillMode === 'none';
        const variant = framed ? 'framed' : 'plain';
        requests.push({
          kind: 'facility',
          key: `${variant}/${assetName}`,
          url: appPath(`/metro-facilities/${variant}/${assetName}.svg`),
        });
        return;
      }
      requests.push({
        kind: 'symbol',
        key: icon.symbol,
        url: appPath(`/material-symbols/outlined/${icon.symbol}.svg`),
      });
      if (element.frameShape === 'rectangle' && element.frameFillMode === 'none') {
        requests.push({
          kind: 'facility',
          key: 'framed/frame',
          url: appPath('/metro-facilities/framed/frame.svg'),
        });
      }
      return;
    }
    if (element.type === 'arrow') {
      if (element.style !== 'classic') {
        const assetName = resolveMetroArrowIconAssetName(element.iconId) ?? 'south-west';
        requests.push({
          kind: 'arrow',
          key: assetName,
          url: appPath(`/metro-arrows/${assetName}.svg`),
        });
      }
      if (element.framed && element.frameFillMode === 'none') {
        requests.push({
          kind: 'facility',
          key: 'framed/frame',
          url: appPath('/metro-facilities/framed/frame.svg'),
        });
      }
      return;
    }
    if (element.type === 'combination') {
      element.children.forEach(visit);
    }
  };
  layout.rows.slice(0, rowCount).flat().forEach(visit);
  return requests;
}

function isRequestCached(request: AssetRequest): boolean {
  if (request.kind === 'symbol') return symbolMarkupCache.has(request.key);
  if (request.kind === 'facility') return facilityMarkupCache.has(request.key);
  return arrowMarkupCache.has(request.key);
}

/** 当前版式所需素材是否已全部在缓存中，可直接同步渲染。 */
export function hasMetroWayfindingSvgAssets(layout: MetroWayfindingLayout): boolean {
  return collectAssetRequests(layout).every(isRequestCached);
}

async function loadRequest(request: AssetRequest): Promise<void> {
  if (isRequestCached(request)) {
    return;
  }
  const pending = pendingRequests.get(`${request.kind}:${request.key}`);
  if (pending) {
    return pending;
  }
  const task = (async () => {
    const response = await fetch(request.url, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`导视牌素材读取失败：${request.url}`);
    }
    const markup = parseSvgMarkup(await response.text());
    if (!markup) {
      throw new Error(`导视牌素材格式无效：${request.url}`);
    }
    if (request.kind === 'symbol') symbolMarkupCache.set(request.key, markup);
    else if (request.kind === 'facility') facilityMarkupCache.set(request.key, markup);
    else arrowMarkupCache.set(request.key, markup);
  })().finally(() => {
    pendingRequests.delete(`${request.kind}:${request.key}`);
  });
  pendingRequests.set(`${request.kind}:${request.key}`, task);
  return task;
}

/** 预加载当前版式所需的全部素材；全部命中缓存时立即完成。 */
export async function loadMetroWayfindingSvgAssets(layout: MetroWayfindingLayout): Promise<void> {
  const uniqueRequests = new Map<string, AssetRequest>();
  for (const request of collectAssetRequests(layout)) {
    uniqueRequests.set(`${request.kind}:${request.key}`, request);
  }
  await Promise.all([...uniqueRequests.values()].map(loadRequest));
}

/** 渲染时使用的同步素材读取器；素材缺失会直接抛错，由调用方决定回退策略。 */
export function createClientMetroWayfindingSvgAssets(): MetroWayfindingSvgAssets {
  return {
    getMaterialSymbolMarkup(symbol) {
      const markup = symbolMarkupCache.get(symbol);
      if (!markup) throw new Error(`导视牌素材尚未加载：${symbol}`);
      return markup;
    },
    getMetroFacilityAssetMarkup(assetName, variant) {
      const markup = facilityMarkupCache.get(`${variant}/${assetName}`);
      if (!markup) throw new Error(`导视牌素材尚未加载：${variant}/${assetName}`);
      return markup;
    },
    getMetroArrowAssetMarkup(assetName) {
      const markup = arrowMarkupCache.get(assetName);
      if (!markup) throw new Error(`导视牌素材尚未加载：${assetName}`);
      return markup;
    },
  };
}
