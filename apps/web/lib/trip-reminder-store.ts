import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ISODateTimeString, TripReminder, TripReminderSource } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface TripReminderStoreSnapshot {
  version: 1;
  reminders: TripReminder[];
}

const emptySnapshot: TripReminderStoreSnapshot = {
  version: 1,
  reminders: [],
};

export async function listTripRemindersForUser(userId: string): Promise<TripReminder[]> {
  const snapshot = await readSnapshot();
  return snapshot.reminders
    .filter((reminder) => reminder.userId === userId)
    .sort(compareTripReminders);
}

export async function upsertTripRemindersForUser(input: {
  userId: string;
  reminders: TripReminder[];
  syncedAt?: ISODateTimeString;
}): Promise<TripReminder[]> {
  const snapshot = await readSnapshot();
  const syncedAt = input.syncedAt ?? new Date().toISOString();
  const incoming = input.reminders.map((reminder) => ({
    ...reminder,
    userId: input.userId,
    syncedAt,
    updatedAt: reminder.updatedAt ?? syncedAt,
  }));
  const incomingKeys = new Set(incoming.map(createReminderKey));
  const preserved = snapshot.reminders.filter(
    (reminder) =>
      reminder.userId !== input.userId || !incomingKeys.has(createReminderKey(reminder)),
  );

  const reminders = [...preserved, ...incoming].sort(compareTripReminders);
  await writeSnapshot({
    version: 1,
    reminders,
  });
  return incoming.sort(compareTripReminders);
}

export async function deleteTripRemindersForUser(input: {
  userId: string;
  reminderIds?: string[];
  source?: TripReminderSource;
}): Promise<TripReminder[]> {
  if (!input.source && (input.reminderIds?.length ?? 0) === 0) {
    return [];
  }

  const snapshot = await readSnapshot();
  const reminderIds = new Set(input.reminderIds ?? []);
  const deleted: TripReminder[] = [];
  const reminders = snapshot.reminders.filter((reminder) => {
    if (reminder.userId !== input.userId) {
      return true;
    }

    const matchedById = reminderIds.has(reminder.id);
    const matchedByLegacyOrderId = reminder.legacyOrderId
      ? reminderIds.has(reminder.legacyOrderId)
      : false;
    const matchedBySource = input.source ? reminder.source === input.source : false;

    if (matchedById || matchedByLegacyOrderId || matchedBySource) {
      deleted.push(reminder);
      return false;
    }

    return true;
  });

  if (deleted.length === 0) {
    return [];
  }

  await writeSnapshot({
    version: 1,
    reminders,
  });
  return deleted.sort(compareTripReminders);
}

async function readSnapshot(): Promise<TripReminderStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as TripReminderStoreSnapshot;
    return {
      version: 1,
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: TripReminderStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.tripReminderStorePath)
    ? config.tripReminderStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.tripReminderStorePath);
}

function createReminderKey(reminder: TripReminder): string {
  return reminder.legacyOrderId ? `legacy:${reminder.legacyOrderId}` : reminder.id;
}

function compareTripReminders(left: TripReminder, right: TripReminder): number {
  const leftTime = new Date(left.remindAt).getTime();
  const rightTime = new Date(right.remindAt).getTime();
  return rightTime - leftTime;
}
