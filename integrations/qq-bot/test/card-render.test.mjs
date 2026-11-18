import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCardPng } from '../src/card-render.mjs';

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
