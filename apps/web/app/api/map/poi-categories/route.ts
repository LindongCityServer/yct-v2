import { NextResponse } from 'next/server';
import type { ApiListResponse, PoiCategory } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { readPoiCategories } from '../../../../lib/poi-categories';
import { readRuntimeConfig } from '../../../../lib/runtime-config';

interface PoiCategoryListResponse extends ApiListResponse<PoiCategory> {
  iconBaseUrl: string;
}

export async function GET() {
  const config = readRuntimeConfig();
  let items: PoiCategory[];
  try {
    items = await readPoiCategories();
  } catch (error) {
    return NextResponse.json(
      {
        meta: createApiMeta(
          'unavailable',
          error instanceof Error ? error.message : 'POI 分类源暂不可用。',
        ),
        items: [],
        iconBaseUrl: config.unminedMapBaseUrl,
      } satisfies PoiCategoryListResponse,
      { status: 502 },
    );
  }

  const response: PoiCategoryListResponse = {
    meta: createApiMeta(
      items.length > 0 ? 'ready' : 'not_configured',
      items.length > 0 ? undefined : 'POI 图标候选尚未配置，且旧地图静态标记中没有可用图标。',
    ),
    items,
    iconBaseUrl: config.unminedMapBaseUrl,
  };

  return NextResponse.json(response);
}
