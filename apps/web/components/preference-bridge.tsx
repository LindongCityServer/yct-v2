'use client';

import { useEffect } from 'react';
import type { AccentTone } from '@yct/contracts';
import {
  fetchLdpassThemeSchedule,
  readCachedLdpassAccentTone,
  writeCachedLdpassThemeSchedule,
} from '../lib/client-ldpass-theme';
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

// 临东通主题计划的最小粒度为分钟，按分钟重新解析即可在生效时刻自动切换。
const ldpassAccentSyncIntervalMs = 60_000;

export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.colorScheme = mode;
  window.localStorage.setItem(preferenceKeys.theme, mode);
  // 主题改变后同步刷新高级材质的边缘、内阴影和文字阴影颜色。
  applyMaterialPreference(readMaterialPreference());
}

export function applyAccentMode(mode: AccentMode) {
  applyAccentTone(resolveAccentTone(mode));
  window.localStorage.setItem(preferenceKeys.accent, mode);
}

function resolveAccentTone(mode: AccentMode): AccentTone {
  if (mode === 'ldpass') {
    return readCachedLdpassAccentTone();
  }
  return mode === 'red' || mode === 'gray' ? mode : 'teal';
}

function applyAccentTone(tone: AccentTone) {
  const root = document.documentElement;
  if (tone === 'red' || tone === 'gray') {
    if (root.dataset.accent !== tone) {
      root.dataset.accent = tone;
    }
    return;
  }

  if (root.dataset.accent !== undefined) {
    delete root.dataset.accent;
  }
}

/**
 * 拉取临东通主题计划并刷新本地缓存。
 * 仅在“跟随临东通”模式或即将切换到该模式时调用；失败时继续使用本地缓存。
 */
export async function refreshLdpassAccentSchedule(): Promise<void> {
  const schedule = await fetchLdpassThemeSchedule();
  if (!schedule) {
    return;
  }

  writeCachedLdpassThemeSchedule(schedule);
  if (readAccentMode() === 'ldpass') {
    applyAccentTone(resolveAccentTone('ldpass'));
  }
}

function applyScheduledLdpassAccent() {
  if (readAccentMode() === 'ldpass') {
    applyAccentTone(resolveAccentTone('ldpass'));
  }
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
  const blur = 0.5 + Math.pow(amount, 2.6) * 30;
  const saturation = 1.55 - amount * 0.15;
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const prefersDark =
    root.dataset.colorScheme === 'dark' ||
    (root.dataset.colorScheme !== 'light' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  const opacityFactor = 1 - amount;
  const innerShadowOpacityFactor = 1 - amount;
  const edgeTopOpacity = (prefersDark ? 5 : 22) * opacityFactor;
  const innerShadowOpacity = (prefersDark ? 13 : 38) * innerShadowOpacityFactor;
  const controlSurfaceOpacity = 32 + amount * 14;

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
  root.style.setProperty('--yct-material-action-surface', 'var(--yct-material-floating-surface)');
  root.style.setProperty('--yct-material-title-surface', `${34 + amount * 62}%`);
  root.style.setProperty('--yct-material-title-mid-surface', `${4 + amount * 58}%`);
  root.style.setProperty('--yct-material-edge-top-opacity', `${edgeTopOpacity}%`);
  root.style.setProperty('--yct-material-inner-shadow-opacity', `${innerShadowOpacity}%`);
  root.style.setProperty(
    '--yct-material-control-surface',
    `color-mix(in srgb, var(--yct-color-surface-muted) ${controlSurfaceOpacity}%, transparent)`,
  );
  const textShadowStrength = 96 * opacityFactor;
  root.style.setProperty('--yct-material-text-shadow-strength', `${textShadowStrength}%`);
  root.style.setProperty('--yct-material-content-shadow-core', `${2 + 2 * opacityFactor}px`);
  root.style.setProperty('--yct-material-content-shadow-halo', `${6 + 6 * opacityFactor}px`);
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

    // “跟随临东通”时先用本地缓存渲染，再异步同步主题计划。
    if (readAccentMode() === 'ldpass') {
      void refreshLdpassAccentSchedule();
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        Object.values(preferenceKeys).includes(
          event.key as (typeof preferenceKeys)[keyof typeof preferenceKeys],
        )
      ) {
        applyStoredPreferences();

        if (event.key === preferenceKeys.accent && readAccentMode() === 'ldpass') {
          void refreshLdpassAccentSchedule();
        }
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
    const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleColorSchemeChanged = () => {
      if (readThemeMode() === 'system') {
        applyMaterialPreference(readMaterialPreference());
      }
    };
    reducedTransparencyQuery.addEventListener('change', handleReducedTransparencyChanged);
    colorSchemeQuery.addEventListener('change', handleColorSchemeChanged);

    // 每分钟按本地时间重新解析一次主题计划，跨过生效时刻后无需刷新页面即可换色。
    const ldpassAccentTimer = window.setInterval(
      applyScheduledLdpassAccent,
      ldpassAccentSyncIntervalMs,
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || readAccentMode() !== 'ldpass') {
        return;
      }

      void refreshLdpassAccentSchedule();
      applyScheduledLdpassAccent();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(ldpassAccentTimer);
      unsubscribeMaterialPreference();
      reducedTransparencyQuery.removeEventListener('change', handleReducedTransparencyChanged);
      colorSchemeQuery.removeEventListener('change', handleColorSchemeChanged);
    };
  }, []);

  return null;
}
