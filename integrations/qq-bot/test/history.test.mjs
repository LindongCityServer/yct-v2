import assert from 'node:assert/strict';
import test from 'node:test';
import { clearHistoryCache, fetchTodayHistory, parseHistoryDateText } from '../src/history.mjs';

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

test('支持查询任意月日', async () => {
  clearHistoryCache();
  let requested = '';
  const text = await fetchTodayHistory({
    dateText: '3月5日',
    fetchImpl: async (url) => {
      requested = url;
      return jsonResponse({
        3: {
          '0305': [{ year: '1963', title: '示例三月事件', type: 'event' }],
        },
      });
    },
  });
  assert.match(requested, /eventsOnHistory\/3\.json/);
  assert.match(text, /历史上的今天（3月5日）/);
  assert.match(text, /1963年 示例三月事件/);
});

test('日期格式支持多种写法并拒绝非法日期', async () => {
  assert.deepEqual(parseHistoryDateText('3月5日'), { month: 3, day: 5 });
  assert.deepEqual(parseHistoryDateText('03-05'), { month: 3, day: 5 });
  assert.deepEqual(parseHistoryDateText('2024/3/5'), { month: 3, day: 5 });
  assert.deepEqual(parseHistoryDateText('2024年2月29日'), { month: 2, day: 29 });
  assert.equal(parseHistoryDateText('2月30日'), null);
  assert.equal(parseHistoryDateText('13月1日'), null);
  assert.equal(parseHistoryDateText('不是日期'), null);
  await assert.rejects(
    fetchTodayHistory({ dateText: '2月30日', fetchImpl: async () => jsonResponse({}) }),
    /日期格式不对/,
  );
});
