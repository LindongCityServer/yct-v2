import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GroupModuleStore } from '../src/group-modules.mjs';

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

function createStore(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'yct-group-modules-'));
  const path = join(dir, 'group-modules.json');
  const logger = createLogger();
  const store = new GroupModuleStore({ path, logger, ...options });
  return {
    dir,
    path,
    logger,
    store,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('没有配置文件时按注册表默认值', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  const policy = setup.store.resolve('group-1');
  assert.equal(policy.modules['ask.transit'], true);
  assert.equal(policy.modules['ask.basics'], true);
  assert.equal(policy.commands.weather, true);
  assert.equal(policy.locked.size, 0);
});

test('关闭模块后写入文件，新实例能读到', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  const result = setup.store.setModule('group-1', 'tools', false, {
    role: 'admin',
    name: '小明',
    openId: 'user-1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(setup.store.resolve('group-1').modules.tools, false);
  assert.equal(setup.store.resolve('group-1').commands.weather, false);

  const reloaded = new GroupModuleStore({ path: setup.path, logger: setup.logger });
  assert.equal(reloaded.resolve('group-1').modules.tools, false);

  const raw = JSON.parse(readFileSync(setup.path, 'utf8'));
  assert.equal(raw.groups['group-1'].modules.tools, false);
  assert.equal(raw.groups['group-1'].updatedBy, 'role:admin');
});

test('指令覆盖优先于模块，默认值优先于注册表', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  setup.store.setModule('group-1', 'tools', false, { role: 'admin' });
  setup.store.setCommand('group-1', 'weather', true, { role: 'admin' });
  const policy = setup.store.resolve('group-1');
  assert.equal(policy.modules.tools, false);
  assert.equal(policy.commands.weather, true);
  assert.equal(policy.commands.calc, false);
});

test('defaults 对没有配置的群生效', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  writeFileSync(
    setup.path,
    JSON.stringify({ version: 1, defaults: { modules: { bilibili: false } }, groups: {} }),
    'utf8',
  );
  setup.store.load();
  assert.equal(setup.store.resolve('group-1').modules.bilibili, false);
  assert.equal(setup.store.resolve('group-1').modules.tools, true);
});

test('旧群号别名能命中同一份配置', (t) => {
  const setup = createStore({ aliases: new Map([['openid-1', 'legacy-9']]) });
  t.after(setup.cleanup);
  writeFileSync(
    setup.path,
    JSON.stringify({ groups: { 'legacy-9': { modules: { tools: false } } } }),
    'utf8',
  );
  setup.store.load();
  assert.equal(setup.store.resolve('openid-1').modules.tools, false);
  assert.equal(setup.store.resolve('openid-1').key, 'legacy-9');

  setup.store.setModule('openid-1', 'community', false, { role: 'admin' });
  const raw = JSON.parse(readFileSync(setup.path, 'utf8'));
  assert.equal(raw.groups['legacy-9'].modules.community, false);
  assert.equal(raw.groups['openid-1'], undefined);
});

test('按群开启模块时，listEnabledGroups 会把旧群号换回 openid', (t) => {
  const setup = createStore({
    aliases: new Map([
      ['openid-1', 'legacy-9'],
      ['openid-2', 'legacy-10'],
    ]),
  });
  t.after(setup.cleanup);
  writeFileSync(
    setup.path,
    JSON.stringify({
      groups: {
        'legacy-9': { modules: { playerEvents: true } },
        'legacy-10': { modules: { playerEvents: false } },
        'openid-3': { modules: { playerEvents: true } },
      },
    }),
    'utf8',
  );
  setup.store.load();

  assert.deepEqual(setup.store.listEnabledGroups('playerEvents').sort(), ['openid-1', 'openid-3']);
  assert.equal(setup.store.explicitModuleValue('legacy-10', 'playerEvents'), false);
  assert.equal(setup.store.resolveGroupOpenId('legacy-9'), 'openid-1');
  assert.equal(setup.store.hasEnabledGroups('playerEvents'), true);
});

