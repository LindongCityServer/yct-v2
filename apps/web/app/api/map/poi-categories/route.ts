import { NextResponse } from 'next/server';
import type { ApiListResponse, PoiCategory } from '@yct/contracts';
import { createApiMeta } from '../../../../lib/api-meta';
import { readPoiCategories } from '../../../../lib/poi-categories';

export async function GET() {
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
      } satisfies ApiListResponse<PoiCategory>,
      { status: 502 },
    );
  }

  const response: ApiListResponse<PoiCategory> = {
    meta: createApiMeta(
      items.length > 0 ? 'ready' : 'not_configured',
      items.length > 0 ? undefined : 'POI 图标候选尚未配置，且旧地图静态标记中没有可用图标。',
    ),
    items,
  };

  return NextResponse.json(response);
}
