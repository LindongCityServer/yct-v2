import type { LocaleCode } from '@yct/contracts';
import type { NextRequest } from 'next/server';
import {
  AssistantProviderError,
  buildAssistantSystemPrompt,
  streamAssistantReply,
  type AssistantChatMessage,
  type AssistantPageContext,
  type AssistantProviderMessage,
  type AssistantToolCall,
} from '../../../../lib/assistant/chat';
import { resolveCurrentPlayerLocation } from '../../../../lib/assistant/current-location';
import { buildViewerPrompt, resolveViewerProfile } from '../../../../lib/assistant/viewer-role';
import { getAssistantProvider } from '../../../../lib/assistant/providers';
import {
  buildAssistantRetrieval,
  type AssistantReference,
} from '../../../../lib/assistant/retrieval';
import { createAssistantTextFilter } from '../../../../lib/assistant/tool-syntax-filter';
import {
  buildAssistantToolPrompt,
  buildOpenAiToolDefinitions,
  runAssistantTool,
  type AssistantToolReference,
} from '../../../../lib/assistant/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const maximumMessages = 8;
const maximumMessageLength = 2000;
const maximumTotalLength = 8000;
const maximumKeyLength = 512;
const maximumToolRounds = 2;
// 引用 chip 过多会挤占回答区域，也会放大模型引用编号出错的概率。
// 预检索最多 10 条，这里留 2 条给工具补充结果。
const maximumReferences = 12;

