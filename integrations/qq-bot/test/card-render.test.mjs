import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCardPng } from '../src/card-render.mjs';
import { buildQqBotCardSvg, normalizeCard } from '../src/card-renderer.mjs';

test('天气卡片按零下气温显示，不再退回占位符', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '11-20 07:01 更新',
    current: { temp: '-5', condition: '多云', feels: '', humidity: '59', wind: '北风 5级' },
    days: [{ label: '今天', low: '-5', high: '2', condition: '多云' }],
    footer: '数据来自公开天气服务',
  });
  assert.match(svg, />-5°</u);
  assert.doesNotMatch(svg, /--°/u);
});

test('天气卡片缺少气温时用占位符代替大号 --°', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '',
    current: { temp: '--', condition: '天气未知', feels: '', humidity: '', wind: '' },
    days: [],
    footer: '数据来自公开天气服务',
  });
  assert.doesNotMatch(svg, /--°/u);
  assert.match(svg, />—</u);
});

test('负两位数温度把天气描述右移，避免压在大号温度上', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '瓦房店市',
    date: '2026-11-20',
    updated: '',
    current: { temp: '-15', condition: '多云', feels: '', humidity: '', wind: '' },
    days: [],
    footer: '数据来自公开天气服务',
  });
  assert.match(svg, /-15°/u);
  const match = /<text x="([\d.]+)" y="122" font-size="30"[^>]*>多云<\/text>/u.exec(svg);
  assert.ok(match);
  assert.ok(Number(match[1]) > 250);
});

test('天气卡片显示预警、日出日落和夜间标签', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海市浦东新区',
    date: '2026-11-24',
    updated: '11-24 20:00更新',
    current: { temp: '8', condition: '晴', feels: '5', humidity: '76', wind: '西北风 3级' },
    days: [{ label: '今天', low: '6', high: '12', condition: '晴' }],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', issuedAt: '11-24 10:00' }],
    sun: { sunrise: '06:32', sunset: '16:58', phase: 'night' },
  });
  assert.match(svg, /上海市气象台发布大风蓝色预警信号/u);
  assert.match(svg, /11-24 10:00 发布 · 蓝色预警/u);
  assert.match(svg, /日出 06:32 · 日落 16:58/u);
  assert.match(svg, /晴 · 夜间/u);
  assert.match(svg, /font-weight="700" fill="#111817">8°<\/text>/u);
  const height = Number(/<svg[^>]*height="(\d+)"/u.exec(svg)?.[1] ?? 0);
  assert.ok(height > 728, `带预警的卡片应加高（实际 ${height}）`);
});

test('天气卡片标题不带省名，副标题带省市并支持多天和全部预警', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '铁西',
    region: '辽宁沈阳',
    date: '2026-11-24',
    current: { temp: '10', condition: '晴' },
    days: Array.from({ length: 5 }, (_, index) => ({
      label: index < 2 ? ['今天', '明天'][index] : `11-${26 + index}`,
      low: '5',
      high: '15',
      condition: '晴',
    })),
    alerts: Array.from({ length: 3 }, (_, index) => ({
      title: `辽宁省沈阳市铁西区气象台发布第 ${index + 1} 条预警信号`,
      level: '蓝色',
      issuedAt: '11-24 10:00',
    })),
  });
  assert.match(svg, />铁西天气<\/text>/u);
  assert.match(svg, /天气 · 辽宁沈阳 · 2026\.11\.24/u);
  assert.equal((svg.match(/data-alert-icon=/gu) ?? []).length, 3);
  const height = Number(/<svg[^>]*height="(\d+)"/u.exec(svg)?.[1] ?? 0);
  assert.ok(height > 900, `5 天预报加 3 条预警应继续加高（实际 ${height}）`);
});

test('预警列表带有左右和上下内边距', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海',
    date: '2026-11-24',
    current: { temp: '15', condition: '晴' },
    days: [],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色' }],
  });
  assert.match(svg, /<g transform="translate\(48,440\)" data-alert-icon="air">/u);
});

test('天气主题色随昼夜和气温变化', () => {
  const headerColor = (input) => {
    const svg = buildQqBotCardSvg({
      type: 'weather',
      place: '上海',
      date: '2026-11-24',
      current: { temp: input.temp, condition: '晴' },
      days: [],
      sun: input.sun,
    });
    return /<rect x="40" y="40" width="88" height="88" rx="14" fill="(#[0-9a-f]{6})"/u.exec(
      svg,
    )?.[1];
  };
  const day = headerColor({ temp: '15', sun: { phase: 'day' } });
  const night = headerColor({ temp: '15', sun: { phase: 'night' } });
  const hot = headerColor({ temp: '35', sun: { phase: 'day' } });
  const cold = headerColor({ temp: '-8', sun: { phase: 'day' } });
  assert.ok(day && night && hot && cold);
  assert.notEqual(day, night, '夜间主题色应与白天不同');
  assert.notEqual(hot, cold, '高温与低温主题色应不同');
});

