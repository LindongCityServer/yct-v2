import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { promoteMaterialSymbolAsset } from '../../../../../lib/material-symbol-asset-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await request.json().catch(() => ({}));
  const iconName = typeof body?.iconName === 'string' ? body.iconName : '';
  const result = await promoteMaterialSymbolAsset({
    iconName,
    actorId: admin.ldpassUserId,
    reason: 'admin_confirmed',
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json(result.asset, { status: 201 });
}
