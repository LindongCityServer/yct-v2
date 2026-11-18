import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCouplet } from '../src/couplet.mjs';

test('对对联请求带上上联并返回下联', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, body: JSON.parse(init.body) };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '下联：细雨润花\n横批：春意盎然' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const result = await makeCouplet({
    providerId: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey: 'sk-test',
    upper: '春风拂柳',
    fetchImpl,
  });

  assert.equal(result, '下联：细雨润花');
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.match(captured.body.messages[1].content, /上联：春风拂柳/);
  assert.match(captured.body.messages[0].content, /对联/);
  assert.match(captured.body.messages[0].content, /无情对/);
});

test('没有上联时给出用法提示', async () => {
  await assert.rejects(
    makeCouplet({
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'sk-test',
      upper: '',
      fetchImpl: async () => new Response('{}'),
    }),
    /上联/,
  );
});
