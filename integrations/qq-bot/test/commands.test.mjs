import assert from 'node:assert/strict';
import test from 'node:test';
import { CommunityStore } from '../src/community.mjs';
import { handleCommand, parseIncomingCommand } from '../src/commands.mjs';

const config = {
  weather: { city: '上海' },
  yct: { providerId: 'deepseek', model: 'deepseek-v4-flash', apiKey: 'sk-test' },
};

const base = { config, logger: { warn() {} } };

test('非斜杠消息交给问一问', async () => {
  assert.deepEqual(await handleCommand({ ...base, text: '临东站附近有什么美食' }), {
    handled: false,
  });
});

test('算式指令', async () => {
  const result = await handleCommand({ ...base, text: '/算 (1+2)*3' });
  assert.equal(result.handled, true);
  assert.equal(result.reply, '= 9');
});

test('查 IP 不带地址时只提示用法，不查询机器人出口 IP', async () => {
  let called = false;
  const result = await handleCommand({
    ...base,
    text: '/查IP',
    ipLookup: async () => {
      called = true;
      return '203.0.113.5：错误结果';
    },
  });
  assert.equal(called, false);
  assert.match(result.reply, /请提供要查询的 IP/);
  assert.equal(result.card, undefined);
});

test('随机数和骰子指令', async () => {
  const random = await handleCommand({ ...base, text: '/随机 5 5' });
  assert.equal(random.reply, '随机数：5（5-5）');

  const dice = await handleCommand({ ...base, text: '/骰子 2d6+2' });
  assert.match(dice.reply, /^2d6 \+ 2：\d+ \+ \d+ \+ 2 = \d+$/u);
  assert.equal(dice.card?.type, 'dice');
  assert.equal(dice.card?.count, 2);
  assert.equal(dice.card?.sides, 6);
  assert.equal(dice.card?.rolls?.length, 2);

  const natural = await handleCommand({ ...base, text: '掷 2个6面骰' });
  assert.equal(natural.card?.type, 'dice');
  assert.equal(natural.card?.count, 2);
  assert.equal(natural.card?.sides, 6);

  const notation = await handleCommand({ ...base, text: '/2d6+1' });
  assert.equal(notation.card?.type, 'dice');
  assert.match(notation.reply, /^2d6 \+ 1：/u);
});

test('中文电码与 GB2312 转换', async () => {
  const ccc = await handleCommand({ ...base, text: '/电码 一' });
  assert.match(ccc.reply, /一 0001/u);

  const gb = await handleCommand({ ...base, text: '/gb2312 临' });
  assert.match(gb.reply, /临 C1D9（33-57）/u);

  const ascii = await handleCommand({ ...base, text: '/gb2312 A' });
  assert.match(ascii.reply, /A 41/u);
});

test('天气指令使用配置中的城市', async () => {
  let asked = '';
  const result = await handleCommand({
    ...base,
    text: '/天气',
    weather: async ({ city }) => {
      asked = city;
      return '上海天气：晴。';
    },
  });
  assert.equal(asked, '上海');
  assert.equal(result.reply, '上海天气：晴。');

  const override = await handleCommand({
    ...base,
    text: '/天气 北京',
    weather: async ({ city }) => `${city}天气：多云。`,
  });
  assert.equal(override.reply, '北京天气：多云。');

  const forecast = await handleCommand({
    ...base,
    text: '/天气 上海',
    context: { kind: 'group', groupId: 'g1', userId: 'u1', userName: '测试' },
    weather: async () => '上海市天气：\n现在 15℃、晴。\n今天 13~18℃、晴。\n明天 12~17℃、多云。',
  });
  assert.equal(forecast.card?.type, 'weather');
  assert.equal(forecast.card?.days?.length, 2);
  assert.equal(forecast.card?.days?.[1].condition, '多云');

  const belowZero = await handleCommand({
    ...base,
    text: '/天气 北京',
    context: { kind: 'group', groupId: 'g1', userId: 'u1', userName: '测试' },
    weather: async () =>
      '北京市天气：\n现在 4℃、晴。\n今天 -1~7℃、白天晴、西北风 1-3级。\n明天 -3~6℃、白天晴、西北风 1-3级。',
  });
  assert.equal(belowZero.card?.days?.[0].low, '-1');
  assert.equal(belowZero.card?.days?.[0].condition, '晴');

  const freezing = await handleCommand({
    ...base,
    text: '/天气 瓦房店',
    context: { kind: 'group', groupId: 'g1', userId: 'u1', userName: '测试' },
    weather: async () =>
      '辽宁省大连市瓦房店市天气（11-20 07:01更新）：\n现在 -5℃、多云、湿度 59%、北风 5级。\n今天 -5~2℃、白天多云。\n明天 -6~-1℃、白天晴。',
  });
  assert.equal(freezing.card?.current.temp, '-5');
  assert.equal(freezing.card?.current.condition, '多云');
  assert.equal(freezing.card?.current.humidity, '59');
  assert.equal(freezing.card?.current.wind, '北风 5级');
  assert.equal(freezing.card?.updated, '11-20 07:01更新');
  assert.equal(freezing.card?.days?.[1].low, '-6');
  assert.equal(freezing.card?.days?.[1].high, '-1');

  const fullWidthMinus = await handleCommand({
    ...base,
    text: '/天气 哈尔滨',
    context: { kind: 'group', groupId: 'g1', userId: 'u1', userName: '测试' },
    weather: async () => '哈尔滨市天气：\n现在 −8℃、晴、体感 −13℃、湿度 76%、风 4 km/h。',
  });
  assert.equal(fullWidthMinus.card?.current.temp, '-8');
  assert.equal(fullWidthMinus.card?.current.condition, '晴');
  assert.equal(fullWidthMinus.card?.current.feels, '-13');
  assert.equal(fullWidthMinus.card?.current.humidity, '76');
  assert.equal(fullWidthMinus.card?.current.wind, '风 4 km/h');
});

