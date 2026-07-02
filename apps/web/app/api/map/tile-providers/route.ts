import { NextResponse } from 'next/server';
import type { ApiListResponse, TileProviderDescriptor } from '@yct/contracts';
import { tileProviderConfigSchema } from '@yct/schemas';
import { createApiMeta } from '../../../../lib/api-meta';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

export function GET() {
  const config = readRuntimeConfig();
  const items: TileProviderDescriptor[] = [];

  if (config.tileFreshHttpTemplate) {
    const provider = tileProviderConfigSchema.parse({
      id: 'lindong-fresh-http',
      name: '临东较新 HTTP 瓦片',
      sourceKind: 'fresh-http',
      tileTemplate: config.tileFreshHttpTemplate,
    });

    items.push({
      ...provider,
      freshness: {
        note: '该源较新，但 HTTPS 主站可能产生混合内容风险。',
      },
    });
  }

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

function buildUnminedTileTemplate(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.jpeg`;
}
