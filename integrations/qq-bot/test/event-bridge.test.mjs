import assert from 'node:assert/strict';
import test from 'node:test';
import { startEventBridge } from '../src/event-bridge.mjs';

test('事件桥接收 OneBot 与服务器事件', async () => {
  const onebot = [];
  const server = [];
  const bridge = await startEventBridge({
    port: 0,
    token: 'test-token',
    onOneBotEvent: (event) => onebot.push(event),
    onServerEvent: (event) => server.push(event),
  });
  try {
    const base = `http://127.0.0.1:${bridge.port}`;
    const unauthorized = await fetch(`${base}/onebot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_type: 'message' }),
    });
    assert.equal(unauthorized.status, 401);

    const onebotResponse = await fetch(`${base}/onebot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ post_type: 'notice', notice_type: 'group_increase' }),
    });
    assert.equal(onebotResponse.status, 202);

    const serverResponse = await fetch(`${base}/server`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-yct-token': 'test-token' },
      body: JSON.stringify({ type: 'chat', player: '小明', message: '你好' }),
    });
    assert.equal(serverResponse.status, 202);
    assert.equal(onebot.length, 1);
    assert.equal(server.length, 1);
  } finally {
    await bridge.close();
  }
});
