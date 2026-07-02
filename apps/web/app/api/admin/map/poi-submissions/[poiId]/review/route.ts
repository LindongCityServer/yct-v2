import { NextRequest, NextResponse } from 'next/server';
import { poiSubmissionReviewDecisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { reviewPoiSubmission } from '../../../../../../../lib/poi-submission-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ poiId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = poiSubmissionReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_poi_submission_review',
        message: 'POI 审核决定不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { poiId } = await params;
  const result = await reviewPoiSubmission({
    poiId: decodeSegment(poiId),
    actorId: admin.ldpassUserId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.submission);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
