import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { askAssistant, createSseParser } from '../src/assistant-client.mjs';

test('SSE 解析器能处理分块、多行 data 和空行分隔', () => {
  const events = [];
  const parser = createSseParser((event, data) => events.push({ event, data }));
  parser.push('event: meta\ndata: {"references":');
  parser.push('[{"id":1}]}\n\nevent: delta\ndata: {"text":"你');
  parser.push('好"}\n\n');
  parser.push('data: 最后一段');
  parser.flush();

  assert.equal(events.length, 3);
  assert.equal(events[0].event, 'meta');
  assert.deepEqual(events[0].data, { references: [{ id: 1 }] });
  assert.deepEqual(events[1].data, { text: '你好' });
  assert.equal(events[2].event, 'message');
  assert.equal(events[2].data, '最后一段');
});

test('askAssistant 消费完整 SSE 流并返回最终文本', async () => {
  let captured = null;
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      captured = { headers: request.headers, body: JSON.parse(body) };
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      response.write('event: meta\ndata: {"references":[{"id":1,"title":"中华路站"}]}\n\n');
      response.write('event: delta\ndata: {"text":"15 路"}\n\n');
      response.write('event: delta\ndata: {"text":" 经过中华路。"}\n\n');
      response.write('event: followups\ndata: {"items":["末班几点"]}\n\n');
      response.write('event: done\ndata: {"ok":true}\n\n');
      response.end();
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    const result = await askAssistant({
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: 'sk-test',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      locale: 'zh-CN',
      channel: 'qq-group',
      messages: [{ role: 'user', content: '中华路有哪些公交站' }],
    });

    assert.equal(result.error, '');
    assert.equal(result.text, '15 路 经过中华路。');
    assert.deepEqual(result.references, [{ id: 1, title: '中华路站' }]);
    assert.deepEqual(result.followups, ['末班几点']);
    assert.equal(captured.headers['x-yct-provider-key'], 'sk-test');
    assert.equal(captured.body.channel, 'qq-group');
    assert.deepEqual(captured.body.messages, [{ role: 'user', content: '中华路有哪些公交站' }]);
  } finally {
    server.close();
  }
});

test('接口返回错误时抛出可直接展示的 AssistantError', async () => {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ error: { code: 'missing_key', message: '请先配置你的模型 API Key。' } }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  try {
    await assert.rejects(
      askAssistant({
        baseUrl: `http://127.0.0.1:${port}`,
        apiKey: '',
        providerId: 'deepseek',
        model: 'deepseek-v4-flash',
        locale: 'zh-CN',
        messages: [{ role: 'user', content: '你好' }],
      }),
      (error) => {
        assert.equal(error.name, 'AssistantError');
        assert.equal(error.status, 401);
        assert.equal(error.message, '请先配置你的模型 API Key。');
        return true;
      },
    );
  } finally {
    server.close();
  }
});
