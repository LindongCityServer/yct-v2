import { NextRequest, NextResponse } from 'next/server';
import { poiSubmissionImageReviewUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  listAdminPoiSubmissionImageReviews,
  updatePoiSubmissionImageReview,
} from '../../../../../lib/poi-submission-image-review-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const reviews = await listAdminPoiSubmissionImageReviews();
  return NextResponse.json({
    items: reviews,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = poiSubmissionImageReviewUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_submission_image_review',
        message: 'POI 投稿图片审核状态不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updatePoiSubmissionImageReview({
    ...parsed.data,
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json({
    items: result.reviews ?? [],
  });
}
