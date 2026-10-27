/**
 * MCP Server HTTP 级校验。
 *
 * 不启动 Next 开发服务器，直接把 /api/mcp 的 route handler 挂到 Node http 上，
 * 用真实 fetch 走一遍协议交互：初始化、工具清单、工具调用、SSE、错误码、限流。
 *
 * 运行：pnpm mcp:check
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { GET, OPTIONS, POST } from '../../apps/web/app/api/mcp/route';
import { assistantTools } from '../../apps/web/lib/assistant/tools';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const method = request.method ?? 'GET';
    const init: RequestInit = {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
    };
    const handler = method === 'POST' ? POST : method === 'OPTIONS' ? OPTIONS : GET;
    const result = await handler(new Request(`http://127.0.0.1${request.url ?? '/'}`, init));

    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(Buffer.from(await result.arrayBuffer()));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${port}/api/mcp`;

  const post = (body: unknown, options: { headers?: Record<string, string>; ip?: string } = {}) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-forwarded-for': options.ip ?? '203.0.113.10',
        ...options.headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  try {
    console.log('── 1. 初始化与通知 ─────────────────────────────');

    const initialized = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check' } },
    });
    const initializedBody = (await initialized.json()) as {
      result?: {
        protocolVersion?: string;
        capabilities?: { tools?: unknown };
        serverInfo?: unknown;
      };
    };
    check('initialize 返回 200', initialized.status === 200, String(initialized.status));
    check(
      'initialize 回显协议版本',
      initializedBody.result?.protocolVersion === '2025-06-18',
      initializedBody.result?.protocolVersion,
    );
    check('initialize 声明 tools 能力', Boolean(initializedBody.result?.capabilities?.tools));
    check('initialize 带 serverInfo', Boolean(initializedBody.result?.serverInfo));

    const fallbackVersion = await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    });
    const fallbackBody = (await fallbackVersion.json()) as {
      result?: { protocolVersion?: string };
    };
    check(
      '未知协议版本回落到最新版',
      fallbackBody.result?.protocolVersion === '2025-06-18',
      fallbackBody.result?.protocolVersion,
    );

    const notification = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    check('通知返回 202 且无响应体', notification.status === 202, String(notification.status));

    console.log('── 2. 工具清单 ─────────────────────────────────');

    const listed = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const listedBody = (await listed.json()) as {
      result?: { tools?: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }> };
    };
    const tools = listedBody.result?.tools ?? [];
    check('tools/list 返回 200', listed.status === 200, String(listed.status));
    check(
      '工具清单与注册表一致',
      tools.length === assistantTools.length &&
        tools.every((tool) => assistantTools.some((entry) => entry.name === tool.name)),
      `${tools.length}/${assistantTools.length}`,
    );
    check(
      '所有工具标记为只读',
      tools.every((tool) => tool.annotations?.readOnlyHint === true),
    );

    console.log('── 3. 工具调用 ─────────────────────────────────');

    const health = await post({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'network_health', arguments: {} },
    });
    const healthBody = (await health.json()) as {
      result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
    };
    check(
      'network_health 返回文本内容',
      health.status === 200 &&
        healthBody.result?.isError !== true &&
        Boolean(healthBody.result?.content?.[0]?.text),
      healthBody.result?.content?.[0]?.text?.slice(0, 60),
    );

    const places = await post({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'search_places', arguments: { query: '超市', limit: 2 } },
    });
    const placesBody = (await places.json()) as {
      result?: { content?: Array<{ text: string }> };
    };
    check(
      'search_places 能执行并返回文本',
      places.status === 200 && Boolean(placesBody.result?.content?.[0]?.text),
      placesBody.result?.content?.[0]?.text?.slice(0, 60),
    );

    const unknownTool = await post({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'drop_database', arguments: {} },
    });
    const unknownToolBody = (await unknownTool.json()) as {
      result?: { isError?: boolean; content?: Array<{ text: string }> };
    };
    check(
      '未知工具返回 isError 而不是服务端崩溃',
      unknownTool.status === 200 &&
        unknownToolBody.result?.isError === true &&
        Boolean(unknownToolBody.result?.content?.[0]?.text),
    );

    const missingArgument = await post({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'search_places', arguments: {} },
    });
    const missingBody = (await missingArgument.json()) as { result?: { isError?: boolean } };
    check('缺少必填参数时返回 isError', missingBody.result?.isError === true);

    console.log('── 4. 传输与错误处理 ───────────────────────────');

    const sse = await post(
      { jsonrpc: '2.0', id: 8, method: 'ping' },
      { headers: { accept: 'text/event-stream' } },
    );
    const sseText = await sse.text();
    check(
      'Accept 只要 SSE 时按事件流返回',
      sse.status === 200 &&
        (sse.headers.get('content-type') ?? '').includes('text/event-stream') &&
        sseText.startsWith('event: message'),
      sseText.slice(0, 60),
    );

    const invalidJson = await post('{');
    const invalidJsonBody = (await invalidJson.json()) as { error?: { code?: number } };
    check(
      '非法 JSON 返回 -32700',
      invalidJson.status === 400 && invalidJsonBody.error?.code === -32700,
      `${invalidJson.status}/${invalidJsonBody.error?.code}`,
    );

    const batch = await post([{ jsonrpc: '2.0', id: 9, method: 'ping' }]);
    const batchBody = (await batch.json()) as { error?: { code?: number } };
    check(
      '批量请求返回 -32600',
      batch.status === 400 && batchBody.error?.code === -32600,
      `${batch.status}/${batchBody.error?.code}`,
    );

    const unknownMethod = await post({ jsonrpc: '2.0', id: 10, method: 'resources/list' });
    const unknownMethodBody = (await unknownMethod.json()) as { error?: { code?: number } };
    check(
      '未知方法返回 -32601',
      unknownMethodBody.error?.code === -32601,
      String(unknownMethodBody.error?.code),
    );

    const oversized = await post({
      jsonrpc: '2.0',
      id: 11,
      method: 'ping',
      padding: 'x'.repeat(200_500),
    });
    check('超大请求返回 413', oversized.status === 413, String(oversized.status));

    const preflight = await fetch(endpoint, { method: 'OPTIONS' });
    check(
      'OPTIONS 返回 CORS 预检',
      preflight.status === 204 &&
        preflight.headers.get('access-control-allow-origin') === '*' &&
        (preflight.headers.get('access-control-allow-methods') ?? '').includes('POST'),
      String(preflight.status),
    );

    const getResponse = await fetch(endpoint, { method: 'GET' });
    check('GET 返回 405（无状态服务不提供长连接）', getResponse.status === 405);

    console.log('── 5. 限流 ─────────────────────────────────────');

    const rateLimitIp = '198.51.100.77';
    let allowed = 0;
    let rejected = 0;
    let retryAfter = '';
    for (let index = 0; index < 61; index += 1) {
      const response = await post(
        { jsonrpc: '2.0', id: `rate-${index}`, method: 'ping' },
        { ip: rateLimitIp },
      );
      if (response.status === 429) {
        rejected += 1;
        retryAfter = response.headers.get('retry-after') ?? '';
        await response.arrayBuffer();
      } else {
        allowed += 1;
        await response.arrayBuffer();
      }
    }
    check('每分钟前 60 次放行', allowed === 60, `放行 ${allowed} 次`);
    check('第 61 次返回 429', rejected === 1, `拒绝 ${rejected} 次`);
    check('429 带 Retry-After', Number(retryAfter) > 0, retryAfter);
  } finally {
    server.close();
  }

  console.log('');
  console.log(`通过 ${passed}，失败 ${failed}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
