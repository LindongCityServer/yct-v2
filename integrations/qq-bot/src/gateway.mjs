import { inflateRawSync, inflateSync } from 'node:zlib';

/**
 * QQ 机器人 WebSocket 网关。
 *
 * 关键约束：
 * - 下行帧可能是文本，也可能是 zlib 压缩后的二进制，两种都要处理；
 * - 必须先收到 op 10 Hello 再发 Identify/Resume；
 * - 发消息接口要求机器人保持 WebSocket 在线，所以断线要自动重连；
 * - 同一个进程只跑一个 shard，群消息量级用不到分片。
 */

export const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

const OPEN = 1;
const FATAL_CLOSE_CODES = new Map([
  [4001, '无效的 opcode，请检查网关实现。'],
  [4002, '无效的 payload，请检查 Identify/Resume 字段。'],
  [4010, '无效的 shard，当前实现固定使用 [0,1]。'],
  [4011, '需要处理的频道过多，需要分片。'],
  [4012, '无效的 version。'],
  [4013, '无效的 intents，请检查 QQ_BOT_INTENTS。'],
  [4014, 'intents 无权限：需要在 QQ 开放平台申请「群聊 / 单聊消息」事件权限。'],
  [4914, '机器人已下架，目前只允许连接沙箱环境：请先在开放平台提交上线，或用沙箱成员测试。'],
  [4915, '机器人已封禁，无法连接。'],
]);

export function buildIdentifyPayload({ token, intents }) {
  return {
    op: OP.IDENTIFY,
    d: {
      token: `QQBot ${token}`,
      intents,
      shard: [0, 1],
      properties: {
        $os: process.platform,
        $browser: 'yct-qq-bot',
        $device: 'yct-qq-bot',
      },
    },
  };
}

export function buildResumePayload({ token, sessionId, seq }) {
  return { op: OP.RESUME, d: { token: `QQBot ${token}`, session_id: sessionId, seq: seq ?? 0 } };
}

/** 网关下行可能是明文 JSON，也可能是 zlib 压缩的二进制帧。 */
export function decodeGatewayPayload(data) {
  if (typeof data === 'string') {
    return data;
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    return inflateSync(buffer).toString('utf8');
  } catch {
    return inflateRawSync(buffer).toString('utf8');
  }
}

export function backoffDelay(attempt, random = Math.random) {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  return base + Math.floor(random() * 500);
}

export class QQGateway {
  constructor({
    api,
    intents,
    logger,
    onEvent,
    onReady,
    onFatal,
    WebSocketImpl = globalThis.WebSocket,
  }) {
    if (typeof WebSocketImpl !== 'function') {
      throw new Error('当前 Node 版本没有内置 WebSocket，请使用 Node.js 22+（推荐 24）。');
    }
    this.api = api;
    this.intents = intents;
    this.logger = logger;
    this.onEvent = onEvent;
    this.onReady = onReady;
    this.onFatal = onFatal;
    this.WebSocketImpl = WebSocketImpl;

    this.ws = null;
    this.stopped = false;
    this.suppressClose = false;
    this.seq = null;
    this.sessionId = '';
    this.lastAckAt = 0;
    this.attempt = 0;
    this.connectCount = 0;

    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.watchdogTimer = null;
    this.handshakeTimer = null;

    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
  }

  start() {
    this.stopped = false;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // probe 模式只等 READY，没有人消费失败分支时不要让 Promise 变成 unhandled rejection。
    this.readyPromise.catch(() => {});
    this.connect().catch((error) => {
      this.logger.error('首次连接失败：', error);
      this.scheduleReconnect();
    });
    return this.readyPromise;
  }

