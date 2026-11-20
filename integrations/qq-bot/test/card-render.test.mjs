import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCardPng } from '../src/card-render.mjs';
import { buildQqBotCardSvg } from '../src/card-renderer.mjs';

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
