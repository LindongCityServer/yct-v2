import { randomUUID } from 'node:crypto';
import type {
  TripReminder,
  TripReminderSource,
  YctEventPayloadMap,
  YctEventType,
} from '@yct/contracts';
import { createYctEvent, emitAppEvent } from './app-event-bus';
import { ensureNotificationDeliveryListenersRegistered } from './notification-delivery-listeners';
import {
  deleteTripRemindersForUser,
  listTripRemindersForUser,
  upsertTripRemindersForUser,
} from './trip-reminder-store';

ensureNotificationDeliveryListenersRegistered();

export async function listUserTripReminders(userId: string): Promise<TripReminder[]> {
  return listTripRemindersForUser(userId);
}

export async function syncUserTripReminders(input: {
  userId: string;
  reminders: TripReminder[];
}): Promise<{ reminders: TripReminder[]; syncedAt: string }> {
  const syncedAt = new Date().toISOString();
  const reminders = await upsertTripRemindersForUser({
    userId: input.userId,
    reminders: input.reminders,
    syncedAt,
  });

  for (const reminder of reminders) {
    if (reminder.status === 'scheduled' || reminder.status === 'notification_queued') {
      await emitEvent('TripReminderScheduled', input.userId, {
        reminderId: reminder.id,
        userId: input.userId,
        title: reminder.title,
        source: reminder.source,
        remindAt: reminder.remindAt,
      });
    }
  }

  return { reminders, syncedAt };
}

export async function deleteUserTripReminders(input: {
  userId: string;
  reminderIds?: string[];
  source?: TripReminderSource;
  reason?: 'user_requested' | 'legacy_sync_consent_revoked' | 'system';
}): Promise<{ reminders: TripReminder[]; deletedAt: string }> {
  const deletedAt = new Date().toISOString();
  const reminders = await deleteTripRemindersForUser({
    userId: input.userId,
    reminderIds: input.reminderIds,
    source: input.source,
  });

  if (reminders.length > 0) {
    await emitEvent('TripReminderDeleted', input.userId, {
      userId: input.userId,
      reminderIds: reminders.map((reminder) => reminder.id),
      source: input.source,
      deletedAt,
      reason: input.reason ?? 'user_requested',
    });
  }

  return { reminders, deletedAt };
}

async function emitEvent<TType extends YctEventType>(
  type: TType,
  actorId: string,
  payload: YctEventPayloadMap[TType],
): Promise<void> {
  await emitAppEvent(
    createYctEvent({
      eventId: `event_${randomUUID()}`,
      type,
      occurredAt: new Date().toISOString(),
      actor: {
        type: 'user',
        id: actorId,
      },
      payload,
    }),
  );
}
