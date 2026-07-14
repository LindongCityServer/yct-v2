import { NextRequest, NextResponse } from 'next/server';
import { transitStationCoordinateUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../../../../lib/admin-auth';
import { updateTransitStationCoordinate } from '../../../../../../../../lib/transit-data-workflow';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: Readonly<{ params: Promise<{ revisionId: string; stationSourceId: string }> }>,
) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json();
  const parsed = transitStationCoordinateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_station_coordinate',
        message: '站点坐标修正内容不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { revisionId, stationSourceId } = await params;
  const result = await updateTransitStationCoordinate({
    revisionId: decodeSegment(revisionId),
    stationSourceId: decodeSegment(stationSourceId),
    actorId: admin.ldpassUserId,
    x: parsed.data.x,
    z: parsed.data.z,
    boundPoiRefs: parsed.data.boundPoiRefs?.map((ref) => ({
      markerId: ref.markerId.trim(),
      label: ref.label.trim(),
      categoryId: ref.categoryId?.trim() || undefined,
    })),
    boundPoiMarkerId: parsed.data.boundPoiMarkerId?.trim() || undefined,
    boundPoiLabel: parsed.data.boundPoiLabel?.trim() || undefined,
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
