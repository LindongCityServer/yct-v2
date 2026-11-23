import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatOpsReminder,
  normalizeOpsEvent,
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

function createGroupStore(groups = ['group-1', 'group-2']) {
  return {
    listEnabledGroups: (moduleId) => (moduleId === 'opsReminder' ? groups : []),
  };
}

function createApi() {
  const sends = [];
  return {
    sends,
    async sendGroupMessage(groupId, payload) {
      sends.push({ groupId, payload });
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

test('运维提醒按开启的群发送，并跳过重复的阶段', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-reminder-'));
  try {
    let now = new Date('2026-11-23T12:00:00Z');
    const store = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    const api = createApi();
    const reminder = new OpsReminder({
      store,
      groupStore: createGroupStore(),
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

test('没有群开启运维提醒时不发送，也不记成已通知', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-ops-reminder-'));
  try {
    const store = new OpsReminderStore({ path: join(dir, 'ops-reminders.json') });
    const api = createApi();
    const reminder = new OpsReminder({
      store,
      groupStore: createGroupStore([]),
      api,
      logger: createLogger(),
    });

    const result = await reminder.handle({
      system: 'ldpass',
      phase: 'start',
      updateId: 'u2',
    });
    assert.equal(result.sent, 0);
    assert.equal(result.reason, 'no_groups');
    assert.equal(api.sends.length, 0);
    assert.equal(store.hasNotified('u2', 'start'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
