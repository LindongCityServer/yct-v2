/**
 * 历史上的今天：使用百度百科的按月事件数据（中文，无需 Key）。
 * 接口按月份给出一整月的数据，这里按上海时区的月日取当天条目并缓存。
 */

const cache = new Map();
const cacheTtlMs = 6 * 60 * 60 * 1000;

export async function fetchTodayHistory({
  date = new Date(),
  timeoutMs = 10_000,
  fetchImpl = fetch,
  now = Date.now,
  timeZone = 'Asia/Shanghai',
} = {}) {
  const { month, day, key } = shanghaiDateParts(date, timeZone);
  const cached = cache.get(key);
  const timestamp = now();
  if (cached && cached.expiresAt > timestamp) {
    return cached.text;
  }

  const url = `https://baike.baidu.com/cms/home/eventsOnHistory/${month}.json`;
  let payload;
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://baike.baidu.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    payload = await response.json();
  } catch (error) {
    throw new Error(`历史数据获取失败：${error?.message ?? '网络错误'}`);
  }

  const events = payload?.[String(month)]?.[key];
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('今天没有查到历史事件，明天再试试。');
  }

  const all = events.filter((event) => typeof event?.title === 'string' && event.title.trim());
  // 优先展示“事件”，再补充出生/逝世，避免整屏都是人物生日。
  const important = all.filter((event) => event.type === 'event').slice(0, 3);
  const rest = all
    .filter((event) => event.type !== 'event')
    .sort((a, b) => Number(a.year) - Number(b.year));
  const picked = [...important, ...rest].slice(0, 6);
  const lines = picked.map((event) => {
    const year = String(event.year ?? '').trim();
    const title = toPlain(event.title);
    return `· ${year ? `${year}年 ` : ''}${title}`;
  });

  if (lines.length === 0) {
    throw new Error('今天没有查到历史事件，明天再试试。');
  }

  const text = `历史上的今天（${month}月${day}日）：\n${lines.join('\n')}`;
  cache.set(key, { expiresAt: timestamp + cacheTtlMs, text });
  return text;
}

function shanghaiDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const month = Number(values.month);
  const day = Number(values.day);
  return {
    month: String(month),
    day: String(day),
    key: `${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
  };
}

/** 百科标题里带 <a> 和转义符，去掉标签后作为纯文本。 */
function toPlain(value) {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clearHistoryCache() {
  cache.clear();
}