test('IP 属地与历史上的今天指令', async () => {
  const ip = await handleCommand({
    ...base,
    text: '/ip 8.8.8.8',
    ipLookup: async ({ ip: target }) => `${target}：美国 加利福尼亚`,
  });
  assert.equal(ip.reply, '8.8.8.8：美国 加利福尼亚');

  const history = await handleCommand({
    ...base,
    text: '/历史',
    history: async () => '历史上的今天（11月17日）：\n· 1939年 冬季战争爆发',
  });
  assert.match(history.reply, /冬季战争/);
});

test('对联指令把上联交给模型', async () => {
  let received = '';
  const result = await handleCommand({
    ...base,
    text: '/对联 春风拂柳',
    couplet: async ({ upper }) => {
      received = upper;
      return '下联：细雨润花\n横批：春意盎然';
    },
  });
  assert.equal(received, '春风拂柳');
  assert.match(result.reply, /下联：细雨润花/);
});

test('未知指令给出帮助提示', async () => {
  const result = await handleCommand({ ...base, text: '/不存在的指令' });
  assert.equal(result.handled, true);
  assert.match(result.reply, /没有 \/不存在的指令/u);
});

test('指令错误不会抛出，而是返回可读提示', async () => {
  const result = await handleCommand({ ...base, text: '/算 1/0' });
  assert.equal(result.handled, true);
  assert.match(result.reply, /除数不能是 0/u);
});

test('自然触发词命中本地指令', async () => {
  const calc = await handleCommand({ ...base, text: '计算 (1+2)*3' });
  assert.equal(calc.reply, '= 9');

  const random = await handleCommand({ ...base, text: '随机数 1-1' });
  assert.equal(random.reply, '随机数：1（1-1）');

  let askedCity = '';
  const weather = async ({ city }) => {
    askedCity = city;
    return `${city}天气：晴。`;
  };
  const suffixWeather = await handleCommand({ ...base, text: '上海天气', weather });
  assert.equal(askedCity, '上海');
  assert.equal(suffixWeather.reply, '上海天气：晴。');

  const prefixWeather = await handleCommand({ ...base, text: '天气 北京', weather });
  assert.equal(prefixWeather.reply, '北京天气：晴。');

  const defaultWeather = await handleCommand({ ...base, text: '天气怎么样', weather });
  assert.equal(askedCity, '上海');
  assert.match(defaultWeather.reply, /天气/);

  let upper = '';
  const couplet = await handleCommand({
    ...base,
    text: '对对联 春风拂柳',
    couplet: async ({ upper: value }) => {
      upper = value;
      return '下联：细雨润花';
    },
  });
  assert.equal(upper, '春风拂柳');
  assert.match(couplet.reply, /下联/);

  let ip = '';
  const ipResult = await handleCommand({
    ...base,
    text: '查IP 8.8.8.8',
    ipLookup: async ({ ip: value }) => {
      ip = value;
      return '8.8.8.8：美国';
    },
  });
  assert.equal(ip, '8.8.8.8');
  assert.match(ipResult.reply, /美国/);

  const history = await handleCommand({
    ...base,
    text: '历史上的今天',
    history: async () => '历史上的今天（11月17日）：\n· 示例事件',
  });
  assert.match(history.reply, /示例事件/);

  const gb = await handleCommand({ ...base, text: '汉字编码 临' });
  assert.match(gb.reply, /临 C1D9/);

  const ccc = await handleCommand({ ...base, text: '电码 一' });
  assert.match(ccc.reply, /一 0001/);

  const menu = await handleCommand({ ...base, text: '菜单' });
  assert.match(menu.reply, /快捷指令/);

  const about = await handleCommand({ ...base, text: '关于机器人' });
  assert.match(about.reply, /QQ 机器人/);
});

