import assert from 'node:assert/strict';
import { materialTransitNetworkProjectUpdateSchema } from '../../packages/schemas/src/materials';
import {
  buildMetroWayfindingTemplateExamples,
  type MetroWayfindingExample,
} from '../../apps/web/lib/metro-wayfinding-examples';
import { buildMetroExampleLineExits } from '../../apps/web/lib/metro-wayfinding-station-exits';
import {
  enrichTransitStationDetailsWithExitMarkers,
  markerHasAccessibleElevator,
} from '../../apps/web/lib/transit-station-exit-facilities';
import {
  buildShenyangSamplePanelProfiles,
  getShenyangSampleStationProfile,
  SHENYANG_SAMPLE_STATION_PROFILES,
} from '../../apps/web/lib/shenyang-sample-station-exits';
import { renderMetroWayfindingSvg } from '../../apps/web/lib/metro-wayfinding-svg';
import { resolveMetroWayfindingLayoutSizing } from '../../apps/web/lib/metro-wayfinding';

let passed = 0;
function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`✅ ${name}`);
}

function largeTextValues(example: MetroWayfindingExample | undefined): string[] {
  return (example?.project.layout.rows ?? [])
    .flat()
    .flatMap((element) => (element.type === 'largeText' ? [element.value] : []));
}

function largeTextCodeValues(example: MetroWayfindingExample | undefined): string[] {
  return (example?.project.layout.rows ?? [])
    .flat()
    .flatMap((element) =>
      element.type === 'largeText' ? [`${element.value}${element.suffix ?? ''}`] : [],
    );
}

function textElements(example: MetroWayfindingExample | undefined) {
  return (example?.project.layout.rows ?? []).flat().filter((element) => element.type === 'text');
}

function boxedGridCodes(example: MetroWayfindingExample | undefined): string[] {
  const grid = textElements(example).find((element) =>
    element.rows.some(
      (row) => row.kind === 'main' && row.segments.some((segment) => segment.kind === 'boxed'),
    ),
  );
  if (!grid) return [];
  return grid.rows.flatMap((row) =>
    row.kind === 'main'
      ? row.segments.flatMap((segment) => (segment.kind === 'boxed' ? [segment.value] : []))
      : [],
  );
}

function allBoxedGridCodes(example: MetroWayfindingExample | undefined): string[] {
  return textElements(example).flatMap((element) =>
    element.rows.flatMap((row) =>
      row.kind === 'main'
        ? row.segments.flatMap((segment) => (segment.kind === 'boxed' ? [segment.value] : []))
        : [],
    ),
  );
}

function descriptionRows(
  example: MetroWayfindingExample | undefined,
): { align: string; rows: Array<{ main: string; secondary: string }> } | undefined {
  const element = textElements(example).find(
    (candidate) =>
      candidate.rows.some(
        (row) => row.kind === 'main' && row.segments.some((segment) => segment.value.trim()),
      ) && candidate.rows.some((row) => row.kind === 'secondary'),
  );
  if (!element) return undefined;
  const rows: Array<{ main: string; secondary: string }> = [];
  let current: { main: string; secondary: string } | undefined;
  for (const row of element.rows) {
    if (row.kind === 'main') {
      current = { main: row.segments.map((segment) => segment.value).join(''), secondary: '' };
      rows.push(current);
    } else if (current) {
      current.secondary = row.value;
    }
  }
  return { align: element.align, rows };
}

function cardElements(example: MetroWayfindingExample | undefined) {
  return example?.project.layout.rows.flat() ?? [];
}

check('出口资料 schema 接受完整资料', () => {
  const result = materialTransitNetworkProjectUpdateSchema.safeParse({
    stationProfiles: [
      {
        nodeId: 'stn_1',
        structure: {
          position: 'underground',
          platformType: 'island',
          layers: [{ name: 'B1', usage: 'concourse', order: 0 }],
        },
        exits: [
          { code: 'A', orientation: 'NW', status: 'open', description: '朝阳街路东' },
          { code: 'B', orientation: 'SE', status: 'closed' },
        ],
      },
    ],
  });
  assert.equal(result.success, true);
});

