/**
 * 首末班车时间的**合成与拆解**唯一真源。
 *
 * 两端共用同一套格式，不要各写一份：
 * - 服务端（`material-transit-source.ts`）把线路的首/末班时间合成牌面上那一行文字；
 * - 物料面板在项目线网来源下用「首班车 / 末班车」两个时间输入反填同一个字段
 *   （项目存档不带运营时间，见面板里的判定注释）。
 *
 * 一旦两边格式漂移，用户手填的时间和服务器线网自动生成的样式就会对不上
 * （典型是跨夜线路的「次日」标记）。
 */

export interface MaterialServiceTimeRange {
  first: string;
  last: string;
}

/** 只接受 `H:MM` / `HH:MM`，其他一律当空（时间输入框只认 `HH:MM`）。 */
function normalizeClock(value: string | undefined): string | undefined {
  const text = value?.trim() ?? '';
  if (!/^\d{1,2}:\d{2}$/.test(text)) {
    return undefined;
  }
  return text.padStart(5, '0');
}

function parseClockMinutes(value: string): number | undefined {
  const normalized = normalizeClock(value);
  if (!normalized) {
    return undefined;
  }
  const [hours, minutes] = normalized.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * 合成牌面上的首末班车时间文字。
 * 两个都有 → `06:00-22:30`；跨夜（末班早于首班）→ `06:00-次日01:00`；
 * 只有一个 → `首 06:00` / `末 22:30`，避免读成区间。
 */
export function formatServiceTimeRange(
  first: string | undefined,
  last: string | undefined,
): string {
  const firstClock = normalizeClock(first);
  const lastClock = normalizeClock(last);
  if (!firstClock && !lastClock) {
    return '';
  }
  if (!firstClock) {
    return `末 ${lastClock}`;
  }
  if (!lastClock) {
    return `首 ${firstClock}`;
  }
  const firstMinutes = parseClockMinutes(firstClock);
  const lastMinutes = parseClockMinutes(lastClock);
  const nextDay =
    firstMinutes !== undefined && lastMinutes !== undefined && lastMinutes < firstMinutes;
  return `${firstClock}-${nextDay ? '次日' : ''}${lastClock}`;
}

/** `formatServiceTimeRange` 的逆运算：把牌面文字拆回两个时间输入框的值。 */
export function parseServiceTimeRange(value: string): MaterialServiceTimeRange {
  const normalized = value.trim();
  if (!normalized) {
    return { first: '', last: '' };
  }
  const strip = (part: string) =>
    normalizeClock(part.replace(/^(?:次日|首|末)\s*/u, '').trim()) ?? '';
  const segments = normalized.split('-');
  if (segments.length > 1) {
    return { first: strip(segments[0] ?? ''), last: strip(segments.slice(1).join('-')) };
  }
  // 只有一个时间：靠「末」前缀判断它落在哪一头。
  return normalized.startsWith('末')
    ? { first: '', last: strip(normalized) }
    : { first: strip(normalized), last: '' };
}
