import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CommunityStore } from '../src/community.mjs';

const quietLogger = { warn() {} };

test('签到累计次数、连续天数和重复签到', () => {
  const store = new CommunityStore({ logger: quietLogger });
  const base = { groupId: 'g1', userId: 'u1', name: '小明' };

  assert.deepEqual(store.signIn({ ...base, date: '2026-11-17' }), {
    already: false,
    total: 1,
    streak: 1,
  });
  assert.deepEqual(store.signIn({ ...base, date: '2026-11-17' }), {
    already: true,
    total: 1,
    streak: 1,
  });
  assert.deepEqual(store.signIn({ ...base, date: '2026-11-18' }), {
    already: false,
    total: 2,
    streak: 2,
  });
  assert.deepEqual(store.signIn({ ...base, date: '2026-11-20' }), {
    already: false,
    total: 3,
    streak: 1,
  });

  const board = store.signInBoard({ groupId: 'g1' });
  assert.equal(board[0].name, '小明');
  assert.equal(board[0].total, 3);
  assert.equal(board[0].streak, 1);
});

test('发言统计按天聚合人数、次数和活跃天数', () => {
  const store = new CommunityStore({ logger: quietLogger });
  store.recordMessage({
    groupId: 'g1',
    userId: 'u1',
    name: '小明',
    date: '2026-11-17',
    source: 'all',
  });
  store.recordMessage({
    groupId: 'g1',
    userId: 'u2',
    name: '小红',
    date: '2026-11-17',
    source: 'all',
  });
  store.recordMessage({
    groupId: 'g1',
    userId: 'u1',
    name: '小明',
    date: '2026-11-16',
    source: 'at',
  });

  const today = store.messageStats({ groupId: 'g1', date: '2026-11-17', days: 1 });
  assert.deepEqual(today, { total: 2, uniqueUsers: 2, activeDays: 1, fullMessages: true });

  const week = store.messageStats({ groupId: 'g1', date: '2026-11-17', days: 2 });
  assert.equal(week.total, 3);
  assert.equal(week.uniqueUsers, 2);
  assert.equal(week.activeDays, 2);

  const board = store.messageBoard({ groupId: 'g1', date: '2026-11-17', days: 1 });
  assert.deepEqual(
    board.map((row) => row.count),
    [1, 1],
  );
  assert.deepEqual(new Set(board.map((row) => row.name)), new Set(['小明', '小红']));
});

test('今日运势同一天固定，重置后变化', () => {
  let randomValue = 77;
  const store = new CommunityStore({ logger: quietLogger, random: () => randomValue });
  const first = store.getFortune({ userId: 'u1', name: '小明', date: '2026-11-17' });
  assert.equal(first.score, 77);
  assert.equal(first.text, '宜写英语作业');
  assert.equal(first.isNew, true);

  const second = store.getFortune({ userId: 'u1', name: '小明', date: '2026-11-17' });
  assert.equal(second.score, first.score);
  assert.equal(second.text, first.text);
  assert.equal(second.isNew, false);

  randomValue = 12;
  const reset = store.resetFortune({ userId: 'u1', name: '小明', date: '2026-11-17' });
  assert.equal(reset.score, 12);
  assert.notEqual(reset.text, first.text);
});

test('签到时和统计状态可以持久化并重新加载', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yct-community-'));
  const path = join(directory, 'state.json');
  try {
    const first = new CommunityStore({ path, logger: quietLogger, random: () => 50 });
    await first.load();
    first.signIn({ groupId: 'g1', userId: 'u1', name: '小明', date: '2026-11-17' });
    first.recordMessage({
      groupId: 'g1',
      userId: 'u1',
      name: '小明',
      date: '2026-11-17',
      source: 'all',
    });
    first.getFortune({ userId: 'u1', name: '小明', date: '2026-11-17' });
    await first.flush();

    const second = new CommunityStore({ path, logger: quietLogger });
    await second.load();
    assert.equal(second.signInBoard({ groupId: 'g1' })[0].total, 1);
    assert.equal(second.messageStats({ groupId: 'g1', date: '2026-11-17', days: 1 }).total, 1);
    assert.equal(second.getFortune({ userId: 'u1', name: '小明', date: '2026-11-17' }).score, 50);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