check('出口编号重复会被 schema 拒绝', () => {
  const result = materialTransitNetworkProjectUpdateSchema.safeParse({
    stationProfiles: [{ nodeId: 'stn_1', exits: [{ code: 'A' }, { code: 'A' }] }],
  });
  assert.equal(result.success, false);
});

check('空更新会被 schema 拒绝', () => {
  assert.equal(materialTransitNetworkProjectUpdateSchema.safeParse({}).success, false);
});

check('服务器站内资料按线路映射出口，电梯取全站并集', () => {
  const mapped = buildMetroExampleLineExits(
    '测试站',
    [
      { id: 'L1', name: '1号线', color: '#E4002B' },
      { id: 'L2', name: '2号线', color: '#0072BC' },
    ],
    [
      {
        stationName: '测试站',
        lineName: '1号线',
        exits: [
          { code: 'A', direction: 'upwards' },
          { code: 'B', direction: 'downwards' },
        ],
        facilities: [],
      },
      {
        stationName: '测试站',
        lineName: '2号线',
        exits: [
          { code: 'C', direction: 'upwards' },
          { code: 'D', direction: 'downwards' },
        ],
        facilities: [{ type: 'elevator' }],
      },
    ] as never,
  );
  assert.deepEqual(
    mapped.map((entry) => entry.exits.map((exit) => exit.code)),
    [
      ['A', 'B'],
      ['C', 'D'],
    ],
  );
  assert.equal(
    mapped.every((entry) => entry.hasElevator),
    true,
  );
});

check('出口 POI 的无障碍电梯设施会挂回出口，全角编号也能匹配', () => {
  const details = [
    {
      stationName: '测试站',
      lineName: '1号线',
      exits: [{ code: 'A' }, { code: 'B' }, { code: 'C' }],
      facilities: [],
    },
  ] as never;
  const markers = [
    {
      id: 'm-a',
      label: '测试站-A出口',
      categoryId: 'metro-entrance',
      facilities: [{ symbolIcon: 'elevator', description: '无障碍电梯' }],
    },
    {
      id: 'm-b',
      label: '测试站-B出口',
      categoryId: 'metro-entrance',
      facilities: [{ symbolIcon: 'elevator', description: '1F、2F' }],
    },
    {
      id: 'm-c',
      label: '测试站-Ｃ出口',
      categoryId: 'metro-entrance',
      facilities: [{ symbolIcon: 'accessible', description: '轮椅升降机' }],
    },
  ] as never;
  const enriched = enrichTransitStationDetailsWithExitMarkers(details, markers) as Array<{
    exits: Array<{
      code: string;
      facilities?: Array<{ description: string }>;
      hasAccessibleElevator?: boolean;
    }>;
  }>;
  assert.equal(enriched[0]?.exits[0]?.hasAccessibleElevator, true);
  assert.equal(enriched[0]?.exits[0]?.facilities?.[0]?.description, '无障碍电梯');
  assert.equal(enriched[0]?.exits[1]?.hasAccessibleElevator, false);
  assert.equal(enriched[0]?.exits[2]?.hasAccessibleElevator, true);
});

check('placeMarkerId 优先于站名+编号标签', () => {
  const enriched = enrichTransitStationDetailsWithExitMarkers(
    [
      {
        stationName: '测试站',
        lineName: '1号线',
        exits: [{ code: 'A', placeMarkerId: 'm-by-id' }],
        facilities: [],
      },
    ] as never,
    [
      {
        id: 'm-by-label',
        label: '测试站-A出口',
        categoryId: 'metro-entrance',
        facilities: [{ symbolIcon: 'elevator', description: '1F、2F' }],
      },
      {
        id: 'm-by-id',
        label: '其他标签',
        categoryId: 'metro-entrance',
        facilities: [{ symbolIcon: 'elevator', description: '无障碍电梯' }],
      },
    ] as never,
  ) as Array<{ exits: Array<{ hasAccessibleElevator?: boolean }> }>;
  assert.equal(enriched[0]?.exits[0]?.hasAccessibleElevator, true);
  assert.equal(
    markerHasAccessibleElevator({
      facilities: [{ symbolIcon: 'accessible', description: '轮椅升降机' }],
    } as never),
    true,
  );
});

