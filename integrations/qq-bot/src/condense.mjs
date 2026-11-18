import { completeWithModel } from './model-api.mjs';

/**
 * 二次精炼：把问一问的长回答改写成一条 QQ 聊天消息。
 *
 * 这一步直接调用模型服务商的兼容接口，不经过站内检索，也不依赖网页端是否已经发版；
 * 失败时由调用方回退到本地按句精炼，不影响正常回答。
 */

export function buildCondensePrompt(targetChars, question = '') {
  return [
    '你是雨城通「问一问」的编辑。把用户给出的回答改写成一条适合 QQ 群聊的消息。',
    `用户的问题是：${question || '（未提供）'}`,
    `1. 先给结论，普通问题 2-3 句、约 ${targetChars} 字；列举类问题最多 3 条，每条一句话。`,
    '2. 必须保留原回答里的具体名称、线路、时间、距离、价格和推荐方案；不要用“可在页面查看”“可切换方案”“需自行对比”这类空话代替具体信息。',
    '3. 如果问题在问“有哪些/附近有什么”，保留最多 3 个具体地点名称和关键距离，不要只给数量或范围。',
    '4. 如果问题在问怎么走，优先保留公共交通方案（乘坐几路/几号线、在哪里换乘、约多少分钟）；没有公共交通方案时明确说明，再给最推荐方案的具体用时、距离或价格。',
    '5. 删掉网页操作、链接、次要提醒和重复内容；不要新增回答里没有的事实。',
    '6. 纯文本，不要 Markdown、表格、引用编号或网址；只输出改写后的文字，不要解释。',
  ].join('\n');
}

export async function condenseWithModel({
  providerId,
  model,
  apiKey,
  text,
  question = '',
  targetChars = 180,
  timeoutMs = 20_000,
  fetchImpl = fetch,
}) {
  const source = String(text ?? '').trim();
  if (!source) {
    return '';
  }

  return completeWithModel({
    providerId,
    model,
    apiKey,
    messages: [
      { role: 'system', content: buildCondensePrompt(targetChars, question) },
      { role: 'user', content: source },
    ],
    maxTokens: Math.max(240, Math.ceil(targetChars * 2.5)),
    purpose: '精炼回答',
    timeoutMs,
    fetchImpl,
  });
}
