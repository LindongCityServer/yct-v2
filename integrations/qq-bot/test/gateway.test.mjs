import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync, deflateSync } from 'node:zlib';
import {
  backoffDelay,
  buildIdentifyPayload,
  buildResumePayload,
  decodeGatewayPayload,
} from '../src/gateway.mjs';

test('Identify 使用 QQBot access_token 格式和固定 shard', () => {
  const payload = buildIdentifyPayload({ token: 'abc', intents: 33554432 });
  assert.equal(payload.op, 2);
  assert.equal(payload.d.token, 'QQBot abc');
  assert.equal(payload.d.intents, 33554432);
  assert.deepEqual(payload.d.shard, [0, 1]);
});

test('Resume 携带 session_id 与 seq', () => {
  const payload = buildResumePayload({ token: 'abc', sessionId: 's-1', seq: 42 });
  assert.deepEqual(payload, {
    op: 6,
    d: { token: 'QQBot abc', session_id: 's-1', seq: 42 },
  });
});

test('网关下行同时支持明文和 zlib 压缩帧', () => {
  const raw = JSON.stringify({ op: 0, s: 7, t: 'READY', d: { session_id: 's' } });
  assert.equal(decodeGatewayPayload(raw), raw);
  assert.equal(decodeGatewayPayload(deflateSync(raw)), raw);
  assert.equal(decodeGatewayPayload(deflateRawSync(raw)), raw);
});

test('重连退避有上限并带抖动', () => {
  assert.equal(
    backoffDelay(0, () => 0),
    1000,
  );
  assert.equal(
    backoffDelay(10, () => 0),
    30_000,
  );
  assert.equal(
    backoffDelay(10, () => 0.999),
    30_499,
  );
});
