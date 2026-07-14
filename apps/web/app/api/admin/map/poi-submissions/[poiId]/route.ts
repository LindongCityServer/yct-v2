import { NextRequest, NextResponse } from 'next/server';
import { poiSubmissionAdminUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { findPoiCategory, readPoiCategories } from '../../../../../../lib/poi-categories';
import {
  archivePoiSubmissionByAdmin,
  updatePoiSubmissionByAdmin,
} from '../../../../../../lib/poi-submission-workflow';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ poiId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { poiId } = await params;
  const body = await request.json();
  const parsed = poiSubmissionAdminUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_submission_update',
        message: 'POI 投稿修正内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const categories = await readPoiCategories().catch(() => []);
  const category = findPoiCategory(categories, parsed.data.categoryId);
  if (!category) {
    return NextResponse.json(
      {
        error: 'unknown_poi_category',
        message: '请选择存在的 POI 分类。',
      },
      { status: 400 },
    );
  }

  const result = await updatePoiSubmissionByAdmin({
    poiId: decodeSegment(poiId),
    actorId: admin.ldpassUserId,
    title: parsed.data.title,
    categoryId: parsed.data.categoryId,
    iconFileName: parsed.data.iconFileName || undefined,
    description: parsed.data.description,
    href: parsed.data.href || undefined,
    imageUrl: parsed.data.imageUrl,
    geometry: parsed.data.geometry,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.submission);
}

export async function DELETE(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ poiId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { poiId } = await params;
  const result = await archivePoiSubmissionByAdmin({
    poiId: decodeSegment(poiId),
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.submission?.id,
    status: result.submission?.status,
  });
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
