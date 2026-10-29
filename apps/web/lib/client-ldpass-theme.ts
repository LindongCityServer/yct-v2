import type {
  AccentTone,
  LdpassAccentScheduleEntry,
  YctLdpassThemeScheduleResponse,
} from '@yct/contracts';
import { appPath } from './app-paths';
import {
  createYctLdpassThemeScheduleResponse,
  fallbackLdpassAccentSchedule,
  normalizeLdpassAccentSchedule,
  resolveLdpassAccentTone,
} from './ldpass-theme-schedule';

export const ldpassThemeScheduleStorageKey = 'yct.ldpassThemeSchedule.v1';

/**
 * 读取本地缓存的临东通强调色计划。
 * 先渲染缓存，再异步刷新，避免主题色在首屏闪回默认色。
 */
export function readCachedLdpassAccentSchedule(): LdpassAccentScheduleEntry[] {
  if (typeof window === 'undefined') {
    return [...fallbackLdpassAccentSchedule];
  }

  const rawValue = window.localStorage.getItem(ldpassThemeScheduleStorageKey);
  if (!rawValue) {
    return [...fallbackLdpassAccentSchedule];
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<YctLdpassThemeScheduleResponse> | null;
    const entries = Array.isArray(parsed?.entries)
      ? parsed.entries
          .filter((entry) => typeof entry?.effectiveAt === 'string')
          .map((entry) => ({
            effectiveAt: entry.effectiveAt,
            tone: entry.tone,
            enabled: true,
          }))
      : [];

    return normalizeLdpassAccentSchedule({ entries });
  } catch {
    return [...fallbackLdpassAccentSchedule];
  }
}

export function readCachedLdpassAccentTone(date = new Date()): AccentTone {
  return resolveLdpassAccentTone(readCachedLdpassAccentSchedule(), date);
}

export function writeCachedLdpassThemeSchedule(response: YctLdpassThemeScheduleResponse): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(ldpassThemeScheduleStorageKey, JSON.stringify(response));
}

export async function fetchLdpassThemeSchedule(): Promise<
  YctLdpassThemeScheduleResponse | undefined
> {
  try {
    const response = await fetch(appPath('/api/theme/ldpass'), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });

    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as Partial<YctLdpassThemeScheduleResponse> | null;
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    return createYctLdpassThemeScheduleResponse(
      normalizeLdpassAccentSchedule({
        entries: entries.map((entry) => ({
          effectiveAt: String(entry.effectiveAt),
          tone: entry.tone,
          enabled: true,
        })),
      }),
    );
  } catch {
    return undefined;
  }
}
