import { NextRequest, NextResponse } from 'next/server';
import { transitLineBatchApprovalSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../lib/admin-auth';
import { updateTransitLineApprovalStatuses } from '../../../../../../../../lib/transit-data-workflow';

export const dynamic = 'force-dynamic';

/** 批量审批线路：整批一次写入，避免逐条请求串行等待。 */
export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitLineBatchApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_line_batch_approval',
        message: '线路批量审批内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await updateTransitLineApprovalStatuses({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    lineSourceIds: parsed.data.lineSourceIds,
    action: parsed.data.action,
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