test('无斜线裸词兼容物料、数据源和模块', () => {
  const cases = [
    ['物料', 'materials'],
    ['路牌', 'roadsign'],
    ['楼牌', 'buildingsign'],
    ['站牌', 'stopsign'],
    ['地铁', 'metro'],
    ['盲盒', 'blindbox'],
    ['数据源', 'materialsource'],
    ['数据源 示例', 'materialsource'],
    ['模块', 'modules'],
    ['模块 关 天气', 'modules'],
  ];
  for (const [text, command] of cases) {
    assert.equal(parseIncomingCommand(text)?.command, command, text);
  }
  for (const text of ['路牌怎么申请', '站牌在哪里', '地铁怎么坐', '模块是什么']) {
    assert.equal(parseIncomingCommand(text), null, text);
  }
});

test('容易误触发的自然语句交回问一问', async () => {
  for (const text of ['计算器怎么用', '随机数是多少', '电码是什么', '汉字编码是什么']) {
    const result = await handleCommand({ ...base, text });
    assert.equal(result.handled, false, text);
  }
});

test('群签到、签到榜、发言统计和今日运势', async () => {
  const community = new CommunityStore({ random: () => 50, logger: { warn() {} } });
  const context = {
    kind: 'group',
    groupId: 'g1',
    userId: 'u1',
    userName: '小明',
    date: '2026-11-17',
  };

  const sign = await handleCommand({ ...base, text: '签到', community, context });
  assert.match(sign.reply, /签到成功/);
  assert.equal(sign.card, undefined);

  const again = await handleCommand({ ...base, text: '打卡', community, context });
  assert.match(again.reply, /今天已经签到过了/);

  const signBoard = await handleCommand({ ...base, text: '签到榜', community, context });
  assert.match(signBoard.reply, /小明/);
  assert.match(signBoard.reply, /1 次/);
  assert.equal(signBoard.card?.type, 'signin-board');

  community.recordMessage({
    groupId: 'g1',
    userId: 'u1',
    name: '小明',
    date: '2026-11-17',
    source: 'all',
  });
  community.recordMessage({
    groupId: 'g1',
    userId: 'u2',
    name: '小红',
    date: '2026-11-17',
    source: 'all',
  });

  const stats = await handleCommand({ ...base, text: '发言统计', community, context });
  assert.match(stats.reply, /共 2 条/);
  assert.match(stats.reply, /2 人参与/);
  assert.match(stats.reply, /群消息/);
  assert.equal(stats.card?.type, 'stats');
  assert.equal(stats.card?.total, 2);

  const board = await handleCommand({ ...base, text: '发言榜', community, context });
  assert.match(board.reply, /发言榜/);
  assert.match(board.reply, /小明/);
  assert.equal(board.card?.type, 'board');

  const fortune = await handleCommand({ ...base, text: '今日运势', community, context });
  assert.match(fortune.reply, /今日运势：50\/100/);
  assert.equal(fortune.card?.type, 'fortune');
  assert.equal(fortune.card?.score, 50);
  const fortuneAgain = await handleCommand({ ...base, text: '运势', community, context });
  assert.equal(fortuneAgain.reply, fortune.reply);

  const reset = await handleCommand({ ...base, text: '重置运势', community, context });
  assert.match(reset.reply, /运势已重置：50\/100/);
});

test('签到类指令在单聊里给出提示', async () => {
  const community = new CommunityStore({ logger: { warn() {} } });
  const result = await handleCommand({
    ...base,
    text: '签到',
    community,
    context: { kind: 'c2c', userId: 'u1', userName: '小明', date: '2026-11-17' },
  });
  assert.match(result.reply, /群里使用/);
});

