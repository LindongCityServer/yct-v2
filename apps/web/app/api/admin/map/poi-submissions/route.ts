import { NextRequest, NextResponse } from 'next/server';
import type { PoiSubmission } from '@yct/contracts';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  readPoiSubmissionImageMetadataByPublicPath,
  type StoredPoiSubmissionImageMetadata,
} from '../../../../../lib/poi-submission-image-store';
import { listAdminPoiSubmissions } from '../../../../../lib/poi-submission-workflow';

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
