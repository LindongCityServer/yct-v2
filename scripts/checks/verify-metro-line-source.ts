/**
 * 校验「线路编号选择器」不会把 RMP 项目的颜色线路键整体当成编号。
 *
 * 背景：RMP 存档用**颜色**命名线路，`lineKey` 形如 `sh2` / `bj1` / `pjl` / `maglevA`。
 * 它**不是**线路名，但**含有**编号信息：字母前缀是城市代号（`sh` = 上海），
 * 数字部分就是线路编号（`sh2` → 2 号线）。
 *
 * 因此正确的行为是两条：
 *   1. 不能把整个键当编号（`sh2` 展示成「sh2号线」是错的）——剥离字母前缀；
 *   2. 也不能把键整个丢掉（那样就丢了 2 号线这个编号）——数字部分要留下。
 *
 * 已配置正式线路名时优先采信线路名（`snapshot.lineNames`）。
 */
import {
  deriveMetroWayfindingLineIdentity,
  isMetroWayfindingLineNumberLike,
  isMetroWayfindingPseudoLineKey,
  resolveMetroWayfindingLineTemplateOptions,
} from '../../apps/web/lib/metro-wayfinding-line-source';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`);
  }
}

console.log('── 1. 从线路键剥离字母前缀，取数字编号 ─────────');
const DERIVE_CASES: Array<[string, string | undefined, string]> = [
  // [lineKey, 期望编号, 期望建议名]
  ['sh2', '2', '2号线'],
  ['sh1', '1', '1号线'],
  ['sh14', '14', '14号线'],
  ['sh18', '18', '18号线'],
  ['bj1', '1', '1号线'],
  ['sy3', '3', '3号线'],
  ['gz1', '1', '1号线'],
  // 颜色元组的 `[colorKey, colorLabel]` 相同 → lineKey 形如 `sy1:sy1`。
  // 曾经被当成「带命名空间的正式标识」整体保留，产出「sy1号线」。
  ['sy1:sy1', '1', '1号线'],
  ['sy10:sy10', '10', '10号线'],
  // 命名空间后缀是正式编号（单大写字母 + 数字）→ 整段保留，不能削成 `1`。
  ['line:S1', 'S1', 'S1号线'],
  ['line:S2', 'S2', 'S2号线'],
  ['pjl', undefined, 'pjl'],
  ['maglevA', undefined, 'maglevA'],
  ['maglevB', undefined, 'maglevB'],
  ['jsr', undefined, 'jsr'],
  ['stn_sh2', undefined, 'stn_sh2'],
];
for (const [lineKey, expectedNumber, expectedName] of DERIVE_CASES) {
  const derived = deriveMetroWayfindingLineIdentity(lineKey);
  check(
    `「${lineKey}」→ 编号 ${expectedNumber ?? '(无)'} / 名称 ${expectedName}`,
    derived.lineNumber === expectedNumber && derived.suggestedName === expectedName,
  );
}

console.log('\n── 2. 绝不把整个线路键当成编号 ─────────────────');
for (const key of ['sh2', 'bj1', 'sy3']) {
  const derived = deriveMetroWayfindingLineIdentity(key);
  check(`「${key}」的编号不是键本身`, derived.lineNumber !== key);
}
check('「sh2」整体不是合法编号', !isMetroWayfindingLineNumberLike('sh2', 'sh2'));

console.log('\n── 3. 线路键仍应被识别为「非正式线路名」───────');
for (const key of ['sh2', 'bj1', 'pjl', 'maglevA', 'stn_sh2']) {
  check(`「${key}」标记为待确认名称`, isMetroWayfindingPseudoLineKey(key));
}
for (const name of ['1号线', 'S1线', '环线', 'Line 1', 'Airport Express']) {
  check(`「${name}」视为正式线路名`, !isMetroWayfindingPseudoLineKey(name));
}

console.log('\n── 4. 候选列表：未配置名称时用推导编号 ─────────');
const lineKeysByColor = new Map([
  ['#8CC220', 'sh2'],
  ['#E3002B', 'sh1'],
  ['#461D84', 'sh4'],
  ['#B5A2C9', 'pjl'],
]);
const derivedOptions = resolveMetroWayfindingLineTemplateOptions(
  [
    { value: '#8CC220', label: 'sh2 · #8CC220', aliases: [] },
    { value: '#E3002B', label: 'sh1 · #E3002B', aliases: [] },
    { value: '#461D84', label: 'sh4 · #461D84', aliases: [] },
    { value: '#B5A2C9', label: 'pjl · #B5A2C9', aliases: [] },
  ],
  lineKeysByColor,
);
check('未配置名称的线路仍产出候选（不再被丢弃）', derivedOptions.length === 3);
check(
  '编号来自线路键的数字部分',
  derivedOptions.map((line) => line.lineNumber).join(',') === '2,1,4',
);
check(
  '展示名是「N号线」而非工程键',
  derivedOptions.map((line) => line.name).join(',') === '2号线,1号线,4号线',
);
check(
  '候选项标记为推导名',
  derivedOptions.every((line) => line.isDerivedName),
);
check(
  '无编号的 pjl 不产出候选（无从推导编号）',
  !derivedOptions.some((line) => line.name === 'pjl'),
);

console.log('\n── 5. 已配置正式名称时优先采信名称 ─────────────');
const namedOptions = resolveMetroWayfindingLineTemplateOptions(
  [
    { value: '#8CC220', label: '2号线 / Line 2 · #8CC220', aliases: ['2号线', 'Line 2'] },
    { value: '#E3002B', label: '1号线 / Line 1 · #E3002B', aliases: ['1号线', 'Line 1'] },
  ],
  lineKeysByColor,
);
check('配置名称后产出候选', namedOptions.length === 2);
check('编号取自正式名称', namedOptions.map((line) => line.lineNumber).join(',') === '2,1');
check(
  '不再标记为推导名',
  namedOptions.every((line) => !line.isDerivedName),
);

console.log('\n── 6. 中文线路名回退首字的既有契约仍然成立 ──────');
const chineseFallback = resolveMetroWayfindingLineTemplateOptions(
  [
    { value: '#00A0E9', label: '环线 · #00A0E9', aliases: ['环线'] },
    { value: '#7A1E7A', label: '机场线 · #7A1E7A', aliases: ['机场线'] },
  ],
  undefined,
);
check(
  '中文线路名仍产出编号（环 / 机）',
  chineseFallback.map((line) => line.lineNumber).join(',') === '环,机',
);

console.log('\n── 7. 缺少线路键映射时不编造编号 ───────────────');
const noMapping = resolveMetroWayfindingLineTemplateOptions(
  [{ value: '#8CC220', label: 'sh2 · #8CC220', aliases: [] }],
  undefined,
);
check('无映射且无名称 → 不产出候选', noMapping.length === 0);

console.log('\n── 8. 未配置线路名的兜底名称必须走 derive ──────');
// 回归：resolveMaterialTransitNetworkLineNames 曾误用通用提取器
// extractMetroWayfindingLineNumber，对 `sy1` 这种「字母+数字」整串返回，
// 编出「sy1号线」——正是「配置项目线路名称」对话框要消除的东西。
{
  const { resolveMaterialTransitNetworkLineNames } =
    await import('../../apps/web/lib/rmp-transit-network');
  const emptySnapshot = { format: 'rmp' as const, version: 77, nodes: [], edges: [] };
  const FALLBACK_CASES: Array<[string, string, string]> = [
    // [lineKey, 期望主名称, 期望副名称]
    ['sy1', '1号线', 'Line 1'],
    ['sy1:sy1', '1号线', 'Line 1'],
    ['sy10:sy10', '10号线', 'Line 10'],
    ['sh2', '2号线', 'Line 2'],
    ['line:S1', 'S1号线', 'Line S1'],
  ];
  for (const [lineKey, expectedName, expectedSecondary] of FALLBACK_CASES) {
    const resolved = resolveMaterialTransitNetworkLineNames(emptySnapshot, lineKey);
    check(
      `兜底「${lineKey}」→ ${expectedName} / ${expectedSecondary}`,
      resolved?.name === expectedName && resolved?.secondaryName === expectedSecondary,
    );
  }
  // 不能出现「把颜色键整串当编号」的形态。
  for (const key of ['sy1', 'sy1:sy1', 'sh2', 'bj1']) {
    const resolved = resolveMaterialTransitNetworkLineNames(emptySnapshot, key);
    check(`兜底「${key}」不含颜色键前缀`, !/^[a-z]+\d/u.test(resolved?.name ?? ''));
  }
  // 站点键 / 无编号键不该编出名字。
  for (const key of ['stn_sh2', 'pjl', 'maglevA']) {
    check(
      `兜底「${key}」不编造名称`,
      resolveMaterialTransitNetworkLineNames(emptySnapshot, key) === undefined,
    );
  }
  // 已配置名称时优先采信配置值，不被兜底覆盖。
  const configuredSnapshot = {
    ...emptySnapshot,
    lineNames: [{ lineKey: 'sy1', name: '松江1路', secondaryName: 'Songjiang Line 1' }],
  };
  const configured = resolveMaterialTransitNetworkLineNames(configuredSnapshot, 'sy1');
  check(
    '已配置名称优先于兜底推导',
    configured?.name === '松江1路' && configured?.secondaryName === 'Songjiang Line 1',
  );
}

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
