/**
 * QQ 机器人开放平台 HTTP 客户端。
 * 只覆盖本机器人用到的能力：access_token、网关地址、群聊/单聊消息、输入状态。
 * 接口地址与鉴权方式以 2026-07 版官方文档为准（统一域名 api.bot.qq.com）。
 */

export class QQApiError extends Error {
  constructor(message, { status = 0, code = 0, traceId = '', path = '' } = {}) {
    super(message);
    this.name = 'QQApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.path = path;
  }
}

export class QQApi {
  constructor({ apiBase, appId, appSecret, logger, fetchImpl = fetch, timeoutMs = 15000 }) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.appId = appId;
    this.appSecret = appSecret;
    this.logger = logger;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.token = '';
    this.tokenExpiresAt = 0;
    this.pendingToken = null;
  }

  /** access_token 有效期约 7200 秒，提前 60 秒刷新；并发请求共用同一次获取。 */
  async getAccessToken({ force = false } = {}) {
    const now = Date.now();
    if (!force && this.token && now < this.tokenExpiresAt - 60_000) {
      return this.token;
    }
    if (this.pendingToken) {
      return this.pendingToken;
    }

    this.pendingToken = this.fetchAccessToken()
      .then(({ token, expiresIn }) => {
        this.token = token;
        this.tokenExpiresAt = Date.now() + expiresIn * 1000;
        return token;
      })
      .finally(() => {
        this.pendingToken = null;
      });

    return this.pendingToken;
  }

  async fetchAccessToken() {
    const response = await this.fetchImpl(`${this.apiBase}/app/getAppAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: this.appId, clientSecret: this.appSecret }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await readJson(response);
    if (!response.ok || !data?.access_token) {
      throw new QQApiError(
        `获取 QQ access_token 失败：${data?.message ?? `HTTP ${response.status}`}（code ${data?.code ?? response.status}）`,
        { status: response.status, code: Number(data?.code) || 0, path: '/app/getAppAccessToken' },
      );
    }
    const expiresIn = Number(data.expires_in) || 7200;
    return { token: String(data.access_token), expiresIn };
  }

  async getGatewayUrl() {
    const data = await this.request('/gateway');
    if (!data?.url) {
      throw new QQApiError('获取网关地址失败：响应里没有 url。', { path: '/gateway' });
    }
    return String(data.url);
  }

  /**
   * 统一的 openapi 调用：401 时刷新一次 token 再重试，
   * 其余错误交给调用方决定是否提示用户。
   */
  async request(path, { method = 'GET', body, retryOnAuth = true } = {}) {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `QQBot ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 401 && retryOnAuth) {
      this.logger?.warn('QQ access_token 已失效，刷新后重试。');
      await this.getAccessToken({ force: true });
      return this.request(path, { method, body, retryOnAuth: false });
    }

    const data = await readJson(response);
    if (!response.ok || isBusinessError(data)) {
      const code = Number(data?.code) || 0;
      throw new QQApiError(
        `QQ 接口 ${path} 调用失败：${data?.message ?? `HTTP ${response.status}`}（code ${code || response.status}）`,
        {
          status: response.status,
          code,
          traceId: typeof data?.trace_id === 'string' ? data.trace_id : '',
          path,
        },
      );
    }
    return data;
  }

  sendGroupMessage(groupOpenid, payload) {
    return this.request(`/v2/groups/${encodeURIComponent(groupOpenid)}/messages`, {
      method: 'POST',
      body: payload,
    });
  }

  sendC2CMessage(userOpenid, payload) {
    return this.request(`/v2/users/${encodeURIComponent(userOpenid)}/messages`, {
      method: 'POST',
      body: payload,
    });
  }

  /** 群聊图片走“上传拿 file_info，再发 msg_type=7”两步。 */
  async uploadGroupImageData(groupOpenid, buffer) {
    return this.uploadGroupFileData(groupOpenid, buffer, 'card.png');
  }

  async uploadC2CImageData(userOpenid, buffer) {
    return this.uploadC2CFileData(userOpenid, buffer, 'card.png');
  }

  async uploadGroupFileData(groupOpenid, buffer, fileName) {
    const data = await this.request(`/v2/groups/${encodeURIComponent(groupOpenid)}/files`, {
      method: 'POST',
      body: {
        file_type: 1,
        file_data: Buffer.from(buffer).toString('base64'),
        file_name: fileName,
        srv_send_msg: false,
      },
    });
    const fileInfo = data?.file_info;
    if (typeof fileInfo !== 'string' || !fileInfo) {
      throw new QQApiError('QQ 群图片数据上传没有返回 file_info。', {
        path: '/v2/groups/.../files',
      });
    }
    return fileInfo;
  }

  async uploadC2CFileData(userOpenid, buffer, fileName) {
    const data = await this.request(`/v2/users/${encodeURIComponent(userOpenid)}/files`, {
      method: 'POST',
      body: {
        file_type: 1,
        file_data: Buffer.from(buffer).toString('base64'),
        file_name: fileName,
        srv_send_msg: false,
      },
    });
    const fileInfo = data?.file_info;
    if (typeof fileInfo !== 'string' || !fileInfo) {
      throw new QQApiError('QQ 单聊图片数据上传没有返回 file_info。', {
        path: '/v2/users/.../files',
      });
    }
    return fileInfo;
  }

  async uploadGroupImage(groupOpenid, url) {
    const data = await this.request(`/v2/groups/${encodeURIComponent(groupOpenid)}/files`, {
      method: 'POST',
      body: { file_type: 1, url, srv_send_msg: false },
    });
    const fileInfo = data?.file_info;
    if (typeof fileInfo !== 'string' || !fileInfo) {
      throw new QQApiError('QQ 群图片上传没有返回 file_info。', { path: '/v2/groups/.../files' });
    }
    return fileInfo;
  }

  sendGroupImage(groupOpenid, { fileInfo, msgId, msgSeq }) {
    return this.sendGroupMessage(groupOpenid, {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_id: msgId,
      msg_seq: msgSeq,
    });
  }

  async uploadC2CImage(userOpenid, url) {
    const data = await this.request(`/v2/users/${encodeURIComponent(userOpenid)}/files`, {
      method: 'POST',
      body: { file_type: 1, url, srv_send_msg: false },
    });
    const fileInfo = data?.file_info;
    if (typeof fileInfo !== 'string' || !fileInfo) {
      throw new QQApiError('QQ 单聊图片上传没有返回 file_info。', { path: '/v2/users/.../files' });
    }
    return fileInfo;
  }

  sendC2CImage(userOpenid, { fileInfo, msgId, msgSeq }) {
    return this.sendC2CMessage(userOpenid, {
      msg_type: 7,
      media: { file_info: fileInfo },
      msg_id: msgId,
      msg_seq: msgSeq,
    });
  }

  /** 单聊支持「输入中」状态；群聊没有等价能力，只能发一条短提示。 */
  sendC2CTyping(userOpenid, { msgId, msgSeq }) {
    return this.sendC2CMessage(userOpenid, {
      msg_type: 6,
      input_notify: { input_type: 1, input_second: 60 },
      msg_id: msgId,
      msg_seq: msgSeq,
    });
  }
}

function isBusinessError(data) {
  return Boolean(data && typeof data === 'object' && data.code && Number(data.code) !== 0);
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}
