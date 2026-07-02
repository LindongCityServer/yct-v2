import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { importLegacyContentAssets } from '../../../../../../lib/content-asset-workflow';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const result = await importLegacyContentAssets({
    actorId: admin.ldpassUserId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status ?? 400 });
  }

  return NextResponse.json(result);
}