const serverStation = {
  name: '测试站',
  secondaryName: 'CESHIZHAN',
  lines: [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ],
  lineExits: [
    {
      lineId: 'L1',
      lineName: '1号线',
      hasElevator: true,
      exits: [
        { code: 'A', direction: 'upwards' as const, description: 'A口无障碍电梯' },
        { code: 'B', direction: 'downwards' as const },
        { code: 'C', direction: 'upwards' as const },
      ],
    },
    {
      lineId: 'L2',
      lineName: '2号线',
      exits: [{ code: 'C' }, { code: 'D' }, { code: 'E' }, { code: 'F' }, { code: 'G' }],
    },
  ],
};
const serverExamples = buildMetroWayfindingTemplateExamples(serverStation, 'L1');
const serverByRemark = new Map(serverExamples.map((example) => [example.source.remark, example]));

check('线路与出口方向只填当前线路没有的出口，宽度够时保留大文本', () => {
  const example = serverByRemark.get('线路与出口方向');
  assert.deepEqual(largeTextValues(example), ['D', 'E', 'F', 'G']);
  assert.deepEqual(boxedGridCodes(example), []);
});

check('线路色换乘出口只填当前线路没有的出口', () => {
  assert.deepEqual(largeTextValues(serverByRemark.get('线路色换乘出口')), ['D', 'E', 'F', 'G']);
  assert.deepEqual(boxedGridCodes(serverByRemark.get('线路色换乘出口')), []);
});

check('线路号侧填当前线路没有的出口，另一侧填当前线路出口', () => {
  const example = serverByRemark.get('线路号与双侧出口');
  assert.deepEqual(largeTextValues(example).filter(Boolean), ['1']);
  assert.deepEqual(allBoxedGridCodes(example), ['D', 'F', 'E', 'G', 'A', 'C', 'B']);
});

check('双侧出口编号按 direction 分左右，不留空大文本', () => {
  assert.deepEqual(largeTextValues(serverByRemark.get('双侧出口编号')).filter(Boolean), [
    'A',
    'C',
    'B',
  ]);
});

check('出口编号与电梯填有电梯的出口，开头不再加弹性空白', () => {
  assert.deepEqual(largeTextValues(serverByRemark.get('出口编号与电梯')).filter(Boolean), ['A']);
  const elements = cardElements(serverByRemark.get('出口编号与电梯'));
  assert.equal(elements[0]?.type, 'arrow');
  assert.equal(
    elements.some((element) => element.type === 'facility' && element.iconId === 'elevator'),
    true,
  );
});

check('服务器数据里没有空出口大文本（站外线路标识的空白占位除外）', () => {
  for (const [remark, example] of serverByRemark) {
    if (remark === '站外线路标识') continue;
    assert.equal(largeTextValues(example).filter((value) => !value).length, 0, remark);
  }
});

const noElevatorStation = {
  ...serverStation,
  lineExits: [
    {
      lineId: 'L1',
      lineName: '1号线',
      hasElevator: false,
      exits: [{ code: 'A', direction: 'upwards' as const }],
    },
    { lineId: 'L2', lineName: '2号线', exits: [{ code: 'B' }] },
  ],
};
const noElevatorByRemark = new Map(
  buildMetroWayfindingTemplateExamples(noElevatorStation, 'L1').map((example) => [
    example.source.remark,
    example,
  ]),
);

check('没有电梯时不生成「出口编号与电梯」', () => {
  assert.equal(noElevatorByRemark.has('出口编号与电梯'), false);
});

const customStation = {
  name: '自定义站',
  lines: [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ],
  exits: [
    { code: 'A', direction: 'upwards' as const },
    { code: 'B', direction: 'downwards' as const },
    { code: 'C', direction: 'upwards' as const },
  ],
};
const customByRemark = new Map(
  buildMetroWayfindingTemplateExamples(customStation, 'L1').map((example) => [
    example.source.remark,
    example,
  ]),
);

