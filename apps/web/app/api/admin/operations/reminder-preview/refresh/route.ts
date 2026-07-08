import { NextRequest, NextResponse } from 'next/server';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { requestOperationsReminderDeliveryRefresh } from '../../../../../../lib/operations-reminder-delivery-workflow';
import { readOperationsReminderPreview } from '../../../../../../lib/operations-reminder-preview';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  await requestOperationsReminderDeliveryRefresh({
    actorId: admin.ldpassUserId,
    reason: 'admin_manual_refresh',
  });
  const preview = await readOperationsReminderPreview();

  return NextResponse.json(preview);
}
