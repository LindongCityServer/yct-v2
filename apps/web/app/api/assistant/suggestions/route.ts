import type { LocaleCode } from '@yct/contracts';
import {
  getMaterialWorkspaceGuide,
  resolveMaterialWorkspace,
} from '../../../../lib/assistant/material-workspaces';
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
  variation?: unknown;
  previous?: unknown;
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

  const variation = normalizeVariation(body.variation);
  const prompt = followUpMode
    ? buildFollowUpPrompt(
        page,
        body.query,
        body.answer,
        variation,
        normalizePrevious(body.previous),
      )
    : buildPagePrompt(page, await readCandidates(page, locale), variation);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    let suggestions: string[] = [];
    // 推理模型偶尔会把 token 花在思考过程上导致正文为空；空结果时用更严格的提示重试一次。
    for (let attempt = 0; attempt < 2 && suggestions.length === 0; attempt += 1) {
      const content = await requestSuggestionContent({
        provider,
        model,
        apiKey,
        prompt: attempt === 0 ? prompt : `${prompt}\n\n注意：只输出 JSON 字符串数组。`,
        signal: controller.signal,
      });
      suggestions = parseSuggestions(
        content,
        followUpMode ? (item) => !echoFollowUpPattern.test(item) : undefined,
      );
    }

    return jsonResponse(200, { suggestions });
  } catch (error) {
    const message =
      error instanceof SuggestionProviderError
        ? error.message
        : error instanceof DOMException && error.name === 'AbortError'
          ? '模型响应超时，请稍后重试。'
          : '无法连接模型服务，请检查网络或 Base URL。';
    return jsonResponse(502, {
      error: {
        code: 'provider_unavailable',
        message,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

class SuggestionProviderError extends Error {}

async function requestSuggestionContent(input: {
  provider: ReturnType<typeof getAssistantProvider> & object;
  model: string;
  apiKey: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (input.provider.id === 'mimo') {
    headers['api-key'] = input.apiKey;
  }

  const response = await fetch(`${input.provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      stream: false,
      temperature: 0.8,
      // 推理模型会先消耗一部分 token 再输出正文，预算太小会拿到空 content。
      [input.provider.maxTokensField]: 900,
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new SuggestionProviderError(describeProviderFailure(response.status));
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  return payload.choices?.[0]?.message?.content;
}

function describeProviderFailure(status: number): string {
  if (status === 400) {
    return '模型拒绝了这次请求，请检查模型名是否可用。';
  }
  if (status === 401 || status === 403) {
    return '模型 Key 无效或没有访问权限。';
  }
  if (status === 404) {
    return '模型接口地址不可用。';
  }
  if (status === 429) {
    return '模型请求过于频繁，请稍后再试。';
  }
  if (status >= 500) {
    return '模型服务暂时不可用。';
  }
  return `模型服务返回 ${status}。`;
}

function buildPagePrompt(page: PageSnapshot, candidates: string[], variation: number): string {
  return [
    '你在为雨城通（Yuchengtong）生成搜索框下方的推荐项。',
    '直接给出最终结果，不要展示推理过程。',
    '只输出一个 JSON 字符串数组，不要输出解释、代码块或多余文字。',
    `生成 ${maximumSuggestions} 条用户可能直接输入的中文短句，每条 5-18 个字。`,
    '要求：',
    '1. 必须和当前页面能做的事直接相关，优先使用候选条目里的真实名称。',
    '2. 不要把页面标题原样当成推荐项。',
    '3. 不要编造候选条目之外的线路、站点、班次或公告。',
    '4. 尽量覆盖不同角度：具体操作、概念解释、常见问题、下一步建议，不要四条都在问同一类事情。',
    '5. 用户已经在看的内容不要推荐“打开/查看/定位它”，那是重复操作；可以在它基础上继续追问或做下一步。',
    '6. 只推荐站内资料能回答的问题：地图图例与界面说明、地点、线路与站点、班次时刻、运营公告、FAQ、Wiki、物料模板；不要推荐站外知识或需要实时计算的问题。',
    variation > 0 ? `7. 这是第 ${variation + 1} 次生成，请换一个角度，避免和常见推荐重复。` : '',
    '',
    `当前页面：${page.title || '未知'}（${page.pathname || '未知路径'}）`,
    page.highlights.length > 0
      ? `用户正在查看：${page.highlights.join('；')}`
      : '用户没有选中具体内容。',
    '',
    '候选条目：',
    candidates.length > 0 ? candidates.join('\n') : '（暂无）',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeVariation(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.min(Math.floor(numeric), 20);
}

function normalizePrevious(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 6);
}

function buildFollowUpPrompt(
  page: PageSnapshot,
  query: unknown,
  answer: unknown,
  variation: number,
  previous: string[],
): string {
  const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 300) : '';
  const cleanAnswer = typeof answer === 'string' ? answer.trim().slice(0, 1600) : '';

  return [
    '你在为雨城通（Yuchengtong）的问一问生成回答下方的追问推荐。',
    '直接给出最终结果，不要展示推理过程。',
    '只输出一个 JSON 字符串数组，不要输出解释、代码块或多余文字。',
    '生成 3 条用户看完这段回答后可能继续操作的短句，每条 8-20 个字。',
    '要求：',
    '1. 可以是问句，也可以直接是祈使句（例如“帮我规划一条少走路的路线”“把目的地换成铁西分馆”“列出这条线沿途的餐饮”），不要三条都是问句。',
    '2. 必须围绕原问题、回答内容和当前页面，不要发散到无关话题。',
    '3. 不要重复原问题，也不要只换个说法。',
    '4. 不要追问回答里已经解释过的内容；回答已经说明“为什么没有/为什么查不到”时，不要再问同类问题。',
    '5. 不要建议打开、查看用户已经在看的内容，也不要问“怎么打开这个页面”。',
    '6. 不要编造回答里没有出现的线路、站点、班次、时间或链接。',
    '7. 三条尽量落在不同角度：下一步操作、替代方案、注意事项或筛选条件。',
    '',
    variation > 0 ? `这是第 ${variation + 1} 次生成，请换一批，不要和上一批重复。` : '',
    previous.length > 0 ? `上一批推荐：${previous.join('、')}` : '',
    `当前页面：${page.title || '未知'}（${page.pathname || '未知路径'}）`,
    resolveMaterialWorkspace(page.pathname)
      ? '当前在物料工作台，追问应围绕模板、数据来源、编辑、预览、审核和导出，不要转到服务器地点或线路。'
      : '',
    page.highlights.length > 0 ? `用户正在查看：${page.highlights.join('；')}` : '',
    `原问题：${cleanQuery || '（未知）'}`,
    '回答：',
    cleanAnswer || '（空）',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 过滤“骑驴找驴”和解释型追问：问回答里已经说过的事，或问系统为什么没有数据。 */
const echoFollowUpPattern =
  /为什么(没有|查不到|不显示|看不到|无法|不能|找不到)|怎么(打开|查看).*(页面|地图|标记)|如何(打开|查看).*(页面|地图|标记)/u;

async function readCandidates(page: PageSnapshot, locale: LocaleCode): Promise<string[]> {
  const candidates: string[] = [];
  const isMap = /(^|\/)map(\/|$)/.test(page.pathname);
  const isTravel = /(^|\/)travel(\/|$)/.test(page.pathname);
  const workspaceId = resolveMaterialWorkspace(page.pathname);

  // 物料工作台只给工作台内部的操作和数据来源，避免把模型引到服务器线路上。
  if (workspaceId) {
    const guide = getMaterialWorkspaceGuide(workspaceId);
    candidates.push(`工作台：${guide.title}`, `说明：${guide.summary}`);
    for (const entry of guide.entries) {
      candidates.push(
        `操作：${entry.title}`,
        ...entry.questions.map((question) => `可问：${question}`),
      );
    }
    if (page.highlights.length > 0) {
      candidates.unshift(`正在查看：${page.highlights.join('；')}`);
    }
    return candidates.slice(0, 60);
  }

  const [operations, services, markers] = await Promise.allSettled([
    readOperationsFeed(),
    readServiceEntryGroups(),
    readPublicMapMarkerSnapshot(),
  ]);

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

function parseSuggestions(value: unknown, accept?: (item: string) => boolean): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const text = value.trim();
  const rawItems: string[] = [];

  // 1. 标准 JSON 数组（可能被 ```json 代码块包裹）。
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (Array.isArray(parsed)) {
        rawItems.push(...parsed.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      // 继续尝试其他格式。
    }
  }

  // 2. {"suggestions": [...]} 形式的 JSON 对象。
  if (rawItems.length === 0) {
    try {
      const parsed = JSON.parse(text) as { suggestions?: unknown };
      if (Array.isArray(parsed?.suggestions)) {
        rawItems.push(
          ...parsed.suggestions.filter((item): item is string => typeof item === 'string'),
        );
      }
    } catch {
      // 继续尝试逐行解析。
    }
  }

  // 3. 模型没有按 JSON 输出时，退化为逐行读取，去掉序号和项目符号。
  if (rawItems.length === 0) {
    for (const line of text.split(/\r?\n/u)) {
      const cleaned = line
        .replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/u, '')
        .replace(/^["'“”]+|["'“”]+$/gu, '')
        .trim();
      if (cleaned) {
        rawItems.push(cleaned);
      }
    }
  }

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const item of rawItems) {
    for (const part of splitConcatenatedSuggestion(item)) {
      const cleaned = part.replace(/\s+/g, ' ').trim().slice(0, 30);
      if (cleaned.length < 2 || seen.has(cleaned) || (accept && !accept(cleaned))) {
        continue;
      }
      seen.add(cleaned);
      suggestions.push(cleaned);
      if (suggestions.length >= maximumSuggestions) {
        return suggestions;
      }
    }
  }

  return suggestions;
}

/** 模型偶尔把多条建议用中文引号连成一串，这里按「引号 + 逗号 + 引号」拆开。 */
function splitConcatenatedSuggestion(value: string): string[] {
  return value
    .split(/[”"']\s*[，,]\s*[“"']/u)
    .map((part) => part.replace(/^["'“”]+|["'“”]+$/gu, '').trim())
    .filter(Boolean);
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
