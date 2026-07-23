import { NextRequest, NextResponse } from 'next/server';
import { poiSubmissionSchema } from '@yct/schemas';
import { readPoiCategories, findPoiCategory } from '../../../../lib/poi-categories';
import { submitPublicPoi } from '../../../../lib/poi-submission-workflow';
import { requireVerifiedLdpassUser } from '../../../../lib/user-auth';

export async function POST(request: NextRequest) {
  const user = await requireVerifiedLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = poiSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_submission',
        message: 'POI 投稿不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  if (parsed.data.visibility !== 'public_pending_review') {
    return NextResponse.json(
      {
        error: 'private_poi_not_supported',
        message: '当前阶段仅开放公开 POI 投稿审核，私有 POI 需要登录同步能力后再开放。',
      },
      { status: 400 },
    );
  }

  const categories = await readPoiCategories().catch(() => []);
  const category = findPoiCategory(categories, parsed.data.categoryId);
  if (!category || !category.acceptsPublicSubmissions) {
    return NextResponse.json(
      {
        error: 'poi_category_not_allowed',
        message: '当前 POI 分类不允许公开投稿。',
      },
      { status: 400 },
    );
  }

  const result = await submitPublicPoi({
    title: parsed.data.title,
    categoryId: parsed.data.categoryId,
    description: parsed.data.description,
    href: parsed.data.href,
    imageUrls: parsed.data.imageUrls,
    imageUrl: parsed.data.imageUrl,
    geometry: parsed.data.geometry,
    parentMarkerId: parsed.data.parentMarkerId,
    floorLabel: parsed.data.floorLabel,
    boundRegionMarkerIds: parsed.data.boundRegionMarkerIds,
    openingHours: parsed.data.openingHours,
    address: parsed.data.address,
    addressRoadMarkerId: parsed.data.addressRoadMarkerId,
    facilities: parsed.data.facilities,
    actorId: user.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.submission, { status: 201 });
}
