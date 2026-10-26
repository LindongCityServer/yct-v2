import type { LocaleCode } from '@yct/contracts';
import {
  AssistantProviderError,
  buildAssistantSystemPrompt,
  streamAssistantReply,
  type AssistantChatMessage,
  type AssistantPageContext,
} from '../../../../lib/assistant/chat';
import { getAssistantProvider } from '../../../../lib/assistant/providers';
import { buildAssistantRetrieval } from '../../../../lib/assistant/retrieval';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const maximumMessages = 8;
const maximumMessageLength = 2000;
const maximumTotalLength = 8000;
const maximumKeyLength = 512;

interface ChatRequestBody {
  providerId?: unknown;
  model?: unknown;
  locale?: unknown;
  messages?: unknown;
  page?: unknown;
}

export async function POST(request: Request) {
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
  const retrieval = await buildAssistantRetrieval(retrievalQuery, locale, {
    pathname: page?.pathname,
    highlights: page?.highlights,
  });
  const systemPrompt = buildAssistantSystemPrompt(retrieval, locale, page);
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

      send('meta', {
        references: retrieval.references,
        sourceStatus: retrieval.sourceStatus,
        asOf: retrieval.asOf,
        generatedAt: retrieval.generatedAt,
        provider: provider.id,
        model,
      });

      try {
        for await (const delta of streamAssistantReply({
          provider,
          model,
          apiKey,
          messages,
          systemPrompt,
          signal: abortController.signal,
        })) {
          send('delta', { text: delta });
        }
        send('done', { ok: true });
      } catch (error) {
        const message =
          error instanceof AssistantProviderError
            ? error.message
            : '问一问暂时不可用，请稍后再试。';
        send('error', {
          message,
          references: retrieval.references,
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
