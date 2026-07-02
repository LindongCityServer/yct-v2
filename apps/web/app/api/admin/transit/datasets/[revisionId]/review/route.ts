import { NextRequest, NextResponse } from 'next/server';
import { transitDataReviewDecisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { reviewTransitDataRevision } from '../../../../../../../lib/transit-data-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitDataReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_review_decision',
        message: '交通数据审核结论不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await reviewTransitDataRevision({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        message: result.message,
      },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result.revision);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
