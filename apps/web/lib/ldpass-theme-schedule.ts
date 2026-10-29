import type {
  AccentTone,
  LdpassAccentScheduleEntry,
  LdpassThemeScheduleResponse,
  YctLdpassThemeScheduleResponse,
} from '@yct/contracts';

/**
 * 与临东通一致的兜底：1970 年生效的青绿色。
 * 当临东通主题计划为空、全部停用或接口不可用时，YCT 回到默认强调色。
 */
export const fallbackLdpassAccentSchedule: readonly LdpassAccentScheduleEntry[] = [
  { effectiveAt: '1970-01-01T00:00:00.000Z', tone: 'teal' },
];

function isAccentTone(value: unknown): value is AccentTone {
  return value === 'teal' || value === 'red' || value === 'gray';
}

/**
 * 把临东通公开接口的原始条目归一化为可比较的计划表：
 * 只保留启用项、合法时间与合法色调，并按生效时间升序排列。
 */
export function normalizeLdpassAccentSchedule(
  response: LdpassThemeScheduleResponse | undefined,
): LdpassAccentScheduleEntry[] {
  const entries = Array.isArray(response?.entries) ? response.entries : [];
  const schedule = entries
    .filter((entry) => entry?.enabled !== false)
    .filter((entry) => typeof entry.effectiveAt === 'string')
    .filter((entry) => !Number.isNaN(Date.parse(entry.effectiveAt)))
    .filter((entry) => isAccentTone(entry.tone))
    .map((entry) => ({
      effectiveAt: entry.effectiveAt,
      tone: entry.tone,
    }))
    .sort((left, right) => Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt));

  return schedule.length > 0 ? schedule : [...fallbackLdpassAccentSchedule];
}

/**
 * 取当前时间之前最近一条计划的色调；没有命中时使用兜底青绿色。
 */
export function resolveLdpassAccentTone(
  schedule: readonly LdpassAccentScheduleEntry[] | undefined,
  date = new Date(),
): AccentTone {
  if (!schedule || schedule.length === 0) {
    return 'teal';
  }

  const now = date.getTime();
  let matched: LdpassAccentScheduleEntry | undefined;
  for (const entry of schedule) {
    const effectiveAt = Date.parse(entry.effectiveAt);
    if (!Number.isNaN(effectiveAt) && effectiveAt <= now) {
      matched = entry;
    }
  }

  return matched?.tone ?? 'teal';
}

export function createYctLdpassThemeScheduleResponse(
  schedule: LdpassAccentScheduleEntry[],
  now = new Date(),
): YctLdpassThemeScheduleResponse {
  return {
    activeTone: resolveLdpassAccentTone(schedule, now),
    entries: schedule,
    fetchedAt: now.toISOString(),
  };
}
