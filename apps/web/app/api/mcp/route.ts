import type { LocaleCode } from '@yct/contracts';
import { handleMcpMessage } from '../../../lib/mcp/server';
import { consumeMcpRateLimit } from '../../../lib/mcp/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const maximumBodyBytes = 200_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
  'Access-Control-Max-Age': '86400',
  'X-Robots-Tag': 'noindex',
};

/**
 * 只读 MCP Server（Streamable HTTP，无状态）。
 * 工具清单与问一问共用 lib/assistant/tools，不暴露任何写操作或模型 Key。
 */
export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    return jsonRpcError(413, -32600, '请求内容过大。');
  }

  const rateLimit = consumeMcpRateLimit(resolveClientKey(request));
  if (!rateLimit.allowed) {
    return jsonRpcError(429, -32000, '请求过于频繁，请稍后再试。', {
      'Retry-After': String(rateLimit.retryAfterSeconds),
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcError(400, -32700, '请求体不是合法 JSON。');
  }

  if (Array.isArray(payload)) {
    return jsonRpcError(400, -32600, '暂不支持 JSON-RPC 批量请求。');
  }

  const response = await handleMcpMessage(payload, {
    locale: resolveLocale(request),
  });

  if (!response) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const accept = request.headers.get('accept') ?? '';
  const prefersEventStream =
    accept.includes('text/event-stream') && !accept.includes('application/json');

  if (prefersEventStream) {
    return new Response(`event: message\ndata: ${JSON.stringify(response)}\n\n`, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return Response.json(response, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/** Streamable HTTP 的 GET 用于服务端推送；这里是无状态只读服务，不提供长连接。 */
export function GET() {
  return new Response('只支持 POST。', {
    status: 405,
    headers: {
      ...corsHeaders,
      Allow: 'POST, OPTIONS',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export function DELETE() {
  return new Response('无状态服务，无需关闭会话。', {
    status: 405,
    headers: {
      ...corsHeaders,
      Allow: 'POST, OPTIONS',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code, message } },
    {
      status,
      headers: { ...corsHeaders, ...extraHeaders, 'Cache-Control': 'no-store' },
    },
  );
}

function resolveClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'anonymous';
}

function resolveLocale(request: Request): LocaleCode {
  const url = new URL(request.url);
  const queryLocale = normalizeLocale(url.searchParams.get('locale'));
  if (queryLocale) {
    return queryLocale;
  }
  return normalizeLocale(request.headers.get('accept-language')?.split(',')[0]) ?? 'zh-CN';
}

function normalizeLocale(value: string | null | undefined): LocaleCode | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }
  if (
    normalized === 'zh-hant' ||
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return 'zh-CN';
  }
  return undefined;
}