test('锁定项群管理不能改，运维改文件后生效', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  writeFileSync(
    setup.path,
    JSON.stringify({
      groups: {
        'group-1': { modules: { 'ask.transit': false }, locked: ['ask.transit'] },
      },
    }),
    'utf8',
  );
  setup.store.load();
  const policy = setup.store.resolve('group-1');
  assert.equal(policy.modules['ask.transit'], false);
  assert.equal(setup.store.isLocked(policy, 'ask.transit'), true);

  const blocked = setup.store.setModule('group-1', 'ask.transit', true, { role: 'owner' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'locked');
  assert.equal(setup.store.resolve('group-1').modules['ask.transit'], false);

  setup.store.setModule('group-1', 'ask.map', false, { role: 'owner' });
  assert.equal(setup.store.resolve('group-1').modules['ask.map'], false);
});

test('常开项不能被关闭', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  const result = setup.store.setModule('group-1', 'ask.basics', false, { role: 'admin' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'always');
  assert.equal(setup.store.resolve('group-1').modules['ask.basics'], true);
});

test('恢复默认会删除本群覆盖', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  setup.store.setModule('group-1', 'tools', false, { role: 'admin' });
  const result = setup.store.resetGroup('group-1', { role: 'admin' });
  assert.equal(result.changed, true);
  assert.equal(setup.store.resolve('group-1').modules.tools, true);
  assert.equal(setup.store.describeGroups().length, 0);
});

test('配置文件损坏时回退默认并告警', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  writeFileSync(setup.path, '{ not json', 'utf8');
  const store = new GroupModuleStore({ path: setup.path, logger: setup.logger });
  assert.equal(store.resolve('group-1').modules.tools, true);
  assert.ok(setup.logger.lines.some((line) => line.includes('读取群功能配置失败')));
});

test('热加载：文件变化后下一轮读取生效，写坏时保留上一份', (t) => {
  const setup = createStore({ checkIntervalMs: 0 });
  t.after(setup.cleanup);
  setup.store.setModule('group-1', 'tools', false, { role: 'admin' });
  assert.equal(setup.store.resolve('group-1').modules.tools, false);

  writeFileSync(
    setup.path,
    JSON.stringify({ groups: { 'group-1': { modules: { tools: true } } } }),
    'utf8',
  );
  const future = new Date(Date.now() + 5000);
  utimesSync(setup.path, future, future);
  setup.store.reloadIfChanged();
  assert.equal(setup.store.resolve('group-1').modules.tools, true);

  writeFileSync(setup.path, '{ broken', 'utf8');
  utimesSync(setup.path, new Date(Date.now() + 10_000), new Date(Date.now() + 10_000));
  setup.store.reloadIfChanged();
  assert.equal(setup.store.resolve('group-1').modules.tools, true);
  assert.ok(setup.logger.lines.some((line) => line.includes('继续使用上一份')));
});

test('开关变更写入审计，群号和 openid 打码', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  setup.store.setModule('group-1', 'tools', false, {
    role: 'admin',
    name: '小明',
    openId: 'user-123456',
  });
  const auditPath = join(setup.dir, 'module-audit.jsonl');
  const line = readFileSync(auditPath, 'utf8').trim();
  const entry = JSON.parse(line);
  assert.equal(entry.target, 'tools');
  assert.equal(entry.from, true);
  assert.equal(entry.to, false);
  assert.equal(entry.actorRole, 'admin');
  assert.equal(entry.group, 'grou…-1');
  assert.equal(entry.actorOpenId, 'user…56');
  assert.equal(line.includes('group-1'), false);
});

test('未知模块和指令不会写进配置', (t) => {
  const setup = createStore();
  t.after(setup.cleanup);
  writeFileSync(
    setup.path,
    JSON.stringify({
      groups: {
        'group-1': {
          modules: { nope: false, tools: false },
          commands: { nope: false, weather: false },
          locked: ['nope', 'ask.transit'],
        },
      },
    }),
    'utf8',
  );
  setup.store.load();
  const raw = JSON.parse(readFileSync(setup.path, 'utf8'));
  // load 不写回文件，但内存里应忽略未知项。
  const policy = setup.store.resolve('group-1');
  assert.equal(policy.modules.tools, false);
  assert.equal(policy.commands.weather, false);
  assert.equal(policy.locked.has('nope'), false);
  assert.equal(policy.locked.has('ask.transit'), true);
  assert.equal(raw.groups['group-1'].modules.nope, false);
});
