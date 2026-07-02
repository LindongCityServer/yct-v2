import { NextRequest, NextResponse } from 'next/server';
import { serviceEntryReviewDecisionSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import { reviewServiceEntry } from '../../../../../../../lib/service-entry-workflow';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ entryId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = serviceEntryReviewDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_service_entry_review',
        message: '服务入口审核决定不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { entryId } = await params;
  const result = await reviewServiceEntry({
    serviceEntryId: decodeSegment(entryId),
    actorId: admin.ldpassUserId,
    decision: parsed.data.decision,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result.entry);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
