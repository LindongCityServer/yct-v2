import type { LocaleCode } from '@yct/contracts';
import {
  assistantTools,
  buildAssistantToolPrompt,
  buildMcpToolDefinitions,
  runAssistantTool,
} from '../assistant/tools';

/** 服务端支持的 MCP 协议版本；优先回显客户端版本，未知时回落到最新。 */
const supportedProtocolVersions = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const latestMcpProtocolVersion = supportedProtocolVersions[0];

export interface JsonRpcId {
  id: string | number | null;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId['id'];
  error: { code: number; message: string; data?: unknown };
}

export interface JsonRpcResult {
  jsonrpc: '2.0';
  id: JsonRpcId['id'];
  result: unknown;
}

export type JsonRpcResponse = JsonRpcError | JsonRpcResult;

export const mcpServerInfo = {
  name: 'yuchengtong',
  title: '雨城通公开数据',
  version: '0.1.0',
};

/**
 * 处理单条 JSON-RPC 消息。
 * 返回 undefined 表示这是 notification，不需要 HTTP 响应体。
 */
export async function handleMcpMessage(
  message: unknown,
  context: { locale: LocaleCode },
): Promise<JsonRpcResponse | undefined> {
  if (!isJsonRpcRequest(message)) {
    return errorResponse(null, -32600, '无效的 JSON-RPC 请求。');
  }

  const { id, method, params } = message;
  const isNotification = id === undefined;
  if (isNotification) {
    // notifications/initialized 等通知按协议不返回内容。
    return undefined;
  }

  switch (method) {
    case 'initialize':
      return resultResponse(id, {
        protocolVersion: resolveProtocolVersion(params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: mcpServerInfo,
        instructions: [
          '雨城通（Yuchengtong）只读数据服务，提供临东市地图地点、公交地铁线路、班次换乘、运营公告与 Wiki 检索。',
          '所有工具只读且匿名可用；不要在这里提交或修改任何数据。',
          buildAssistantToolPrompt(),
        ].join('\n'),
      });
    case 'ping':
      return resultResponse(id, {});
    case 'tools/list':
      return resultResponse(id, { tools: buildMcpToolDefinitions() });
    case 'tools/call':
      return callTool(id, params, context);
    default:
      return errorResponse(id, -32601, `不支持的方法：${method}`);
  }
}

async function callTool(
  id: JsonRpcId['id'],
  params: unknown,
  context: { locale: LocaleCode },
): Promise<JsonRpcResponse> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return errorResponse(id, -32602, 'tools/call 需要 { name, arguments } 参数。');
  }

  const input = params as { name?: unknown; arguments?: unknown };
  if (typeof input.name !== 'string' || !input.name.trim()) {
    return errorResponse(id, -32602, 'tools/call 缺少工具名。');
  }

  const outcome = await runAssistantTool(input.name.trim(), input.arguments, {
    locale: context.locale,
  });

  return resultResponse(id, {
    content: [
      { type: 'text', text: outcome.result.summary },
      ...(outcome.result.references.length > 0
        ? [
            {
              type: 'text',
              text: `结构化引用：${JSON.stringify({ references: outcome.result.references })}`,
            },
          ]
        : []),
    ],
    ...(outcome.isError ? { isError: true } : {}),
  });
}

function resolveProtocolVersion(params: unknown): string {
  const requested =
    params && typeof params === 'object' && !Array.isArray(params)
      ? (params as { protocolVersion?: unknown }).protocolVersion
      : undefined;
  return typeof requested === 'string' && supportedProtocolVersions.includes(requested)
    ? requested
    : latestMcpProtocolVersion;
}

function isJsonRpcRequest(
  value: unknown,
): value is { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const message = value as { jsonrpc?: unknown; method?: unknown };
  return message.jsonrpc === '2.0' && typeof message.method === 'string';
}

function resultResponse(id: JsonRpcId['id'], result: unknown): JsonRpcResult {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id: JsonRpcId['id'], code: number, message: string): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** 工具数量用于健康检查与校验脚本。 */
export const mcpToolCount = assistantTools.length;