check('自定义线网没有「其它线路出口」时不留下空大文本', () => {
  assert.deepEqual(largeTextValues(customByRemark.get('线路与出口方向')), []);
  assert.deepEqual(largeTextValues(customByRemark.get('线路色换乘出口')), []);
});

check('自定义线网双侧出口仍按 direction 填当前线路出口', () => {
  assert.deepEqual(largeTextValues(customByRemark.get('双侧出口编号')).filter(Boolean), [
    'A',
    'C',
    'B',
  ]);
});

const descriptionStation = {
  name: '描述站',
  lines: [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ],
  lineExits: [
    {
      lineId: 'L1',
      lineName: '1号线',
      exits: [
        {
          code: 'A',
          direction: 'upwards' as const,
          description: '青年大街 路东',
          hasAccessibleElevator: true,
        },
        {
          code: 'B',
          direction: 'downwards' as const,
          description: '建业街 路东/普济路 路北',
        },
        { code: 'C', direction: 'upwards' as const },
        {
          code: 'D',
          direction: 'upwards' as const,
          description: '青年大街 路东/QINGNIANDAJIE East Side',
        },
      ],
    },
    { lineId: 'L2', lineName: '2号线', exits: [] },
  ],
};
const descriptionByRemark = new Map(
  buildMetroWayfindingTemplateExamples(descriptionStation, 'L1').map((example) => [
    example.source.remark,
    example,
  ]),
);

check('出口编号与站内设施按出口分别生成卡片', () => {
  assert.ok(descriptionByRemark.has('出口编号与站内设施 · A'));
  assert.ok(descriptionByRemark.has('出口编号与站内设施 · B'));
  assert.ok(descriptionByRemark.has('出口编号与站内设施 · C'));
  assert.equal(descriptionByRemark.has('出口编号与站内设施'), false);
});

check('有中英描述的出口：中文主行 + 紧跟英文副行，左对齐', () => {
  assert.deepEqual(largeTextValues(descriptionByRemark.get('出口编号与站内设施 · A')), ['A']);
  assert.deepEqual(descriptionRows(descriptionByRemark.get('出口编号与站内设施 · A')), {
    align: 'left',
    rows: [{ main: '青年大街 路东', secondary: 'QINGNIANDAJIE East-side' }],
  });
});

check('多段中文各成一对：主行后面紧跟自己的英文副行', () => {
  assert.deepEqual(descriptionRows(descriptionByRemark.get('出口编号与站内设施 · B')), {
    align: 'left',
    rows: [
      { main: '建业街 路东', secondary: 'JIANYEJIE East-side' },
      { main: '普济路 路北', secondary: 'PUJILU North-side' },
    ],
  });
});

check('已有中英对照的描述直接用英文副行', () => {
  assert.deepEqual(descriptionRows(descriptionByRemark.get('出口编号与站内设施 · D')), {
    align: 'left',
    rows: [{ main: '青年大街 路东', secondary: 'QINGNIANDAJIE East-side' }],
  });
});

check('没有描述的出口用「出口/EXIT」占位', () => {
  assert.deepEqual(largeTextValues(descriptionByRemark.get('出口编号与站内设施 · C')), ['C']);
  assert.deepEqual(descriptionRows(descriptionByRemark.get('出口编号与站内设施 · C')), {
    align: 'left',
    rows: [{ main: '出口', secondary: 'EXIT' }],
  });
});

check('出口卡不再用开头弹性空白，电梯图标按出口有无决定', () => {
  const withElevator = cardElements(descriptionByRemark.get('出口编号与站内设施 · A'));
  assert.equal(withElevator[0]?.type, 'facility');
  assert.equal(
    withElevator.some((element) => element.type === 'facility' && element.iconId === 'elevator'),
    true,
  );

  const withoutElevator = cardElements(descriptionByRemark.get('出口编号与站内设施 · B'));
  assert.equal(withoutElevator[0]?.type, 'facility');
  assert.equal(
    withoutElevator.some((element) => element.type === 'facility' && element.iconId === 'elevator'),
    false,
  );
});

