import { wikiBaseUrl } from './wiki-search';

/**
 * 从 Wiki 的「玩家列表」条目里读取玩家名与 Xbox ID 的对应关系。
 * 条目是人工维护的表格（可能一段时间没更新），只作为本地别名文件的补充。
 */
const pageTitle = '玩家列表';
const requestTimeoutMs = 2500;
const cacheTtlMs = 10 * 60 * 1000;

export interface WikiPlayerRecord {
  name: string;
  xboxIds: string[];
}

let cache: { expiresAt: number; aliases: Map<string, string[]> } | undefined;

/** 返回 Xbox ID（小写）到 Wiki 玩家名的映射。Wiki 不可用时返回空表。 */
export async function readWikiPlayerAliases(): Promise<Map<string, string[]>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.aliases;
  }

  const aliases = new Map<string, string[]>();
  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: pageTitle,
      prop: 'wikitext',
      format: 'json',
      formatversion: '2',
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${wikiBaseUrl}/api.php?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'YuchengtongSearch/1.0 (+https://yct.local)',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (response.ok) {
        const payload = (await response.json()) as { parse?: { wikitext?: string } };
        for (const record of parsePlayerListWikitext(payload.parse?.wikitext ?? '')) {
          for (const xboxId of record.xboxIds) {
            aliases.set(xboxId.toLocaleLowerCase(), [record.name]);
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Wiki 是可选来源，超时或出错时静默跳过。
  }

  cache = { expiresAt: Date.now() + cacheTtlMs, aliases };
  return aliases;
}

/** 解析玩家列表 wikitext；导出后可在校验脚本里用固定片段测试。 */
export function parsePlayerListWikitext(wikitext: string): WikiPlayerRecord[] {
  const records: WikiPlayerRecord[] = [];
  let current: WikiPlayerRecord | undefined;
  let inTable = false;

  for (const rawLine of wikitext.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('{|')) {
      inTable = true;
      continue;
    }
    if (line.startsWith('|}')) {
      inTable = false;
      continue;
    }
    if (!inTable || !line.startsWith('|') || line.startsWith('|-')) {
      continue;
    }

    const xboxIds = extractXboxIds(line);
    const name = parsePlayerName(extractFirstCell(line));
    // 表格用 rowspan 表示同一玩家的多个 Xbox ID，空名字的行沿用上一个玩家。
    if (name && name !== current?.name) {
      current = { name, xboxIds: [] };
      records.push(current);
    }
    if (current && xboxIds.length > 0) {
      current.xboxIds.push(...xboxIds);
    }
  }

  return records.filter((record) => record.xboxIds.length > 0);
}

function extractXboxIds(line: string): string[] {
  return [...line.matchAll(/\{\{\s*[Xx]box[ _]?ID\s*\|\s*([^}|]+?)\s*\}\}/g)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

/** 取表格第一列，去掉 rowspan 这类单元格属性。 */
function extractFirstCell(line: string): string {
  let value = line.slice(1).trim();
  const attribute = /^(?:[a-zA-Z-]+(?:="[^"]*")?\s*)+\|/.exec(value);
  if (attribute) {
    value = value.slice(attribute[0].length);
  }
  const cellEnd = value.indexOf('||');
  return (cellEnd >= 0 ? value.slice(0, cellEnd) : value).trim();
}

function parsePlayerName(cell: string): string | undefined {
  if (!cell || cell.startsWith('{{') || cell.startsWith('|')) {
    return undefined;
  }

  const wikiLink = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(cell);
  if (wikiLink) {
    return (wikiLink[2] ?? wikiLink[1]).trim();
  }

  const externalLink = /^\[https?:\/\/\S+\s+([^\]]+)\]/.exec(cell);
  if (externalLink) {
    return externalLink[1].trim();
  }

  return /^[^[\]{}<>]{1,40}$/.test(cell) ? cell.trim() : undefined;
}
