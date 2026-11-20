import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { QQBot } from '../src/bot.mjs';
import { commandHelpText, handleCommand, parseIncomingCommand } from '../src/commands.mjs';
import { GroupModuleStore } from '../src/group-modules.mjs';
import { MaterialSourceStore } from '../src/material-sources.mjs';
import { renderCardPng } from '../src/card-render.mjs';
import {
  MATERIAL_SIGNATURE_HEADER,
  SAMPLE_LICENSE_MISSING_TEXT,
  SAMPLE_LICENSE_TEXT,
  createMaterialSignature,
  handleSignageCommand,
} from '../src/signage.mjs';

const secret = 'material-test-secret';
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

/** 1×1 PNG：卡片渲染测试里必须能在 resvg 里解码。 */
const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function createConfig(overrides = {}) {
  return {
    materials: {
      enabled: true,
      secret,
      timeoutMs: 8000,
      sourcePath: '',
      ...overrides.materials,
    },
    modules: {
      editors: ['owner', 'admin'],
      admins: new Map(),
      ...overrides.modules,
    },
    yct: {
      baseUrl: 'http://127.0.0.1:3300',
      publicBaseUrl: 'https://yct.example.com',
      ...overrides.yct,
    },
  };
}

function groupContext(role = 'member', overrides = {}) {
  return {
    kind: 'group',
    groupId: 'group-1',
    userId: 'user-1',
    userName: '小明',
    role,
    date: '2026-11-19',
    ...overrides,
  };
}

function sourceDescriptor(dataSource) {
  return dataSource === 'sample'
    ? {
        kind: 'sample',
        name: '沈阳示例线网',
        licenseName: 'CC BY-NC-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      }
    : { kind: 'server', name: '临东市线网', licenseName: '', licenseUrl: '' };
}

function successPayload(overrides = {}) {
  const dataSource = overrides.dataSource ?? 'server';
  const kind = overrides.kind ?? 'road_sign';
  return {
    ok: true,
    seed: 'a1b2c3',
    code: overrides.code ?? 'LD-7F3A',
    shareId: 'shareId1234',
    shareUrl: overrides.shareUrl ?? 'https://yct.example.com/m/road/shareId1234',
    source: sourceDescriptor(dataSource),
    pngBase64: overrides.pngBase64 ?? tinyPngBase64,
    widthPx: overrides.widthPx ?? 1024,
    heightPx: overrides.heightPx ?? 256,
    card: {
      kind,
      title: overrides.title ?? '随机路牌',
      eyebrow: '城市物料盲盒 · 11月19日',
      headline: overrides.headline ?? '临东大道',
      subline: '西—东 · 旧版蓝 · 双箭头',
      meta: [
        `编号 ${overrides.code ?? 'LD-7F3A'} · 数据来自临东市地图道路标记`,
        '方位 西—东',
        '模板：道路路名方向牌（v1）',
      ],
      footer: '雨城通 · 随机生成，非正式物料',
      color: '#004796',
    },
    template: {
      id: 'system_material_road_name_direction',
      version: 1,
      title: '道路路名方向牌',
      slug: 'road',
    },
    canvas: {},
    input: {},
  };
}

function createFetch({
  status = 200,
  payload = successPayload(),
  throws = null,
  responseJsonThrows = false,
  capture = {},
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body });
    Object.assign(capture, {
      url: String(url),
      method: init?.method,
      headers: init?.headers ?? {},
      body: init?.body,
    });
    if (throws) {
      throw throws;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        if (responseJsonThrows) {
          throw new Error('not json');
        }
        return payload;
      },
    };
  };
  return { fetchImpl, calls };
}

