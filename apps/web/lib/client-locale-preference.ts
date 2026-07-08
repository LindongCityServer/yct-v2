import type { LocaleCode, LocalePreference, UserLocalePreference } from '@yct/contracts';
import { appPath } from './app-paths';

export const localePreferenceStorageKey = 'yct.localePreference.v1';
export const localePreferenceChangedEventName = 'yct:locale-preference-changed';

export const supportedLocaleCodes = ['zh-CN', 'zh-Hant', 'en'] as const satisfies readonly LocaleCode[];
export const supportedLocalePreferences = [
  'system',
  ...supportedLocaleCodes,
] as const satisfies readonly LocalePreference[];

export interface ClientLocalePreferenceState {
  locale: LocalePreference;
  resolvedLocale: LocaleCode;
  updatedAt?: string;
  source: 'default' | 'local' | 'server';
}

export function readLocalLocalePreference(): ClientLocalePreferenceState {
  if (typeof window === 'undefined') {
    return createDefaultLocalePreferenceState();
  }

  const source = window.localStorage.getItem(localePreferenceStorageKey);
  const locale = isLocalePreference(source) ? source : 'system';
  return {
    locale,
    resolvedLocale: resolveClientLocalePreference(locale),
    source: source ? 'local' : 'default',
  };
}

export function writeLocalLocalePreference(locale: LocalePreference): ClientLocalePreferenceState {
  if (typeof window === 'undefined') {
    return createDefaultLocalePreferenceState(locale);
  }

  window.localStorage.setItem(localePreferenceStorageKey, locale);
  const state: ClientLocalePreferenceState = {
    locale,
    resolvedLocale: resolveClientLocalePreference(locale),
    updatedAt: new Date().toISOString(),
    source: 'local',
  };
  window.dispatchEvent(new CustomEvent(localePreferenceChangedEventName, { detail: state }));
  return state;
}

export async function fetchServerLocalePreference(): Promise<ClientLocalePreferenceState | undefined> {
  const response = await fetch(appPath('/api/account/locale-preference'), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    return undefined;
  }

  const data = (await response.json()) as { item?: UserLocalePreference };
  return data.item ? normalizeServerLocalePreference(data.item) : undefined;
}

export async function updateServerLocalePreference(
  locale: LocalePreference,
): Promise<ClientLocalePreferenceState> {
  const localState = writeLocalLocalePreference(locale);
  const response = await fetch(appPath('/api/account/locale-preference'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({ locale }),
  });

  if (!response.ok) {
    return localState;
  }

  const data = (await response.json()) as { item?: UserLocalePreference };
  return data.item ? normalizeServerLocalePreference(data.item) : localState;
}

export function resolveClientLocalePreference(locale: LocalePreference): LocaleCode {
  if (locale !== 'system') {
    return locale;
  }

  if (typeof navigator === 'undefined') {
    return 'zh-CN';
  }

  for (const language of navigator.languages.length ? navigator.languages : [navigator.language]) {
    const resolved = resolveLocaleTag(language);
    if (resolved) {
      return resolved;
    }
  }

  return 'zh-CN';
}

function normalizeServerLocalePreference(
  preference: UserLocalePreference,
): ClientLocalePreferenceState {
  return {
    locale: preference.locale,
    resolvedLocale: preference.resolvedLocale,
    updatedAt: preference.updatedAt,
    source: 'server',
  };
}

function createDefaultLocalePreferenceState(
  locale: LocalePreference = 'system',
): ClientLocalePreferenceState {
  return {
    locale,
    resolvedLocale: locale === 'system' ? 'zh-CN' : locale,
    source: 'default',
  };
}

function isLocalePreference(value: string | null | undefined): value is LocalePreference {
  return supportedLocalePreferences.some((locale) => locale === value);
}

function resolveLocaleTag(value: string | undefined): LocaleCode | undefined {
  const tag = value?.trim().toLowerCase();
  if (!tag) {
    return undefined;
  }

  if (
    tag === 'zh-hant' ||
    tag.startsWith('zh-tw') ||
    tag.startsWith('zh-hk') ||
    tag.startsWith('zh-mo')
  ) {
    return 'zh-Hant';
  }

  if (tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg' || tag.startsWith('zh-hans')) {
    return 'zh-CN';
  }

  if (tag === 'en' || tag.startsWith('en-')) {
    return 'en';
  }

  return undefined;
}
