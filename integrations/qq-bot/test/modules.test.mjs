import assert from 'node:assert/strict';
import test from 'node:test';
import { helpText } from '../src/answer.mjs';
import { buildHelpText, describePolicy, moduleById, resolveTarget } from '../src/modules.mjs';

test('模块和指令别名都能解析', () => {
  assert.equal(resolveTarget('公交')?.module?.id, 'ask.transit');
  assert.equal(resolveTarget('公交与线路')?.module?.id, 'ask.transit');
  assert.equal(resolveTarget('ask.transit')?.module?.id, 'ask.transit');
  assert.equal(resolveTarget('天气')?.type, 'command');
  assert.equal(resolveTarget('天气')?.commandId, 'weather');
  assert.equal(resolveTarget('实用工具')?.module?.id, 'tools');
  assert.equal(resolveTarget('B站')?.module?.id, 'bilibili');
  assert.equal(resolveTarget('进退群')?.module?.id, 'notices');
  assert.equal(resolveTarget('玩家播报')?.module?.id, 'playerEvents');
  assert.equal(resolveTarget('服务器消息')?.module?.id, 'serverMessages');
  assert.equal(resolveTarget('运维提醒'), null);
  assert.equal(resolveTarget('菜单')?.type, 'always');
  assert.equal(resolveTarget('问一问')?.moduleIds?.length, 5);
  assert.equal(resolveTarget('指令')?.moduleIds?.length, 9);
  assert.equal(resolveTarget('不存在的功能'), null);
});

test('玩家进出和服务器消息默认关闭、按群开启', () => {
  for (const id of ['playerEvents', 'serverMessages']) {
    const definition = moduleById.get(id);
    assert.equal(definition?.defaultEnabled, false, id);
    assert.equal(definition?.optIn, true, id);
  }
});

test('使用说明是常开模块，其它问一问范围都可关', () => {
  assert.equal(moduleById.get('ask.basics')?.editable, false);
  for (const id of ['ask.server', 'ask.transit', 'ask.operations', 'ask.map', 'ask.general']) {
    assert.equal(moduleById.get(id)?.editable, true, id);
  }
});

test('物料盲盒模块注册了全部物料指令并默认开启', () => {
  const definition = moduleById.get('materials');
  assert.equal(definition?.label, '物料盲盒');
  assert.equal(definition?.defaultEnabled, true);
  assert.equal(definition?.group, 'commands');
  assert.deepEqual(definition?.commands, [
    'materials',
    'blindbox',
    'roadsign',
    'buildingsign',
    'stopsign',
    'metro',
    'materialsource',
  ]);
  assert.equal(resolveTarget('物料')?.module?.id, 'materials');
  assert.equal(resolveTarget('数据源')?.module?.id, 'materials');
  assert.equal(resolveTarget('blindbox')?.type, 'command');
  assert.equal(resolveTarget('blindbox')?.moduleId, 'materials');
  assert.equal(resolveTarget('materialsource')?.commandId, 'materialsource');
  // 物料模块关闭时，模块内每条指令都应转为关闭（与 /模块 的展示、帮助一致）。
  const policy = {
    modules: Object.fromEntries([...moduleById.keys()].map((id) => [id, id !== 'materials'])),
    commands: Object.fromEntries(
      definition.commands.map((commandId) => [commandId, commandId === 'materials' ? false : true]),
    ),
    locked: new Set(),
  };
  const helped = buildHelpText(policy, helpText);
  assert.match(helped, /本群未开启：物料盲盒/);
});

test('/模块 列表默认展示常开和已开启项', () => {
  const policy = {
    modules: Object.fromEntries([...moduleById.keys()].map((id) => [id, true])),
    commands: { weather: true },
    locked: new Set(),
  };
  const text = describePolicy(policy);
  assert.match(text, /使用说明 常开/);
  assert.match(text, /临东服资料 开/);
  assert.match(text, /实用工具 开/);
  assert.match(text, /进退群提示 开/);
  assert.match(text, /玩家进出播报 开/);
  assert.match(text, /服务器消息 开/);
  assert.doesNotMatch(text, /锁定/);
});

test('有功能关闭时帮助追加本群未开启项', () => {
  const policy = {
    modules: Object.fromEntries([...moduleById.keys()].map((id) => [id, true])),
    commands: { weather: false },
    locked: new Set(),
  };
  policy.modules.tools = false;
  policy.modules['ask.transit'] = false;
  const text = buildHelpText(policy, helpText);
  assert.match(text, /本群未开启：公交与线路、实用工具/);
  assert.match(text, /发送「\/模块」查看开关/);
});

test('全部开启时帮助保持原文', () => {
  const policy = {
    modules: Object.fromEntries([...moduleById.keys()].map((id) => [id, true])),
    commands: {},
    locked: new Set(),
  };
  assert.equal(buildHelpText(policy, helpText), helpText);
});
