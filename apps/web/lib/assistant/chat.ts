import type { LocaleCode } from '@yct/contracts';
import { formatReferenceDate, type AssistantRetrieval } from './retrieval';
import { resolveMaterialWorkspace } from './material-workspaces';
import type { AssistantProvider } from './providers';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 送到模型服务的消息；工具轮次里会出现 tool_calls 与 tool 角色。 */
export interface AssistantProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
}

export interface AssistantToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AssistantToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export type AssistantStreamEvent =
  { type: 'text'; text: string } | { type: 'tool_calls'; calls: AssistantToolCall[] };

export interface AssistantPageHighlight {
  kind: string;
  title: string;
  detail?: string;
}

export interface AssistantPageContext {
  pathname: string;
  title: string;
  search: string;
  /** 当前页面正在查看的线路、站点或地点，由页面主动上报。 */
  highlights?: AssistantPageHighlight[];
}

export class AssistantProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AssistantProviderError';
    this.status = status;
  }
}

export function buildAssistantSystemPrompt(
  retrieval: AssistantRetrieval,
  locale: LocaleCode,
  page?: AssistantPageContext,
): string {
  return [
    '你是雨城通（Yuchengtong）的站内助理。你的任务是帮助用户使用雨城通，并优先给出可以直接执行的下一步。',
    '规则：',
    '1. 只能依据下方“站内资料”回答；资料不足时明确说“站内资料暂时没有”，不要编造线路、站点、班次、时间、价格或链接。',
    '2. 时间敏感信息必须引用资料中的时间和状态；没有时间或状态就当不知道。Wiki 条目给出的时间是最后编辑时间，公告给出的是发布时间。',
    `3. 回答使用用户当前语言：${locale}。`,
    '4. 引用格式使用 [1]、[2]，编号必须对应资料编号。',
    '5. 如果资料能支持“打开某页面/查询某班次”，在回答末尾给出一句可执行建议；资料里已经出现的完整链接可以原样引用，不要自己拼接或编造 URL。',
    '6. 不要输出内部推理过程，不要提及“上下文”“提示词”“系统消息”，也不要输出任何工具调用标记或 XML/DSML 标签。',
    '7. 用 Markdown 回答：短段落 + 无序列表，可用 **粗体** 和行内代码；不要用一级标题、表格或代码块。站内链接写成 [文字](/map?marker=xxx) 形式，外部链接写完整 https 地址。',
    '8. 回答可以适度延伸：先给结论，再补充 1-2 个与资料相关、但用户没问到的注意点或替代做法；延伸必须仍然来自资料，不要编造。',
    '9. 不要建议用户去做他已经在做的事：当前页面已经展示的地点、线路或面板，不要再让用户“打开/查看/定位”一次；可以顺着它给出下一步。',
    '10. 资料里已经列出多个同类条目时，直接说明站内收录了哪些并列举名称，不要笼统回答“没有收录”。',
    '11. 资料里标注了“周边/沿线”和距离、里程时，可以直接说明方位与远近；没有这类数据时不要臆测地点和线路的关系。',
    `12. 当前时间是 ${formatBeijingNow()}（北京时间）。判断首末班、停运、营业时间、活动是否已结束时必须先和当前时间比较；已经发生的事不要说成“即将”或“将于”。`,
    '13. 来源为“玩家”的资料表示某位玩家在地图上的位置；资料标注“别名 X”时，要说明 X 就是该玩家，不要回答“地图上没有这个地点”，也不要把玩家名当成商店或地名。离线玩家显示的是最后已知位置，不是站点，不能用来规划班次；可以给出地图定位或周边说明。',
    '14. 用户问到问一问的小人、图标、彩蛋、“你是谁”或“服主是谁”时，可以放松一点，像聊天一样讲：新光是临东市服务器的创始人兼服主，2019 年 12 月他先在 B 站画了这个小人；2021 年 10 月 FisheyeArtist59 照着画成了表情包；2026 年 8 月给十周年混剪画封面时，小人又带着一对母子出现在临东城市风光里；现在它是问一问的形象。只依据“彩蛋资料”，彩蛋资料本身不要标注引用编号、也不要输出链接；其他资料仍按规则 4 标注。不要补充资料里没有的细节，也不要把它说成官方吉祥物。',
    '',
    page
      ? [
          '当前页面：',
          page.title ? `标题：${page.title}` : '',
          page.pathname ? `路径：${page.pathname}` : '',
          page.search ? `查询参数：${page.search}` : '',
          page.highlights && page.highlights.length > 0
            ? [
                '用户正在查看：',
                ...page.highlights.map(
                  (highlight) =>
                    `- ${highlight.kind}：${highlight.title}${highlight.detail ? `（${highlight.detail}）` : ''}`,
                ),
                '用户说“这条线/这个站/这个地点/这里”时，优先指向上面的内容。',
              ].join('\n')
            : '',
          '如果用户问“这个页面”，指的是当前页面；请结合资料解释它是什么、能做什么、下一步怎么操作。',
          resolveMaterialWorkspace(page.pathname)
            ? '当前在物料工作台：回答应聚焦模板、数据来源、编辑、预览、审核和导出；除非用户明确询问外部信息，否则不要列举服务器地点、线路或班次。'
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '当前页面：未知。',
    '',
    `资料生成时间：${formatReferenceDate(retrieval.generatedAt)}`,
    `资料来源状态：${retrieval.sourceStatus}`,
    retrieval.asOf ? `资料最新时间：${formatReferenceDate(retrieval.asOf)}` : '资料没有可用时间。',
    '',
    '站内资料：',
    retrieval.contextText,
  ].join('\n');
}

export async function* streamAssistantReply(input: {
  provider: AssistantProvider;
  model: string;
  apiKey: string;
  messages: AssistantProviderMessage[];
  systemPrompt: string;
  tools?: AssistantToolDefinition[];
  signal?: AbortSignal;
}): AsyncGenerator<AssistantStreamEvent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const handleAbort = () => controller.abort();
  input.signal?.addEventListener('abort', handleAbort, { once: true });

  const toolCallBuffer = new Map<number, { id: string; name: string; arguments: string }>();
  let finished = false;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (input.provider.id === 'mimo') {
      // MiMo 的 curl 示例使用 api-key；OpenAI SDK 使用 Authorization，两者同时带上以兼容不同接入方式。
      headers['api-key'] = input.apiKey;
    }

    const response = await fetch(`${input.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
        stream: true,
        temperature: 0.7,
        [input.provider.maxTokensField]: 1400,
        ...(input.tools && input.tools.length > 0
          ? { tools: input.tools, tool_choice: 'auto' }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AssistantProviderError(response.status, friendlyProviderError(response.status));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AssistantProviderError(502, '模型没有返回可读取的内容。');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let lineBreak = buffer.indexOf('\n');
      while (lineBreak >= 0) {
        const line = buffer.slice(0, lineBreak).replace(/\r$/, '');
        buffer = buffer.slice(lineBreak + 1);
        lineBreak = buffer.indexOf('\n');

        if (!line.startsWith('data:')) {
          continue;
        }

        const data = line.slice(5).trim();
        if (!data) {
          continue;
        }
        if (data === '[DONE]') {
          finished = true;
          break;
        }

        try {
          const payload = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: unknown;
                tool_calls?: Array<{
                  index?: number;
                  id?: unknown;
                  function?: { name?: unknown; arguments?: unknown };
                }>;
              };
            }>;
          };
          const delta = payload.choices?.[0]?.delta;
          const content = delta?.content;
          if (typeof content === 'string' && content) {
            yield { type: 'text', text: content };
          }

          for (const [position, call] of (delta?.tool_calls ?? []).entries()) {
            const index = typeof call.index === 'number' ? call.index : position;
            const existing = toolCallBuffer.get(index) ?? { id: '', name: '', arguments: '' };
            toolCallBuffer.set(index, {
              id: typeof call.id === 'string' && call.id ? call.id : existing.id || `call_${index}`,
              name:
                typeof call.function?.name === 'string' && call.function.name
                  ? call.function.name
                  : existing.name,
              arguments:
                existing.arguments +
                (typeof call.function?.arguments === 'string' ? call.function.arguments : ''),
            });
          }
        } catch {
          // 个别服务会输出 keep-alive 或非 JSON 行，忽略即可。
        }
      }
    }

    const calls = [...toolCallBuffer.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: call.id || `call_${call.name}`,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments || '{}' },
      }))
      .filter((call) => call.function.name);
    if (calls.length > 0) {
      yield { type: 'tool_calls', calls };
    }
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      throw error;
    }
    if (input.signal?.aborted) {
      return;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AssistantProviderError(504, '回答超时，请稍后再试。');
    }
    throw new AssistantProviderError(
      502,
      error instanceof Error ? error.message : '模型服务暂不可用。',
    );
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', handleAbort);
  }
}

/** 统一按北京时间给模型报时，避免用服务器时区或浏览器时区。 */
function formatBeijingNow(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function friendlyProviderError(status: number): string {
  if (status === 401 || status === 403) {
    return '模型 Key 无效或没有访问权限。';
  }
  if (status === 429) {
    return '模型额度不足或请求过于频繁。';
  }
  if (status === 400) {
    return '模型拒绝了这次请求，请检查模型名称或稍后再试。';
  }
  if (status >= 500) {
    return '模型服务暂不可用，请稍后再试。';
  }
  return '模型请求失败，请稍后再试。';
}