check('沈阳示例线网 144 站都有出口资料', () => {
  assert.equal(SHENYANG_SAMPLE_STATION_PROFILES.length, 144);
});

check('示例车站资料包含按线路分组和 3 号线地上结构', () => {
  const profiles = buildShenyangSamplePanelProfiles();
  assert.equal(profiles.length, 144);
  assert.equal(
    profiles.every((profile) => profile.structure),
    true,
  );
  const youth = profiles.find((profile) => profile.nodeId === 'stn_PXpxx35kME');
  assert.equal(youth?.lineGroups?.length, 2);
  assert.equal(youth?.exits?.length, 4);
  assert.equal(youth?.structure?.position, 'underground');
  const lidaProfile = profiles.find(
    (profile) =>
      profile.structure?.overGround &&
      profile.lineGroups?.some((group) => group.lineName === '3号线'),
  );
  assert.ok(lidaProfile);
});

check('沈阳示例线网按线路分组，出口按下一站/上一站分方向', () => {
  const profile = getShenyangSampleStationProfile('青年大街');
  assert.ok(profile);
  assert.deepEqual(
    profile.lineGroups.map((group) => group.lineName),
    ['1号线', '2号线'],
  );
  const line1 = profile.lineGroups[0]!;
  assert.deepEqual(
    line1.exits.map((exit) => [exit.code, exit.direction]),
    [
      ['A', 'upwards'],
      ['B', 'downwards'],
      ['C', 'downwards'],
      ['D', 'upwards'],
    ],
  );
  const line2 = profile.lineGroups[1]!;
  assert.deepEqual(
    line2.exits.map((exit) => [exit.code, exit.direction]),
    [
      ['A', 'downwards'],
      ['B', 'downwards'],
      ['C', 'upwards'],
      ['D', 'upwards'],
    ],
  );

  const lines = profile.lineGroups.map((group) => ({
    id: group.lineKey,
    name: group.lineName,
    color: '#B63F1F',
  }));
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: profile.stationName,
      lines,
      lineExits: profile.lineGroups.map((group) => ({
        lineId: group.lineKey,
        lineName: group.lineName,
        hasElevator: group.exits.some((exit) => exit.hasAccessibleElevator),
        exits: group.exits,
      })),
    },
    'shenyang:sy1',
  );
  const byRemark = new Map(examples.map((example) => [example.source.remark, example]));
  assert.deepEqual(largeTextValues(byRemark.get('出口编号与电梯')).filter(Boolean), ['A']);
  assert.deepEqual(largeTextValues(byRemark.get('双侧出口编号')).filter(Boolean), [
    'A',
    'D',
    'B',
    'C',
  ]);
  const cardA = cardElements(byRemark.get('出口编号与站内设施 · A'));
  assert.equal(cardA[0]?.type, 'facility');
  assert.equal(
    cardA.some((element) => element.type === 'facility' && element.iconId === 'elevator'),
    true,
  );
});

check('沈阳3号线李达—余良按线路左右侧分组，A1/A2 合并为 A', () => {
  const profile = getShenyangSampleStationProfile('李达');
  assert.ok(profile);
  const line3 = profile.lineGroups.find((group) => group.lineName === '3号线');
  assert.ok(line3);
  assert.deepEqual(
    line3.exits.map((exit) => [exit.code, exit.direction]),
    [
      ['A1', 'upwards'],
      ['A2', 'upwards'],
      ['B1', 'downwards'],
      ['B2', 'downwards'],
    ],
  );
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: profile.stationName,
      lines: profile.lineGroups.map((group) => ({
        id: group.lineKey,
        name: group.lineName,
        color: '#B63F1F',
      })),
      lineExits: profile.lineGroups.map((group) => ({
        lineId: group.lineKey,
        lineName: group.lineName,
        hasElevator: group.exits.some((exit) => exit.hasAccessibleElevator),
        exits: group.exits,
      })),
    },
    line3.lineKey,
  );
  const sides = examples.find((example) => example.source.remark === '双侧出口编号');
  assert.deepEqual(largeTextValues(sides).filter(Boolean), ['A', 'B']);
});

