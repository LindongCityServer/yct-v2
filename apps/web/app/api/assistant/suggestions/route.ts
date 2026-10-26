import type { LocaleCode } from '@yct/contracts';
import { getAssistantProvider } from '../../../../lib/assistant/providers';
import { readPublicMapMarkerSnapshot } from '../../../../lib/map-marker-public-snapshot-store';
import { readOperationsFeed } from '../../../../lib/operations-content';
import { readServiceEntryGroups } from '../../../../lib/service-entries';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const maximumKeyLength = 512;
const maximumSuggestions = 4;

interface SuggestionRequestBody {
  providerId?: unknown;
  model?: unknown;
  locale?: unknown;
  page?: unknown;
  mode?: unknown;
  query?: unknown;
  answer?: unknown;
}

interface PageSnapshot {
  pathname: string;
  title: string;
  highlights: string[];
}

export async function POST(request: Request) {
  const apiKey = request.headers.get('x-yct-provider-key')?.trim() ?? '';
  if (!apiKey || apiKey.length > maximumKeyLength) {
    return jsonResponse(401, {
      error: { code: 'missing_key', message: '请先配置你的模型 API Key。' },
    });
  }

  let body: SuggestionRequestBody;
  try {
    body = (await request.json()) as SuggestionRequestBody;
  } catch {
    return jsonResponse(400, { error: { code: 'invalid_request', message: '请求格式不正确。' } });
  }

  const provider = getAssistantProvider(typeof body.providerId === 'string' ? body.providerId : '');
  if (!provider) {
    return jsonResponse(400, {
      error: { code: 'invalid_provider', message: '不支持的模型提供商。' },
    });
  }

  const model = normalizeModel(body.model) ?? provider.defaultModel;
  const locale = normalizeLocale(body.locale);
  const page = normalizePage(body.page);
  const followUpMode = body.mode === 'followup';

  const prompt = followUpMode
    ? buildFollowUpPrompt(page, body.query, body.answer)
    : buildPagePrompt(page, await readCandidates(page, locale));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (provider.id === 'mimo') {
      headers['api-key'] = apiKey;
    }

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.7,
        [provider.maxTokensField]: 240,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return jsonResponse(502, {
        error: { code: 'provider_unavailable', message: '推荐项暂时不可用。' },
      });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    return jsonResponse(200, { suggestions: parseSuggestions(content) });
  } catch {
    return jsonResponse(502, {
      error: { code: 'provider_unavailable', message: '推荐项暂时不可用。' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildPagePrompt(page: PageSnapshot, candidates: string[]): string {
  return [
    '你在为雨城通（Yuchengtong）生成搜索框下方的推荐项。',
    '只输出一个 JSON 字符串数组，不要输出解释、代码块或多余文字。',
    `生成 ${maximumSuggestions} 条用户可能直接输入的中文短句，每条 5-18 个字。`,
    '要求：',
    '1. 必须和当前页面能做的事直接相关，优先使用候选条目里的真实名称。',
    '2. 不要把页面标题原样当成推荐项。',
    '3. 不要编造候选条目之外的线路、站点、班次或公告。',
    '',
    `当前页面：${page.title || '未知'}（${page.pathname || '未知路径'}）`,
    page.highlights.length > 0
      ? `用户正在查看：${page.highlights.join('；')}`
      : '用户没有选中具体内容。',
    '',
    '候选条目：',
    candidates.length > 0 ? candidates.join('\n') : '（暂无）',
  ].join('\n');
}

function buildFollowUpPrompt(page: PageSnapshot, query: unknown, answer: unknown): string {
  const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 300) : '';
  const cleanAnswer = typeof answer === 'string' ? answer.trim().slice(0, 1600) : '';

  return [
    '你在为雨城通（Yuchengtong）的问一问生成回答下方的追问推荐。',
    '只输出一个 JSON 字符串数组，不要输出解释、代码块或多余文字。',
    '生成 3 条用户看完这段回答后可能继续追问的短问题，每条 8-20 个字。',
    '要求：',
    '1. 必须围绕原问题、回答内容和当前页面，不要发散到无关话题。',
    '2. 不要重复原问题，也不要只换个说法。',
    '3. 不要编造回答里没有出现的线路、站点、班次、时间或链接。',
    '',
    `当前页面：${page.title || '未知'}（${page.pathname || '未知路径'}）`,
    page.highlights.length > 0 ? `用户正在查看：${page.highlights.join('；')}` : '',
    `原问题：${cleanQuery || '（未知）'}`,
    '回答：',
    cleanAnswer || '（空）',
  ]
    .filter(Boolean)
    .join('\n');
}

async function readCandidates(page: PageSnapshot, locale: LocaleCode): Promise<string[]> {
  const [operations, services, markers] = await Promise.allSettled([
    readOperationsFeed(),
    readServiceEntryGroups(),
    readPublicMapMarkerSnapshot(),
  ]);

  const candidates: string[] = [];
  const isMap = /(^|\/)map(\/|$)/.test(page.pathname);
  const isTravel = /(^|\/)travel(\/|$)/.test(page.pathname);

  if (markers.status === 'fulfilled' && markers.value) {
    const limit = isMap ? 24 : 10;
    for (const marker of markers.value.snapshot.markers) {
      if (candidates.length >= limit || marker.categoryId === 'player') {
        break;
      }
      candidates.push(
        `${locale === 'zh-CN' ? marker.label : (marker.localizedLabels?.[locale] ?? marker.label)} · ${marker.categoryId}`,
      );
    }
  }

  if (operations.status === 'fulfilled') {
    const limit = isTravel ? 8 : 14;
    for (const item of operations.value.items.slice(0, limit)) {
      candidates.push(`运营：${item.title}`);
    }
  }

  if (services.status === 'fulfilled') {
    const entries = services.value.items.flatMap((group) => group.items);
    const limit = isTravel ? 16 : 10;
    for (const entry of entries.slice(0, limit)) {
      candidates.push(`服务：${entry.title}`);
    }
  }

  if (page.highlights.length > 0) {
    candidates.unshift(`正在查看：${page.highlights.join('；')}`);
  }

  return candidates.slice(0, 60);
}

function parseSuggestions(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const start = value.indexOf('[');
  const end = value.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return [];
  }

  try {
    const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') {
        continue;
      }
      const text = item.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!text || seen.has(text)) {
        continue;
      }
      seen.add(text);
      suggestions.push(text);
      if (suggestions.length >= maximumSuggestions) {
        break;
      }
    }
    return suggestions;
  } catch {
    return [];
  }
}

function normalizePage(value: unknown): PageSnapshot {
  if (!value || typeof value !== 'object') {
    return { pathname: '', title: '', highlights: [] };
  }

  const candidate = value as { pathname?: unknown; title?: unknown; highlights?: unknown };
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights
        .map((item) =>
          item && typeof item === 'object' ? (item as { title?: unknown }).title : '',
        )
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => item.trim().slice(0, 120))
        .slice(0, 4)
    : [];

  return {
    pathname: sanitize(candidate.pathname, 200),
    title: sanitize(candidate.title, 200),
    highlights,
  };
}

function sanitize(value: unknown, maximumLength: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maximumLength)
    : '';
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

function jsonResponse(status: number, payload: unknown) {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
