import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ISODateTimeString,
  LocaleCode,
  LocalePreference,
  UserLocalePreference,
} from '@yct/contracts';
import { readRuntimeConfig } from './runtime-config';

interface LocalePreferenceStoreSnapshot {
  version: 1;
  preferences: UserLocalePreference[];
}

const emptySnapshot: LocalePreferenceStoreSnapshot = {
  version: 1,
  preferences: [],
};

export async function findLocalePreferenceByUserId(
  userId: string,
): Promise<UserLocalePreference | undefined> {
  const snapshot = await readSnapshot();
  return snapshot.preferences.find((preference) => preference.userId === userId);
}

export async function upsertLocalePreference(
  preference: UserLocalePreference,
): Promise<UserLocalePreference> {
  const snapshot = await readSnapshot();
  const existing = snapshot.preferences.find((item) => item.userId === preference.userId);
  const next: UserLocalePreference = {
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

export function createDefaultLocalePreference(input: {
  userId: string;
  ldpassUserId: string;
  resolvedLocale: LocaleCode;
  updatedAt?: ISODateTimeString;
}): UserLocalePreference {
  return {
    userId: input.userId,
    ldpassUserId: input.ldpassUserId,
    locale: 'system',
    resolvedLocale: input.resolvedLocale,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function resolveLocalePreference(
  locale: LocalePreference,
  acceptLanguage?: string | null,
): LocaleCode {
  if (locale !== 'system') {
    return locale;
  }

  return resolveBrowserLocale(acceptLanguage);
}

function resolveBrowserLocale(acceptLanguage?: string | null): LocaleCode {
  const candidates = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag = '', qValue] = part.trim().split(';q=');
      const q = qValue ? Number(qValue) : 1;
      return {
        tag: tag.toLowerCase(),
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .filter((item) => item.tag)
    .sort((left, right) => right.q - left.q);

  for (const candidate of candidates) {
    if (
      candidate.tag === 'zh-hant' ||
      candidate.tag.startsWith('zh-tw') ||
      candidate.tag.startsWith('zh-hk') ||
      candidate.tag.startsWith('zh-mo')
    ) {
      return 'zh-Hant';
    }

    if (
      candidate.tag === 'zh-cn' ||
      candidate.tag === 'zh-sg' ||
      candidate.tag === 'zh' ||
      candidate.tag.startsWith('zh-hans')
    ) {
      return 'zh-CN';
    }

    if (candidate.tag === 'en' || candidate.tag.startsWith('en-')) {
      return 'en';
    }
  }

  return 'zh-CN';
}

async function readSnapshot(): Promise<LocalePreferenceStoreSnapshot> {
  const storePath = resolveStorePath();

  try {
    const source = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(source) as LocalePreferenceStoreSnapshot;
    return {
      version: 1,
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    };
  } catch {
    return emptySnapshot;
  }
}

async function writeSnapshot(snapshot: LocalePreferenceStoreSnapshot): Promise<void> {
  const storePath = resolveStorePath();
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

function resolveStorePath(): string {
  const config = readRuntimeConfig();
  return path.isAbsolute(config.localePreferenceStorePath)
    ? config.localePreferenceStorePath
    : path.join(/*turbopackIgnore: true*/ process.cwd(), config.localePreferenceStorePath);
}
