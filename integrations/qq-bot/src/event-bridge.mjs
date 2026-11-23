import { createServer } from 'node:http';

const maximumBodyBytes = 64 * 1024;

/**
 * 本机事件桥：
 * - POST /onebot：接 OneBot v11 的群消息、进退群通知；
 * - POST /server：接游戏服务器插件的进服/退服/聊天事件；
 * - POST /ops：接部署脚本的运维提醒（开始/完成/异常/回滚/取消）。
 * 只监听回环地址，写一个随机 token 后由外部插件带上；/ops 另有独立 token。
 */
export function startEventBridge({
  port,
  bind = '127.0.0.1',
  token = '',
  opsToken = '',
  info = {},
  onOneBotEvent,
  onServerEvent,
  onOpsEvent,
  logger,
} = {}) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, ...info, ops: Boolean(opsToken) });
    }
    if (request.method !== 'POST') {
      return json(response, 405, { error: 'method_not_allowed' });
    }

    // /ops 使用独立 token，避免把部署通知权限和 OneBot / 游戏服务器事件混在一起。
    if (url.pathname === '/ops') {
      if (!opsToken) {
        return json(response, 503, { error: 'ops_not_configured' });
      }
      if (!authorize(request, opsToken)) {
        return json(response, 401, { error: 'unauthorized' });
      }
    } else if (!authorize(request, token)) {
      return json(response, 401, { error: 'unauthorized' });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
    try {
      if (url.pathname === '/ops') {
        const result = (await onOpsEvent?.(body)) ?? {};
        return json(response, 202, { ok: true, ...result });
      }
      if (url.pathname === '/onebot') {
        await onOneBotEvent?.(body);
      } else if (url.pathname === '/server') {
        await onServerEvent?.(body);
      } else {
        return json(response, 404, { error: 'not_found' });
      }
      return json(response, 202, { ok: true });
    } catch (error) {
      if (error?.name === 'OpsReminderError' || error?.code === 'invalid_ops_event') {
        return json(response, 400, { error: 'invalid_ops_event', message: error.message });
      }
      logger?.warn(`事件桥处理 ${url.pathname} 失败：`, error);
      return json(response, 500, { error: 'handler_failed' });
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, bind, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      logger?.info(`事件桥已监听 http://${bind}:${actualPort}`);
      resolve({
        port: actualPort,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

function authorize(request, token) {
  if (!token) {
    return true;
  }
  const header = request.headers.authorization;
  const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  return bearer === token || request.headers['x-yct-token'] === token;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maximumBodyBytes) {
        reject(new Error('body_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    request.on('error', reject);
  });
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
