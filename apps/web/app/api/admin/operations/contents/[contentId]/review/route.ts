import { NextRequest, NextResponse } from 'next/server';
import { contentReviewDecisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { reviewContentRevision } from '../../../../../../../lib/content-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ contentId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = contentReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_review_decision',
        message: '审核决定不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { contentId } = await params;
  const result = await reviewContentRevision({
    contentId: decodeSegment(contentId),
    actorId: admin.ldpassUserId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.record);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
