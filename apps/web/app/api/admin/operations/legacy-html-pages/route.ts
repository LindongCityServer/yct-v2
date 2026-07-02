import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readLegacyHtmlContentMigrationPreview } from '../../../../../lib/legacy-html-content-migration';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const preview = await readLegacyHtmlContentMigrationPreview();
  return NextResponse.json(preview);
}
