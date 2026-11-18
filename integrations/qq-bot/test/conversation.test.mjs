import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCommand,
  ConversationStore,
  RecentSet,
  SlidingWindowLimiter,
} from '../src/conversation.mjs';

test('对话记录保留最近几轮并在重置后清空', () => {
  const store = new ConversationStore({ maxMessages: 4, maxChars: 100 });
  store.append('k', 'user', '第一问');
  store.append('k', 'assistant', '第一答');
  store.append('k', 'user', '第二问');
  store.append('k', 'assistant', '第二答');
  store.append('k', 'user', '第三问');

  assert.deepEqual(
    store.get('k').map((message) => message.content),
    ['第一答', '第二问', '第二答', '第三问'],
  );
  store.reset('k');
  assert.deepEqual(store.get('k'), []);
});

test('只识别完全匹配的短指令', () => {
  assert.equal(classifyCommand('帮助'), null);
  assert.equal(classifyCommand('/new'), 'reset');
  assert.equal(classifyCommand(' 新对话 '), 'reset');
  assert.equal(classifyCommand('帮助我查一下中华路'), null);
});

test('滑动窗口限流返回需要等待的秒数', () => {
  let now = 1_000;
  const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 60_000, now: () => now });
  assert.equal(limiter.take('u').allowed, true);
  assert.equal(limiter.take('u').allowed, true);
  const blocked = limiter.take('u');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 60);

  now += 61_000;
  assert.equal(limiter.take('u').allowed, true);
});

test('重复事件在有效期内只放行一次', () => {
  let now = 1_000;
  const recent = new RecentSet({ ttlMs: 1_000, now: () => now });
  assert.equal(recent.add('msg-1'), true);
  assert.equal(recent.add('msg-1'), false);
  now += 1_500;
  assert.equal(recent.add('msg-1'), true);
});