interface ChatRequestBody {
  providerId?: unknown;
  model?: unknown;
  locale?: unknown;
  messages?: unknown;
  page?: unknown;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 200_000) {
    return errorResponse(413, 'too_large', '请求内容过大。');
  }

  const apiKey = request.headers.get('x-yct-provider-key')?.trim() ?? '';
  if (!apiKey || apiKey.length > maximumKeyLength) {
    return errorResponse(401, 'missing_key', '请先配置你的模型 API Key。');
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return errorResponse(400, 'invalid_request', '请求格式不正确。');
  }

  const provider = getAssistantProvider(typeof body.providerId === 'string' ? body.providerId : '');
  if (!provider) {
    return errorResponse(400, 'invalid_provider', '不支持的模型提供商。');
  }

  const model = normalizeModel(body.model) ?? provider.defaultModel;
  const locale = normalizeLocale(body.locale);
  const messages = normalizeMessages(body.messages);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return errorResponse(400, 'invalid_request', '请先输入问题。');
  }

  const page = normalizePageContext(body.page);
  // 页面标题只用于提示词，不参与检索，避免“这个页面怎么用”召回同名的无关地点。
  const retrievalQuery = messages
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.content)
    .join(' ');
  const [currentLocation, viewer] = await Promise.all([
    resolveCurrentPlayerLocation(request),
    resolveViewerProfile(request),
  ]);
  const retrieval = await buildAssistantRetrieval(retrievalQuery, locale, {
    pathname: page?.pathname,
    highlights: page?.highlights,
    currentLocation,
  });
  const baseSystemPrompt = [
    buildAssistantSystemPrompt(retrieval, locale, page),
    buildViewerPrompt(viewer),
  ]
    .filter(Boolean)
    .join('\n\n');
  const systemPromptWithTools = [
    baseSystemPrompt,
    '',
    '工具使用规则：',
    '1. 站内资料不足以回答，或需要精确的距离、时刻、班次、公告原文时，调用工具获取，不要猜测。',
    '2. 资料已经能回答时不要调用工具；每轮最多调用 3 个工具。',
    '3. 工具结果会附带引用编号，回答时继续用 [编号] 引用；不要编造编号。',
    buildAssistantToolPrompt(),
  ].join('\n');
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const abortFromClient = () => abortController.abort();
  request.signal.addEventListener('abort', abortFromClient, { once: true });

  let streamClosed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (streamClosed) {
          return;
        }
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // 引用在工具调用过程中会继续增加，前端按事件里的完整列表替换即可。
      const mergedReferences: AssistantReference[] = [];
      const seenReferences = new Set<string>();
      const rememberReference = (reference: AssistantReference | AssistantToolReference) => {
        const key = `${reference.source}:${reference.href ?? reference.title}`;
        if (seenReferences.has(key) || mergedReferences.length >= maximumReferences) {
          return false;
        }
        seenReferences.add(key);
        mergedReferences.push({ ...reference, id: mergedReferences.length + 1 });
        return true;
      };
      for (const reference of retrieval.references) {
        rememberReference(reference);
      }
      const addToolReferences = (references: AssistantToolReference[]): string => {
        const start = mergedReferences.length;
        for (const reference of references) {
          rememberReference(reference);
        }
        return mergedReferences
          .slice(start)
          .map(
            (reference) =>
              `[${reference.id}] ${reference.source}：${reference.title}${
                reference.snippet ? ` · ${reference.snippet}` : ''
              }`,
          )
          .join('\n');
      };

      send('meta', {
        references: mergedReferences,
        sourceStatus: retrieval.sourceStatus,
        asOf: retrieval.asOf,
        generatedAt: retrieval.generatedAt,
        provider: provider.id,
        model,
      });

      const providerMessages: AssistantProviderMessage[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const toolDefinitions = buildOpenAiToolDefinitions();
      let toolsEnabled = true;
      let round = 0;

      try {
        while (true) {
          let roundText = '';
          let visibleText = '';
          let toolCalls: AssistantToolCall[] = [];
          const useTools = toolsEnabled && round < maximumToolRounds;
          const textFilter = createAssistantTextFilter();
          try {
            for await (const event of streamAssistantReply({
              provider,
              model,
              apiKey,
              messages: providerMessages,
              // 关闭工具时同时去掉工具清单，避免模型继续输出工具调用语法。
              systemPrompt: useTools ? systemPromptWithTools : baseSystemPrompt,
              tools: useTools ? toolDefinitions : undefined,
              signal: abortController.signal,
            })) {
              if (event.type === 'text') {
                roundText += event.text;
                const visible = textFilter.push(event.text);
                if (visible) {
                  visibleText += visible;
                  send('delta', { text: visible });
                }
              } else {
                toolCalls = event.calls;
              }
            }
          } catch (error) {
            // 部分模型服务不认 tools 字段，退回纯资料回答。
            if (toolsEnabled && round === 0 && isToolsUnsupported(error)) {
              toolsEnabled = false;
              send('reset', { reason: 'tools_unsupported' });
              continue;
            }
            throw error;
          }

          const tail = textFilter.flush();
          if (tail) {
            visibleText += tail;
            send('delta', { text: tail });
          }

          // 模型把工具调用语法当成文本吐出来：关掉工具重答一次，并清掉已显示的残片。
          if (toolsEnabled && round === 0 && textFilter.sawToolSyntax) {
            toolsEnabled = false;
            send('reset', { reason: 'tool_syntax' });
            continue;
          }

          // 清洗后只剩符号（例如 `<<<<<<</`）时当作空回答：先关工具重答一次，再明确报错。
          if (round === 0 && toolCalls.length === 0 && !isMeaningfulAssistantText(visibleText)) {
            if (toolsEnabled) {
              toolsEnabled = false;
              send('reset', { reason: 'empty_answer' });
              continue;
            }
            throw new AssistantProviderError(502, '模型没有返回可读内容，请重试。');
          }

          if (toolCalls.length === 0 || round >= maximumToolRounds) {
            break;
          }

          // 模型决定先调工具，丢掉这一轮已经吐出的半句话，避免和最终回答叠在一起。
          if (visibleText) {
            send('reset', { reason: 'tool_call' });
          }
          providerMessages.push({
            role: 'assistant',
            content: roundText || null,
            tool_calls: toolCalls,
          });

          for (const call of toolCalls.slice(0, 3)) {
            const outcome = await runAssistantTool(
              call.function.name,
              parseToolArguments(call.function.arguments),
              { locale, pathname: page?.pathname },
            );
            const addedReferences = addToolReferences(outcome.result.references);
            providerMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: [
                outcome.result.summary,
                addedReferences ? `可直接引用的条目：\n${addedReferences}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            });
          }
          if (mergedReferences.length > 0) {
            send('references', { references: mergedReferences });
          }

          round += 1;
        }
        send('done', { ok: true });
      } catch (error) {
        const message =
          error instanceof AssistantProviderError
            ? error.message
            : '问一问暂时不可用，请稍后再试。';
        send('error', {
          message,
          references: mergedReferences,
        });
      } finally {
        streamClosed = true;
        request.signal.removeEventListener('abort', abortFromClient);
        try {
          controller.close();
        } catch {
          // 客户端主动取消时流可能已经关闭。
        }
      }
    },
    cancel() {
      streamClosed = true;
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/** 清洗后至少要有中文、英文单词或数字，纯符号不算有效回答。 */
function isMeaningfulAssistantText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return true;
  }
  return /[a-z]{2,}/i.test(trimmed) || /\d/.test(trimmed);
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const model = value.trim();
  if (!model || model.length > 120 || !/^[a-zA-Z0-9._:/-]+$/.test(model)) {
    return undefined;
  }
  return model;
}

function normalizeLocale(value: unknown): LocaleCode {
  return value === 'zh-Hant' || value === 'en' ? value : 'zh-CN';
}

function normalizePageContext(value: unknown): AssistantPageContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<AssistantPageContext>;
  const pathname = sanitizeString(candidate.pathname, 200);
  const title = sanitizeString(candidate.title, 200);
  const search = sanitizeString(candidate.search, 500);
  const highlights = normalizeHighlights(candidate.highlights);
  if (!pathname && !title && !search && highlights.length === 0) {
    return undefined;
  }

  return {
    pathname,
    title,
    search,
    ...(highlights.length > 0 ? { highlights } : {}),
  };
}

function normalizeHighlights(value: unknown): NonNullable<AssistantPageContext['highlights']> {
  if (!Array.isArray(value)) {
    return [];
  }

  const highlights: NonNullable<AssistantPageContext['highlights']> = [];
  for (const item of value.slice(0, 4)) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const kind = sanitizeString((item as { kind?: unknown }).kind, 24);
    const highlightTitle = sanitizeString((item as { title?: unknown }).title, 120);
    if (!highlightTitle) {
      continue;
    }

    highlights.push({
      kind: kind || 'unknown',
      title: highlightTitle,
      detail: sanitizeString((item as { detail?: unknown }).detail, 600) || undefined,
    });
  }

  return highlights;
}

function sanitizeString(value: unknown, maximumLength: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maximumLength)
    : '';
}

function normalizeMessages(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const messages: AssistantChatMessage[] = [];
  let totalLength = 0;
  for (const item of value.slice(-maximumMessages)) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      continue;
    }

    const normalizedContent = content.trim().slice(0, maximumMessageLength);
    if (!normalizedContent) {
      continue;
    }

    if (totalLength + normalizedContent.length > maximumTotalLength) {
      break;
    }

    totalLength += normalizedContent.length;
    messages.push({ role, content: normalizedContent });
  }

  return messages;
}

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** 部分服务商不接受 tools 字段，用 4xx 区分“参数不支持”和额度/鉴权问题。 */
function isToolsUnsupported(error: unknown): boolean {
  return (
    error instanceof AssistantProviderError &&
    (error.status === 400 || error.status === 404 || error.status === 422)
  );
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