function verifyMaterialSignature(header, body) {
  const [timestamp, signature] = String(header ?? '').split('.');
  assert.match(timestamp, /^\d{1,12}$/u);
  assert.match(signature, /^[0-9a-f]{64}$/u);
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${bodyHash}`, 'utf8')
    .digest('hex');
  assert.equal(signature, expected);
  assert.ok(Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) <= 60);
}

// ---------------------------------------------------------------------------
// 渲染成功与卡片字段
// ---------------------------------------------------------------------------

test('/盲盒 渲染成功：请求签名、卡片字段和二维码齐全', async () => {
  const capture = {};
  const { fetchImpl, calls } = createFetch({ capture });
  const config = createConfig();
  const result = await handleCommand({
    text: '/盲盒',
    config,
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: new MaterialSourceStore({}),
  });

  assert.equal(result.handled, true);
  assert.equal(calls.length, 1);
  assert.equal(capture.url, 'http://127.0.0.1:3300/api/qq-bot/materials/render');
  assert.equal(capture.method, 'POST');
  assert.equal(JSON.parse(capture.body).kind, 'random');
  assert.equal(JSON.parse(capture.body).dataSource, 'server');
  assert.equal(capture.headers['content-type'], 'application/json');
  verifyMaterialSignature(capture.headers[MATERIAL_SIGNATURE_HEADER], capture.body);

  assert.equal(result.card.type, 'signage');
  assert.equal(result.card.title, '随机路牌');
  assert.equal(result.card.headline, '临东大道');
  assert.equal(result.card.eyebrow, '城市物料盲盒 · 11月19日');
  assert.equal(result.card.color, '#004796');
  assert.equal(result.card.date, '2026-11-19');
  assert.ok(result.card.imageDataUri.startsWith('data:image/png;base64,'));
  assert.equal(result.card.imageWidthPx, 1024);
  assert.equal(result.card.imageHeightPx, 256);
  assert.ok(result.card.qrDataUrl.startsWith('data:image/png;base64,'));
  assert.equal(result.card.shareUrl, 'https://yct.example.com/m/road/shareId1234');
  assert.match(result.card.meta[0], /编号 LD-7F3A/);
  assert.match(result.card.meta.join('\n'), /模板：道路路名方向牌（v1）/);
  assert.match(result.reply, /随机路牌：临东大道/);
  assert.match(result.reply, /编号：LD-7F3A/);
  assert.match(result.reply, /30 天内可在雨城通工作台继续编辑/);
  assert.match(result.reply, /https:\/\/yct\.example\.com\/m\/road\/shareId1234/);
  assert.match(result.reply, /非正式物料/);
});

test('每种族指令映射到对应 kind', async () => {
  const cases = [
    ['/路牌', 'road_sign'],
    ['/楼牌', 'address_sign'],
    ['/站牌', 'bus_stop'],
    ['/地铁', 'metro_line'],
  ];
  for (const [text, kind] of cases) {
    const capture = {};
    const { fetchImpl } = createFetch({ payload: successPayload({ kind }), capture });
    const result = await handleCommand({
      text,
      config: createConfig(),
      context: groupContext(),
      fetchImpl,
      logger: silentLogger,
      moduleStore: new GroupModuleStore({}),
      materialSourceStore: new MaterialSourceStore({}),
    });
    assert.equal(result.handled, true, text);
    assert.equal(JSON.parse(capture.body).kind, kind, text);
    assert.equal(JSON.parse(capture.body).dataSource, 'server', text);
  }
});

test('生成的 signage 卡片能在机器人本地渲染成 PNG', async () => {
  const { fetchImpl } = createFetch();
  const result = await handleCommand({
    text: '/路牌',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
  });
  const png = await renderCardPng(result.card);
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length > 10_000, `卡片渲染结果过小：${png.length}`);
});

test('HMAC 签名格式与网页端一致（固定时间戳）', () => {
  const body = '{"kind":"random","dataSource":"server"}';
  const header = createMaterialSignature(secret, body, 1_700_000_000);
  assert.match(header, /^1700000000\.[0-9a-f]{64}$/u);
  const expected = createHmac('sha256', secret)
    .update(`1700000000.${createHash('sha256').update(body, 'utf8').digest('hex')}`, 'utf8')
    .digest('hex');
  assert.equal(header.split('.')[1], expected);
});

// ---------------------------------------------------------------------------
// 自然触发词
// ---------------------------------------------------------------------------

test('自然触发词只接管明确句式，问法交回问一问', () => {
  assert.equal(parseIncomingCommand('随机路牌')?.command, 'roadsign');
  assert.equal(parseIncomingCommand('来张站牌')?.command, 'stopsign');
  assert.equal(parseIncomingCommand('抽个楼牌')?.command, 'buildingsign');
  assert.equal(parseIncomingCommand('地铁盲盒')?.command, 'metro');
  assert.equal(parseIncomingCommand('物料盲盒')?.command, 'blindbox');
  assert.equal(parseIncomingCommand('随机物料')?.command, 'blindbox');

  assert.equal(parseIncomingCommand('路牌怎么申请'), null);
  assert.equal(parseIncomingCommand('地铁盲盒是什么'), null);
  assert.equal(parseIncomingCommand('站牌在哪里'), null);
  assert.equal(parseIncomingCommand('来张站牌吗'), null);
});

// ---------------------------------------------------------------------------
// 示例线网：本地拦截、许可标注
// ---------------------------------------------------------------------------

function sampleStore() {
  const store = new MaterialSourceStore({});
  store.setSource('group-1', 'sample', { role: 'owner', name: '群主' });
  return store;
}

test('示例线网下 /路牌 /楼牌 /站牌 本地拦截，不请求网页', async () => {
  for (const text of ['/路牌', '/楼牌', '/站牌']) {
    const { fetchImpl, calls } = createFetch();
    const result = await handleCommand({
      text,
      config: createConfig(),
      context: groupContext(),
      fetchImpl,
      logger: silentLogger,
      moduleStore: new GroupModuleStore({}),
      materialSourceStore: sampleStore(),
    });
    assert.equal(result.handled, true);
    assert.equal(calls.length, 0, text);
    assert.equal(result.card, undefined);
    assert.match(result.reply, /当前群使用示例线网，只支持地铁物料/);
  }
});

test('示例线网下 /盲盒 仍传 random，由网页端只在地铁模板里抽，并带许可标注', async () => {
  const capture = {};
  const { fetchImpl } = createFetch({
    payload: successPayload({
      dataSource: 'sample',
      kind: 'metro_line',
      title: '随机地铁',
      headline: '1号线',
      code: 'ML-1A2B',
      shareUrl: 'https://yct.example.com/m/metro-line-map/shareId1234',
    }),
    capture,
  });
  const result = await handleCommand({
    text: '/盲盒',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: sampleStore(),
  });

  assert.equal(JSON.parse(capture.body).kind, 'random');
  assert.equal(JSON.parse(capture.body).dataSource, 'sample');
  assert.match(result.reply, /沈阳示例线网 · CC BY-NC-SA 4\.0 · railmapgen\.org/);
  assert.ok(result.card.meta.includes(SAMPLE_LICENSE_TEXT));
  assert.equal(result.card.meta.length <= 4, true);
});

test('示例线网缺少许可时不出图', async () => {
  const payload = successPayload({ dataSource: 'sample', kind: 'metro_line' });
  payload.source = { kind: 'sample', name: '沈阳示例线网', licenseName: '', licenseUrl: '' };
  const { fetchImpl } = createFetch({ payload });
  const result = await handleCommand({
    text: '/地铁',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: sampleStore(),
  });
  assert.equal(result.handled, true);
  assert.equal(result.card, undefined);
  assert.match(result.reply, new RegExp(escapeRegExp(SAMPLE_LICENSE_MISSING_TEXT)));
});

test('示例线网走 /地铁 时请求 kind=metro_line', async () => {
  const capture = {};
  const { fetchImpl } = createFetch({
    payload: successPayload({ dataSource: 'sample', kind: 'metro_line' }),
    capture,
  });
  await handleCommand({
    text: '/地铁',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: sampleStore(),
  });
  assert.deepEqual(JSON.parse(capture.body), { kind: 'metro_line', dataSource: 'sample' });
});

// ---------------------------------------------------------------------------
// 错误映射
// ---------------------------------------------------------------------------

async function renderWithResponse({ status, payload, throws, config = createConfig() }) {
  const { fetchImpl } = createFetch({ status, payload, throws });
  return handleCommand({
    text: '/盲盒',
    config,
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: new MaterialSourceStore({}),
  });
}

test('403 提示物料功能未配置', async () => {
  const result = await renderWithResponse({
    status: 403,
    payload: { ok: false, error: 'invalid_signature', message: '签名校验失败。' },
  });
  assert.match(result.reply, /物料功能还没有配置完成/);
  assert.equal(result.card, undefined);
});

test('429 提示剩余等待秒数', async () => {
  const result = await renderWithResponse({
    status: 429,
    payload: { ok: false, error: 'rate_limited', retryAfterSeconds: 17 },
  });
  assert.match(result.reply, /17 秒后再试/);
});

test('503 区分服务器线网与示例线网', async () => {
  const server = await renderWithResponse({
    status: 503,
    payload: { ok: false, error: 'source_unavailable', message: '地图数据不可用。' },
  });
  assert.match(server.reply, /物料数据源暂时不可用/);

  const { fetchImpl } = createFetch({
    status: 503,
    payload: { ok: false, error: 'sample_unavailable', message: '示例线网拉取失败。' },
  });
  const sample = await handleCommand({
    text: '/地铁',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: sampleStore(),
  });
  assert.match(sample.reply, /示例线网暂时不可用/);
  assert.match(sample.reply, /\/数据源 服务器/);
});

test('404 提示抽不到可用数据', async () => {
  const result = await renderWithResponse({
    status: 404,
    payload: { ok: false, error: 'no_candidate', message: '没有可用数据。' },
  });
  assert.match(result.reply, /暂时没有抽到可用的物料数据/);
});

test('500 提示出图失败', async () => {
  const result = await renderWithResponse({
    status: 500,
    payload: { ok: false, error: 'render_failed', message: '渲染异常。' },
  });
  assert.match(result.reply, /出图失败/);
});

test('超时与连不上服务给可读提示', async () => {
  const timeout = new Error('aborted');
  timeout.name = 'TimeoutError';
  const timedOut = await renderWithResponse({ throws: timeout });
  assert.match(timedOut.reply, /超时/);

  const refused = await renderWithResponse({ throws: new Error('ECONNREFUSED') });
  assert.match(refused.reply, /暂时连不上物料服务/);
});

test('物料服务失败日志带实际耗时和超时配置', async () => {
  const timeout = new Error('The operation was aborted due to timeout');
  timeout.name = 'TimeoutError';
  const warnings = [];
  const logger = {
    debug() {},
    info() {},
    warn(...args) {
      warnings.push(args.map((value) => String(value)).join(' '));
    },
    error() {},
  };
  const { fetchImpl } = createFetch({ throws: timeout });
  const result = await handleCommand({
    text: '/盲盒',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: new MaterialSourceStore({}),
  });
  assert.match(result.reply, /超时/);
  assert.match(
    warnings.join('\n'),
    /请求物料服务失败（耗时 \d+ms，超时 8000ms，目标 http:\/\/127\.0\.0\.1:3300）/u,
  );
});

test('响应不是 JSON 时按不可用处理', async () => {
  const { fetchImpl } = createFetch({ responseJsonThrows: true });
  const result = await handleCommand({
    text: '/盲盒',
    config: createConfig(),
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
  });
  assert.match(result.reply, /物料生成没有成功|物料服务没有返回图片/);
});

// ---------------------------------------------------------------------------
// 开关与配置
// ---------------------------------------------------------------------------

test('未配置 secret 时提示还没有配置完成且不发请求', async () => {
  const { fetchImpl, calls } = createFetch();
  const config = createConfig({ materials: { secret: '' } });
  for (const text of ['/盲盒', '/路牌', '/数据源']) {
    const result = await handleCommand({
      text,
      config,
      context: groupContext('owner'),
      fetchImpl,
      logger: silentLogger,
    });
    assert.match(result.reply, /物料功能还没有配置完成/, text);
  }
  assert.equal(calls.length, 0);
});

test('QQ_BOT_MATERIALS=0 时物料指令关闭', async () => {
  const { fetchImpl, calls } = createFetch();
  const config = createConfig({ materials: { enabled: false } });
  const render = await handleCommand({
    text: '/盲盒',
    config,
    context: groupContext(),
    fetchImpl,
    logger: silentLogger,
  });
  assert.match(render.reply, /物料盲盒功能暂时关闭了/);
  const source = await handleCommand({
    text: '/数据源',
    config,
    context: groupContext('owner'),
    fetchImpl,
    logger: silentLogger,
  });
  assert.match(source.reply, /物料盲盒功能暂时关闭了/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// /物料 说明菜单
// ---------------------------------------------------------------------------

test('/物料 返回玩法说明', async () => {
  const result = await handleCommand({
    text: '/物料',
    config: createConfig(),
    context: groupContext(),
    logger: silentLogger,
  });
  assert.equal(result.handled, true);
  assert.match(result.reply, /\/盲盒/);
  assert.match(result.reply, /\/路牌/);
  assert.match(result.reply, /\/地铁/);
  assert.match(result.reply, /\/数据源/);
  assert.match(result.reply, /本群数据源：服务器线网/);
});

// ---------------------------------------------------------------------------
// /数据源 权限、审计与切换
// ---------------------------------------------------------------------------

async function runSourceCommand({
  args = '',
  role = 'owner',
  config,
  store,
  logger,
  context,
} = {}) {
  return handleCommand({
    text: `/数据源 ${args}`.trim(),
    config: config ?? createConfig(),
    context: context ?? groupContext(role),
    logger: logger ?? silentLogger,
    moduleStore: new GroupModuleStore({}),
    materialSourceStore: store ?? new MaterialSourceStore({}),
  });
}

test('数据源查看对所有成员开放，默认服务器线网', async () => {
  const result = await runSourceCommand({ role: 'member' });
  assert.match(result.reply, /本群物料数据源：服务器线网/);
  assert.match(result.reply, /\/数据源 示例/);
});

test('普通成员不能切换数据源', async () => {
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({ args: '示例', role: 'member', store });
  assert.match(result.reply, /只有群主或管理员可以切换本群物料数据源/);
  assert.equal(store.getSource('group-1'), 'server');
});

test('未知角色拒绝修改并提示确认身份', async () => {
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({
    args: '示例',
    store,
    context: { kind: 'group', groupId: 'group-1', userId: 'user-1', userName: '小明' },
  });
  assert.match(result.reply, /暂时无法确认你的群身份/);
  assert.equal(store.getSource('group-1'), 'server');
});

test('群主切到示例线网：回复影响、写审计、持久化', async () => {
  const logs = [];
  const logger = {
    debug() {},
    info: (...parts) => logs.push(parts.join(' ')),
    warn() {},
    error() {},
  };
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({ args: '示例', role: 'owner', store, logger });
  assert.match(result.reply, /已把本群物料数据源切到「沈阳示例线网」/);
  assert.match(result.reply, /只开放地铁物料/);
  assert.match(result.reply, /沈阳示例线网 · CC BY-NC-SA 4\.0 · railmapgen\.org/);
  assert.equal(store.getSource('group-1'), 'sample');

  const auditLine = logs.find((line) => line.includes('material.source_change'));
  assert.ok(auditLine, '应写入审计日志');
  const record = JSON.parse(auditLine.slice(auditLine.indexOf('{')));
  assert.equal(record.event, 'material.source_change');
  assert.equal(record.role, 'owner');
  assert.equal(record.before, 'server');
  assert.equal(record.after, 'sample');
  assert.match(record.groupHash, /^[0-9a-f]{16}$/u);
  assert.ok(record.group, '审计里应带打码后的群标识');
});

test('群管理员可以切回服务器线网', async () => {
  const store = sampleStore();
  const result = await runSourceCommand({ args: '服务器', role: 'admin', store });
  assert.match(result.reply, /已把本群物料数据源切到「服务器线网」/);
  assert.match(result.reply, /路牌、楼牌、公交站牌和地铁物料都恢复可用/);
  assert.equal(store.getSource('group-1'), 'server');
});

test('重复切换同一数据源只提示已经是', async () => {
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({ args: '服务器线网', role: 'owner', store });
  assert.match(result.reply, /已经是「服务器线网」了/);
  assert.equal(store.getSource('group-1'), 'server');
});

test('非法数据源参数返回用法', async () => {
  const result = await runSourceCommand({ args: '火星', role: 'owner' });
  assert.match(result.reply, /用法：\/数据源/);
});

test('单聊不能查看或切换按群数据源', async () => {
  const result = await runSourceCommand({
    context: { kind: 'c2c', userId: 'user-9', userName: '小明', date: '2026-11-19' },
  });
  assert.match(result.reply, /只能在群里/);
});

test('白名单成员在身份未知时也能切换', async () => {
  const config = createConfig({
    modules: { editors: [], admins: new Map([['group-1:user-1', '运维']]) },
  });
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({
    args: '示例',
    config,
    store,
    context: { kind: 'group', groupId: 'group-1', userId: 'user-1', userName: '小明' },
  });
  assert.match(result.reply, /已把本群物料数据源切到「沈阳示例线网」/);
});

test('编辑权限收紧到群主时管理员不能切换', async () => {
  const config = createConfig({ modules: { editors: ['owner'] } });
  const store = new MaterialSourceStore({});
  const result = await runSourceCommand({ args: '示例', role: 'admin', config, store });
  assert.match(result.reply, /只有群主或管理员可以切换本群物料数据源/);
});

// ---------------------------------------------------------------------------
// material-sources 存储
// ---------------------------------------------------------------------------

test('数据源按群持久化，重新加载后仍生效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-material-sources-'));
  try {
    const path = join(dir, 'material-sources.json');
    const first = new MaterialSourceStore({ path });
    first.setSource('group-1', 'sample', { role: 'owner', name: '群主' });
    first.setSource('group-2', 'server', { role: 'admin', name: '管理员' });

    const raw = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.groups['group-1'].source, 'sample');
    assert.equal(raw.groups['group-1'].updatedByRole, 'owner');
    assert.equal(raw.groups['group-1'].updatedByName, '群主');
    assert.match(raw.groups['group-1'].updatedAt, /^\d{4}-\d{2}-\d{2}T/u);

    const second = new MaterialSourceStore({ path });
    assert.equal(second.getSource('group-1'), 'sample');
    assert.equal(second.getSource('group-2'), 'server');
    assert.equal(second.getSource('group-3'), 'server');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('数据源文件损坏时回退默认并告警', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yct-material-sources-broken-'));
  try {
    const path = join(dir, 'material-sources.json');
    writeFileSync(path, '{ 这不是 JSON', 'utf8');
    const warnings = [];
    const logger = { debug() {}, info() {}, warn: (...parts) => warnings.push(parts.join(' ')) };
    const store = new MaterialSourceStore({ path, logger });
    assert.equal(store.getSource('group-1'), 'server');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /物料数据源配置/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// bot.mjs 集成：模块开关、帮助、参数透传
// ---------------------------------------------------------------------------

function createBotConfig() {
  return {
    qq: { userQpm: 6, groupQpm: 20, groupAllowlist: new Set(), groupAliases: new Map() },
    reply: {
      ack: true,
      ackDelayMs: 1000,
      style: 'chat',
      chatMaxChars: 600,
      condense: false,
      condenseChars: 120,
      condenseThreshold: 180,
      appendSources: true,
      links: false,
      images: false,
      cards: false,
      imageHosts: new Set(),
      followups: false,
      segmentChars: 200,
      maxQuestionChars: 1000,
      answerTimeoutMs: 5000,
    },
    yct: {
      baseUrl: 'http://127.0.0.1:3300',
      publicBaseUrl: '',
      apiKey: 'sk-test',
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      locale: 'zh-CN',
    },
    events: {
      port: 0,
      bind: '127.0.0.1',
      token: '',
      groupMap: new Map(),
      groups: new Set(),
    },
    link: {
      baseUrl: '',
      secret: '',
      contextSecret: '',
      groupEnabled: true,
      groupTokenTtlMs: 300_000,
      groupTokenCacheMax: 10_000,
      timeoutMs: 20_000,
    },
    modules: {
      path: '',
      auditPath: '',
      editors: ['owner', 'admin'],
      admins: new Map(),
      hints: true,
      hintTtlMs: 600_000,
    },
    materials: { enabled: true, secret, timeoutMs: 8000, sourcePath: '' },
  };
}

function createBot({ moduleStore, materialSourceStore, signage } = {}) {
  const sends = [];
  const api = {
    async sendGroupMessage(openid, payload) {
      sends.push({ kind: 'group', openid, payload });
    },
    async sendC2CMessage() {},
    async sendC2CTyping() {},
    async sendGroupImage() {},
    async sendC2CImage() {},
    async uploadGroupImage() {
      return 'file-info';
    },
    async uploadC2CImage() {
      return 'file-info';
    },
    async uploadGroupImageData() {
      return 'file-data';
    },
    async uploadC2CImageData() {
      return 'file-data';
    },
  };
  const config = createBotConfig();
  const bot = new QQBot({
    api,
    config,
    logger: silentLogger,
    assistant: async () => ({ text: '', references: [], followups: [], error: '' }),
    queue: { submit: () => true, settle: async () => {} },
    moduleStore,
    materialSourceStore,
    signage,
  });
  return { bot, sends, config };
}

function groupEvent({ id = 'msg-1', content, role = 'member' } = {}) {
  return {
    id,
    group_openid: 'group-1',
    author: { member_openid: 'user-1', member_role: role },
    content,
  };
}

test('帮助菜单包含物料盲盒一行', async () => {
  const { bot, sends } = createBot();
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent({ content: '帮助' }));
  const reply = sends.at(-1).payload.content;
  assert.equal(reply, commandHelpText());
  assert.match(reply, /物料盲盒：\/物料/);
});

test('bot 把 moduleStore / materialSourceStore / signage 透传给 handleCommand', async () => {
  const moduleStore = new GroupModuleStore({});
  const materialSourceStore = new MaterialSourceStore({});
  let seen = null;
  const { bot, sends } = createBot({
    moduleStore,
    materialSourceStore,
    signage: async (options) => {
      seen = options;
      return { handled: true, reply: `stub:${options.command}` };
    },
  });
  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent({ content: '/路牌' }));
  assert.ok(seen, 'signage 应被调用');
  assert.equal(seen.command, 'roadsign');
  assert.equal(seen.moduleStore, moduleStore);
  assert.equal(seen.materialSourceStore, materialSourceStore);
  assert.equal(seen.context.role, 'member');
  assert.match(sends.at(-1).payload.content, /^stub:roadsign$/);
});

test('关闭 materials 模块后物料指令与 /数据源 一起停用', async () => {
  const moduleStore = new GroupModuleStore({});
  moduleStore.setModule('group-1', 'materials', false, { role: 'admin' });
  let called = 0;
  const { bot, sends } = createBot({
    moduleStore,
    signage: async () => {
      called += 1;
      return { handled: true, reply: 'should-not-reach' };
    },
  });

  await bot.handleEvent('GROUP_AT_MESSAGE_CREATE', groupEvent({ id: 'msg-a', content: '/盲盒' }));
  assert.match(sends.at(-1).payload.content, /「盲盒」在本群未开启/);

  await bot.handleEvent(
    'GROUP_AT_MESSAGE_CREATE',
    groupEvent({ id: 'msg-b', content: '/数据源 示例', role: 'owner' }),
  );
  assert.match(sends.at(-1).payload.content, /「数据源」在本群未开启/);
  assert.equal(called, 0);
});

test('bot 内 /数据源 使用同一个 per-group store 并按角色授权', async () => {
  const moduleStore = new GroupModuleStore({});
  const materialSourceStore = new MaterialSourceStore({});
  const { bot, sends } = createBot({ moduleStore, materialSourceStore });

  await bot.handleEvent(
    'GROUP_AT_MESSAGE_CREATE',
    groupEvent({ id: 'msg-ds-1', content: '/数据源 示例', role: 'member' }),
  );
  assert.match(sends.at(-1).payload.content, /只有群主或管理员/);
  assert.equal(materialSourceStore.getSource('group-1'), 'server');

  await bot.handleEvent(
    'GROUP_AT_MESSAGE_CREATE',
    groupEvent({ id: 'msg-ds-2', content: '/数据源 示例', role: 'owner' }),
  );
  assert.match(sends.at(-1).payload.content, /已把本群物料数据源切到「沈阳示例线网」/);
  assert.equal(materialSourceStore.getSource('group-1'), 'sample');
});

test('/数据源 直接调用 signage 时也能复用 canEdit 的白名单兜底', async () => {
  const moduleStore = new GroupModuleStore({});
  const config = createConfig({
    modules: { editors: [], admins: new Map([['group-1:user-1', '运维']]) },
  });
  const result = await handleSignageCommand({
    command: 'materialsource',
    args: '示例',
    config,
    context: groupContext(undefined),
    logger: silentLogger,
    moduleStore,
    materialSourceStore: new MaterialSourceStore({}),
  });
  assert.match(result.reply, /已把本群物料数据源切到「沈阳示例线网」/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
