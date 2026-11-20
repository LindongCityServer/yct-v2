/**
 * 关闭提示的节流：同一群同一功能在一段时间内只提示一次，
 * 避免某个成员反复触发被关掉的功能时刷屏。
 */
export class HintThrottle {
  constructor({ ttlMs = 10 * 60 * 1000, max = 2000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.now = now;
    this.lastSent = new Map();
  }

  shouldSend(key) {
    if (!key) {
      return false;
    }
    const now = this.now();
    const last = this.lastSent.get(key);
    if (typeof last === 'number' && now - last < this.ttlMs) {
      return false;
    }
    this.lastSent.set(key, now);
    if (this.lastSent.size > this.max) {
      for (const [itemKey, time] of this.lastSent) {
        if (now - time >= this.ttlMs) {
          this.lastSent.delete(itemKey);
        }
      }
      while (this.lastSent.size > this.max) {
        this.lastSent.delete(this.lastSent.keys().next().value);
      }
    }
    return true;
  }
}
