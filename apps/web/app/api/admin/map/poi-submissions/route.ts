import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { listAdminPoiSubmissions } from '../../../../../lib/poi-submission-workflow';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const submissions = await listAdminPoiSubmissions();
  return NextResponse.json({
    items: submissions,
  });
}
