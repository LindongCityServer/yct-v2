import assert from 'node:assert/strict';
import test from 'node:test';
import { composeAnswer, expandUiBlocks, splitText, toPlainText } from '../src/answer.mjs';

const references = [
  {
    id: 1,
    title: '170路',
    snippet: '临东站 → 猴市中北 · 经过 3 站：临东站 → 中华路 → 猴市中北',
  },
  { id: 2, title: '尚瑞超市(启航店)', snippet: '商业 · 启航路 12 号 · 距临东站 180 格' },
  {
    id: 3,
    title: '170路 加班车',
    snippet: '工作日 · 快速 · 临东站 - 猴市中北 · 08:40 - 09:20 · 2元 · 余票 8',
  },
];

test('把 Markdown 整理成 QQ 纯文本', () => {
  const text = [
    '## 线路',
    '**15 路** 从 [中华路](https://example.com/a) 发车[1]。',
    '',
    '- 首班 06:00',
    '- 末班 21:30',
    '',
    '> 雨雪天可能调整',
  ].join('\n');
  const plain = toPlainText(text);
  assert.equal(
    plain,
    [
      '线路',
      '15 路 从 中华路 发车。',
      '',
      '· 首班 06:00',
      '· 末班 21:30',
      '',
      '雨雪天可能调整',
    ].join('\n'),
  );
  assert.doesNotMatch(plain, /https?:|\[1\]|\*\*|##/);
});

test('打开链接开关后保留 URL', () => {
  const plain = toPlainText('详情见 [公告](https://example.com/b)。', { links: true });
  assert.equal(plain, '详情见 公告（https://example.com/b）。');
});

test('分段优先在句号或换行处切开', () => {
  const segments = splitText('第一句话。第二句话。第三句话。', 12);
  assert.deepEqual(segments, ['第一句话。第二句话。', '第三句话。']);
  assert.ok(segments.every((segment) => segment.length <= 12));
});

test('超长且无标点时按上限硬切', () => {
  const segments = splitText('啊'.repeat(25), 10);
  assert.deepEqual(
    segments.map((segment) => segment.length),
    [10, 10, 5],
  );
});

test('合成回答时附加参考标题并遵守被动回复段数', () => {
  const segments = composeAnswer({
    text: '第一段。'.repeat(8),
    references: [{ title: '中华路站' }, { title: '15 路' }, { title: '中华路站' }],
    segmentChars: 40,
    maxSegments: 2,
  });
  assert.equal(segments.length, 2);
  assert.ok(segments.every((segment) => segment.length <= 40));
  assert.equal(segments[1], '参考：中华路站、15 路');
});

test('聊天模式在句末截断过长回答', () => {
  const segments = composeAnswer({
    text: '第一句。第二句。第三句。第四句。',
    maxChars: 12,
    segmentChars: 100,
  });
  assert.equal(segments.length, 1);
  assert.equal(segments[0], '第一句。第二句。第三句。');
});

test('把 ui 卡片按引用还原成可读文字', () => {
  const text = [
    '附近有 2 家店：',
    '```ui',
    '{"type":"place_list","refs":[2]}',
    '```',
    '线路和班次：',
    '```ui',
    '{"type":"line_strip","ref":1}',
    '{"type":"trip_card","refs":[3]}',
    '```',
  ].join('\n');

  const expanded = expandUiBlocks(text, references);
  assert.match(expanded, /· 尚瑞超市\(启航店\)/);
  assert.match(expanded, /170路：临东站 → 中华路 → 猴市中北/);
  assert.match(expanded, /· 170路 加班车（08:40 → 09:20）/);
  assert.doesNotMatch(expanded, /```ui|\{"type"/);
});

test('引用缺失时只丢掉这一块，正文保留', () => {
  const expanded = expandUiBlocks(
    '前文\n```ui\n{"type":"place_list","refs":[99]}\n```\n后文',
    references,
  );
  assert.match(expanded, /前文/);
  assert.match(expanded, /后文/);
  assert.doesNotMatch(expanded, /99|\{"type"/);
});

test('composeAnswer 不会把卡片 JSON 直接发出去', () => {
  const text = '附近有：\n```ui\n{"type":"place_list","refs":[2]}\n```\n';
  const segments = composeAnswer({
    text,
    references,
    appendSources: false,
    segmentChars: 200,
    maxSegments: 2,
  });
  const joined = segments.join('\n');
  assert.match(joined, /· 尚瑞超市\(启航店\)/);
  assert.doesNotMatch(joined, /\{"type"|```ui/);
});

test('丢弃卡片指令和追问标记', () => {
  const plain = toPlainText(
    '附近有 2 家超市。\n```ui\n{"type":"place_list","refs":[1,2]}\n```\n[[followups]]["末班几点"]',
  );
  assert.equal(plain, '附近有 2 家超市。');
});

test('表格转成自然语言列表', () => {
  const text = [
    '| 线路 | 首班 | 末班 |',
    '| --- | --- | --- |',
    '| 170路 | 06:00 | 21:30 |',
    '| 310路 | 06:30 | 20:00 |',
  ].join('\n');
  const plain = toPlainText(text);
  assert.equal(
    plain,
    ['· 170路：首班 06:00，末班 21:30', '· 310路：首班 06:30，末班 20:00'].join('\n'),
  );
  assert.doesNotMatch(plain, /\|/);
});

test('两列表格省略重复表头', () => {
  const plain = toPlainText('| 项目 | 时间 |\n| --- | --- |\n| 首班 | 06:00 |');
  assert.equal(plain, '· 首班：06:00');
});

test('默认去掉链接和裸域名', () => {
  const plain = toPlainText(
    '详见 https://yct.example.com/a 或 www.example.com，也可访问 yct.shangxiaoguan.top/ask。',
  );
  assert.doesNotMatch(plain, /https?:|www\.|yct\.shangxiaoguan\.top/);
  assert.match(plain, /详见/);
  assert.match(plain, /也可访问。/);
});

test('聊天模式删掉网页操作说明并压到字数上限', () => {
  const text = [
    '从临东站到出生点，最省力的是打车（约 10 分钟、约 ¥12），最省钱的是步行（约 64 分钟）。站内已经预填好了这条路线规划入口，可直接打开查看方案：临东站 → 出生点。',
    '',
    '· 步行直达：距离 4070 格，用时约 64 分钟，换乘/花费 0 次换乘',
    '· 少转弯步行：距离 4729 格，用时约 74 分钟，换乘/花费 0 次换乘',
    '· 少路段打车：距离 4469 格，用时约 10 分钟，换乘/花费 0 次换乘，约 ¥12',
    '',
    '步行的话：从临东站先走 118 格到东进站口（约 2 分钟），再沿道路走约 3952 格即到出生点。',
    '',
    '两点提醒：',
    '· 本次规划只返回了步行和打车方案；到页面上可以再用筛选器试试其他方式。',
    '',
    '打开入口后，选择左侧对应的方案，就能看到逐段导航和到发时刻。',
  ].join('\n');

  const [segment] = composeAnswer({
    text,
    maxChars: 280,
    segmentChars: 900,
    appendSources: false,
  });

  assert.ok(segment.length <= 280, `实际 ${segment.length} 字`);
  assert.doesNotMatch(segment, /打开|页面|入口|筛选器|逐段导航/);
  assert.match(segment, /最省力的是打车/);
  // 截断在完整句子后，不能以省略号结尾。
  assert.match(segment, /[。！？]$/);
  assert.doesNotMatch(segment, /…$/);
});

test('没有可读内容时返回空数组', () => {
  assert.deepEqual(composeAnswer({ text: '```\n\n```' }), []);
});
