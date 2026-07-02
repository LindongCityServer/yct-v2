import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listAdminContentAssetRecords } from '../../../../../lib/content-asset-workflow';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const records = await listAdminContentAssetRecords();
  return NextResponse.json({
    items: records,
  });
}
