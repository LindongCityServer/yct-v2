/**
 * 轮询站内玩家位置接口，推断玩家进入/离开服务器。
 * 首次拉取只建立基线，不补发历史进服/退服消息。
 */
export class PlayerEventMonitor {
  constructor({ baseUrl, intervalMs = 30_000, onEvent, logger, fetchImpl = fetch } = {}) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/+$/, '');
    this.intervalMs = Math.max(10_000, Number(intervalMs) || 30_000);
    this.onEvent = onEvent;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.timer = null;
    this.online = null;
    this.polling = false;
    this.failureLogged = false;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll() {
    if (this.polling || !this.enabled) {
      return;
    }
    this.polling = true;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/map/player-locations`, {
        signal: AbortSignal.timeout(Math.min(this.intervalMs, 15_000)),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const names = new Set(
        (payload?.snapshot?.markers ?? [])
          .filter((marker) => marker?.playerLocation?.presence === 'online')
          .map((marker) => String(marker.label ?? marker.playerLocation?.serverAccountName ?? ''))
          .filter(Boolean),
      );
      const firstPoll = this.online === null;
      if (this.online) {
        for (const name of names) {
          if (!this.online.has(name)) {
            await this.onEvent?.({ type: 'join', name });
          }
        }
        for (const name of this.online) {
          if (!names.has(name)) {
            await this.onEvent?.({ type: 'leave', name });
          }
        }
      }
      this.online = names;
      this.failureLogged = false;
      if (firstPoll) {
        this.logger?.info(`玩家进出轮询已建立基线，当前在线 ${names.size} 人。`);
      }
    } catch (error) {
      // 默认 info 级别下 debug 不可见；首次失败用 warn 提示，避免轮询静默失效。
      if (!this.failureLogged) {
        this.failureLogged = true;
        this.logger?.warn('玩家进出轮询失败（后续同类错误只记 debug）：', error);
      } else {
        this.logger?.debug('玩家进出轮询失败：', error);
      }
    } finally {
      this.polling = false;
    }
  }
}
