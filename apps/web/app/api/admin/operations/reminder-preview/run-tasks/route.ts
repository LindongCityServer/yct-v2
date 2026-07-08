import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireYctAdmin } from '../../../../../../lib/admin-auth';
import { runInternalTasks } from '../../../../../../lib/internal-task-runner';
import { readOperationsReminderPreview } from '../../../../../../lib/operations-reminder-preview';

export const dynamic = 'force-dynamic';

const adminTaskRunSchema = z.object({
  forceOperationsReminderRefresh: z.boolean().optional(),
  syncOperationsReminders: z.boolean().optional(),
  eventLimit: z.number().int().positive().max(1000).optional(),
  pushLimit: z.number().int().positive().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireYctAdmin(request);
  if (!admin.ok) {
    return admin.response;
  }

  const body = await parseBody(request);
  const parsed = adminTaskRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: '内部任务参数无效。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const taskRun = await runInternalTasks({
    actorId: admin.ldpassUserId,
    actorType: 'admin',
    forceOperationsReminderRefresh: parsed.data.forceOperationsReminderRefresh,
    syncOperationsReminders: parsed.data.syncOperationsReminders,
    eventLimit: parsed.data.eventLimit,
    pushLimit: parsed.data.pushLimit,
  });
  const preview = await readOperationsReminderPreview();

  return NextResponse.json({
    ...preview,
    taskRun,
  });
}

async function parseBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
