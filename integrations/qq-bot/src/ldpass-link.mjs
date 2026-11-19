/** 临东通 QQ 绑定内部接口客户端。只负责 c2c openid，不接触 QQ 号。 */
export class QqLinkError extends Error {
  constructor(message, code = 'link_failed') {
    super(message);
    this.name = 'QqLinkError';
    this.code = code;
  }
}

export class QqLinkClient {
  constructor({ baseUrl, secret, fetchImpl = fetch, timeoutMs = 8_000, logger } = {}) {
    this.baseUrl = String(baseUrl ?? '').replace(/\/+$/, '');
    this.secret = String(secret ?? '');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.baseUrl && this.secret);
  }

  async createToken(openId) {
    const payload = await this.request('/api/internal/qq-link/token', {
      method: 'POST',
      body: { openId, scope: 'c2c', groupOpenId: null },
    });
    if (typeof payload?.url !== 'string' || !payload.url) {
      throw new QqLinkError('临东通没有返回可用的绑定链接。', 'invalid_response');
    }
    return { url: payload.url, expiresAt: payload.expiresAt };
  }

  async consumeCode(code, openId) {
    const payload = await this.request('/api/internal/qq-link/consume', {
      method: 'POST',
      body: { code, openId, scope: 'c2c', groupOpenId: null },
    });
    if (!payload?.link) {
      throw new QqLinkError('绑定码没有完成绑定。', 'invalid_response');
    }
    return payload.link;
  }

  async resolve(openId) {
    const payload = await this.request(
      `/api/internal/qq-link/resolve?openId=${encodeURIComponent(openId)}&scope=c2c`,
      { method: 'GET' },
    );
    return payload?.link ?? null;
  }

  async unlink(openId) {
    await this.request('/api/internal/qq-link/unlink', {
      method: 'POST',
      body: { openId, scope: 'c2c', groupOpenId: null },
    });
    return true;
  }

  async request(path, { method, body }) {
    if (!this.enabled) {
      throw new QqLinkError('QQ 绑定功能还没有配置完成。', 'not_configured');
    }
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      this.logger?.warn(`临东通 QQ 绑定接口请求失败（${path}）：`, error);
      throw new QqLinkError('临时无法连接临东通绑定服务，请稍后再试。', 'network_error');
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || payload?.ok === false) {
      const message =
        typeof payload?.message === 'string' && payload.message
          ? payload.message
          : '临东通暂时无法完成 QQ 绑定。';
      throw new QqLinkError(message, payload?.error ?? `http_${response.status}`);
    }
    return payload ?? {};
  }
}
