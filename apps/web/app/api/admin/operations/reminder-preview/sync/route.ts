import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { readOperationsReminderPreview } from '../../../../../../lib/operations-reminder-preview';
import { syncTransitServiceNoticeReminderSource } from '../../../../../../lib/operations-reminder-source-sync-workflow';

export const dynamic = 'force-dynamic';

const reminderSourceSyncSchema = z.object({
  forceRefresh: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await parseBody(request);
  const parsed = reminderSourceSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: '公告源同步参数无效。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const syncResult = await syncTransitServiceNoticeReminderSource({
    actorId: admin.ldpassUserId,
    actorType: 'admin',
    forceRefresh: parsed.data.forceRefresh,
  });
  const preview = await readOperationsReminderPreview();

  return NextResponse.json({
    ...preview,
    syncResult,
  });
}

async function parseBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