check('双侧出口按整体宽度不足才转两行方框，左侧左对齐、右侧右对齐并交替排', () => {
  const lines = [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ];
  const exits = Array.from({ length: 12 }, (_, index) => ({
    code: String.fromCharCode(65 + index),
    direction: index % 2 === 0 ? ('upwards' as const) : ('downwards' as const),
    description: '路东',
  }));
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: '宽度测试站',
      lines,
      lineExits: [
        { lineId: 'L1', lineName: '1号线', exits },
        { lineId: 'L2', lineName: '2号线', exits: [] },
      ],
    },
    'L1',
  );
  const sides = examples.find((example) => example.source.remark === '双侧出口编号');
  const grids = textElements(sides).filter((element) =>
    element.rows.some(
      (row) => row.kind === 'main' && row.segments.some((segment) => segment.kind === 'boxed'),
    ),
  );
  assert.equal(grids.length, 2);
  assert.deepEqual(
    grids.map((grid) => grid.align),
    ['left', 'right'],
  );
  assert.deepEqual(
    grids.map((grid) =>
      grid.rows.map((row) =>
        row.kind === 'main'
          ? row.segments.flatMap((segment) => (segment.kind === 'boxed' ? [segment.value] : []))
          : [],
      ),
    ),
    [
      [
        ['A', 'E', 'I'],
        ['C', 'G', 'K'],
      ],
      [
        ['B', 'F', 'J'],
        ['D', 'H', 'L'],
      ],
    ],
  );
});

check('L1/L2 不参与 A1/A2 的合并', () => {
  const lines = [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ];
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: 'L口测试站',
      lines,
      lineExits: [
        {
          lineId: 'L1',
          lineName: '1号线',
          exits: [
            { code: 'A1', direction: 'upwards', description: '路东' },
            { code: 'L1', direction: 'upwards', description: '路东' },
            { code: 'L2', direction: 'downwards', description: '路西' },
          ],
        },
        { lineId: 'L2', lineName: '2号线', exits: [] },
      ],
    },
    'L1',
  );
  const sides = examples.find((example) => example.source.remark === '双侧出口编号');
  assert.deepEqual(largeTextCodeValues(sides).filter(Boolean), ['A', 'L1', 'L2']);
});

check('双侧出口只有一侧有出口时移除空侧和分割线', () => {
  const lines = [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ];
  const build = (exits: Array<{ code: string; direction: 'upwards' | 'downwards' }>) =>
    buildMetroWayfindingTemplateExamples(
      {
        name: '单侧测试站',
        lines,
        lineExits: [
          { lineId: 'L1', lineName: '1号线', exits },
          { lineId: 'L2', lineName: '2号线', exits: [] },
        ],
      },
      'L1',
    ).find((example) => example.source.remark === '双侧出口编号');

  const leftOnly = cardElements(
    build([
      { code: 'A', direction: 'upwards' },
      { code: 'B', direction: 'upwards' },
    ]),
  );
  assert.equal(
    leftOnly.some((element) => element.type === 'divider'),
    false,
  );
  assert.equal(
    leftOnly.some((element) => element.type === 'arrow' && element.iconId === 'east'),
    false,
  );

  const rightOnly = cardElements(build([{ code: 'C', direction: 'downwards' }]));
  assert.equal(
    rightOnly.some((element) => element.type === 'divider'),
    false,
  );
  assert.equal(
    rightOnly.some((element) => element.type === 'arrow' && element.iconId === 'west'),
    false,
  );
  assert.equal(
    rightOnly.some((element) => element.type === 'arrow' && element.iconId === 'east'),
    true,
  );

  const bothEmpty = cardElements(build([]));
  assert.equal(
    bothEmpty.some((element) => element.type === 'divider'),
    false,
  );
  assert.ok(bothEmpty.length > 0);
});

