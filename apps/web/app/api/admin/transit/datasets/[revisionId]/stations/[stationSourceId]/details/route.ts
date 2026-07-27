import { NextRequest, NextResponse } from 'next/server';
import { transitStationDetailUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../../lib/admin-auth';
import { updateTransitStationDetail } from '../../../../../../../../../lib/transit-data-workflow';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; stationSourceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const parsed = transitStationDetailUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_station_detail_update',
        message: '站内设施编辑内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, stationSourceId } = await params;
  const result = await updateTransitStationDetail({
    revisionId: decodeSegment(revisionId),
    detailSourceId: decodeSegment(stationSourceId),
    actorId: admin.ldpassUserId,
    patch: parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
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
