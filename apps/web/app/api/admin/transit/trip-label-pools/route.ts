import { NextRequest, NextResponse } from 'next/server';
import { transitTripLabelPoolsUpdateSchema } from '@yct/schemas';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import {
  listTransitTripLabelPools,
  updateTransitTripLabelPools,
} from '../../../../../lib/transit-trip-label-pool-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const pools = await listTransitTripLabelPools();
  return NextResponse.json({ items: pools });
}

export async function PUT(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = transitTripLabelPoolsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_transit_trip_label_pool',
        message: '班次标签池配置不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await updateTransitTripLabelPools({
    actorId: admin.ldpassUserId,
    actorName: admin.username,
    pools: parsed.data.pools,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json({ items: result.pools ?? [] });
}
