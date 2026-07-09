import { NextRequest, NextResponse } from 'next/server';
import { poiCategoryProfileUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readPoiCategories } from '../../../../../lib/poi-categories';
import { updatePoiCategoryProfiles } from '../../../../../lib/poi-category-profile-workflow';
import { readRuntimeConfig } from '../../../../../lib/runtime-config';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const config = readRuntimeConfig();
  const categories = await readPoiCategories();
  return NextResponse.json({
    items: categories,
    iconBaseUrl: config.unminedMapBaseUrl,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = poiCategoryProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_category_profile',
        message: 'POI 分类配置不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updatePoiCategoryProfiles({
    categories: parsed.data.categories,
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json({
    items: result.categories ?? [],
    iconBaseUrl: readRuntimeConfig().unminedMapBaseUrl,
  });
}
