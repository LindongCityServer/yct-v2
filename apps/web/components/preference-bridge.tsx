'use client';

import { useEffect } from 'react';
import {
  fetchServerLocalePreference,
  localePreferenceChangedEventName,
  localePreferenceStorageKey,
  readLocalLocalePreference,
  writeResolvedLocaleCookie,
  writeLocalLocalePreference,
  type ClientLocalePreferenceState,
} from '../lib/client-locale-preference';
import {
  materialPreferenceStorageKey,
  publishMaterialPreferenceChanged,
  readMaterialPreference,
  subscribeMaterialPreferenceChanged,
  type MaterialPreference,
} from '../lib/client-material-preference';

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

export function applyMaterialPreference(preference: MaterialPreference) {
  const root = document.documentElement;
  const amount = preference.thickness / 100;
  const blur = 2 + Math.pow(amount, 2) * 30;
  const saturation = 1.55 - amount * 0.15;
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;

  // 系统减少透明度偏好只记录为兼容标记，不能覆盖用户显式选择的高级材质。
  root.dataset.materialMode = preference.mode;
  if (reducedTransparency) {
    root.dataset.reducedTransparency = '';
  } else {
    delete root.dataset.reducedTransparency;
  }
  root.style.setProperty('--yct-material-blur', `${blur}px`);
  root.style.setProperty('--yct-material-blur-strong', `${blur * 1.35}px`);
  root.style.setProperty('--yct-material-blur-medium', `${blur * 0.8}px`);
  root.style.setProperty('--yct-material-blur-soft', `${blur * 0.35}px`);
  root.style.setProperty('--yct-material-brightness-light', String(1.38 - amount * 0.32));
  root.style.setProperty('--yct-material-brightness-dark', String(0.68 + amount * 0.26));
  root.style.setProperty('--yct-material-contrast', String(1.24 - amount * 0.2));
  root.style.setProperty('--yct-material-saturation', String(saturation));
  root.style.setProperty('--yct-material-floating-surface', `${36 + amount * 58}%`);
  root.style.setProperty('--yct-material-action-surface', `${48 + amount * 49}%`);
  root.style.setProperty('--yct-material-title-surface', `${34 + amount * 62}%`);
  root.style.setProperty('--yct-material-title-mid-surface', `${4 + amount * 58}%`);
  root.style.setProperty('--yct-material-text-shadow-strength', `${68 - amount * 44}%`);
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
  applyMaterialPreference(readMaterialPreference());
  const localePreference = readLocalLocalePreference();
  applyLocalePreferenceState(localePreference);
  writeResolvedLocaleCookie(localePreference.resolvedLocale);
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
        const localePreference = readLocalLocalePreference();
        applyLocalePreferenceState(localePreference);
        writeResolvedLocaleCookie(localePreference.resolvedLocale);
      }

      if (event.key === materialPreferenceStorageKey) {
        publishMaterialPreferenceChanged({
          preference: readMaterialPreference(),
          source: 'storage',
        });
      }
    };

    const handleLocalePreferenceChanged = (event: Event) => {
      const state =
        event instanceof CustomEvent
          ? (event.detail as ClientLocalePreferenceState | undefined)
          : undefined;
      applyLocalePreferenceState(state ?? readLocalLocalePreference());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(localePreferenceChangedEventName, handleLocalePreferenceChanged);
    const unsubscribeMaterialPreference = subscribeMaterialPreferenceChanged(({ preference }) =>
      applyMaterialPreference(preference),
    );
    const reducedTransparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const handleReducedTransparencyChanged = () =>
      applyMaterialPreference(readMaterialPreference());
    reducedTransparencyQuery.addEventListener('change', handleReducedTransparencyChanged);

    void fetchServerLocalePreference()
      .then((preference) => {
        if (!preference || ignoreServerLocale) {
          return;
        }

        writeLocalLocalePreference(preference.locale);
        writeResolvedLocaleCookie(preference.resolvedLocale);
        applyLocalePreferenceState(preference);
      })
      .catch(() => undefined);

    return () => {
      ignoreServerLocale = true;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(localePreferenceChangedEventName, handleLocalePreferenceChanged);
      unsubscribeMaterialPreference();
      reducedTransparencyQuery.removeEventListener('change', handleReducedTransparencyChanged);
    };
  }, []);

  return null;
}
