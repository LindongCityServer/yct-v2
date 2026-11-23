import assert from 'node:assert/strict';
import test from 'node:test';
import { startEventBridge } from '../src/event-bridge.mjs';
import { normalizeOpsEvent } from '../src/ops-reminder.mjs';

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

test('事件桥 /ops 使用独立 token，并返回发送结果', async () => {
  const events = [];
  const bridge = await startEventBridge({
    port: 0,
    token: 'test-token',
    opsToken: 'ops-token',
    onOpsEvent: (event) => {
      events.push(event);
      return { sent: 2, failed: [], groups: 2 };
    },
  });
  try {
    const base = `http://127.0.0.1:${bridge.port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ops, true);

    const wrongToken = await fetch(`${base}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({ system: 'yct', phase: 'start', updateId: 'u1' }),
    });
    assert.equal(wrongToken.status, 401);

    const accepted = await fetch(`${base}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ops-token' },
      body: JSON.stringify({ system: 'yct', phase: 'start', updateId: 'u1' }),
    });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).sent, 2);
    assert.equal(events.length, 1);
  } finally {
    await bridge.close();
  }
});

test('事件桥没有配置 opsToken 时 /ops 返回 503', async () => {
  const bridge = await startEventBridge({ port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: 'yct', phase: 'start', updateId: 'u1' }),
    });
    assert.equal(response.status, 503);
  } finally {
    await bridge.close();
  }
});

test('事件桥 /ops 参数非法时返回 400', async () => {
  const bridge = await startEventBridge({
    port: 0,
    opsToken: 'ops-token',
    onOpsEvent: (event) => normalizeOpsEvent(event),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ops-token' },
      body: JSON.stringify({ system: 'unknown', phase: 'start', updateId: 'u1' }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'invalid_ops_event');
  } finally {
    await bridge.close();
  }
});
