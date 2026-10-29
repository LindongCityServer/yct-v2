import { NextRequest, NextResponse } from 'next/server';
import { travelScheduleTripBatchMutationSchema, travelScheduleTripDraftSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../lib/admin-auth';
import {
  createTravelScheduleTrip,
  mutateTravelScheduleTrips,
} from '../../../../../../../lib/travel-schedule-revision-workflow';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = travelScheduleTripDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_schedule_trip_create',
        message: '班次新增内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await createTravelScheduleTrip({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    trip: parsed.data,
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

/** 批量保存：工作台一次提交所有新增与修正，服务端只写一次版本。 */
export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = travelScheduleTripBatchMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_travel_schedule_trip_batch',
        message: '班次批量保存内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId } = await params;
  const result = await mutateTravelScheduleTrips({
    revisionId: decodeSegment(revisionId),
    actorId: admin.ldpassUserId,
    updates: parsed.data.updates,
    creates: parsed.data.creates,
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
