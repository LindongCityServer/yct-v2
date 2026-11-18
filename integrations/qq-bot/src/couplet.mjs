import { completeWithModel } from './model-api.mjs';

const systemPrompt = [
  '你是对联和无情对高手。根据用户给出的上联对出下联。',
  '优先按无情对处理：字数相等，逐字或逐词尽量工整；语义越不相干越好，可以借音、借义、借字。',
  '如果上联明显是普通对联，也可以兼顾词性、平仄和意境，但不要强行解释语义关联。',
  '只输出一行，不要解释，也不要横批：',
  '下联：……',
].join('\n');

export async function makeCouplet({
  providerId,
  model,
  apiKey,
  upper,
  timeoutMs = 20_000,
  fetchImpl = fetch,
}) {
  const text = String(upper ?? '').trim();
  if (!text) {
    throw new Error('请在 /对联 后面写上联，例如 /对联 春风拂柳。');
  }
  if (text.length > 60) {
    throw new Error('上联太长，最多 60 个字。');
  }

  const content = await completeWithModel({
    providerId,
    model,
    apiKey,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `上联：${text}` },
    ],
    maxTokens: 200,
    purpose: '对对联',
    timeoutMs,
    fetchImpl,
  });
  if (!content) {
    throw new Error('模型没有给出下联，请稍后再试。');
  }
  const lower = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^下联[:：]/u.test(line));
  return lower || content;
}
