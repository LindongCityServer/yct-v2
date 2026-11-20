import type { LocaleCode } from '@yct/contracts';
import type { NextRequest } from 'next/server';
import {
  AssistantProviderError,
  buildAssistantChannelPrompt,
  buildAssistantContextBlock,
  buildAssistantSystemPrompt,
  streamAssistantReply,
  type AssistantChannel,
  type AssistantChatMessage,
  type AssistantPageContext,
  type AssistantProviderMessage,
  type AssistantToolCall,
} from '../../../../lib/assistant/chat';
import {
  buildCurrentLocationPrompt,
  resolveCurrentPlayerLocation,
} from '../../../../lib/assistant/current-location';
import { isEasterEggQuery } from '../../../../lib/assistant/easter-egg';
import {
  buildAssistantIntentPrecheck,
  classifyAssistantIntent,
  isNearbyIntent,
  shouldEnableTools,
  shouldInjectCurrentLocation,
  shouldInjectPageContext,
  shouldInjectViewerProfile,
  shouldRunAssistantRetrieval,
  type AssistantIntentReference,
} from '../../../../lib/assistant/intent';
import { readQqAccountContext } from '../../../../lib/assistant/qq-account-context';
import {
  allowedScopesFor,
  buildAssistantScopePrecheck,
  buildAssistantScopePrompt,
  normalizeAssistantCapabilities,
} from '../../../../lib/assistant/scope';
import { buildViewerPrompt, resolveViewerProfile } from '../../../../lib/assistant/viewer-role';
import { getAssistantProvider } from '../../../../lib/assistant/providers';
import {
  buildAssistantRetrieval,
  createEmptyAssistantRetrieval,
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
/** 模型在回答末尾输出追问建议的标记；这里剥离后单独下发给前端。 */
const followUpMarker = '[[followups]]';

/** 正常流式回答与意图预检直出共用同一组 SSE 响应头。 */
const assistantSseHeaders = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
  'X-Robots-Tag': 'noindex',
};

interface ChatRequestBody {
  providerId?: unknown;
  model?: unknown;
  locale?: unknown;
  messages?: unknown;
  page?: unknown;
  /** 聊天渠道；网页端不传，QQ 机器人传 qq-group / qq-c2c 以获得更短的回复。 */
  channel?: unknown;
  /** 按群范围；网页端不传，表示所有范围都开启。 */
  capabilities?: unknown;
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
  const channel = normalizeChannel(body.channel);
  // 按群范围只来自 QQ 机器人；网页端不传，等于所有范围开启。
  const capabilities = normalizeAssistantCapabilities(body.capabilities);
  const allowedScopes = capabilities ? allowedScopesFor(capabilities) : undefined;
  const isGroupChannel = channel === 'qq-group';
  // 群聊请求当前不携带账号上下文；这里不读取网页登录态，也不解析账号位置。
  const accountContext = isGroupChannel ? undefined : readQqAccountContext(request);
  const [currentLocation, viewer] = isGroupChannel
    ? [undefined, { role: 'guest' as const }]
    : await Promise.all([
        resolveCurrentPlayerLocation(request, accountContext),
        resolveViewerProfile(request, accountContext),
      ]);
  const hasVerifiedAccount = viewer.role !== 'guest';
  const hasAccountContext = Boolean(accountContext) || hasVerifiedAccount;
  // 第 0 轮意图分类：只读当前问题，不读历史、不读账号对象，也不用于授权。
  const intent = classifyAssistantIntent({
    query: latestUserMessage.content,
    channel,
    hasAccountContext,
    page,
    highlights: page?.highlights,
  });
  const precheck = buildAssistantIntentPrecheck({
    result: intent,
    channel,
    hasAccountContext,
    hasVerifiedAccount,
    hasLocation: Boolean(currentLocation),
  });
  if (precheck) {
    return buildDirectAssistantReply(precheck.text, precheck.references, precheck.reasonCode);
  }

  // 按群范围：在检索和模型之前拦截，不产生检索和 token 成本。
  const scopePrecheck = buildAssistantScopePrecheck({
    result: intent,
    capabilities,
    hasHistory: messages.filter((message) => message.role === 'user').length > 1,
  });
  if (scopePrecheck) {
    return buildDirectAssistantReply(scopePrecheck.text, [], scopePrecheck.reasonCode);
  }

