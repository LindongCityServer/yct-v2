/**
 * 服务商兼容接口的最小封装：只用于机器人本地的短任务（精炼回答、对对联）。
 * 与 apps/web/lib/assistant/providers.ts 保持同一组服务商和字段差异。
 */

const providerEndpoints = {
  deepseek: { baseUrl: 'https://api.deepseek.com', maxTokensField: 'max_tokens' },
  glm: { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', maxTokensField: 'max_tokens' },
  mimo: { baseUrl: 'https://api.xiaomimimo.com/v1', maxTokensField: 'max_completion_tokens' },
};

export async function completeWithModel({
  providerId,
  model,
  apiKey,
  messages,
  maxTokens = 300,
  purpose = '模型',
  timeoutMs = 20_000,
  fetchImpl = fetch,
}) {
  const endpoint = providerEndpoints[providerId];
  if (!endpoint) {
    throw new Error(`不支持的模型服务商：${providerId}`);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error(`${purpose}缺少消息内容。`);
  }

  const body = { model, messages, stream: false };
  body[endpoint.maxTokensField] = Math.max(1, maxTokens);

  let response;
  try {
    response = await fetchImpl(`${endpoint.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`${purpose}请求失败：${error?.message ?? '网络错误'}`);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      `${purpose}失败：HTTP ${response.status}${payload?.error?.message ? `，${payload.error.message}` : ''}`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
