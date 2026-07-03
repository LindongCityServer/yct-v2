import { NextRequest, NextResponse } from 'next/server';
import { tripReminderDeleteSchema, tripReminderSyncSchema } from '@yct/schemas';
import {
  deleteUserTripReminders,
  listUserTripReminders,
  syncUserTripReminders,
} from '../../../../lib/trip-reminder-workflow';
import { requireActiveLdpassUser } from '../../../../lib/user-auth';

export async function GET(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const items = await listUserTripReminders(user.userId);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await request.json();
  const parsed = tripReminderSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_trip_reminder_sync',
        message: '行程提醒同步数据不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await syncUserTripReminders({
    userId: user.userId,
    reminders: parsed.data.reminders,
  });

  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const user = await requireActiveLdpassUser(request);
  if (!user.ok) {
    return user.response;
  }

  const body = await readJsonBody(request);
  const parsed = tripReminderDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_trip_reminder_delete',
        message: '行程提醒删除条件不符合要求。',
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const result = await deleteUserTripReminders({
    userId: user.userId,
    reminderIds: parsed.data.reminderIds,
    source: parsed.data.source,
    reason:
      parsed.data.source === 'legacy_order' ? 'legacy_sync_consent_revoked' : 'user_requested',
  });

  return NextResponse.json({
    deletedAt: result.deletedAt,
    deletedCount: result.reminders.length,
    reminderIds: result.reminders.map((reminder) => reminder.id),
  });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
