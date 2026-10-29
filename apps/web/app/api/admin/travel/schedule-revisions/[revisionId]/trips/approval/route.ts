import { NextRequest, NextResponse } from 'next/server';
import { travelScheduleTripBatchApprovalSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../lib/admin-auth';
import { updateTravelScheduleTripsApprovalStatus } from '../../../../../../../../lib/travel-schedule-revision-workflow';

export const dynamic = 'force-dynamic';

/** 批量审批：整批一次写入，避免逐条请求串行等待。 */
export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = travelScheduleTripBatchApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_schedule_trip_batch_approval',
        message: '班次批量审批内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await updateTravelScheduleTripsApprovalStatus({
    revisionId: decodeSegment(revisionId),
    tripInstanceIds: parsed.data.tripInstanceIds,
    actorId: admin.ldpassUserId,
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
