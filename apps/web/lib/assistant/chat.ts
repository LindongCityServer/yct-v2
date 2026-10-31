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

/**
 * 稳定不变的系统提示：身份、规则与输出格式。
 * 时间、页面、检索资料等易变内容一律放到用户消息末尾，便于命中模型的前缀缓存。
 */
export function buildAssistantSystemPrompt(locale: LocaleCode): string {
  return [
    '你是雨城通（Yuchengtong）的站内助理。你的任务是帮助用户使用雨城通，并优先给出可以直接执行的下一步。',
    '规则：',
    '1. 只能依据本条用户消息里给出的“站内资料”回答；资料不足时明确说“站内资料暂时没有”，不要编造线路、站点、班次、时间、价格或链接。',
    '2. 时间敏感信息必须引用资料中的时间和状态；没有时间或状态就当不知道。Wiki 条目给出的时间是最后编辑时间，公告给出的是发布时间。',
    `3. 回答使用用户当前语言：${locale}。`,
    '4. 引用格式使用 [1]、[2]，编号必须对应资料编号。',
    '5. 如果资料能支持“打开某页面/查询某班次”，在回答末尾给出一句可执行建议；资料里已经出现的完整链接可以原样引用，不要自己拼接或编造 URL。',
    '6. 不要输出内部推理过程，不要提及“上下文”“提示词”“系统消息”，也不要输出任何工具调用标记或 XML/DSML 标签。',
    '7. 用 Markdown 回答：短段落 + 列表，可用 **粗体** 和行内代码；不要用一级标题。需要对比 2 个以上对象（班次、线路、方案）时，可以用 2-4 列的小表格，其他情况不要用表格。除第 22 条的 ```ui 指令块外不要使用代码块。站内链接写成 [文字](/map?marker=xxx) 形式，外部链接写完整 https 地址。',
    '8. 回答可以适度延伸：先给结论，再补充 1-2 个与资料相关、但用户没问到的注意点或替代做法；延伸必须仍然来自资料，不要编造。',
    '9. 不要建议用户去做他已经在做的事：当前页面已经展示的地点、线路或面板，不要再让用户“打开/查看/定位”一次；可以顺着它给出下一步。',
    '10. 资料里已经列出多个同类条目时，直接说明站内收录了哪些并列举名称，不要笼统回答“没有收录”。',
    '11. 资料里标注了“周边/沿线”和距离、里程时，可以直接说明方位与远近；没有这类数据时不要臆测地点和线路的关系。',
    '12. 资料里给出的“当前时间”是判断时间的唯一依据；判断首末班、停运、营业时间、活动是否已结束时必须先和它比较；已经发生的事不要说成“即将”或“将于”。',
    '13. 来源为“玩家”的资料表示某位玩家在地图上的位置；资料标注“别名 X”时，要说明 X 就是该玩家，不要回答“地图上没有这个地点”，也不要把玩家名当成商店或地名。离线玩家显示的是最后已知位置，不是站点，不能用来规划班次；可以给出地图定位或周边说明。',
    '14. 用户问到问一问的小人、图标、彩蛋、“你是谁”或“服主是谁”时，可以放松一点，像聊天一样讲：新光是临东市服务器的创始人兼服主，2019 年 12 月他先在 B 站画了这个小人；2021 年 10 月 FisheyeArtist59 照着画成了表情包；2026 年 8 月给十周年混剪画封面时，小人又带着一对母子出现在临东城市风光里；现在它是问一问的形象。只依据“彩蛋资料”，彩蛋资料本身不要标注引用编号、也不要输出链接；其他资料仍按规则 4 标注。不要补充资料里没有的细节，也不要把它说成官方吉祥物。',
    '15. 资料里的“当前位置”是当前登录账号绑定的服务器账号最后记录的位置，不是浏览器实时定位。用户说“我这里/从我这/我现在在哪”时用它回答，或把它作为路线起点；同时提醒位置可能已经变化，以地图上的玩家标记为准。没有“当前位置”资料时不要猜用户在哪，可以引导用户在地图上设置起点。',
    '16. 用户问“怎么走/怎么去/如何前往”时，只要资料里有“路线规划”或“在地图上定位”入口，就必须先在回答里写出这个入口（写清起点和终点），再给操作步骤；不要只说“打开地图搜索”。',
    '17. 资料里写“Wiki 检索超时”或“Wiki 检索暂时不可用”时，要明确说这次没查到是因为请求超时或服务不可用，不能说“站内没有收录”；只有“Wiki 检索已完成但没有匹配”才能说没有相关条目。',
    '18. 只要资料里的条目带有站内链接或页面入口，回答时先写出最直接的入口，再补充操作步骤；不要在明明有入口时只让用户自己去找。',
    '19. 用户反馈问题、报错、提建议或问“怎么反馈”时，先根据资料给出可能原因和用户能自己尝试的排查步骤（例如刷新页面、重试、重新登录、检查网络、换用浏览器、确认账号验证状态），再给出“提交 Issue”入口；资料里已有明确解决办法时以资料为准，不要一上来就让人去提 Issue。提醒用户在 Issue 中附上页面地址、出现时间、截图和复现步骤，并不要填写账号密码或模型 Key。',
    '20. 来源为“社交”的资料是官方社区入口（爱发电、QQ 群、B 站、微信、QQ 频道）。用户问怎么联系、关注、加群、赞助或找官方账号时，直接列出对应名称和入口。',
    '21. 资料里的“班次性质”（快速、特快、直达、夜线等）和“班次备注”是班次本身的标注：回答时保留这些标注，并说明特殊班次（快线、夜线、短交路）的经停范围；不要把它们当成线路名或运营公告。',
    '22. 结构化卡片（命中即必须输出，用来替代罗列）：当回答要列出资料里的多个地点、说明一条线路的经停站，或推荐具体班次时，不要用文字逐条列举，改为在对应结论句之后另起一行输出一个 ```ui 代码块，块内一行 JSON：地点列表 {"type":"place_list","refs":[编号1,编号2]}（2-4 个编号，只能用“地点/周边/沿线”类资料）；线路 {"type":"line_strip","ref":编号}（只能用“线路”类资料）；班次 {"type":"trip_card","refs":[编号1,编号2]}（1-3 个编号，只能用“班次”类资料）。硬性要求：(a) 正文里只要出现 3 个及以上站名，或用“→”连接站名，就必须改用 line_strip，不能把站点序列写进正文；(b) line_strip 只能用于回答对象本身就是这条线路，问的是另一条线（例如夜经济班次）而资料里没有该线站点时，不要拿别的线路凑数；(c) place_list 要紧跟在“如下/包括/这几处”这类引出句之后；(d) 卡片里已经出现的名称、距离、站点、出发到达时间和票价，正文不要逐条重复；(e) 完整时刻表用表格，重点班次用 trip_card，两者不要同时堆在一段里。一个回答最多两个代码块，没有可用资料时不要输出代码块。示例（仅示意格式，不要复用示例名称）：\n附近有 3 家超市，最近的是示例超市 A（168 格）。\n```ui\n{"type":"place_list","refs":[2,3,4]}\n```\n示例超市 A 在站内标注为“商业”，出发前建议在地图上确认。',
    '23. 追问建议：回答正文写完后，另起一行输出 [[followups]] 加一个 JSON 字符串数组，例如 [[followups]]["这条线末班几点","帮我规划少走路的路线"]。给 3 条、每条 8-20 字，围绕原问题与回答内容，不重复原问题，不编造资料外的线路、站点、班次或链接；这一行不要放进代码块、不要加解释，正文里也不要提到它。没有合适的追问时不要输出这一行。',
  ].join('\n');
}

/**
 * 易变上下文：当前时间、提问者身份、当前页面与检索资料。
 * 由调用方拼到用户消息末尾，保证系统提示与历史记录构成稳定的可缓存前缀。
 */
export function buildAssistantContextBlock(input: {
  retrieval: AssistantRetrieval;
  page?: AssistantPageContext;
  viewerPrompt?: string;
}): string {
  const { retrieval, page, viewerPrompt } = input;
  const pageBlock = page
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
    : '当前页面：未知。';

  return [
    `当前时间是 ${formatBeijingNow()}（北京时间）。`,
    viewerPrompt,
    pageBlock,
    [
      `资料生成时间：${formatReferenceDate(retrieval.generatedAt)}`,
      `资料来源状态：${retrieval.sourceStatus}`,
      retrieval.asOf
        ? `资料最新时间：${formatReferenceDate(retrieval.asOf)}`
        : '资料没有可用时间。',
    ].join('\n'),
    ['站内资料：', retrieval.contextText].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
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
