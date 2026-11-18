/**
 * 对话状态：QQ 没有会话概念，这里按「群 + 用户」或「单聊用户」保留最近几轮，
 * 让「那它几点末班」「换乘呢」这类追问仍然能接上。数据只在内存里，重启即清空。
 */

export class ConversationStore {
  constructor({ maxKeys = 400, ttlMs = 30 * 60 * 1000, maxMessages = 6, maxChars = 6000 } = {}) {
    this.maxKeys = maxKeys;
    this.ttlMs = ttlMs;
    this.maxMessages = maxMessages;
    this.maxChars = maxChars;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return [];
    }
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.entries.delete(key);
      return [];
    }
    return entry.messages.map((message) => ({ ...message }));
  }

  append(key, role, content) {
    if (!content) {
      return;
    }
    const entry = this.entries.get(key) ?? { messages: [], updatedAt: Date.now() };
    entry.messages.push({ role, content });
    entry.updatedAt = Date.now();

    while (entry.messages.length > this.maxMessages) {
      entry.messages.shift();
    }
    let total = entry.messages.reduce((sum, message) => sum + message.content.length, 0);
    while (total > this.maxChars && entry.messages.length > 1) {
      total -= entry.messages.shift().content.length;
    }

    // 先删再插，Map 的迭代顺序就是最近使用顺序，超限时淘汰最久未用的。
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.prune();
  }

  reset(key) {
    this.entries.delete(key);
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.updatedAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
    while (this.entries.size > this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }

  get size() {
    return this.entries.size;
  }
}

const resetCommands = new Set(['/new', '新对话', '重置', '清空', '重新开始', '换个话题']);

/** 只识别完全匹配的短指令，避免把「帮助我查一下…」当成命令。 */
export function classifyCommand(content) {
  const text = String(content ?? '')
    .trim()
    .toLowerCase();
  if (resetCommands.has(text)) {
    return 'reset';
  }
  return null;
}

/** 简单的滑动窗口限流：返回是否放行，以及需要等待的秒数。 */
export class SlidingWindowLimiter {
  constructor({ limit, windowMs = 60_000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  take(key) {
    const now = this.now();
    const list = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (list.length >= this.limit) {
      const retryAfterMs = this.windowMs - (now - list[0]);
      this.hits.set(key, list);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 500) {
      for (const [itemKey, times] of this.hits) {
        if (times.every((time) => now - time >= this.windowMs)) {
          this.hits.delete(itemKey);
        }
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

/** 事件去重：平台可能重复推送同一条消息，按事件/消息 id 挡掉。 */
export class RecentSet {
  constructor({ ttlMs = 10 * 60 * 1000, max = 2000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.now = now;
    this.seen = new Map();
  }

  add(id) {
    if (!id) {
      return true;
    }
    const now = this.now();
    const expiresAt = this.seen.get(id);
    if (expiresAt && expiresAt > now) {
      return false;
    }
    this.seen.set(id, now + this.ttlMs);
    if (this.seen.size > this.max) {
      for (const [key, expiry] of this.seen) {
        if (expiry <= now) {
          this.seen.delete(key);
        }
      }
      while (this.seen.size > this.max) {
        this.seen.delete(this.seen.keys().next().value);
      }
    }
    return true;
  }
}

/**
 * 每个会话串行处理，另外限制全局并发。
 * 群消息高峰时宁可拒绝新问题，也不要把模型请求和 QQ 回复次数一起打满。
 */
export class ConversationQueue {
  constructor({ maxGlobal = 3, maxPendingPerKey = 2, logger } = {}) {
    this.maxGlobal = maxGlobal;
    this.maxPendingPerKey = maxPendingPerKey;
    this.logger = logger;
    this.chains = new Map();
    this.active = 0;
    this.waiters = [];
  }

  submit(key, task) {
    const chain = this.chains.get(key) ?? { running: false, pending: [] };
    this.chains.set(key, chain);
    if (chain.running && chain.pending.length >= this.maxPendingPerKey) {
      return false;
    }
    chain.pending.push(task);
    this.pump(key);
    return true;
  }

  pump(key) {
    const chain = this.chains.get(key);
    if (!chain || chain.running) {
      return;
    }
    const task = chain.pending.shift();
    if (!task) {
      this.chains.delete(key);
      return;
    }
    chain.running = true;
    this.acquire().then(async () => {
      try {
        await task();
      } catch (error) {
        this.logger?.error(`会话 ${key} 处理失败：`, error);
      } finally {
        this.release();
        chain.running = false;
        this.pump(key);
      }
    });
  }

  acquire() {
    if (this.active < this.maxGlobal) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release() {
    const next = this.waiters.shift();
    if (next) {
      // 名额直接转交给等待者，active 保持不变。
      next();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }

  get pendingCount() {
    let total = 0;
    for (const chain of this.chains.values()) {
      total += chain.pending.length + (chain.running ? 1 : 0);
    }
    return total;
  }
}
