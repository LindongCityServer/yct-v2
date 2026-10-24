import { NextResponse } from 'next/server';
import type { ApiListResponse, TileProviderDescriptor, TileZoomRange } from '@yct/contracts';
import { tileProviderConfigSchema } from '@yct/schemas';
import { createApiMeta } from '../../../../lib/api-meta';
import {
  buildMapTileProxyTemplate,
  buildUnminedTileTemplate,
} from '../../../../lib/map-tile-templates';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export async function GET() {
  const config = readRuntimeConfig();
  const items: TileProviderDescriptor[] = [];
  const staticTileTemplate =
    config.tileSafeHttpsStaticTemplate ??
    (config.unminedMapBaseUrl ? buildUnminedTileTemplate(config.unminedMapBaseUrl) : null);
  const [staticZoomRange, freshZoomRange] = await Promise.all([
    staticTileTemplate ? readUnminedZoomRange(staticTileTemplate) : undefined,
    config.tileFreshHttpTemplate ? readUnminedZoomRange(config.tileFreshHttpTemplate) : undefined,
  ]);

  if (config.tileSafeHttpsStaticTemplate) {
    const provider = tileProviderConfigSchema.parse({
      id: 'lindong-safe-https-static',
      name: '临东 HTTPS 静态瓦片',
      sourceKind: 'safe-https-static',
      tileTemplate: config.tileSafeHttpsStaticTemplate,
    });

    items.push({
      ...provider,
      freshness: {
        note: '该源无混合内容风险，但可能不反映最新地图状态。',
      },
      zoomRange: staticZoomRange,
    });
  }

  if (!config.tileSafeHttpsStaticTemplate && config.unminedMapBaseUrl) {
    const provider = tileProviderConfigSchema.parse({
      id: 'lindong-unmined-static',
      name: '临东 uNmINeD 静态瓦片',
      sourceKind: 'safe-https-static',
      tileTemplate: buildUnminedTileTemplate(config.unminedMapBaseUrl),
      attribution: 'uNmINeD / 临东市服务器',
    });

    items.push({
      ...provider,
      freshness: {
        note: '该源来自 map.shangxiaoguan.top 的 HTTPS 静态地图，后续需接入 uNmINeD 坐标转换后完整渲染。',
      },
      zoomRange: staticZoomRange,
    });
  }

  if (config.tileFreshHttpTemplate) {
    const provider = tileProviderConfigSchema.parse({
      id: 'lindong-fresh-http',
      name: '临东较新瓦片',
      sourceKind: 'proxied',
      tileTemplate: buildMapTileProxyTemplate('fresh-http'),
    });

    items.push({
      ...provider,
      freshness: {
        note: '该源较新，已通过 YCT 后端代理同源加载以避免 HTTPS 混合内容风险。',
      },
      zoomRange: freshZoomRange,
    });
  }

  const response: ApiListResponse<TileProviderDescriptor> = {
    meta: createApiMeta(
      items.length > 0 ? 'ready' : 'not_configured',
      items.length > 0 ? undefined : '瓦片模板尚未配置。',
    ),
    items,
  };

  return NextResponse.json(response);
}

/** 从瓦片模板推导 uNmINeD 静态站根地址，读取其声明的缩放层级范围。 */
async function readUnminedZoomRange(tileTemplate: string): Promise<TileZoomRange | undefined> {
  const tilesIndex = tileTemplate.indexOf('tiles/');
  if (tilesIndex <= 0) {
    return undefined;
  }

  try {
    const response = await fetch(
      new URL('unmined.map.properties.js', tileTemplate.slice(0, tilesIndex)),
      { next: { revalidate: 300 }, signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) {
      return undefined;
    }

    const source = await response.text();
    const minZoom = readNumberProperty(source, 'minZoom');
    const maxZoom = readNumberProperty(source, 'maxZoom');
    if (minZoom === null || maxZoom === null || minZoom > maxZoom) {
      return undefined;
    }

    return { maxZoom, minZoom };
  } catch {
    return undefined;
  }
}

function readNumberProperty(source: string, propertyName: string): number | null {
  const match = new RegExp(`${propertyName}:\\s*(-?\\d+)`).exec(source);
  return match ? Number.parseInt(match[1] ?? '', 10) : null;
}
