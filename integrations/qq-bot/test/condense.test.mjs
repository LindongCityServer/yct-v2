import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCondensePrompt, condenseWithModel } from '../src/condense.mjs';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('精炼请求走服务商兼容接口并带上目标字数', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    return jsonResponse({ choices: [{ message: { content: '短回答。' } }] });
  };

  const result = await condenseWithModel({
    providerId: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-test',
    text: '很长的回答。',
    targetChars: 120,
    fetchImpl,
  });

  assert.equal(result, '短回答。');
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(captured.body.model, 'deepseek-v4-flash');
  assert.ok(captured.body.max_tokens >= 160);
  assert.match(captured.body.messages[0].content, /120 字/);
});

test('MiMo 使用 max_completion_tokens 字段', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = JSON.parse(init.body);
    return jsonResponse({ choices: [{ message: { content: '短回答。' } }] });
  };

  await condenseWithModel({
    providerId: 'mimo',
    model: 'mimo-v2.6-pro',
    apiKey: 'sk-test',
    text: '很长的回答。',
    fetchImpl,
  });

  assert.ok(captured.max_completion_tokens >= 160);
  assert.equal(captured.max_tokens, undefined);
});

test('服务商返回错误时抛出可记录的异常', async () => {
  const fetchImpl = async () => jsonResponse({ error: { message: 'invalid api key' } }, 401);

  await assert.rejects(
    condenseWithModel({
      providerId: 'glm',
      model: 'glm-4-flash',
      apiKey: 'bad-key',
      text: '很长的回答。',
      fetchImpl,
    }),
    /精炼回答失败：HTTP 401/,
  );
});

test('精炼提示词明确禁止空话、新增事实和链接', () => {
  const prompt = buildCondensePrompt(120, '临东站附近有什么美食');
  assert.match(prompt, /不要新增回答里没有的事实/);
  assert.match(prompt, /网址/);
  assert.match(prompt, /2-3 句/);
  assert.match(prompt, /可在页面查看/);
  assert.match(prompt, /用户的问题是：临东站附近有什么美食/);
});
