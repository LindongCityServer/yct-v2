'use client';

import { useEffect } from 'react';
import {
  fetchServerLocalePreference,
  localePreferenceChangedEventName,
  localePreferenceStorageKey,
  readLocalLocalePreference,
  writeLocalLocalePreference,
  type ClientLocalePreferenceState,
} from '../lib/client-locale-preference';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentMode = 'ldpass' | 'green' | 'red' | 'gray';
export type MotionMode = 'system' | 'full' | 'reduced';
export type FontMode = 'harmony' | 'system';

export const preferenceKeys = {
  theme: 'yct.themeMode',
  accent: 'yct.accentMode',
  motion: 'yct.motionMode',
  font: 'yct.fontMode',
} as const;

export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.colorScheme = mode;
  window.localStorage.setItem(preferenceKeys.theme, mode);
}

export function applyAccentMode(mode: AccentMode) {
  if (mode === 'red' || mode === 'gray') {
    document.documentElement.dataset.accent = mode;
  } else {
    delete document.documentElement.dataset.accent;
  }
  window.localStorage.setItem(preferenceKeys.accent, mode);
}

export function applyMotionMode(mode: MotionMode) {
  if (mode === 'full' || mode === 'reduced') {
    document.documentElement.dataset.motion = mode;
  } else {
    delete document.documentElement.dataset.motion;
  }
  window.localStorage.setItem(preferenceKeys.motion, mode);
}

export function applyFontMode(mode: FontMode) {
  if (mode === 'system') {
    document.documentElement.dataset.font = mode;
  } else {
    delete document.documentElement.dataset.font;
  }
  window.localStorage.setItem(preferenceKeys.font, mode);
}

export function applyLocalePreferenceState(state: ClientLocalePreferenceState) {
  document.documentElement.lang = state.resolvedLocale;
}

export function readThemeMode(): ThemeMode {
  const value = window.localStorage.getItem(preferenceKeys.theme);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function readAccentMode(): AccentMode {
  const value = window.localStorage.getItem(preferenceKeys.accent);
  return value === 'green' || value === 'red' || value === 'gray' || value === 'ldpass'
    ? value
    : 'ldpass';
}

export function readMotionMode(): MotionMode {
  const value = window.localStorage.getItem(preferenceKeys.motion);
  return value === 'full' || value === 'reduced' || value === 'system' ? value : 'system';
}

export function readFontMode(): FontMode {
  const value = window.localStorage.getItem(preferenceKeys.font);
  return value === 'system' || value === 'harmony' ? value : 'harmony';
}

function applyStoredPreferences() {
  applyThemeMode(readThemeMode());
  applyAccentMode(readAccentMode());
  applyMotionMode(readMotionMode());
  applyFontMode(readFontMode());
  applyLocalePreferenceState(readLocalLocalePreference());
}

export function PreferenceBridge() {
  useEffect(() => {
    applyStoredPreferences();
    let ignoreServerLocale = false;

    const handleStorage = (event: StorageEvent) => {
      if (
        Object.values(preferenceKeys).includes(
          event.key as (typeof preferenceKeys)[keyof typeof preferenceKeys],
        )
      ) {
        applyStoredPreferences();
      }

      if (event.key === localePreferenceStorageKey) {
        applyLocalePreferenceState(readLocalLocalePreference());
      }
    };

    const handleLocalePreferenceChanged = (event: Event) => {
      const state =
        event instanceof CustomEvent ? (event.detail as ClientLocalePreferenceState | undefined) : undefined;
      applyLocalePreferenceState(state ?? readLocalLocalePreference());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(localePreferenceChangedEventName, handleLocalePreferenceChanged);

    void fetchServerLocalePreference()
      .then((preference) => {
        if (!preference || ignoreServerLocale) {
          return;
        }

        writeLocalLocalePreference(preference.locale);
        applyLocalePreferenceState(preference);
      })
      .catch(() => undefined);

    return () => {
      ignoreServerLocale = true;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(localePreferenceChangedEventName, handleLocalePreferenceChanged);
    };
  }, []);

  return null;
}