test('天气卡片经过接口归一化后仍保留预警和日出日落', () => {
  const normalized = normalizeCard({
    type: 'weather',
    place: '上海市',
    date: '2026-11-24',
    current: { temp: '8', condition: '晴' },
    days: [],
    alerts: [{ title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', issuedAt: '11-24 10:00' }],
    sun: { sunrise: '06:32', sunset: '16:58', phase: 'night' },
  });
  assert.equal(normalized?.alerts?.[0]?.level, '蓝色');
  assert.equal(normalized?.sun?.phase, 'night');
  assert.equal(normalized?.sun?.sunrise, '06:32');
});

test('天气预警按种类选择图标', () => {
  const svg = buildQqBotCardSvg({
    type: 'weather',
    place: '上海市',
    date: '2026-11-24',
    current: { temp: '15', condition: '多云' },
    days: [],
    alerts: [
      { title: '上海市气象台发布大风蓝色预警信号', level: '蓝色', type: '大风' },
      { title: '上海市气象台发布暴雨黄色预警信号', level: '黄色', type: '暴雨' },
    ],
  });
  assert.match(svg, /data-alert-icon="air"/u);
  assert.match(svg, /data-alert-icon="water"/u);
  assert.doesNotMatch(svg, /stroke-opacity="0.28"/u);
  assert.doesNotMatch(svg, /<circle cx="26" cy="25"/u);
});

test('POI 卡片使用自己的图标和分类语义色', () => {
  const icon =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2ZQAAAABJRU5ErkJggg==';
  const svg = buildQqBotCardSvg({
    type: 'poi',
    label: '临东茶话会',
    category: '餐饮',
    color: '#E86A33',
    iconDataUri: icon,
    description: '测试地点',
    shareUrl: 'https://yct.example.com/map?m=poi-1',
    date: '2026-11-24',
  });
  assert.match(svg, /<rect x="40" y="40" width="88" height="88" rx="14" fill="#E86A33"\/>/u);
  assert.match(svg, /<image x="58" y="58" width="52" height="52" href="data:image\/png;base64,/u);
});

test('GB2312 涂卡按 0-9 行对齐', () => {
  const svg = buildQqBotCardSvg({
    type: 'gb2312',
    date: '2026-11-24',
    // 12 34 → 1、2、3、4 四个数字。
    entries: [{ char: '临', area: 12, position: 34 }],
  });
  const marks = [
    ...svg.matchAll(
      /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="[\d.]+" rx="1" fill="#111817"/gu,
    ),
  ].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  assert.equal(marks.length, 4);
  const scale = 560 / 204;
  // 底图行中心从设计坐标 45.1 开始，每行 9；第一行是数字 0，数字 1 的中心在 54.1。
  const firstCenter = marks[0].y + 1.6 * scale;
  assert.ok(Math.abs(firstCenter - (180 + 54.1 * scale)) < 2, `首位标记中心 y=${firstCenter}`);
  for (let index = 1; index < marks.length; index += 1) {
    const spacing = marks[index].y - marks[index - 1].y;
    assert.ok(Math.abs(spacing - 9 * scale) < 1, `行距应约 ${9 * scale}（实际 ${spacing}）`);
  }
});

test('长昵称不会截掉页眉日期和页脚时间', () => {
  const name = 'AAAAAA【享受美好早八×2】沈局沈段HXD3D0635';
  const svg = buildQqBotCardSvg({
    type: 'fortune',
    name,
    score: 45,
    text: '宜看纪录片',
    date: '2026-11-20',
    reset: false,
    footer: `仅供娱乐｜${name}｜11-20 07:30`,
  });
  assert.match(svg, /· 2026\.11\.20<\/text>/u);
  assert.match(svg, /· 11-20 07:30<\/text>/u);
});

test('机器人在本地渲染卡片 PNG', async () => {
  const png = await renderCardPng({
    type: 'dice',
    count: 2,
    sides: 6,
    bonus: 1,
    rolls: [4, 5],
    total: 10,
    date: '2026-11-18',
    footer: '测试',
  });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('本地 POI 卡片会生成二维码，不依赖网页卡片路由', async () => {
  const png = await renderCardPng({
    type: 'poi',
    label: '测试地点',
    category: '餐饮',
    description: '测试描述',
    shareUrl: 'https://yct.example.com/map?m=test',
    date: '2026-11-18',
  });
  assert.ok(png.length > 10_000);
});
