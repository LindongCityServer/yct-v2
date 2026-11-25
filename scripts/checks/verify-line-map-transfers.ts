/**
 * 线路图换乘解析层回归测试。
 *
 * 覆盖范围（对应 `apps/web/lib/line-map-transfers.ts` 的契约）：
 * 1. 服务器线网：同名站点 + 同类型线路才算换乘，公交线路绝不能进入地铁线路图；
 * 2. 自定义 RMP：共享换乘站（单个节点两条线）与「同名不同节点」两种建模方式；
 * 3. 没有换乘的线路：`hasLine === true` 且 `transferLines === ''`，
 *    调用方据此提示「该线路没有换乘站」而不是「未选择线路」；
 * 4. 线路解析失败：`hasLine === false`；
 * 5. 输出格式与渲染器 `parseMetroLineMapTransfers` 对齐。
 *
 * 另外在存在真实示例线网（`.tmp/shenyang.json`）时做一次真实数据核对：
 * 沈阳示例线网 3 号线 27 站、4 个换乘站 —— 这个数字是「刷新换乘信息」误报
 * 「当前线路没有可用的换乘信息」的直接反证。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  formatLineMapTransferLines,
  normalizeLineMapStationName,
  resolveLineMapTransfers,
} from '../../apps/web/lib/line-map-transfers';
import { parseRmpTransitNetworkProject } from '../../apps/web/lib/rmp-transit-network';

let passed = 0;
let failed = 0;
function check(name: string, run: () => void) {
  try {
    run();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`❌ ${name}`);
    console.log(`   ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// 服务器线网
// ---------------------------------------------------------------------------

const serverLines = [
  {
    id: 'metro-1',
    name: '1号线',
    mode: 'metro',
    color: '#B63F1F',
    stations: [
      { stationId: 'm1-a', stationName: '甲' },
      { stationId: 'm1-b', stationName: '乙' },
      { stationId: 'm1-c', stationName: '丙' },
    ],
  },
  {
    id: 'metro-2',
    name: '2号线',
    mode: 'metro',
    color: '#E5703A',
    stations: [
      { stationId: 'm2-a', stationName: '丁' },
      { stationId: 'm2-b', stationName: '乙' },
      { stationId: 'm2-c', stationName: '戊' },
    ],
  },
  {
    id: 'tram-1',
    name: '有轨1号线',
    mode: 'tram',
    color: '#00A0E9',
    stations: [{ stationId: 't1-a', stationName: '乙' }],
  },
  {
    id: 'bus-101',
    name: '101路',
    mode: 'bus',
    color: '#62AA3C',
    stations: [
      { stationId: 'b1-a', stationName: '乙' },
      { stationId: 'b1-b', stationName: '己' },
    ],
  },
  {
    id: 'metro-3',
    name: '3号线',
    mode: 'metro',
    color: '#E6669F',
    stations: [
      { stationId: 'm3-a', stationName: '庚' },
      { stationId: 'm3-b', stationName: '辛' },
    ],
  },
];

console.log('── 1. 服务器线网：只有同类型线路 + 同名站点才算换乘 ──────');

check('地铁线路的换乘只写地铁线路，公交 / 有轨不参与', () => {
  const result = resolveLineMapTransfers({
    source: 'server',
    line: serverLines[0],
    lines: serverLines,
  });
  assert.equal(result.hasLine, true);
  assert.equal(result.transferLines, '乙=2:#E5703A');
  assert.equal(result.stationTransfers.length, 1);
  assert.equal(result.stationTransfers[0]?.stationId, 'm1-b');
  assert.equal(result.stationTransfers[0]?.stationName, '乙');
  assert.deepEqual(
    result.stationTransfers[0]?.lines.map((line) => line.number),
    ['2'],
  );
  assert.ok(!result.transferLines.includes('101'), '公交线路 101 不能出现在地铁换乘里');
});

check('同名不同站 ID 也算换乘（按站名覆盖判定）', () => {
  const result = resolveLineMapTransfers({
    source: 'server',
    line: serverLines[1],
    lines: serverLines,
  });
  assert.equal(result.transferLines, '乙=1:#B63F1F');
});

check('没有换乘的线路：hasLine 为 true、transferLines 为空', () => {
  const result = resolveLineMapTransfers({
    source: 'server',
    line: serverLines[4],
    lines: serverLines,
  });
  assert.equal(result.hasLine, true);
  assert.equal(result.stationCount, 2);
  assert.equal(result.transferLines, '');
  assert.deepEqual(result.stationTransfers, []);
});

check('未选择线路：hasLine 为 false（提示「先选线路」而不是「没有换乘站」）', () => {
  const result = resolveLineMapTransfers({
    source: 'server',
    line: undefined,
    lines: serverLines,
  });
  assert.equal(result.hasLine, false);
  assert.equal(result.transferLines, '');
});

check('兼容只提供 stationNames 的服务端线路对象', () => {
  const result = resolveLineMapTransfers({
    source: 'server',
    line: { id: 'metro-9', name: '9号线', mode: 'metro', stationNames: ['甲', '乙'] },
    lines: [
      { id: 'metro-9', name: '9号线', mode: 'metro', stationNames: ['甲', '乙'] },
      { id: 'metro-10', name: '10号线', mode: 'metro', stationNames: ['乙'] },
    ],
  });
  assert.equal(result.transferLines, '乙=10');
});

// ---------------------------------------------------------------------------
// 自定义 RMP 线网
// ---------------------------------------------------------------------------

interface RmpFixtureLine {
  lineKey: string;
  name: string;
  color: string;
}

function colorTuple(line: RmpFixtureLine): [string, string, string, string] {
  const [city, key] = line.lineKey.split(':');
  return [city!, key!, line.color, '#fff'];
}

function rmpStationNode(input: {
  key: string;
  names: string[];
  x: number;
  y: number;
  line?: RmpFixtureLine;
}) {
  return {
    key: input.key,
    attributes: {
      visible: true,
      zIndex: 5,
      x: input.x,
      y: input.y,
      type: 'kunmingrt-basic',
      'kunmingrt-basic': {
        names: input.names,
        ...(input.line ? { color: colorTuple(input.line) } : {}),
      },
    },
  };
}

function rmpEdge(input: { key: string; source: string; target: string; line: RmpFixtureLine }) {
  return {
    key: input.key,
    source: input.source,
    target: input.target,
    attributes: {
      visible: true,
      zIndex: -5,
      type: 'diagonal',
      style: 'single-color',
      'single-color': { color: colorTuple(input.line) },
      diagonal: { offsetFrom: 0, offsetTo: 0, roundCornerFactor: 10, startFrom: 'from' },
    },
  };
}

const line1 = { lineKey: 'city:sy1', name: '1号线', color: '#B63F1F' };
const line2 = { lineKey: 'city:sy2', name: '2号线', color: '#E5703A' };
const line3 = { lineKey: 'city:sy3', name: '3号线', color: '#E6669F' };
const line4 = { lineKey: 'city:sy4', name: '4号线', color: '#6E3E94' };
const line9 = { lineKey: 'city:sy9', name: '9号线', color: '#017CBF' };

const rmpProject = {
  version: 77,
  graph: {
    nodes: [
      // 1 号线：甲 — 乙（共享换乘节点）— 丙
      rmpStationNode({ key: 'stn_a', names: ['甲', 'A'], x: 0, y: 0, line: line1 }),
      // 换乘节点自身不带配色，线路键完全由相邻边推导（与真实 RMP 一致）。
      rmpStationNode({ key: 'stn_shared', names: ['乙', 'YI'], x: 100, y: 0 }),
      rmpStationNode({ key: 'stn_c', names: ['丙', 'C'], x: 200, y: 0, line: line1 }),
      // 2 号线：丁 — 乙 — 戊
      rmpStationNode({ key: 'stn_d', names: ['丁', 'D'], x: 100, y: 100, line: line2 }),
      rmpStationNode({ key: 'stn_e', names: ['戊', 'E'], x: 100, y: -100, line: line2 }),
      // 3 号线：己 — 庚 — 辛
      rmpStationNode({ key: 'stn_f', names: ['己', 'F'], x: 300, y: 0, line: line3 }),
      rmpStationNode({ key: 'stn_g3', names: ['庚', 'GENG'], x: 400, y: 0, line: line3 }),
      rmpStationNode({ key: 'stn_h', names: ['辛', 'H'], x: 500, y: 0, line: line3 }),
      // 4 号线：同名的「庚」是另一个节点 —— 同名不同节点的换乘建模。
      rmpStationNode({ key: 'stn_g4', names: ['庚', 'GENG'], x: 400, y: -100, line: line4 }),
      rmpStationNode({ key: 'stn_i', names: ['壬', 'I'], x: 500, y: -100, line: line4 }),
      // 9 号线：没有换乘站
      rmpStationNode({ key: 'stn_j', names: ['癸', 'J'], x: 0, y: 300, line: line9 }),
      rmpStationNode({ key: 'stn_k', names: ['子', 'K'], x: 100, y: 300, line: line9 }),
    ],
    edges: [
      rmpEdge({ key: 'e1', source: 'stn_a', target: 'stn_shared', line: line1 }),
      rmpEdge({ key: 'e2', source: 'stn_shared', target: 'stn_c', line: line1 }),
      rmpEdge({ key: 'e3', source: 'stn_d', target: 'stn_shared', line: line2 }),
      rmpEdge({ key: 'e4', source: 'stn_shared', target: 'stn_e', line: line2 }),
      rmpEdge({ key: 'e5', source: 'stn_f', target: 'stn_g3', line: line3 }),
      rmpEdge({ key: 'e6', source: 'stn_g3', target: 'stn_h', line: line3 }),
      rmpEdge({ key: 'e7', source: 'stn_g4', target: 'stn_i', line: line4 }),
      rmpEdge({ key: 'e8', source: 'stn_j', target: 'stn_k', line: line9 }),
    ],
  },
};

const rmpSnapshot = parseRmpTransitNetworkProject(JSON.stringify(rmpProject));
rmpSnapshot.lineNames = [line1, line2, line3, line4, line9].map((line) => ({
  lineKey: line.lineKey,
  name: line.name,
  secondaryName: `Line ${line.lineKey.split(':')[1]!.replace(/^sy/u, '')}`,
}));

console.log('\n── 2. 自定义 RMP：共享节点 + 同名不同节点 ──────────────');

check('共享换乘节点：两条线都识别到对方', () => {
  const line1Result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: line1.lineKey,
    snapshot: rmpSnapshot,
  });
  assert.equal(line1Result.hasLine, true);
  assert.equal(line1Result.transferLines, '乙=2:#E5703A');
  assert.equal(line1Result.stationTransfers[0]?.stationId, 'stn_shared');

  const line2Result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: line2.lineKey,
    snapshot: rmpSnapshot,
  });
  assert.equal(line2Result.transferLines, '乙=1:#B63F1F');
});

check('同名不同节点：按站名兜底识别换乘', () => {
  const result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: line3.lineKey,
    snapshot: rmpSnapshot,
  });
  assert.equal(result.hasLine, true);
  assert.equal(result.transferLines, '庚=4:#6E3E94');
  assert.equal(result.stationTransfers[0]?.stationName, '庚');
});

check('RMP 没有换乘的线路：hasLine 为 true、transferLines 为空', () => {
  const result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: line9.lineKey,
    snapshot: rmpSnapshot,
  });
  assert.equal(result.hasLine, true);
  assert.equal(result.stationCount, 2);
  assert.equal(result.transferLines, '');
});

check('RMP 未知线路键 / 缺少快照：hasLine 为 false', () => {
  assert.equal(
    resolveLineMapTransfers({ source: 'rmp', lineKey: 'city:sy404', snapshot: rmpSnapshot })
      .hasLine,
    false,
  );
  assert.equal(
    resolveLineMapTransfers({ source: 'rmp', lineKey: line1.lineKey, snapshot: undefined }).hasLine,
    false,
  );
});

check('换乘线路数与渲染器一致（单站最多 4 条）', () => {
  const hub = { lineKey: 'city:hub', name: '1号线', color: '#B63F1F' };
  const others = [2, 3, 4, 5, 6].map((number) => ({
    lineKey: `city:l${number}`,
    name: `${number}号线`,
    color: '#E5703A',
  }));
  const nodes = [
    rmpStationNode({ key: 'stn_hub_a', names: ['甲'], x: 0, y: 0, line: hub }),
    rmpStationNode({ key: 'stn_hub_shared', names: ['枢纽'], x: 100, y: 0 }),
    ...others.map((line, index) =>
      rmpStationNode({
        key: `stn_other_${index}`,
        names: [`支${index}`],
        x: 100,
        y: 100 + index * 50,
        line,
      }),
    ),
  ];
  const edges = [
    rmpEdge({ key: 'h0', source: 'stn_hub_a', target: 'stn_hub_shared', line: hub }),
    ...others.map((line, index) =>
      rmpEdge({
        key: `h${index + 1}`,
        source: 'stn_hub_shared',
        target: `stn_other_${index}`,
        line,
      }),
    ),
  ];
  const snapshot = parseRmpTransitNetworkProject(
    JSON.stringify({ version: 77, graph: { nodes, edges } }),
  );
  const result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: hub.lineKey,
    snapshot,
  });
  assert.equal(result.stationTransfers.length, 1);
  assert.equal(result.stationTransfers[0]?.lines.length, 4);
  assert.equal(result.transferLines.split(',').length, 4);
});

// ---------------------------------------------------------------------------
// 输出格式
// ---------------------------------------------------------------------------

console.log('\n── 3. 输出格式（渲染器 parseMetroLineMapTransfers 契约）──');

check('站名去空白、无配色线路只写编号', () => {
  assert.equal(normalizeLineMapStationName(' 乙　站 '), '乙站');
  assert.equal(
    formatLineMapTransferLines([
      {
        stationName: '乙 站',
        lines: [
          { number: '2', color: '#E5703A' },
          { number: '4', color: '' },
        ],
      },
    ]),
    '乙站=2:#E5703A,4',
  );
});

check('同名站只写一条（环线 / 重复站名）', () => {
  assert.equal(
    formatLineMapTransferLines([
      { stationName: '甲', lines: [{ number: '2', color: '#E5703A' }] },
      { stationName: '甲', lines: [{ number: '3', color: '#E6669F' }] },
    ]),
    '甲=2:#E5703A',
  );
});

check('多站换乘以分号分隔、顺序与线路站序一致', () => {
  const result = resolveLineMapTransfers({
    source: 'rmp',
    lineKey: line1.lineKey,
    snapshot: rmpSnapshot,
  });
  assert.match(
    result.transferLines,
    /^[^=;]+=[0-9A-Za-z]+(?::#[0-9A-F]{6})?(?:,[0-9A-Za-z]+(?::#[0-9A-F]{6})?)*$/u,
  );
});

// ---------------------------------------------------------------------------
// 真实示例线网核对（有文件时执行）
// ---------------------------------------------------------------------------

const REAL_SAMPLE_PATH = '.tmp/shenyang.json';
const SAMPLE_FALLBACK_NAMES: Record<string, [string, string]> = {
  stn_VNNsGRDTf9: ['淮河街沈医二院', 'HUAIHEJIESHENYIERYUAN'],
  stn_OBJ6zErfdk: ['中医药大学', 'ZHONGYIYAODAXUE'],
  stn_KcMsq7IsNK: ['合作街', 'HEZUOJIE'],
  stn_HqfRyU013Q: ['沈阳北站', 'SHENYANGBEIZHAN'],
  stn_P0JnfuV6Bu: ['铁西广场', 'TIEXIGUANGCHANG'],
  stn_0yFFOqOEe_: ['太原街', 'TAIYUANJIE'],
  stn_PXpxx35kME: ['青年大街', 'QINGNIANDAJIE'],
  stn_IveDZluXqP: ['滂江街', 'PANGJIANGJIE'],
  stn_lKATsOrbt5: ['大通湖街', 'DATONGHUJIE'],
  stn_dn2SAsJBXZ: ['砂阳', 'SHAYANG'],
  stn_qlkT5VkbRd: ['工业展览馆', 'GONGYEZHANLANGUAN'],
  stn_x9mwSY7T7F: ['江东街', 'JIANGDONGJIE'],
  stn_LxttgPKYoR: ['长白南', 'CHANGBAINAN'],
  stn_Oyp8Ar6Lra: ['奥体中心', 'AOTIZHONGXIN'],
  stn_EyLKeA45CV: ['长青南街', 'CHANGQINGNANJIE'],
};

console.log('\n── 4. 真实沈阳示例线网（可选）──────────────────────────');

if (existsSync(REAL_SAMPLE_PATH)) {
  const snapshot = parseRmpTransitNetworkProject(readFileSync(REAL_SAMPLE_PATH, 'utf8'));
  snapshot.lineNames = [
    { lineKey: 'shenyang:sy1', name: '1号线' },
    { lineKey: 'shenyang:sy2', name: '2号线' },
    { lineKey: 'shenyang:sy3', name: '3号线' },
    { lineKey: 'shenyang:sy4', name: '4号线' },
    { lineKey: 'shenyang:sy9', name: '9号线' },
    { lineKey: 'shenyang:sy10', name: '10号线' },
  ];
  snapshot.nodes = snapshot.nodes.map((node) => {
    const fallback = SAMPLE_FALLBACK_NAMES[node.id];
    return node.kind === 'station' && !node.names.length && fallback
      ? { ...node, names: [...fallback] }
      : node;
  });

  check('3 号线有 27 站、4 个换乘站（刷新按钮不应误报「没有换乘信息」）', () => {
    const result = resolveLineMapTransfers({
      source: 'rmp',
      lineKey: 'shenyang:sy3',
      snapshot,
    });
    assert.equal(result.hasLine, true);
    assert.equal(result.stationCount, 27);
    assert.equal(
      result.transferLines,
      '大通湖街=9:#017CBF;砂阳=4:#6E3E94;工业展览馆=2:#E5703A;江东街=10:#62AA3C',
    );
  });

  check('示例线网每条线路都能解析出线路（不再依赖是否勾选当前站）', () => {
    for (const lineKey of Object.keys(
      snapshot.lineNames.reduce<Record<string, true>>((all, line) => {
        all[line.lineKey] = true;
        return all;
      }, {}),
    )) {
      const result = resolveLineMapTransfers({ source: 'rmp', lineKey, snapshot });
      assert.equal(result.hasLine, true, `${lineKey} 应可解析`);
      assert.ok(result.stationCount > 1, `${lineKey} 站点数应大于 1`);
    }
  });
} else {
  console.log(`（跳过：未找到 ${REAL_SAMPLE_PATH}；该文件不随仓库提交）`);
}

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
