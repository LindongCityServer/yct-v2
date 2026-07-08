import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../lib/admin-auth';
import { readOperationsReminderPreview } from '../../../../../lib/operations-reminder-preview';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const preview = await readOperationsReminderPreview();
  return NextResponse.json(preview);
}
