/**
 * 多维度审计 QQ 机器人随机物料的抽取方案（只模拟抽样，不渲染图片）。
 *
 * 用法：
 *   pnpm qqbot:material:audit --rounds 1000
 *   pnpm qqbot:material:audit --kind metro_line --rounds 500
 *   pnpm qqbot:material:audit --data-source sample --rounds 500
 *
 * 输出：
 *   1. 对象类型：候选池占比 vs 抽样占比；
 *   2. 模板 × 版式 × 样式：可用对象覆盖率、候选数、抽样占比；
 *   3. 版式 / 样式维度；
 *   4. 每个对象可用版式数分布；
 *   5. 抽中最多的对象。
 */
import {
  previewQqBotMaterialSampling,
  resolveQqBotMaterialKind,
  resolveQqBotMaterialSamplingKeys,
  resolveQqBotMaterialTemplate,
  qqBotMaterialTemplateIds,
  type QqBotMaterialResolvedKind,
} from '../apps/web/lib/qq-bot-material';
import { BUS_STOP_TERMINAL_TEMPLATE_ID } from '../apps/web/lib/material-template-ids';
import { listMaterialLocations } from '../apps/web/lib/material-location-source';
import { listMaterialTransitStations } from '../apps/web/lib/material-transit-source';

function readOption(name: string, fallback = ''): string {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index]!;
    if (argument === exact) {
      return process.argv[index + 1] ?? fallback;
    }
    if (argument.startsWith(prefix)) {
      return argument.slice(prefix.length) || fallback;
    }
  }
  return fallback;
}

const kindObjectType: Record<QqBotMaterialResolvedKind, string> = {
  road_sign: 'road',
  address_sign: 'address',
  bus_stop: 'bus',
  metro_line: 'metro',
  custom: 'wayfinding',
};

const objectTypeLabel: Record<string, string> = {
  road: '道路',
  address: '带地址 POI',
  bus: '公交站',
  metro: '地铁线路',
  wayfinding: '导视牌站点',
};

function pct(value: number, total: number): string {
  return `${((value / Math.max(1, total)) * 100).toFixed(1)}%`;
}

function line(...values: Array<string | number>): void {
  console.log(values.map((value) => String(value)).join('  '));
}

const rounds = Number(readOption('rounds', '1000'));
const kind = readOption('kind', 'random');
const dataSource = readOption('data-source', 'server');
const seedPrefix = readOption('seed-prefix', 'audit');

const result = await previewQqBotMaterialSampling({
  rounds,
  kind,
  dataSource,
  seedPrefix,
});
const kindFilters = new Set(
  qqBotMaterialTemplateIds.filter((templateId) => {
    const templateKind = resolveQqBotMaterialKind(templateId);
    return kind === 'random' || templateKind === kind;
  }),
);

console.log(
  `随机物料抽样审计：kind=${kind} · dataSource=${dataSource} · ${result.rounds} 次 · ${result.source.name}`,
);
console.log(
  `候选池：${result.pool.objectCount} 个对象 / ${result.pool.candidateCount} 个候选；按对象等概率。`,
);

const objectCountOf = (objectType: string) => result.pool.objectTypeCounts[objectType] ?? 0;
const layoutCountOf = (layoutCount: string) => result.pool.layoutCountByObject[layoutCount] ?? 0;

console.log('\n=== 0. 原始数据形状（对象是否被重复计数） ===');
try {
  const locations = await listMaterialLocations();
  const roadMarkers = locations.filter(
    (location) => location.categoryId === 'road' && location.coordinate,
  );
  const normalizeLabel = (value: string) => String(value).replace(/\s+/gu, '');
  const uniqueRoads = new Set(roadMarkers.map((location) => normalizeLabel(location.label)));
  console.log(
    `道路标记 ${roadMarkers.length} 个 → 按名称去重 ${uniqueRoads.size} 个（例如同一路名会有多个线段 / 端点标记）。`,
  );
  const stations = await listMaterialTransitStations();
  const uniqueStations = new Set(stations.map((station) => station.stationName));
  console.log(
    `公交站 ${uniqueStations.size} 个 → 按方向展开 ${objectCountOf('bus')} 个对象（同站上下行各算一个对象）。`,
  );
} catch (error) {
  console.log(`数据形状统计失败：${error instanceof Error ? error.message : String(error)}`);
}

console.log('\n=== 1. 对象类型：候选池占比 vs 抽样占比 ===');
line('对象类型', '对象数', '池占比', '候选数', '抽样数', '抽样占比', '偏差');
for (const [objectType, objectCount] of Object.entries(result.pool.objectTypeCounts).sort(
  (left, right) => right[1] - left[1],
)) {
  const drawCount = result.objectTypeCounts[objectType] ?? 0;
  const poolShare = objectCount / result.pool.objectCount;
  const drawShare = drawCount / result.rounds;
  line(
    objectTypeLabel[objectType] ?? objectType,
    objectCount,
    pct(objectCount, result.pool.objectCount),
    result.pool.objectCandidateCounts[objectType] ?? 0,
    drawCount,
    pct(drawCount, result.rounds),
    `${drawShare >= poolShare ? '+' : ''}${((drawShare - poolShare) * 100).toFixed(1)}pp`,
  );
}

