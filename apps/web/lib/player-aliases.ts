import { readFile } from 'node:fs/promises';
import path from 'node:path';

interface PlayerAliasRecord {
  version?: number;
  /** 玩家名或玩家键 → 别名列表；例如 { "LDTV2020340248": ["新光", "上官"] }。 */
  players?: Record<string, unknown>;
}

const defaultStorePath = '.yct-data/player-aliases.json';
const cacheTtlMs = 60_000;

let cache: { expiresAt: number; aliases: Map<string, string[]> } | undefined;

/**
 * 读取玩家别名映射（本地文件，可选）。
 * 没有文件或读取失败时返回空表，检索退化为按玩家名/玩家键匹配。
 */
export async function readPlayerAliases(): Promise<Map<string, string[]>> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.aliases;
  }

  const aliases = new Map<string, string[]>();
  try {
    const source = await readFile(resolveStorePath(), 'utf8');
    const record = JSON.parse(source) as PlayerAliasRecord;
    for (const [player, value] of Object.entries(record.players ?? {})) {
      const key = player.trim();
      if (!key || !Array.isArray(value)) {
        continue;
      }
      const list = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      if (list.length > 0) {
        aliases.set(key, list);
      }
    }
  } catch {
    // 别名文件是可选的，缺失时静默跳过。
  }

  cache = { expiresAt: Date.now() + cacheTtlMs, aliases };
  return aliases;
}

/** 校验脚本和后台保存后可以主动失效缓存。 */
export function clearPlayerAliasCache(): void {
  cache = undefined;
}

function resolveStorePath(): string {
  const configured = process.env.YCT_PLAYER_ALIAS_STORE_PATH?.trim();
  if (!configured) {
    return path.join(process.cwd(), defaultStorePath);
  }
  return path.isAbsolute(configured)
    ? configured
    : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