test('内容指令都带卡片数据', async () => {
  const context = {
    kind: 'group',
    groupId: 'g1',
    userId: 'u1',
    userName: '小明',
    date: '2026-11-17',
  };
  const samples = [
    { text: '随机数 1-10', card: 'result' },
    { text: '计算 1+2', card: 'result' },
    { text: '电码 一', card: 'telegraph' },
    { text: '汉字编码 临', card: 'gb2312' },
  ];
  for (const sample of samples) {
    const result = await handleCommand({ ...base, text: sample.text, context });
    assert.equal(result.card?.type, sample.card, sample.text);
  }

  const random = await handleCommand({ ...base, text: '随机数 1-10', context });
  assert.match(random.card?.note ?? '', /范围 1-10/);
  const calc = await handleCommand({ ...base, text: '计算 1+2', context });
  assert.equal(calc.card?.result, '3');

  const telegraph = await handleCommand({ ...base, text: '电码 一', context });
  assert.deepEqual(telegraph.card?.entries, [{ char: '一', code: '0001' }]);

  const gb = await handleCommand({ ...base, text: '汉字编码 临', context });
  assert.deepEqual(gb.card?.entries, [{ char: '临', area: 33, position: 57 }]);

  for (const text of ['菜单', '关于机器人']) {
    const result = await handleCommand({ ...base, text, context });
    assert.equal(result.card, undefined, text);
  }

  const weather = await handleCommand({
    ...base,
    text: '天气 上海',
    context,
    weather: async () => '上海市天气（11-17 20:00更新）：\n现在 15℃、晴。',
  });
  assert.equal(weather.card?.type, 'weather');
  assert.equal(weather.card?.current.temp, '15');

  const ip = await handleCommand({
    ...base,
    text: '查IP 8.8.8.8',
    context,
    ipLookup: async () => '8.8.8.8：美国',
  });
  assert.equal(ip.card?.type, 'result');
  assert.equal(ip.card?.result, '美国');
  assert.match(ip.card?.title ?? '', /8\.8\.8\.8/);

  const history = await handleCommand({
    ...base,
    text: '历史上的今天',
    context,
    history: async () => '历史上的今天（11月17日）：\n· 示例事件',
  });
  assert.equal(history.card?.type, 'action');

  const couplet = await handleCommand({
    ...base,
    text: '对对联 春风拂柳',
    context,
    couplet: async () => '下联：细雨润花',
  });
  assert.equal(couplet.card?.type, 'couplet');
  assert.equal(couplet.card?.upper, '春风拂柳');
  assert.equal(couplet.card?.lower, '细雨润花');
});

test('服务器在线人数', async () => {
  const result = await handleCommand({
    ...base,
    text: '/人数',
    config: { ...config, yct: { ...config.yct, baseUrl: 'http://127.0.0.1:3300' } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          meta: { sourceStatus: 'ready', message: '正常' },
          item: {
            availability: 'online',
            onlinePlayerCount: 12,
            checkedAt: '2026-11-18T04:00:00.000Z',
          },
        };
      },
    }),
  });
  assert.match(result.reply, /服务器在线：12 人/);
  assert.equal(result.card?.type, 'result');
  assert.equal(result.card?.result, '12');
});

test('随机地点返回 POI 分享卡片', async () => {
  const result = await handleCommand({
    ...base,
    text: '/随机地点',
    context: { kind: 'group', groupId: 'g1', userId: 'u1', userName: '测试' },
    config: {
      ...config,
      yct: {
        ...config.yct,
        baseUrl: 'http://127.0.0.1:3300',
        publicBaseUrl: 'https://yct.example.com',
      },
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          poi: {
            id: 'poi-1',
            label: '临东茶话会',
            categoryId: 'food',
            description: '一个适合坐下来聊天的地方。',
            address: '临东市中区',
            coordinates: [120.5, -340.2],
            sharePath: '/map?m=poi-1',
          },
        };
      },
    }),
  });
  assert.match(result.reply, /随机地点：临东茶话会/);
  assert.match(result.reply, /https:\/\/yct\.example\.com\/map\?m=poi-1/);
  assert.equal(result.card?.type, 'poi');
  assert.equal(result.card?.category, '餐饮');
});

test('版本指令返回机器人和网页版本', async () => {
  const result = await handleCommand({
    ...base,
    text: '/版本',
    config: { ...config, yct: { ...config.yct, baseUrl: 'http://127.0.0.1:3300' } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { releaseVersion: '2.22.0', buildId: '20261118-172945' };
      },
    }),
  });
  assert.match(result.reply, /雨城通机器人：\d+\.\d+\.\d+/);
  assert.match(result.reply, /网页：2\.22\.0（20261118-172945）/);
  assert.match(result.reply, /卡片渲染：机器人本地/);
});

test('掷骰子支持无参数和中文写法', async () => {
  const plain = await handleCommand({ ...base, text: '/掷骰子' });
  assert.equal(plain.card?.type, 'dice');
  assert.equal(plain.card?.count, 1);
  assert.equal(plain.card?.sides, 6);

  const chinese = await handleCommand({ ...base, text: '掷 2个6面骰' });
  assert.equal(chinese.card?.type, 'dice');
  assert.equal(chinese.card?.count, 2);
});

test('帮助里列出快捷指令', async () => {
  const result = await handleCommand({ ...base, text: '/帮助' });
  assert.match(result.reply, /快捷指令/);
  assert.match(result.reply, /随机数/);
  assert.match(result.reply, /电码/);
  assert.match(result.reply, /查IP/);
  assert.match(result.reply, /历史上的今天/);
  assert.match(result.reply, /菜单/);
});
