import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ISODateTimeString, UserPushPreference } from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface NotificationPreferenceStoreSnapshot {
  version: 1;
  preferences: UserPushPreference[];
}

const emptySnapshot: NotificationPreferenceStoreSnapshot = {
  version: 1,
  preferences: [],
};

export async function findPushPreferenceByUserId(
  userId: string,
): Promise<UserPushPreference | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.preferences.find((preference) => preference.userId === userId);
}

export async function listPushPreferences(): Promise<UserPushPreference[]> {
  const snapshot = await readSnapshot();
  return [...snapshot.preferences].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function upsertPushPreference(
  preference: UserPushPreference,
): Promise<UserPushPreference> {
  const snapshot = await readSnapshot();
  const existing = snapshot.preferences.find((item) => item.userId === preference.userId);
  const next: UserPushPreference = {
    ...preference,
    updatedAt: preference.updatedAt || new Date().toISOString(),
  };

  await writeSnapshot({
    ...snapshot,
    preferences: existing
      ? snapshot.preferences.map((item) => (item.userId === preference.userId ? next : item))
      : [...snapshot.preferences, next],
  });

  return next;
}

export function createDefaultPushPreference(input: {
  userId: string;
  ldpassUserId: string;
  updatedAt?: ISODateTimeString;
}): UserPushPreference {
  const config = readRuntimeConfig();
  return {
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    enabled: false,
    enabledTypes: config.pushDefaultEnabledTypes,
    quietHours: {
      enabled: false,
      startTime: '23:00',
      endTime: '07:00',
      timezone: 'Asia/Shanghai',
    },
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

async function readSnapshot(): Promise<NotificationPreferenceStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as NotificationPreferenceStoreSnapshot;
    return {
      version: 1,
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: NotificationPreferenceStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.notificationPreferenceStorePath)
    ? config.notificationPreferenceStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.notificationPreferenceStorePath);
}