  // 页面标题只用于提示词，不参与检索，避免“这个页面怎么用”召回同名的无关地点。
  const retrievalQuery = messages
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map((message) => message.content)
    .join(' ');
  const includeCurrentLocation = shouldInjectCurrentLocation(intent, channel);
  const includePageContext = shouldInjectPageContext(intent);
  // 寒暄、服务器状态和身份问题不检索；彩蛋问法例外，保留原有的彩蛋资料。
  const runRetrieval =
    shouldRunAssistantRetrieval(intent) || isEasterEggQuery(latestUserMessage.content);
  const retrieval = runRetrieval
    ? await buildAssistantRetrieval(retrievalQuery, locale, {
        pathname: includePageContext ? page?.pathname : undefined,
        highlights: includePageContext ? page?.highlights : undefined,
        currentLocation: includeCurrentLocation ? currentLocation : undefined,
        currentLocationIntent: includeCurrentLocation,
        nearbyIntent: isNearbyIntent(intent),
      })
    : createEmptyAssistantRetrieval();
  const baseSystemPrompt = buildAssistantSystemPrompt(locale);
  // 渠道提示放在工具规则之后，用来覆盖网页专属的 Markdown、引用编号和卡片格式。
  const channelPrompt = channel ? buildAssistantChannelPrompt(channel) : '';
  const scopePrompt = buildAssistantScopePrompt(capabilities);
  const plainSystemPrompt = [baseSystemPrompt, channelPrompt, scopePrompt]
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
    channelPrompt,
    scopePrompt,
  ]
    .join('\n')
    .trimEnd();
  // 时间、身份、页面与检索资料都属于会变化的内容，只拼进最后一条用户消息，
  // 系统提示与历史记录保持不变，模型的前缀缓存才能持续命中。
  const viewerPrompt = shouldInjectViewerProfile(intent) ? buildViewerPrompt(viewer) : '';
  const currentLocationPrompt = includeCurrentLocation
    ? buildCurrentLocationPrompt(currentLocation)
    : '';
  const contextBlock = buildAssistantContextBlock({
    retrieval,
    page: includePageContext ? page : undefined,
    viewerPrompt: [viewerPrompt, currentLocationPrompt].filter(Boolean).join('\n'),
  });
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
        routing: {
          intent: intent.intent,
          confidence: intent.confidence,
          reasonCode: intent.reasonCode,
        },
      });

      const providerMessages: AssistantProviderMessage[] = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      // 检索资料等易变上下文只拼在最后一条用户消息开头，历史消息保持原样。
      for (let index = providerMessages.length - 1; index >= 0; index -= 1) {
        const message = providerMessages[index];
        if (message?.role !== 'user') {
          continue;
        }
        providerMessages[index] = {
          role: 'user',
          content: `${contextBlock}\n\n---\n\n用户问题：${message.content ?? ''}`,
        };
        break;
      }
      const toolDefinitions = buildOpenAiToolDefinitions(intent.toolHints, allowedScopes);
      let toolsEnabled = shouldEnableTools(intent);
      let round = 0;
      let finalFollowUps: string[] = [];

      try {
        while (true) {
          let roundText = '';
          let visibleText = '';
          let toolCalls: AssistantToolCall[] = [];
          const useTools = toolsEnabled && round < maximumToolRounds;
          const textFilter = createAssistantTextFilter();
          const followUpSplitter = createFollowUpSplitter();
          let roundFollowUps: string[] = [];
          try {
            for await (const event of streamAssistantReply({
              provider,
              model,
              apiKey,
              messages: providerMessages,
              // 关闭工具时同时去掉工具清单，避免模型继续输出工具调用语法。
              systemPrompt: useTools ? systemPromptWithTools : plainSystemPrompt,
              tools: useTools ? toolDefinitions : undefined,
              signal: abortController.signal,
            })) {
              if (event.type === 'text') {
                roundText += event.text;
                const visible = textFilter.push(followUpSplitter.push(event.text));
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

          const splitTail = followUpSplitter.flush();
          roundFollowUps = splitTail.followUps;
          const tail = `${splitTail.text ? textFilter.push(splitTail.text) : ''}${textFilter.flush()}`;
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
            finalFollowUps = roundFollowUps;
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
              { locale, pathname: page?.pathname, allowedScopes },
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
        if (finalFollowUps.length > 0) {
          send('followups', { items: finalFollowUps });
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
    headers: assistantSseHeaders,
  });
}

/**
 * 意图预检的直出回答：仍然走 SSE，网页和 QQ 机器人不需要区分普通回答与预检。
 * 这些句子是确定性文案，不调用模型，也不会编造账号数据。
 */
function buildDirectAssistantReply(
  text: string,
  references: AssistantIntentReference[],
  reasonCode: string,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send('meta', {
        references: references.map((reference, index) => ({ ...reference, id: index + 1 })),
        sourceStatus: 'ready',
        generatedAt: new Date().toISOString(),
        routing: {
          intent: 'precheck',
          confidence: 'high',
          reasonCode,
        },
      });
      send('delta', { text });
      send('done', { ok: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: assistantSseHeaders,
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

/** 渠道是封闭枚举：只接受 QQ 群聊/单聊，避免被当成任意提示词注入。 */
function normalizeChannel(value: unknown): AssistantChannel | undefined {
  return value === 'qq-group' || value === 'qq-c2c' ? value : undefined;
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

interface AssistantFollowUpSplitter {
  push(chunk: string): string;
  flush(): { text: string; followUps: string[] };
}

/**
 * 把回答末尾的追问建议行从正文里剥离：标记之后的内容不再下发，
 * 收尾时再解析成追问列表。标记可能被拆到两个 chunk 中，因此保留较短尾部等待下一块。
 */
function createFollowUpSplitter(): AssistantFollowUpSplitter {
  let carry = '';
  let buffer = '';
  let active = false;

  return {
    push(chunk) {
      if (active) {
        buffer += chunk;
        return '';
      }

      carry += chunk;
      const index = carry.indexOf(followUpMarker);
      if (index >= 0) {
        const visible = carry.slice(0, index);
        buffer = carry.slice(index + followUpMarker.length);
        carry = '';
        active = true;
        return visible;
      }

      const hold = Math.min(followUpMarker.length - 1, carry.length);
      if (hold === 0) {
        return carry;
      }
      const visible = carry.slice(0, carry.length - hold);
      carry = carry.slice(carry.length - hold);
      return visible;
    },
    flush() {
      const visible = active ? '' : carry;
      carry = '';
      const followUps = active ? parseFollowUps(buffer) : [];
      buffer = '';
      active = false;
      return { text: visible, followUps };
    },
  };
}

/** 解析追问 JSON 数组；模型输出不合规时安静忽略，不影响正文回答。 */
function parseFollowUps(raw: string): string[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    const items: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') {
        continue;
      }
      const text = item.replace(/\s+/g, ' ').trim().slice(0, 30);
      if (text.length < 2 || seen.has(text)) {
        continue;
      }
      seen.add(text);
      items.push(text);
      if (items.length >= 3) {
        break;
      }
    }
    return items;
  } catch {
    return [];
  }
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
