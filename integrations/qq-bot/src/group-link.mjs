/**
 * 群聊绑定 token 的内存缓存和文本解析。
 *
 * 群 token 只用于当前「群 + 成员」的一次性确认，进程重启后丢失可以接受；
 * 这里不落库、不写日志，也不接触任何 QQ 号或临东通账号资料。
 */
export const GROUP_LINK_TTL_MS = 5 * 60_000;
export const GROUP_LINK_CACHE_MAX = 10_000;

const ZERO_WIDTH = /[\u200b-\u200d\ufeff\u2060]/gu;
const FULL_WIDTH_DIGITS = /[０-９]/gu;

/** 缓存 key 固定为 group_openid:member_openid，两个 openid 命名空间不交叉。 */
export function groupLinkKey(groupOpenId, memberOpenId) {
  return `${groupOpenId}:${memberOpenId}`;
}

function toExpiry(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * 有上限的内存 token 缓存。
 * TTL 取「本地 5 分钟」和「服务端 expiresAt」中更早的那个；
 * 超限时先清过期项，再淘汰 expiresAt 最早的一项。
 */
export class GroupLinkTokenStore {
  constructor({
    ttlMs = GROUP_LINK_TTL_MS,
    maxEntries = GROUP_LINK_CACHE_MAX,
    now = Date.now,
  } = {}) {
    this.ttlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : GROUP_LINK_TTL_MS;
    this.maxEntries =
      Number.isInteger(maxEntries) && maxEntries > 0 ? maxEntries : GROUP_LINK_CACHE_MAX;
    this.now = now;
    this.tokens = new Map();
  }

  get size() {
    return this.tokens.size;
  }

  set({ groupOpenId, memberOpenId, token, expiresAt } = {}) {
    if (!groupOpenId || !memberOpenId || !token) {
      return false;
    }
    const now = this.now();
    const serverExpiry = toExpiry(expiresAt);
    const localExpiry = now + this.ttlMs;
    const effectiveExpiry =
      serverExpiry === null ? localExpiry : Math.min(localExpiry, serverExpiry);
    if (effectiveExpiry <= now) {
      return false;
    }

    this.prune(now);
    const key = groupLinkKey(groupOpenId, memberOpenId);
    if (!this.tokens.has(key) && this.tokens.size >= this.maxEntries) {
      this.evictEarliest();
    }
    this.tokens.set(key, { token, expiresAt: effectiveExpiry });
    return true;
  }

  get(groupOpenId, memberOpenId) {
    const key = groupLinkKey(groupOpenId, memberOpenId);
    const entry = this.tokens.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= this.now()) {
      this.tokens.delete(key);
      return null;
    }
    return { token: entry.token, expiresAt: entry.expiresAt };
  }

  delete(groupOpenId, memberOpenId) {
    return this.tokens.delete(groupLinkKey(groupOpenId, memberOpenId));
  }

  clear() {
    this.tokens.clear();
  }

  prune(now = this.now()) {
    for (const [key, entry] of this.tokens) {
      if (entry.expiresAt <= now) {
        this.tokens.delete(key);
      }
    }
  }

  evictEarliest() {
    let oldestKey = '';
    let oldestExpiry = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.tokens) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.tokens.delete(oldestKey);
    }
  }
}

/** 服务端返回的链接可能带编码参数，必须用 URL 解析器取 token，不能正则硬切。 */
export function extractTokenFromUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl ?? ''));
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return '';
  }
  const token = url.searchParams.get('token');
  return typeof token === 'string' ? token.trim() : '';
}

/** 群确认码只接受 6 位数字；兼容仓库其他地方的做法，先把全角数字和零宽字符处理掉。 */
export function normalizeConfirmCode(raw) {
  return String(raw ?? '')
    .replace(ZERO_WIDTH, '')
    .replace(FULL_WIDTH_DIGITS, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/gu, ' ')
    .trim();
}

export function isConfirmCode(value) {
  return /^[0-9]{6}$/u.test(String(value ?? ''));
}