const terminalCoverage =
  (result.pool.templateObjectCounts[BUS_STOP_TERMINAL_TEMPLATE_ID] ?? 0) /
  Math.max(1, objectCountOf('bus'));
console.log('\n=== 诊断摘要 ===');
console.log(
  `- 道路 + 公交占对象池 ${pct(objectCountOf('road') + objectCountOf('bus'), result.pool.objectCount)}；` +
    `地铁线路只有 ${objectCountOf('metro')} 个对象（${pct(objectCountOf('metro'), result.pool.objectCount)}），` +
    `带地址 POI 有 ${objectCountOf('address')} 个。`,
);
console.log(
  `- ${layoutCountOf('1')} 个对象只有 1 个版式（${pct(layoutCountOf('1'), result.pool.objectCount)}），` +
    `${layoutCountOf('5')} 个对象有 5 个版式（${pct(layoutCountOf('5'), result.pool.objectCount)}）；` +
    '同一对象内按版式等概率，会让多版式对象的每个版式概率被摊薄。',
);
console.log(
  `- 公交始发终到版式只覆盖 ${(terminalCoverage * 100).toFixed(1)}% 的公交对象；` +
    '线路详情 / 横版详情覆盖 100%，所以它们天然比始发终到更容易出现。',
);

console.log('\n=== 2. 模板 × 版式 × 样式 ===');
line('模板', '版式', '样式', '可用对象/同族总数', '覆盖率', '候选数', '抽样数', '抽样占比');
const templateRows = qqBotMaterialTemplateIds
  .filter((templateId) => kindFilters.has(templateId))
  .map((templateId) => {
    const templateKind = resolveQqBotMaterialKind(templateId);
    const template = resolveQqBotMaterialTemplate(templateId);
    const { layoutKey, styleKey } = resolveQqBotMaterialSamplingKeys(templateId);
    const objectCount = result.pool.templateObjectCounts[templateId] ?? 0;
    const familyObjectCount = result.pool.objectTypeCounts[kindObjectType[templateKind]] ?? 0;
    return {
      templateId,
      title: template.title,
      kind: templateKind,
      layoutKey,
      styleKey,
      objectCount,
      familyObjectCount,
      candidateCount: result.pool.templateCandidateCounts[templateId] ?? 0,
      drawCount: result.templateCounts[templateId] ?? 0,
    };
  })
  .sort((left, right) => right.drawCount - left.drawCount);

for (const row of templateRows) {
  line(
    `${row.title}`,
    row.layoutKey,
    row.styleKey,
    `${row.objectCount}/${row.familyObjectCount}`,
    pct(row.objectCount, row.familyObjectCount),
    row.candidateCount,
    row.drawCount,
    pct(row.drawCount, result.rounds),
  );
}

console.log('\n=== 3. 版式维度 ===');
line('版式', '可用对象数', '候选数', '抽样数', '抽样占比');
for (const [layoutKey, objectCount] of Object.entries(result.pool.layoutObjectCounts).sort(
  (left, right) => (result.layoutCounts[right[0]] ?? 0) - (result.layoutCounts[left[0]] ?? 0),
)) {
  if (!templateRows.some((row) => row.layoutKey === layoutKey)) {
    continue;
  }
  line(
    layoutKey,
    objectCount,
    result.pool.layoutCandidateCounts[layoutKey] ?? 0,
    result.layoutCounts[layoutKey] ?? 0,
    pct(result.layoutCounts[layoutKey] ?? 0, result.rounds),
  );
}

console.log('\n=== 4. 样式维度 ===');
line('样式', '可用对象数', '候选数', '抽样数', '抽样占比');
for (const [styleKey, objectCount] of Object.entries(result.pool.styleObjectCounts).sort(
  (left, right) => (result.styleCounts[right[0]] ?? 0) - (result.styleCounts[left[0]] ?? 0),
)) {
  if (!templateRows.some((row) => row.styleKey === styleKey)) {
    continue;
  }
  line(
    styleKey,
    objectCount,
    result.pool.styleCandidateCounts[styleKey] ?? 0,
    result.styleCounts[styleKey] ?? 0,
    pct(result.styleCounts[styleKey] ?? 0, result.rounds),
  );
}

console.log('\n=== 5. 每个对象可用的版式数 ===');
for (const [layoutCount, objectCount] of Object.entries(result.pool.layoutCountByObject).sort(
  (left, right) => Number(left[0]) - Number(right[0]),
)) {
  line(`${layoutCount} 个版式`, `${objectCount} 个对象`, pct(objectCount, result.pool.objectCount));
}

console.log('\n=== 6. 抽中最多的对象（前 10） ===');
for (const [objectKey, drawCount] of Object.entries(result.objectCounts)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 10)) {
  line(objectKey, drawCount, pct(drawCount, result.rounds));
}

console.log(
  '\n说明：第 1 节用于判断“按对象等概率”是否被数据量倾斜；第 2/3/4 节用于判断某类版式/样式是否因为“可用对象少”而低概率；第 5 节展示对象内部版式数对概率的影响。',
);
