import assert from 'node:assert/strict';
import test from 'node:test';
import { GroupModuleStore } from '../src/group-modules.mjs';
import { handleModuleCommand } from '../src/module-command.mjs';

function createLimiter({ allowed = true } = {}) {
  return {
    user: { take: () => ({ allowed, retryAfterSec: 30 }) },
    group: { take: () => ({ allowed, retryAfterSec: 30 }) },
  };
}

function context(role) {
  return { kind: 'group', groupId: 'group-1', userId: 'user-1', userName: '小明', role };
}

function setup(options = {}) {
  const store = new GroupModuleStore({});
  return {
    store,
    run: (args, overrides = {}) =>
      handleModuleCommand({
        args,
        context: context('role' in overrides ? overrides.role : 'admin'),
        store,
        config: options.config ?? {},
        limiter: overrides.limiter ?? createLimiter(),
      }),
  };
}

test('/模块 无参数时展示本群开关', () => {
  const { run } = setup();
  const reply = run('').reply;
  assert.match(reply, /使用说明 常开/);
  assert.match(reply, /公交与线路 开/);
  assert.match(reply, /群主或管理员/);
});

test('群管理员可以关模块并收到恢复提示', () => {
  const { store, run } = setup();
  const reply = run('关 公交').reply;
  assert.match(reply, /已关闭本群的「公交与线路」/);
  assert.match(reply, /\/模块 开 公交与线路/);
  assert.equal(store.resolve('group-1').modules['ask.transit'], false);
});

test('指令级覆盖可以单独打开', () => {
  const { store, run } = setup();
  run('关 实用工具');
  const reply = run('开 天气').reply;
  assert.match(reply, /已打开本群的「天气」/);
  assert.match(reply, /「实用工具」整体仍是关闭的/);
  const policy = store.resolve('group-1');
  assert.equal(policy.modules.tools, false);
  assert.equal(policy.commands.weather, true);
});

test('普通成员不能修改，但可以查看', () => {
  const { run } = setup();
  assert.match(run('关 天气', { role: 'member' }).reply, /只有群主或管理员/);
  assert.match(run('', { role: 'member' }).reply, /本群功能/);
});

test('身份未知时拒绝修改', () => {
  const { run } = setup();
  const reply = run('关 天气', { role: undefined }).reply;
  assert.match(reply, /暂时无法确认你的群身份/);
});

test('编辑权限可以收紧到群主', () => {
  const { run } = setup({ config: { modules: { editors: ['owner'] } } });
  assert.match(run('关 天气', { role: 'admin' }).reply, /只有群主或管理员/);
  assert.match(run('关 天气', { role: 'owner' }).reply, /已关闭本群的「天气」/);
});

test('白名单成员在身份未知时也能修改', () => {
  const { run } = setup({
    config: { modules: { editors: [], admins: new Map([['group-1:user-1', 'x']]) } },
  });
  assert.match(run('关 天气', { role: undefined }).reply, /已关闭本群的「天气」/);
});

test('常开项拒绝关闭并说明原因', () => {
  const { run } = setup();
  assert.match(run('关 使用说明').reply, /常开功能/);
  assert.match(run('关 帮助').reply, /常开功能/);
});

test('锁定项提示由机器人管理员锁定', () => {
  const { store, run } = setup();
  store.setModule('group-1', 'ask.transit', false, { role: 'admin' });
  store.data.groups['group-1'].locked = ['ask.transit'];
  const reply = run('开 公交').reply;
  assert.match(reply, /由机器人管理员锁定/);
  assert.equal(store.resolve('group-1').modules['ask.transit'], false);
});

test('关问一问会一次关闭五个可关范围', () => {
  const { store, run } = setup();
  const reply = run('关 问一问').reply;
  assert.match(reply, /已关闭本群问一问/);
  for (const id of ['ask.server', 'ask.transit', 'ask.operations', 'ask.map', 'ask.general']) {
    assert.equal(store.resolve('group-1').modules[id], false, id);
  }
  assert.equal(store.resolve('group-1').modules['ask.basics'], true);
});

test('事件类模块也能按群关闭', () => {
  const { store, run } = setup();
  assert.match(run('关 进退群提示').reply, /已关闭本群的「进退群提示」/);
  assert.match(run('关 玩家播报').reply, /已关闭本群的「玩家进出播报」/);
  const policy = store.resolve('group-1');
  assert.equal(policy.modules.notices, false);
  assert.equal(policy.modules.playerEvents, false);
});

test('恢复默认会清掉本群覆盖', () => {
  const { store, run } = setup();
  run('关 天气');
  assert.match(run('恢复默认').reply, /恢复默认/);
  assert.equal(store.resolve('group-1').commands.weather, true);
});

test('详情展示模块包含的指令和状态', () => {
  const { run } = setup();
  run('关 天气');
  const reply = run('详情 实用工具').reply;
  assert.match(reply, /「实用工具」：开/);
  assert.match(reply, /天气（关）/);
  assert.match(reply, /计算/);
});

test('单聊不能用 /模块 改群开关', () => {
  const store = new GroupModuleStore({});
  const reply = handleModuleCommand({
    args: '关 天气',
    context: { kind: 'c2c', userId: 'user-9', userName: '小明' },
    store,
    config: {},
  }).reply;
  assert.match(reply, /只能在群里/);
});

test('调整频率受限流', () => {
  const { run } = setup();
  const reply = run('关 天气', { limiter: createLimiter({ allowed: false }) }).reply;
  assert.match(reply, /调整得有点快/);
});

test('未知模块给出可操作提示', () => {
  const { run } = setup();
  assert.match(run('关 不存在').reply, /没有「不存在」这个模块或指令/);
  assert.match(run('帮忙看看').reply, /模块开关用法/);
});