  waitForReady(timeoutMs = 25_000) {
    if (!this.readyPromise) {
      return Promise.reject(new Error('网关尚未启动。'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`等待 READY 超时（${timeoutMs}ms）。`)),
        timeoutMs,
      );
      this.readyPromise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.suppressClose = true;
      try {
        this.ws.close(1000, 'shutdown');
      } catch {
        // 已经关闭。
      }
      this.ws = null;
    }
  }

  async connect() {
    if (this.stopped) {
      return;
    }
    this.connectCount += 1;
    this.logger.info(
      `连接网关（第 ${this.connectCount} 次）${this.sessionId ? '，尝试 Resume' : ''}…`,
    );
    const url = await this.api.getGatewayUrl();
    const ws = new this.WebSocketImpl(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.logger.debug('WebSocket 已打开，等待 Hello。');
      this.handshakeTimer = setTimeout(() => {
        this.logger.warn('连接后没有收到 Hello，重连。');
        this.scheduleReconnect();
      }, 15_000);
    });

    ws.addEventListener('message', (event) => {
      this.handleMessage(event).catch((error) => {
        this.logger.error('处理网关消息失败：', error);
      });
    });

    ws.addEventListener('error', (event) => {
      this.logger.warn('WebSocket 错误：', event?.message ?? '未知错误');
    });

    ws.addEventListener('close', (event) => {
      this.handleClose(event).catch((error) => {
        this.logger.error('处理断线失败：', error);
      });
    });
  }

  async handleMessage(event) {
    let data = event.data;
    if (data && typeof data.arrayBuffer === 'function') {
      data = await data.arrayBuffer();
    }
    let payload;
    try {
      payload = JSON.parse(decodeGatewayPayload(data));
    } catch (error) {
      this.logger.warn('无法解析网关下行数据：', error);
      return;
    }

    const op = payload.op;
    const s = payload.s;
    if (typeof s === 'number' && s > 0) {
      this.seq = s;
    }

    if (op === OP.HELLO) {
      const interval = Number(payload.d?.heartbeat_interval) || 30_000;
      this.logger.info(`收到 Hello，心跳间隔 ${interval}ms。`);
      this.clearHandshakeTimer();
      this.startHeartbeat(interval);
      try {
        await this.authenticate();
      } catch (error) {
        this.logger.error('网关鉴权失败：', error);
        this.scheduleReconnect();
      }
      return;
    }

    if (op === OP.HEARTBEAT_ACK) {
      this.lastAckAt = Date.now();
      this.logger.debug('心跳 ACK。');
      return;
    }

    if (op === OP.HEARTBEAT) {
      this.send({ op: OP.HEARTBEAT, d: this.seq });
      return;
    }

    if (op === OP.RECONNECT) {
      this.logger.warn('平台要求重连。');
      this.scheduleReconnect();
      return;
    }

    if (op === OP.INVALID_SESSION) {
      this.logger.warn('Session 无效，清除后重新 Identify。');
      this.sessionId = '';
      this.seq = null;
      this.scheduleReconnect();
      return;
    }

    if (op !== OP.DISPATCH) {
      this.logger.debug(`忽略 op ${op}。`);
      return;
    }

    const type = payload.t;
    const body = payload.d;
    if (type === 'READY') {
      this.sessionId = body?.session_id ?? '';
      this.attempt = 0;
      this.logger.info(
        `机器人「${body?.user?.username ?? '未知'}」已上线，session ${shorten(this.sessionId)}。`,
      );
      this.readyResolve?.({ sessionId: this.sessionId, user: body?.user ?? null });
      this.readyResolve = null;
      this.readyReject = null;
      await this.onReady?.(body);
      return;
    }

    if (type === 'RESUMED') {
      this.attempt = 0;
      this.logger.info('Resume 成功，继续接收事件。');
      this.readyResolve?.({ sessionId: this.sessionId, user: null });
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    try {
      await this.onEvent?.(type, body);
    } catch (error) {
      this.logger.error(`处理事件 ${type} 失败：`, error);
    }
  }

  async authenticate() {
    const token = await this.api.getAccessToken();
    if (this.sessionId) {
      this.send(buildResumePayload({ token, sessionId: this.sessionId, seq: this.seq }));
      this.logger.debug('已发送 Resume。');
      return;
    }
    this.send(buildIdentifyPayload({ token, intents: this.intents }));
    this.logger.debug(`已发送 Identify，intents=${this.intents}。`);
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== OPEN) {
      this.logger.warn('WebSocket 未就绪，丢弃待发送数据。');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  startHeartbeat(interval) {
    this.clearHeartbeatTimers();
    this.lastAckAt = Date.now();
    const tick = () => {
      if (this.stopped || !this.ws || this.ws.readyState !== OPEN) {
        return;
      }
      this.send({ op: OP.HEARTBEAT, d: this.seq });
      this.logger.debug('发送心跳。');
    };
    this.heartbeatTimer = setInterval(tick, interval);
    this.watchdogTimer = setInterval(
      () => {
        if (Date.now() - this.lastAckAt > interval * 2.5) {
          this.logger.warn('心跳超时，重连。');
          this.scheduleReconnect();
        }
      },
      Math.max(5_000, Math.floor(interval / 2)),
    );
  }

  async handleClose(event) {
    this.clearTimers();
    if (this.suppressClose) {
      this.suppressClose = false;
      return;
    }
    if (this.stopped) {
      return;
    }

    const code = Number(event?.code) || 0;
    const reason = typeof event?.reason === 'string' ? event.reason : '';
    this.logger.warn(`WebSocket 已关闭：code ${code}${reason ? `，${reason}` : ''}`);

    if (code === 4004) {
      this.logger.warn('鉴权失败，强制刷新 access_token。');
      await this.api.getAccessToken({ force: true }).catch(() => {});
      this.sessionId = '';
      this.seq = null;
    } else if (code === 4006 || code === 4007) {
      this.sessionId = '';
      this.seq = null;
    }

    const fatal = FATAL_CLOSE_CODES.get(code);
    if (fatal) {
      const error = new Error(`QQ 网关拒绝连接：${fatal}（code ${code}）`);
      this.readyReject?.(error);
      this.readyReject = null;
      this.stopped = true;
      this.logger.error(error.message);
      await this.onFatal?.(error);
      return;
    }

    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    this.clearTimers();
    if (this.ws) {
      this.suppressClose = true;
      try {
        this.ws.close(1000, 'reconnect');
      } catch {
        // 忽略：连接可能已经断开。
      }
      this.ws = null;
    }
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.logger.info(`将在 ${delay}ms 后重连。`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        this.logger.error('重连失败：', error);
        this.scheduleReconnect();
      });
    }, delay);
  }

  clearHandshakeTimer() {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  clearHeartbeatTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  clearTimers() {
    this.clearHandshakeTimer();
    this.clearHeartbeatTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

function shorten(value) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}