check('奥体中心 B2 出口卡去掉弹性空白后不再压缩长副文本', () => {
  const profile = getShenyangSampleStationProfile('奥体中心');
  assert.ok(profile);
  const line = profile.lineGroups.find((group) => group.lineName === '2号线');
  assert.ok(line);
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: profile.stationName,
      lines: profile.lineGroups.map((group) => ({
        id: group.lineKey,
        name: group.lineName,
        color: '#B63F1F',
      })),
      lineExits: profile.lineGroups.map((group) => ({
        lineId: group.lineKey,
        lineName: group.lineName,
        hasElevator: group.exits.some((exit) => exit.hasAccessibleElevator),
        exits: group.exits,
      })),
    },
    line.lineKey,
  );
  const card = examples.find((example) => example.source.remark === '出口编号与站内设施 · B2');
  assert.ok(card);
  const elements = card.project.layout.rows.flat();
  assert.equal(elements[0]?.type, 'facility');
  assert.equal(
    resolveMetroWayfindingLayoutSizing(elements, card.project.canvas.widthM * 128).textScaleX,
    1,
  );
});

check('出口编号的第一段字母/数字作主字，后续部分作下标', () => {
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: '测试站',
      lines: [
        { id: 'L1', name: '1号线', color: '#E4002B' },
        { id: 'L2', name: '2号线', color: '#0072BC' },
      ],
      lineExits: [
        {
          lineId: 'L1',
          lineName: '1号线',
          exits: [
            { code: 'C1', direction: 'upwards', description: '路东' },
            { code: 'L1', direction: 'downwards', description: '路西' },
          ],
        },
        { lineId: 'L2', lineName: '2号线', exits: [] },
      ],
    },
    'L1',
  );
  for (const [remark, main, suffix] of [
    ['出口编号与站内设施 · C1', 'C', '1'],
    ['出口编号与站内设施 · L1', 'L', '1'],
  ] as const) {
    const example = examples.find((item) => item.source.remark === remark);
    const largeText = example?.project.layout.rows
      .flat()
      .find((element) => element.type === 'largeText');
    assert.equal(largeText && largeText.type === 'largeText' ? largeText.value : undefined, main);
    assert.equal(
      largeText && largeText.type === 'largeText' ? largeText.suffix : undefined,
      suffix,
    );
  }
});

check('方框/圆框大文本横向不够时等比缩小，不再压成瘦长条', () => {
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: '测试站',
      lines: [
        { id: 'L1', name: '1号线', color: '#E4002B' },
        { id: 'L2', name: '2号线', color: '#0072BC' },
      ],
      lineExits: [
        {
          lineId: 'L1',
          lineName: '1号线',
          exits: [
            {
              code: 'A',
              direction: 'upwards',
              description: '非常长的中文描述文本/EXTREMELY LONG ENGLISH DESCRIPTION',
            },
          ],
        },
        { lineId: 'L2', lineName: '2号线', exits: [] },
      ],
    },
    'L1',
  );
  const example = examples.find((item) => item.source.remark === '出口编号与站内设施 · A');
  assert.ok(example);
  const layout = {
    ...example.project.layout,
    rows: example.project.layout.rows.map((row) =>
      row.filter((element) => ['largeText', 'text', 'space'].includes(element.type)),
    ),
  };
  const sizing = resolveMetroWayfindingLayoutSizing(layout.rows[0]!, 300);
  assert.ok(sizing.textScaleX < 1);
  const svg = renderMetroWayfindingSvg(JSON.stringify(layout), 300, 128, {} as never);
  const scales = [...svg.matchAll(/translate\([-\d.]+ [-\d.]+\) scale\(([-\d.]+) ([-\d.]+)\)/g)]
    .map((match) => [Number(match[1]), Number(match[2])])
    .filter(([scaleX]) => scaleX > 0 && scaleX < 1);
  assert.ok(scales.length > 0);
  assert.equal(scales[0]![0], scales[0]![1]);
});

