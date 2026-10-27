import { readPlayerAliases } from '../player-aliases';
import { readPlayerLocationSnapshot, type PlayerLocationRecord } from '../player-location-store';
import { readWikiPlayerAliases } from '../wiki-player-aliases';

export interface PlayerLocationReference {
  title: string;
  source: string;
  href?: string;
  asOf?: string;
  snippet: string;
  tone: string;
}

/**
 * 玩家位置检索：只在用户明确点名某个玩家时返回，不提供“列出所有玩家”的能力。
 * 匹配范围包括玩家名、玩家键、去掉登录服前缀后的名字、本地别名，以及 Wiki 玩家列表里的名字。
 * 出于隐私考虑，结果只给位置与最后更新时间，不展示实时在线状态。
 */
export async function buildPlayerLocationReferences(
  query: string,
): Promise<PlayerLocationReference[]> {
  const normalizedQuery = normalizePlayerText(query);
  if (!normalizedQuery) {
    return [];
  }

  const [snapshot, aliases, wikiAliases] = await Promise.all([
    readPlayerLocationSnapshot().catch(() => undefined),
    readPlayerAliases(),
    readWikiPlayerAliases().catch(() => new Map<string, string[]>()),
  ]);
  if (!snapshot || snapshot.locations.length === 0) {
    return [];
  }

  const matches = snapshot.locations
    .map((location) => ({
      location,
      matchedName: findPlayerMatch(normalizedQuery, location, aliases, wikiAliases),
    }))
    .filter((item): item is { location: PlayerLocationRecord; matchedName: string } =>
      Boolean(item.matchedName),
    )
    // 多条命中时优先最近有观测记录的玩家，排序本身不对外暴露在线状态。
    .sort((left, right) => right.location.observedAt.localeCompare(left.location.observedAt))
    .slice(0, 2);

  return matches.map(({ location, matchedName }) => {
    const isAlias = normalizePlayerText(matchedName) !== normalizePlayerText(location.playerName);
    return {
      title: isAlias
        ? `${location.playerName}（玩家位置 · 别名 ${matchedName}）`
        : `${location.playerName}（玩家位置）`,
      source: '玩家',
      href: `/map?x=${location.x}&z=${location.z}&label=${encodeURIComponent(location.playerName)}`,
      asOf: location.observedAt,
      snippet: [
        isAlias
          ? `“${matchedName}”是 ${location.playerName} 的别名/Wiki 名，两者是同一个人`
          : undefined,
        `坐标 ${formatCoordinate(location.x)}, ${formatCoordinate(location.z)}`,
        `最后更新 ${formatObservedAt(location.lastSeenAt || location.observedAt)}`,
        '位置以地图上的玩家标记为准',
      ]
        .filter(Boolean)
        .join(' · '),
      tone: 'place',
    };
  });
}

/**
 * 返回命中的名字（优先最长的候选），未命中返回 undefined。
 * 中文两字名可宽松匹配；拉丁字母短名与单字名只在整句就是该名字时命中，避免误触发。
 */
export function findPlayerMatch(
  normalizedQuery: string,
  location: PlayerLocationRecord,
  aliases: Map<string, string[]>,
  wikiAliases: Map<string, string[]>,
): string | undefined {
  const candidates = collectCandidates(location, aliases, wikiAliases);
  const strippedQuery = stripPlayerQuestion(normalizedQuery);
  let best: { raw: string; normalized: string } | undefined;

  for (const candidate of candidates) {
    // 中文两字名可以宽松包含；拉丁字母/数字名要 3 个字符以上，短名只在整句匹配时命中。
    const loose = shouldLooseMatch(candidate.normalized);
    const matched = loose
      ? normalizedQuery.includes(candidate.normalized)
      : strippedQuery === candidate.normalized;
    if (matched && (!best || candidate.normalized.length > best.normalized.length)) {
      best = candidate;
    }
  }

  return best?.raw;
}

function shouldLooseMatch(normalized: string): boolean {
  if (/[\u4e00-\u9fff]/u.test(normalized)) {
    return normalized.length >= 2;
  }
  return normalized.length >= 3;
}

function collectCandidates(
  location: PlayerLocationRecord,
  aliases: Map<string, string[]>,
  wikiAliases: Map<string, string[]>,
): Array<{ raw: string; normalized: string }> {
  const seen = new Set<string>();
  const candidates: Array<{ raw: string; normalized: string }> = [];

  const add = (value: string | undefined) => {
    if (!value) {
      return;
    }
    for (const variant of buildNameVariants(value)) {
      if (!variant || seen.has(variant)) {
        continue;
      }
      seen.add(variant);
      candidates.push({ raw: value.trim(), normalized: variant });
    }
  };

  add(location.playerName);
  add(location.playerKey);

  for (const key of [
    location.playerName,
    location.playerKey,
    location.playerName.toLocaleLowerCase(),
  ]) {
    for (const alias of aliases.get(key) ?? []) {
      add(alias);
    }
  }

  for (const key of [location.playerKey, location.playerName.toLocaleLowerCase()]) {
    for (const wikiName of wikiAliases.get(key) ?? []) {
      add(wikiName);
    }
  }

  return candidates;
}

/** “ki在哪”这类单字问法先去掉疑问后缀，再和单字名比较。 */
function stripPlayerQuestion(value: string): string {
  return value.replace(/(现在)?(在哪|在哪里|是谁|是什么|的位置|的坐标)$/u, '');
}

/** 生成同一玩家的不同写法：原名、去登录服前缀、去掉分隔符后的名字。 */
function buildNameVariants(value: string): string[] {
  const normalized = normalizePlayerText(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  // ZYTX_新光 / LDTV_新光 这类登录服前缀，去掉后保留可读昵称。
  const withoutPrefix = normalized.replace(/^[a-z]{2,8}(?=[\u4e00-\u9fff])/u, '');
  if (withoutPrefix.length >= 1) {
    variants.add(withoutPrefix);
  }

  for (const segment of value.split(/[_\-\s|/\\]+/)) {
    const candidate = normalizePlayerText(segment);
    if (candidate) {
      variants.add(candidate);
    }
  }

  return [...variants];
}

function normalizePlayerText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s　'"“”‘’《》<>()（）[\]【】,，.。;；:：!！?？、|/\\_-]+/g, '');
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatObservedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
