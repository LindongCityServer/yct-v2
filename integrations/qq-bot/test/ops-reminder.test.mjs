import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatOpsReminder,
  normalizeOpsEvent,
  OpsRecipientStore,
  OpsReminder,
  OpsReminderStore,
} from '../src/ops-reminder.mjs';

function createLogger() {
  const lines = [];
  return {
    lines,
    info: (...args) => lines.push(['info', ...args].join(' ')),
    warn: (...args) => lines.push(['warn', ...args].join(' ')),
    debug() {},
    error: (...args) => lines.push(['error', ...args].join(' ')),
  };
}

function createRecipientStore(users = ['user-1', 'user-2']) {
  return {
    list: () => users,
  };
}

function createApi({ failFor = new Set(), code = 40034105 } = {}) {
  const sends = [];
  return {
    sends,
    async sendC2CMessage(userOpenId, payload) {
      if (failFor.has(userOpenId)) {
        const error = new Error('主动消息发送失败，无权限');
        error.code = code;
        throw error;
      }
      sends.push({ userOpenId, payload });
    },
  };
}

test('运维提醒事件校验 system、phase 和 updateId', () => {
  assert.throws(
    () => normalizeOpsEvent({ system: 'unknown', phase: 'start', updateId: 'u1' }),
    /system/,
  );
  assert.throws(
    () => normalizeOpsEvent({ system: 'yct', phase: 'unknown', updateId: 'u1' }),
    /phase/,
  );
  assert.throws(() => normalizeOpsEvent({ system: 'yct', phase: 'start' }), /updateId/);
  const event = normalizeOpsEvent({
    system: 'yct',
    phase: 'start',
    updateId: 'u1',
    expectedMinutes: '10',
    summary: 'x'.repeat(200),
  });
  assert.equal(event.expectedMinutes, 10);
  assert.ok(event.summary.length <= 120);
});

test('开始文案省略缺省的版本和摘要', () => {
  const event = normalizeOpsEvent({
    system: 'yct',
    phase: 'start',
    updateId: 'u1',
    expectedMinutes: 10,
    startedAt: '2026-11-23T12:00:00Z',
  });
  const text = formatOpsReminder(event, { now: new Date('2026-11-23T12:00:00Z') });

  assert.match(text, /【运维提醒·开始】雨城通/);
  assert.match(text, /11-23 20:00 开始，预计 10 分钟/);
  assert.match(text, /影响：网页、登录、地图和机器人问一问可能短暂不可用/);
  assert.doesNotMatch(text, /版本：/);
  assert.doesNotMatch(text, /说明：/);
});

test('完成文案带版本和开始到结束的用时', () => {
  const event = normalizeOpsEvent({
    system: 'yct',
    phase: 'end',
    updateId: 'u1',
    version: '2.26.0',
    buildId: '20261123-203512',
  });
  const text = formatOpsReminder(event, {
    now: new Date('2026-11-23T12:08:00Z'),
    startedAt: '2026-11-23T12:00:00Z',
  });

  assert.match(text, /【运维提醒·完成】雨城通已恢复/);
  assert.match(text, /版本：2\.26\.0（构建 20261123-203512）/);
  assert.match(text, /用时：8 分钟/);
});

test('运维提醒按私聊好友发送，并跳过重复的阶段', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-reminder-'));
  try {
    let now = new Date('2026-11-23T12:00:00Z');
    const store = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    const api = createApi();
    const reminder = new OpsReminder({
      store,
      recipientStore: createRecipientStore(),
      api,
      logger: createLogger(),
      now: () => now,
    });

    const start = {
      system: 'yct',
      phase: 'start',
      updateId: 'u1',
      expectedMinutes: 10,
      summary: '车站资料维护',
    };
    const first = await reminder.handle(start);
    assert.equal(first.sent, 2);
    assert.equal(api.sends.length, 2);
    assert.match(api.sends[0].payload.content, /【运维提醒·开始】雨城通/);

    const duplicate = await reminder.handle(start);
    assert.equal(duplicate.duplicate, true);
    assert.equal(api.sends.length, 2);

    now = new Date('2026-11-23T12:08:00Z');
    const end = await reminder.handle({ system: 'yct', phase: 'end', updateId: 'u1' });
    assert.equal(end.sent, 2);
    assert.match(api.sends[2].payload.content, /用时：8 分钟/);

    const reloaded = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    assert.equal(reloaded.hasNotified('u1', 'start'), true);
    assert.equal(reloaded.hasNotified('u1', 'end'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('私聊发送失败时保留 pending 并提示 40034105', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-reminder-'));
  try {
    const store = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    const api = createApi({ failFor: new Set(['user-1']) });
    const reminder = new OpsReminder({
      store,
      recipientStore: createRecipientStore(['user-1', 'user-2']),
      api,
      logger: createLogger(),
    });

    const result = await reminder.handle({
      system: 'yct',
      phase: 'start',
      updateId: 'u2',
    });

    assert.equal(result.sent, 1);
    assert.equal(result.pending, 1);
    assert.deepEqual(result.failureCodes, [40034105]);
    assert.match(result.hint, /40034105/);
    assert.equal(reminder.listPending('user-1').length, 1);
    assert.equal(reminder.listPending('user-2').length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('没有私聊好友时不发送，也不记成已通知', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-reminder-'));
  try {
    const store = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    const api = createApi();
    const reminder = new OpsReminder({
      store,
      recipientStore: createRecipientStore([]),
      api,
      logger: createLogger(),
    });

    const result = await reminder.handle({
      system: 'ldpass',
      phase: 'start',
      updateId: 'u3',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.reason, 'no_recipients');
    assert.equal(api.sends.length, 0);
    assert.equal(store.hasNotified('u3', 'start'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('私聊接收人存储会记录、去重并支持移除', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-recipients-'));
  try {
    const store = new OpsRecipientStore({ path: join(dir, 'ops-recipients.json') });
    assert.equal(store.remember('user-1', { source: 'friend_add' }), true);
    assert.equal(store.remember('user-1', { source: 'message' }), true);
    assert.deepEqual(store.list(), ['user-1']);
    assert.equal(store.remove('user-1'), true);
    assert.equal(store.remove('user-1'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
