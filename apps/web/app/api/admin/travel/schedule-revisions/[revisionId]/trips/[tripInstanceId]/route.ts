import { NextRequest, NextResponse } from 'next/server';
import { transitItemApprovalActionSchema, travelScheduleTripUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../lib/admin-auth';
import {
  deleteTravelScheduleTrip,
  updateTravelScheduleTripApprovalStatus,
  updateTravelScheduleTrip,
} from '../../../../../../../../lib/travel-schedule-revision-workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; tripInstanceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitItemApprovalActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_schedule_trip_approval_action',
        message: '班次审批动作不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, tripInstanceId } = await params;
  const result = await updateTravelScheduleTripApprovalStatus({
    revisionId: decodeSegment(revisionId),
    tripInstanceId: decodeSegment(tripInstanceId),
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

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; tripInstanceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = travelScheduleTripUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_schedule_trip_update',
        message: '班次修正内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, tripInstanceId } = await params;
  const result = await updateTravelScheduleTrip({
    revisionId: decodeSegment(revisionId),
    tripInstanceId: decodeSegment(tripInstanceId),
    actorId: admin.ldpassUserId,
    patch: parsed.data,
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

export async function DELETE(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; tripInstanceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const { revisionId, tripInstanceId } = await params;
  const result = await deleteTravelScheduleTrip({
    revisionId: decodeSegment(revisionId),
    tripInstanceId: decodeSegment(tripInstanceId),
    actorId: admin.ldpassUserId,
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
