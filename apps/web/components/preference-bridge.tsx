'use client';

import { useEffect } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentMode = 'ldpass' | 'green' | 'red' | 'gray';
export type MotionMode = 'system' | 'full' | 'reduced';

export const preferenceKeys = {
  theme: 'yct.themeMode',
  accent: 'yct.accentMode',
  motion: 'yct.motionMode',
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

function applyStoredPreferences() {
  applyThemeMode(readThemeMode());
  applyAccentMode(readAccentMode());
  applyMotionMode(readMotionMode());
}

export function PreferenceBridge() {
  useEffect(() => {
    applyStoredPreferences();

    const handleStorage = (event: StorageEvent) => {
      if (
        Object.values(preferenceKeys).includes(
          event.key as (typeof preferenceKeys)[keyof typeof preferenceKeys],
        )
      ) {
        applyStoredPreferences();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return null;
}
