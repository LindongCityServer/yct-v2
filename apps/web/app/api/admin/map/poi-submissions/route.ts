import { NextRequest, NextResponse } from 'next/server';
import type { PoiSubmission } from '@yct/contracts';
import { poiSubmissionAdminCreateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { findPoiCategory, readPoiCategories } from '../../../../../lib/poi-categories';
import {
  readPoiSubmissionImageMetadataByPublicPath,
  type StoredPoiSubmissionImageMetadata,
} from '../../../../../lib/poi-submission-image-store';
import {
  createPoiSubmissionByAdmin,
  listAdminPoiSubmissions,
} from '../../../../../lib/poi-submission-workflow';

type AdminPoiSubmissionResponse = PoiSubmission & {
  imageMetadata?: StoredPoiSubmissionImageMetadata;
};

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const submissions = await listAdminPoiSubmissions();
  const items = await Promise.all(submissions.map(withImageMetadata));
  return NextResponse.json({
    items,
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const parsed = poiSubmissionAdminCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_submission_create',
        message: '新增 POI 内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const categories = await readPoiCategories().catch(() => []);
  if (!findPoiCategory(categories, parsed.data.categoryId)) {
    return NextResponse.json(
      { error: 'unknown_poi_category', message: '请选择存在的 POI 分类。' },
      { status: 400 },
    );
  }

  const result = await createPoiSubmissionByAdmin({
    actorId: admin.ldpassUserId,
    title: parsed.data.title,
    categoryId: parsed.data.categoryId,
    iconFileName: parsed.data.iconFileName || undefined,
    description: parsed.data.description,
    href: parsed.data.href || undefined,
    imageUrl: parsed.data.imageUrl || undefined,
    geometry: parsed.data.geometry,
    parentMarkerId: parsed.data.parentMarkerId || undefined,
    boundRegionMarkerIds: parsed.data.boundRegionMarkerIds,
    openingHours: parsed.data.openingHours || undefined,
    address: parsed.data.address || undefined,
    addressRoadMarkerId: parsed.data.addressRoadMarkerId || undefined,
    facilities: parsed.data.facilities,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.submission, { status: 201 });
}

async function withImageMetadata(submission: PoiSubmission): Promise<AdminPoiSubmissionResponse> {
  if (!submission.imageUrl) {
    return submission;
  }

  try {
    const imageMetadata = await readPoiSubmissionImageMetadataByPublicPath(submission.imageUrl);
    return imageMetadata ? { ...submission, imageMetadata } : submission;
  } catch {
    return submission;
  }
}