check('地上站加空调候车室进站模板，其他站加出口与上楼出站模板', () => {
  const lines = [
    { id: 'L1', name: '1号线', color: '#E4002B' },
    { id: 'L2', name: '2号线', color: '#0072BC' },
  ];
  const groundExamples = buildMetroWayfindingTemplateExamples(
    { name: '地面站', lines, overGround: true },
    'L1',
  );
  const waiting = groundExamples.find((example) => example.source.remark === '空调候车室');
  assert.ok(waiting);
  assert.equal(waiting.project.canvas.widthM, 5);
  const waitingElements = waiting.project.layout.rows.flat();
  assert.equal(waitingElements[0]?.type, 'arrow');
  assert.equal(
    waitingElements.some(
      (element) => element.type === 'facility' && element.iconId === 'waiting-room',
    ),
    true,
  );
  const waitingText = waitingElements.find((element) => element.type === 'text');
  assert.equal(waitingText?.type === 'text' ? waitingText.align : undefined, 'left');
  assert.equal(
    waitingText?.type === 'text'
      ? waitingText.rows
          .filter((row) => row.kind === 'main')
          .flatMap((row) => row.segments.map((segment) => segment.value))
          .join('')
      : undefined,
    '空调候车室',
  );
  assert.equal(
    waitingElements.some((element) => element.type === 'space' && element.mode === 'flex'),
    true,
  );

  const undergroundExamples = buildMetroWayfindingTemplateExamples({ name: '地下站', lines }, 'L1');
  const upstairs = undergroundExamples.find((example) => example.source.remark === '出口与上楼');
  assert.ok(upstairs);
  assert.equal(upstairs.project.canvas.widthM, 9);
  const upstairsElements = upstairs.project.layout.rows.flat();
  assert.equal(upstairsElements[0]?.type, 'arrow');
  assert.equal(
    upstairsElements.some((element) => element.type === 'facility' && element.iconId === 'exit'),
    true,
  );
  assert.equal(
    upstairsElements.some(
      (element) => element.type === 'facility' && element.iconId === 'escalator',
    ),
    true,
  );
  const upstairsText = upstairsElements.find((element) => element.type === 'text');
  assert.equal(upstairsText?.type === 'text' ? upstairsText.align : undefined, 'left');
});

check('出口描述里的「北口/南口」占位不写进模板文本', () => {
  const examples = buildMetroWayfindingTemplateExamples(
    {
      name: '占位描述站',
      lines: [
        { id: 'L1', name: '1号线', color: '#E4002B' },
        { id: 'L2', name: '2号线', color: '#0072BC' },
      ],
      lineExits: [
        {
          lineId: 'L1',
          lineName: '1号线',
          exits: [{ code: 'A', direction: 'upwards', description: '北口' }],
        },
        { lineId: 'L2', lineName: '2号线', exits: [] },
      ],
    },
    'L1',
  );
  const card = examples.find((example) => example.source.remark === '出口编号与站内设施 · A');
  assert.deepEqual(descriptionRows(card), {
    align: 'left',
    rows: [{ main: '出口', secondary: 'EXIT' }],
  });
});

check('沈阳示例数据里没有「北口/南口」占位描述', () => {
  const placeholders: string[] = [];
  for (const profile of SHENYANG_SAMPLE_STATION_PROFILES) {
    for (const group of profile.lineGroups) {
      for (const exit of group.exits) {
        if (
          exit.description &&
          /^(?:东|南|西|北|东北|东南|西南|西北)口$/u.test(exit.description.trim())
        ) {
          placeholders.push(`${profile.stationName}-${group.lineName}-${exit.code}`);
        }
      }
    }
  }
  assert.deepEqual(placeholders, []);
});

check('没有出口资料时出口类模板不留下空大文本', () => {
  const examples = buildMetroWayfindingTemplateExamples(
    { name: '无出口站', lines: customStation.lines },
    'L1',
  );
  const byRemark = new Map(examples.map((example) => [example.source.remark, example]));
  for (const [remark, example] of byRemark) {
    if (remark === '站外线路标识') continue;
    assert.equal(largeTextValues(example).filter((value) => !value).length, 0, remark);
  }
});

console.log(`\n通过 ${passed} 项。`);
