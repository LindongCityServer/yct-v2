import assert from 'node:assert/strict';
import test from 'node:test';
import { clearHistoryCache, fetchTodayHistory } from '../src/history.mjs';

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sample = {
  11: {
    1117: [
      { year: '1939', title: '<a href="https://baike.baidu.com/item/冬季战争">冬季战争</a>爆发' },
      { year: '1869', title: '苏伊士运河通航' },
      { year: '1970', title: '示例事件' },
    ],
  },
};

test('按上海时区取当天事件并去掉 HTML', async () => {
  clearHistoryCache();
  let requested = '';
  const fetchImpl = async (url) => {
    requested = url;
    return jsonResponse(sample);
  };

  const text = await fetchTodayHistory({
    date: new Date('2026-11-17T12:00:00+08:00'),
    fetchImpl,
  });

  assert.match(requested, /eventsOnHistory\/11\.json/);
  assert.match(text, /历史上的今天（11月17日）/);
  assert.match(text, /1939年 冬季战争爆发/);
  assert.doesNotMatch(text, /<a|href/);
});

test('同一天再次查询命中缓存', async () => {
  clearHistoryCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(sample);
  };
  await fetchTodayHistory({ date: new Date('2026-11-17T12:00:00+08:00'), fetchImpl });
  await fetchTodayHistory({ date: new Date('2026-11-17T18:00:00+08:00'), fetchImpl });
  assert.equal(calls, 1);
});

test('没有事件时给出可读提示', async () => {
  clearHistoryCache();
  await assert.rejects(
    fetchTodayHistory({
      date: new Date('2026-11-17T12:00:00+08:00'),
      fetchImpl: async () => jsonResponse({ 11: {} }),
    }),
    /没有查到历史事件/,
  );
});
