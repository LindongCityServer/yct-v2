/**
 * 「问一问」SSE 客户端。
 *
 * 复用网页端同一套接口（POST /api/assistant/chat），因此检索、工具调用、
 * 提示词和引用编号都与站内问一问保持一致；QQ 机器人只负责把最终文本发出去。
 */

import { createAccountContextToken } from './account-context.mjs';

export class AssistantError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.name = 'AssistantError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 解析 SSE 流。事件块之间以空行分隔，data 可能跨多行；
 * 这里不假设固定分块边界，缓冲区只在完整事件处消费。
 */
export function createSseParser(onEvent) {
  let buffer = '';

  const consume = () => {
    while (true) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) {
        return;
      }
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      parseBlock(block, onEvent);
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      consume();
    },
    flush() {
      // 最后一段如果没有以空行结尾，也按一个事件处理。
      const block = buffer;
      buffer = '';
      if (block.trim()) {
        parseBlock(block, onEvent);
      }
    },
  };
}

function parseBlock(block, onEvent) {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon >= 0 ? line.slice(0, colon) : line;
    let value = colon >= 0 ? line.slice(colon + 1) : '';
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0) {
    return;
  }
  const raw = dataLines.join('\n');
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // 非 JSON 的 data 原样交给调用方，避免整条流因为一个坏事件中断。
  }
  onEvent?.(event, data);
}

async function readSse(body, onEvent) {
  if (!body?.getReader) {
    throw new AssistantError('问一问返回的响应不是流式内容。');
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onEvent);
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.flush();
}

/**
 * 请求一次完整回答，内部消费整个 SSE 流后返回最终文本和引用。
 * 失败时抛 AssistantError，message 可以直接回给 QQ 用户。
 */
export async function askAssistant({
  baseUrl,
  apiKey,
  providerId,
  model,
  locale,
  channel,
  capabilities,
  messages,
  accountContext,
  accountContextSecret,
  timeoutMs = 120_000,
  fetchImpl = fetch,
  logger,
}) {
  const startedAt = Date.now();
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/assistant/chat`;
  const contextToken = createAccountContextToken({
    ldpassUserId: accountContext?.ldpassUserId,
    openId: accountContext?.openId,
    secret: accountContextSecret,
  });
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'x-yct-provider-key': apiKey,
        ...(contextToken ? { 'x-yct-qq-account-context': contextToken } : {}),
      },
      body: JSON.stringify({
        providerId,
        model,
        locale,
        channel,
        messages,
        ...(capabilities ? { capabilities } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw toNetworkError(error, endpoint);
  }

  if (!response.ok) {
    const payload = await readJsonSafely(response);
    const message = payload?.error?.message ?? `问一问接口返回 HTTP ${response.status}。`;
    throw new AssistantError(message, {
      status: response.status,
      code: typeof payload?.error?.code === 'string' ? payload.error.code : '',
    });
  }

  const result = { text: '', references: [], followups: [], error: '', reasonCode: '' };
  try {
    await readSse(response.body, (event, data) => {
      switch (event) {
        case 'meta':
          if (Array.isArray(data?.references)) {
            result.references = data.references;
          }
          if (typeof data?.routing?.reasonCode === 'string') {
            result.reasonCode = data.routing.reasonCode;
          }
          break;
        case 'delta':
          if (typeof data?.text === 'string') {
            result.text += data.text;
          }
          break;
        case 'reset':
          result.text = '';
          break;
        case 'references':
          if (Array.isArray(data?.references)) {
            result.references = data.references;
          }
          break;
        case 'followups':
          if (Array.isArray(data?.items)) {
            result.followups = data.items.filter((item) => typeof item === 'string');
          }
          break;
        case 'error':
          result.error = typeof data?.message === 'string' ? data.message : '问一问暂时不可用。';
          break;
        case 'done':
          break;
        default:
          break;
      }
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new AssistantError('问一问回答超时了，请稍后再试。', { code: 'timeout' });
    }
    throw new AssistantError('读取问一问回答时中断了，请稍后再试。', { code: 'stream' });
  }

  if (!result.error && !result.text.trim()) {
    result.error = '问一问没有返回可读内容，请换个问法再试。';
  }
  logger?.debug(
    `问一问回答完成：${result.text.length} 字，引用 ${result.references.length} 条，` +
      `用时 ${Date.now() - startedAt}ms。`,
  );
  return result;
}

function toNetworkError(error, endpoint) {
  if (isTimeout(error)) {
    return new AssistantError('问一问回答超时了，请稍后再试。', { code: 'timeout' });
  }
  const detail = error?.cause?.code ?? error?.code ?? error?.message ?? '未知错误';
  return new AssistantError(
    `连不上问一问服务（${endpoint}，${detail}）。请确认网页服务已启动，或检查 YCT_BASE_URL。`,
    { code: 'network' },
  );
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT';
}

async function readJsonSafely(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    return null;
  }
}
