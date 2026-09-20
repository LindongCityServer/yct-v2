/**
 * 校验外部导视工程（NaL 导向标志设计器 / Chitose.City Sign Maker）的导入转换。
 *
 * 背景：这两个上游工程都不是本项目的数据源，字段名只能靠其导出的工程文件反推。
 * 历史上 NaL 分支的设施映射表**大面积引用了 vitool 里并不存在的素材号**
 * （如 stn@01 / stn@02 / stn@07 / stn@11 / stn@12 / stn@17 / stn@18 / stn@24 /
 * stn@26 / stn@27 / stn@28 / stn@29 / stn@34 / cls@20 / oth@04 / oth@hub04 /
 * way@01 / way@24 / oth@bw / oth@yl），导致这些分支从未生效，且多层文本框
 * （a-cn / c-en1 等字段）会被整段丢弃。
 *
 * 判定素材号是否真实存在，一律以 vitool 线上包内嵌素材清单（`'file':…` 字段）
 * 与包内明文的 `oth@(0[1-9]|1[0-9]|2[0-9]|30|A)` 正则为准，不凭印象推断。
 *
 * 本脚本把「与线上导出结构对齐」的几条关键约定固化成断言，避免再次漂移。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Chitose 解析链路依赖浏览器 `DOMParser`（用于读组件 innerHTML 里的
 * `.textCN` / `.textEN` / `.largeText` 等节点）。本校验脚本跑在 Node 下，
 * 因此注入一个**只覆盖断言所需能力**的最小实现：解析 `class="…">文本` 片段。
 * 不要在此扩充成通用 HTML 解析器——真实链路仍走浏览器原生实现。
 */
if (typeof globalThis.DOMParser === 'undefined') {
  class MinimalElement {
    constructor(className: string, textContent: string) {
      this.className = className;
      this.textContent = textContent;
    }
    className: string;
    textContent: string;
    getAttribute() {
      return null;
    }
    style = {} as CSSStyleDeclaration;
  }
  class MinimalDocument {
    constructor(markup: string) {
      this.body = { textContent: markup.replace(/<[^>]*>/gu, '') } as unknown as HTMLElement;
      this.elements = [...markup.matchAll(/class="([^"]*)"[^>]*>([^<]*)/gu)].map(
        (match) => new MinimalElement(match[1]!, match[2]!.trim()),
      );
    }
    body: HTMLElement;
    private elements: MinimalElement[];
    querySelector<T = MinimalElement>(selector: string): T | null {
      const wanted = selector.replace(/^\./u, '').split(/[[\s]/u)[0]!;
      return (this.elements.find((element) => element.className.split(/\s+/u).includes(wanted)) ??
        null) as T | null;
    }
  }
  (globalThis as Record<string, unknown>).DOMParser = class {
    parseFromString(markup: string) {
      return new MinimalDocument(markup);
    }
  };
}

import {
  parseMetroWayfindingImportFiles,
  resolveMetroWayfindingImportPreview,
} from '../../apps/web/lib/metro-wayfinding-import';
import {
  resolveMetroLargeTextSuffixes,
  splitMetroLargeTextRuns,
} from '../../apps/web/lib/metro-wayfinding';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}

const importSource = readFileSync(
  resolve(import.meta.dirname, '../../apps/web/lib/metro-wayfinding-import.ts'),
  'utf8',
);

/**
 * 从一行元素里找出「承载线路自身信息」的组合框。
 *
 * 背景：规则 4 要求「相邻的色带内容（包括 sub 和 line）放在同一组合框里」，
 * 且组合框**不能嵌套组合框**（`MetroWayfindingCombinationChild` 词表不含
 * `combination`），因此线路标的 children 会被**摊平**进色带容器，
 * 线路的框样式（缩放 / 填充色）提升到容器上。
 * 所以「线路组合框」就是那个含 `largeText` 子元素的组合框，无需下钻。
 *
 * 判据（按优先级）：
 * 1. 含 `largeText` 子元素的组合框 → 线路框（编号位在大文本里）；
 * 2. 否则取第一个组合框（命名线路组合框：只有 text 子元素）。
 */
function findRouteCombination(
  row: readonly unknown[],
): import('../../apps/web/lib/metro-wayfinding').MetroWayfindingCombinationElement | undefined {
  type Combination =
    import('../../apps/web/lib/metro-wayfinding').MetroWayfindingCombinationElement;
  const combinations = row.filter(
    (element): element is Combination =>
      typeof element === 'object' &&
      element !== null &&
      (element as { type?: string }).type === 'combination',
  );
  for (const combination of combinations) {
    if (combination.children.some((child) => child.type === 'largeText')) return combination;
  }
  return combinations[0];
}

/**
 * vitool 线上包（vitool.<hash>.js）内嵌素材清单中真实存在的素材号。
 *
 * 口径说明（三份权威来源交叉验证，勿凭印象增删）：
 * A. 素材清单：包内 233 条形如
 *    `{'title':…,'file':'xxx@NN.svg','refresh':…,'keywords':…}` 的对象，
 *    `file` / `refresh` 字段的明文即真实素材号；
 * B. 包内明文正则 `/oth@(0[1-9]|1[0-9]|2[0-9]|30|A)\.svg/` 界定 oth 数字族；
 * C. **官方模板工程文件** `assets/template/*.json` 的 elements 实际引用。
 *
 * 重要教训：**只看 A 会漏判**。`oth@yl`、`stn@24`、`stn@32`、`line@03`
 * 等素材在 A 里查不到，但 C（官方模板）确实在用，属于真实素材。
 * 反之 `oth@bw` / `oth@hub04` / `stn@01` 等在三份来源里**都不存在**，才是臆造。
 *
 * 其他口径：
 * - `oth@one` / `oth@two` / `oth@thr` / `oth@fou` 是**运行时拼接**的后缀标记
 *   （包内以 `oth@(one|two|thr|fou).svg` 判定），计入合法素材；
 * - `sub@` 是**命名前缀**而非固定素材号：`sub@NN` / `sub@long` 是色带字母与
 *   分隔点，`sub@text-custom-<时间戳>`（type=subtext）与 `sub@space*`
 *   （type=color-icon）是用户自定义文本 / 占位，后者不应登记为固定素材。
 *
 * 新增映射时必须先在此登记，防止再出现「映射到不存在的素材」。
 */
const NAL_REAL_ASSETS = new Set([
  // way@ —— 完整号段 01-30（31+ 线上 404）。
  // 其中 01/02/28/29 = 出口图标（统一转向上出口）；24/25/30 = 步行小人/禁止通行（忽略）；
  // 21/22 = 箭头附带下一站文本；23/26/27 = 纯文本（下一站/内环/外环）。
  'way@01.svg',
  'way@02.svg',
  'way@03.svg',
  'way@04.svg',
  'way@05.svg',
  'way@06.svg',
  'way@07.svg',
  'way@08.svg',
  'way@09.svg',
  'way@10.svg',
  'way@11.svg',
  'way@12.svg',
  'way@13.svg',
  'way@14.svg',
  'way@15.svg',
  'way@16.svg',
  'way@17.svg',
  'way@18.svg',
  'way@19.svg',
  'way@20.svg',
  'way@21.svg',
  'way@22.svg',
  'way@23.svg',
  'way@24.svg',
  'way@25.svg',
  'way@26.svg',
  'way@27.svg',
  'way@28.svg',
  'way@29.svg',
  'way@30.svg',
  // stn@ —— **线上 SVG 实测号段 01–40**（2026-09-19 逐张抓取渲染核对）。
  // 其中 39 / 40 是长条横幅（viewBox 440×57），无设施图形，本模板跳过；
  // 完整语义见 metro-wayfinding-import.ts 的 `nalFacilityAssetMap` 注释。
  'stn@01.svg',
  'stn@02.svg',
  'stn@03.svg',
  'stn@04.svg',
  'stn@05.svg',
  'stn@06.svg',
  'stn@07.svg',
  'stn@08.svg',
  'stn@09.svg',
  'stn@10.svg',
  'stn@11.svg',
  'stn@12.svg',
  'stn@13.svg',
  'stn@14.svg',
  'stn@15.svg',
  'stn@16.svg',
  'stn@17.svg',
  'stn@18.svg',
  'stn@19.svg',
  'stn@20.svg',
  'stn@21.svg',
  'stn@22.svg',
  'stn@23.svg',
  'stn@24.svg',
  'stn@25.svg',
  'stn@26.svg',
  'stn@27.svg',
  'stn@28.svg',
  'stn@29.svg',
  'stn@30.svg',
  'stn@31.svg',
  'stn@32.svg',
  'stn@33.svg',
  'stn@34.svg',
  'stn@35.svg',
  'stn@36.svg',
  'stn@37.svg',
  'stn@38.svg',
  'stn@39.svg',
  'stn@40.svg',
  // oth@ 数字族 + 字母族 + 后缀标记 + 枢纽 / 色带
  // 位次 1-4（实验，裸图标）：市郊铁路/铁路/巴士/飞机；06-30 = 字母 B-Z。
  'oth@01.svg',
  'oth@02.svg',
  'oth@03.svg',
  'oth@04.svg',
  'oth@06.svg',
  'oth@07.svg',
  'oth@08.svg',
  'oth@09.svg',
  'oth@10.svg',
  'oth@11.svg',
  'oth@12.svg',
  'oth@13.svg',
  'oth@14.svg',
  'oth@15.svg',
  'oth@16.svg',
  'oth@17.svg',
  'oth@18.svg',
  'oth@19.svg',
  'oth@20.svg',
  'oth@21.svg',
  'oth@22.svg',
  'oth@23.svg',
  'oth@24.svg',
  'oth@25.svg',
  'oth@26.svg',
  'oth@27.svg',
  'oth@28.svg',
  'oth@29.svg',
  'oth@30.svg',
  'oth@A.svg',
  'oth@Dot.svg',
  'oth@one.svg',
  'oth@two.svg',
  'oth@thr.svg',
  'oth@fou.svg',
  // oth@cls01-28 = 加框字母 A-L + A1-F2（经典系列，角标走 largeText.suffix）。
  // 完整号段由栅格化逐字识别确证（见 metro-wayfinding-import.ts 的
  // `nalOthFramedLetterMap` 注释）；cls29+ 线上 404，故不登记。
  'oth@cls01.svg',
  'oth@cls02.svg',
  'oth@cls03.svg',
  'oth@cls04.svg',
  'oth@cls05.svg',
  'oth@cls06.svg',
  'oth@cls07.svg',
  'oth@cls08.svg',
  'oth@cls09.svg',
  'oth@cls10.svg',
  'oth@cls11.svg',
  'oth@cls12.svg',
  'oth@cls13.svg',
  'oth@cls14.svg',
  'oth@cls15.svg',
  'oth@cls16.svg',
  'oth@cls17.svg',
  'oth@cls18.svg',
  'oth@cls19.svg',
  'oth@cls20.svg',
  'oth@cls21.svg',
  'oth@cls22.svg',
  'oth@cls23.svg',
  'oth@cls24.svg',
  'oth@cls25.svg',
  'oth@cls26.svg',
  'oth@cls27.svg',
  'oth@cls28.svg',
  // oth@hub01-05 = 经典系列枢纽图标（飞机/出租车/市郊铁路/铁路/巴士）。
  'oth@hub01.svg',
  'oth@hub02.svg',
  'oth@hub03.svg',
  'oth@hub04.svg',
  'oth@hub05.svg',
  'oth@space.svg',
  // oth@yl 是经典分割线：不在素材清单里，但官方模板 1-5-4 / 1-6-2 / 1-7-2 /
  // 1-8-1 / 1-8-2 / 1-8-3 / 2-5-1 / 2-8-1 都在 elements 中单独占一栏使用。
  'oth@yl.svg',
  // sub@ 色带字母 A-N（04-17）+ 图标（01/18/19/20/21）+ 分隔点（03）+ 空白
  'sub@01.svg',
  'sub@02.svg',
  'sub@03.svg',
  'sub@04.svg',
  'sub@05.svg',
  'sub@06.svg',
  'sub@07.svg',
  'sub@08.svg',
  'sub@09.svg',
  'sub@10.svg',
  'sub@11.svg',
  'sub@12.svg',
  'sub@13.svg',
  'sub@14.svg',
  'sub@15.svg',
  'sub@16.svg',
  'sub@17.svg',
  'sub@18.svg',
  'sub@19.svg',
  'sub@20.svg',
  'sub@21.svg',
  'sub@long.svg',
  'sub@space.svg',
  // cls@ / clss@ 色带。
  // 说明：clss@01~32 的完整号段已由「vitool 界面截图网格顺序 + 线上素材 SVG 的
  // fill 色值」双源交叉确证（序号即线路号，22 起为特殊线路），故整段登记。
  'cls@14.svg',
  'cls@18.svg',
  'cls@19.svg',
  'cls@23.svg',
  'cls@24.svg',
  'cls@25.svg',
  'cls@27.svg',
  'cls@36.svg',
  'clss@01.svg',
  'clss@02.svg',
  'clss@03.svg',
  'clss@04.svg',
  'clss@05.svg',
  'clss@06.svg',
  'clss@07.svg',
  'clss@08.svg',
  'clss@09.svg',
  'clss@10.svg',
  'clss@11.svg',
  'clss@12.svg',
  'clss@13.svg',
  'clss@14.svg',
  'clss@15.svg',
  'clss@16.svg',
  'clss@17.svg',
  'clss@18.svg',
  'clss@19.svg',
  'clss@20.svg',
  'clss@21.svg',
  'clss@22.svg',
  'clss@23.svg',
  'clss@24.svg',
  'clss@25.svg',
  'clss@26.svg',
  'clss@27.svg',
  'clss@28.svg',
  'clss@29.svg',
  'clss@30.svg',
  'clss@31.svg',
  'clss@32.svg',
  // line@ 新版色带。line@NN 同样按界面顺序编号，但比 clss@ 多插入
  // 「八通线(02)」「大兴线(06)」两个占位，因此不能写成 NN±k 的简单偏移。
  // line@03 / 08 / 10 / 16 仅见于官方模板（1-5-3、1-8-2、1-8-1、2-6-1、
  // 1-8-3、2-8-1），不在素材清单里，属真实素材。
  'line@01.svg',
  'line@02.svg',
  'line@03.svg',
  'line@04.svg',
  'line@05.svg',
  'line@06.svg',
  'line@07.svg',
  'line@08.svg',
  'line@09.svg',
  'line@10.svg',
  'line@11.svg',
  'line@12.svg',
  'line@13.svg',
  'line@14.svg',
  'line@15.svg',
  'line@16.svg',
  'line@17.svg',
  'line@18.svg',
  'line@19.svg',
  'line@20.svg',
  'line@21.svg',
  'line@22.svg',
  'line@23.svg',
  'line@24.svg',
  'line@25.svg',
  'line@26.svg',
  'line@27.svg',
  'line@28.svg',
  'line@29.svg',
  'line@30.svg',
  'line@31.svg',
  'line@32.svg',
]);

console.log('── 1. 代码中的 NaL 素材映射必须真实存在 ─────────');
// 只扫描 NaL 相关的素材字面量（排除 Chitose 侧使用的无前缀资源名）。
const nalLiteralAssets = new Set(
  Array.from(
    importSource.matchAll(/'((?:way|stn|oth|cls|clss|line|sub)@[A-Za-z0-9_]+\.svg)'/gu),
  ).map((match) => match[1]!),
);
const ghostAssets = [...nalLiteralAssets].filter((asset) => !NAL_REAL_ASSETS.has(asset)).sort();
check(
  `不再引用 vitool 中不存在的素材（发现 ${ghostAssets.length} 个）`,
  ghostAssets.length === 0,
  ghostAssets,
);
// oth@bw 在三份来源里都不存在，是纯臆造；oth@yl 反之——官方模板在用，必须保留。
check('历史臆造的 oth@bw 已被清除', !nalLiteralAssets.has('oth@bw.svg'));
check('真实存在的 oth@yl（官方模板分割线）未被误删', nalLiteralAssets.has('oth@yl.svg'));
// oth@hub03 / oth@hub05 是清单 file 字段明文可查的真实素材，曾被误删，必须保留。
check('真实存在的 oth@hub03 未被误删', nalLiteralAssets.has('oth@hub03.svg'));
check('真实存在的 oth@hub05 未被误删', nalLiteralAssets.has('oth@hub05.svg'));

console.log('── 1b. 关键素材语义必须与 vitool 明文一致 ──────');
// 方向箭头：way@05 = 直行/上、way@06 = 下 —— 有包内 AI 指令文本明文佐证。
// way@09 = 左下、way@12 = 右掉头 —— 有素材清单 title 明文佐证。
const arrowExpectations: Array<[string, string]> = [
  ['way@05.svg', 'north'],
  ['way@06.svg', 'south'],
  ['way@09.svg', 'south-west'],
  ['way@12.svg', 'u-turn-right'],
];
for (const [asset, iconId] of arrowExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'arrow.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const arrow = preview.layout.rows[0]!.find((element) => element.type === 'arrow');
  check(`${asset} 映射为箭头 ${iconId}`, arrow?.type === 'arrow' && arrow.iconId === iconId, arrow);
}
// oth@yl 独占一栏时是分割线（官方模板 1-5-4 / 1-8-3 的 g2 栏即此用法）。
{
  const doc = createNalDocument({ elements: ['oth@yl.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'divider.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const divider = preview.layout.rows[0]!.find((element) => element.type === 'divider');
  check('oth@yl 映射为分割线', divider?.type === 'divider', preview.layout.rows[0]);
}
// sub@text-custom-* 是用户自定义文本（type=subtext），不能被硬套成线路标。
// 注意：`sub@` 前缀的色带内容会与相邻色带素材合并进**同一个组合框**
// （规则 4，「相邻的色带内容放在同一组合框里」），因此自定义文本会成为
// 组合框的一个子元素，而不是顶层 text 元素。断言需按此形态写。
{
  const doc = createNalDocument({
    elements: ['sub@text-custom-1775230374933.svg'],
    definitions: {
      custom_2: {
        cn: '开往 东四十条',
        en: 'To Dongsi Shitiao',
        type: 'subtext',
        file: 'sub@text-custom-1775230374933.svg',
      },
    },
  });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'subtext.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const combination = row.find((element) => element.type === 'combination');
  const texts = [
    ...row.filter((element) => element.type === 'text'),
    ...(combination?.type === 'combination'
      ? combination.children.filter((child) => child.type === 'text')
      : []),
  ];
  check(
    'sub@text-custom-* 解析为用户文本而非线路标',
    texts.length > 0 && !row.some((element) => element.type === 'largeText'),
    row,
  );
  check(
    'sub@text-custom-* 文本内容正确',
    texts.some((element) => JSON.stringify(element).includes('东四十条')),
    texts,
  );
}

// 线路标识：clss@NN / line@NN 必须解析为**真实线路名**，不能再硬编码 10 号线。
//
// 期望值来自「vitool 界面截图网格顺序」，并已与「线上素材 SVG 的 fill 色值」
// 交叉确证（双源逐位吻合）。此处只固化其中最具代表性的若干条：
//   - clss@NN 号即线号（01~21）：clss@07=7号线、clss@09=9号线、clss@10=10号线、
//     clss@17=17号线；
//   - line@NN 按界面顺序但多插「八通线(02)」「大兴线(06)」占位：
//     line@03=2号线、line@07=5号线、line@12=10号线、line@15=13号线、line@16=14号线；
//   - 非数字线路名（亦庄线等）产出「填充风格组合框 + 中英双语文本」，无大字号。
//
// **形态提示**：线路标属「色带内容」，会与相邻色带素材合并进**外层色带组合框**
// （规则 4），线路自身的组合框成为其子元素。因此断言需递归下钻一层。
const routeExpectations: Array<[string, string, string]> = [
  // [素材, 期望大字号编号, 期望填充色]
  ['clss@07.svg', '7', '#fac671'],
  ['clss@09.svg', '9', '#8fc31f'],
  ['clss@10.svg', '10', '#009bc0'],
  ['clss@13.svg', '13', '#f9e700'],
  ['clss@17.svg', '17', '#00a9a9'],
  ['line@03.svg', '2', '#006098'],
  ['line@07.svg', '5', '#a6217f'],
  ['line@09.svg', '7', '#fac671'],
  ['line@12.svg', '10', '#009bc0'],
  ['line@15.svg', '13', '#f9e700'],
  ['line@16.svg', '14', '#d5a7a1'],
];
for (const [asset, number, color] of routeExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'route.json', size: 512, text: JSON.stringify(doc) },
  ]);
  // 下钻到「承载线路自身信息」的那个组合框：外层是色带框（无 children 嵌套），
  // 内层才是线路组合框（frameFillMode='color' 或带 largeText 子元素）。
  const routeCombination = findRouteCombination(preview.layout.rows[0]!);
  const largeText =
    routeCombination?.type === 'combination'
      ? routeCombination.children.find((child) => child.type === 'largeText')
      : undefined;
  check(
    `${asset} 解析为 ${number} 号线组合框`,
    routeCombination?.type === 'combination' && largeText?.value === number,
    preview.layout.rows[0],
  );
  check(
    `${asset} 使用真实线路色 ${color}`,
    routeCombination?.type === 'combination' &&
      routeCombination.frameFillColor?.toUpperCase() === color.toUpperCase(),
    routeCombination?.type === 'combination' ? routeCombination.frameFillColor : routeCombination,
  );
}
// 非数字线路名：产出「填充框 + 一个中英双语文本」，且没有大字号编号位。
{
  const doc = createNalDocument({ elements: ['clss@24.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'named-route.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const routeCombination = findRouteCombination(preview.layout.rows[0]!);
  const childTypes =
    routeCombination?.type === 'combination'
      ? routeCombination.children.map((child) => child.type)
      : [];
  check(
    'clss@24（亦庄线）产出填充框组合框且无大字号',
    routeCombination?.type === 'combination' && !childTypes.includes('largeText'),
    preview.layout.rows[0],
  );
  check(
    'clss@24 框内文本为中英双语线路名',
    routeCombination?.type === 'combination' &&
      JSON.stringify(routeCombination.children).includes('亦庄线') &&
      JSON.stringify(routeCombination.children).includes('Yizhuang Line'),
    routeCombination,
  );
  check(
    'clss@24 使用亦庄线标识色',
    routeCombination?.type === 'combination' &&
      routeCombination.frameFillColor?.toUpperCase() === '#E40077',
    routeCombination?.type === 'combination' ? routeCombination.frameFillColor : routeCombination,
  );
}
// 素材号与线路号解耦的回归锁：线路名**不能**由素材号里抠数字得到。
// clss@02 是 2 号线、clss@20 是 22 号线、line@24 是亦庄线——若有人改回
// 「从素材号抠数字」，这几条会立刻失败。
{
  const doc = createNalDocument({ elements: ['clss@20.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'no-strip.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const routeCombination = findRouteCombination(preview.layout.rows[0]!);
  const largeText =
    routeCombination?.type === 'combination'
      ? routeCombination.children.find((child) => child.type === 'largeText')
      : undefined;
  check(
    'clss@20 解析为 22 号线（禁止从素材号抠数字）',
    largeText?.value === '22',
    largeText?.value,
  );
}

console.log('── 2. 关键素材必须被映射或显式识别 ─────────');
// 这些素材曾被错映射（stn@28 等），修正后应落到设施映射或「显式跳过」分支，
// 两者都不应产生 `nal-unknown-asset` 告警。
for (const asset of [
  'stn@05.svg', // 经典：双向楼梯（曾误判为扶梯）
  'stn@15.svg', // 经典：行李安检机（显式跳过）
  'stn@20.svg', // 经典：推婴儿车的人（显式跳过）
  'stn@20.svg', // 经典：推婴儿车的人（显式跳过）
  'stn@23.svg', // 实验：电梯（曾误判为跳过）
  'stn@31.svg', // 实验：楼梯（曾误判为母婴室）
  'stn@39.svg', // 长条横幅（显式跳过）
]) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'facility.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const hasUnknown = preview.warnings.some((warning) => warning.code === 'nal-unknown-asset');
  check(`${asset} 命中映射（无未识别告警）`, !hasUnknown, preview.warnings);
}

console.log('── 3. group.align 传递到文本元素 ───────────────');
const alignDoc = createNalDocument({
  elements: ['custom_1'],
  align: 'center',
  definitions: { custom_1: createTextDefinition({ cn: '换乘', en: 'Transfer' }) },
});
const alignPreview = parseMetroWayfindingImportFiles([
  { name: 'align.json', size: 512, text: JSON.stringify(alignDoc) },
]);
const centeredText = alignPreview.layout.rows[0]!.find((element) => element.type === 'text');
check(
  'align=center 时文本元素居中',
  centeredText?.type === 'text' && centeredText.align === 'center',
  centeredText,
);

console.log('── 4. 多层文本框字段（a-* / c-*-N）不丢失 ───────');
const multilineDoc = createNalDocument({
  elements: ['custom_multi'],
  definitions: {
    custom_multi: createTextDefinition({
      cn: '',
      en: '',
      extra: {
        'a-cn': '换乘',
        'a-en1': 'Transfer',
        'a-en2': 'Interchange',
        'c-cn1': '2号线',
        'c-en1': 'Line 2',
      },
      drct: 'end',
    }),
  },
});
const multilinePreview = parseMetroWayfindingImportFiles([
  { name: 'multiline.json', size: 512, text: JSON.stringify(multilineDoc) },
]);
const multilineText = multilinePreview.layout.rows[0]!.find((element) => element.type === 'text');
const mainRowCount =
  multilineText?.type === 'text'
    ? multilineText.rows.filter((row) => row.kind === 'main').length
    : 0;
const secondaryRowCount =
  multilineText?.type === 'text'
    ? multilineText.rows.filter((row) => row.kind === 'secondary').length
    : 0;
check('a-cn + c-cn1 合并出 2 行主文本', mainRowCount === 2, mainRowCount);
check('a-en1 / a-en2 归入副文本', secondaryRowCount >= 2, secondaryRowCount);
check(
  'drct=end 时右对齐',
  multilineText?.type === 'text' && multilineText.align === 'right',
  multilineText,
);

console.log('── 5. 未知素材走告警而不是静默错映射 ───────────');
const ghostDoc = createNalDocument({ elements: ['stn@99.svg'] });
const ghostPreview = parseMetroWayfindingImportFiles([
  { name: 'ghost.json', size: 512, text: JSON.stringify(ghostDoc) },
]);
check(
  '不存在的素材产生 nal-unknown-asset 告警',
  ghostPreview.warnings.some((warning) => warning.code === 'nal-unknown-asset'),
  ghostPreview.warnings,
);

console.log('── 6. 双层工程保留两层并启用行分隔 ─────────────');
const twoLayerDoc = createNalDocument({
  elements: ['custom_1'],
  definitions: { custom_1: createTextDefinition({ cn: '一层', en: 'Layer 1' }) },
  group: true,
  layer2: true,
});
const twoLayerPreview = parseMetroWayfindingImportFiles([
  { name: 'two-layer.json', size: 512, text: JSON.stringify(twoLayerDoc) },
]);
check(
  '双层工程 mode=double',
  twoLayerPreview.layout.mode === 'double',
  twoLayerPreview.layout.mode,
);
check('双层工程启用行分隔', twoLayerPreview.layout.dividerBetweenRows === true);
check('两层都被保留', twoLayerPreview.layout.rows.length === 2, twoLayerPreview.layout.rows.length);

console.log('── 7. 语义模式仍可正常转换 ─────────────────────');
const semanticPreview = resolveMetroWayfindingImportPreview(alignPreview, 'semantic');
check(
  '语义模式切到 DB21 样式标签',
  semanticPreview.styleLabel.includes('DB21'),
  semanticPreview.styleLabel,
);
check(
  '语义模式清空背景色（落到模板默认）',
  semanticPreview.layout.backgroundColor.length > 0,
  semanticPreview.layout.backgroundColor,
);

console.log('── 8. Chitose 真实资源路径必须被正确识别 ────────');
// 千岁 Sign Maker 线上发布的图标路径形如
// https://signmaker.chitose.city/icon/arrows/leftup.svg（方向词**无连字符**）。
// 这批样例取自其官网实际渲染的 <img src>，用于锁定路径解析口径。
const chitoseArrowExpectations: Array<[string, string]> = [
  ['https://signmaker.chitose.city/icon/arrows/leftup.svg', 'north-west'],
  ['https://signmaker.chitose.city/icon/arrows/up.svg', 'north'],
  ['https://signmaker.chitose.city/icon/arrows/rightup.svg', 'north-east'],
  ['icon/arrows/leftdown.svg', 'south-west'],
  ['icon/arrows/rightdown.svg', 'south-east'],
  ['icon/arrows/uturn-left.svg', 'u-turn-left'],
  ['icon/arrows/uturn-right.svg', 'u-turn-right'],
];
for (const [asset, iconId] of chitoseArrowExpectations) {
  const doc = createChitoseDocument({
    className: 'arrow',
    dataset: { src: asset },
    innerHTML: '',
  });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'chitose.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const arrow = preview.layout.rows[0]!.find((element) => element.type === 'arrow');
  check(
    `Chitose ${asset.split('/').slice(-2).join('/')} → ${iconId}`,
    arrow?.type === 'arrow' && arrow.iconId === iconId,
    arrow,
  );
}
// 非箭头资源不应被误判为箭头（exit / stairs 属于设施与出口）。
for (const asset of ['icon/exit.svg', 'icon/stairs.svg']) {
  const doc = createChitoseDocument({
    className: 'icon',
    dataset: { src: asset },
    innerHTML: '',
  });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'chitose.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const hasArrow = preview.layout.rows[0]!.some((element) => element.type === 'arrow');
  check(`Chitose ${asset} 不被误判为箭头`, !hasArrow, preview.layout.rows[0]);
}

console.log('── 9. 规则 1：保留原样式下实验/重庆线路标识缩放 = 1 ───');
// 用户规则 1：实验风格（`line@`）或重庆风格产出的线路标识组合框，放大倍数调到 1。
{
  const doc = createNalDocument({ elements: ['line@12.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'scale.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const combination = findRouteCombination(preview.layout.rows[0]!);
  const experimentalScale = combination?.type === 'combination' ? combination.scale : undefined;
  check('line@12（实验风格）线路组合框缩放为 1', experimentalScale === 1, experimentalScale);

  const classicDoc = createNalDocument({ elements: ['clss@10.svg'] });
  const classicPreview = parseMetroWayfindingImportFiles([
    { name: 'scale-classic.json', size: 512, text: JSON.stringify(classicDoc) },
  ]);
  const classicCombination = findRouteCombination(classicPreview.layout.rows[0]!);
  const classicScale =
    classicCombination?.type === 'combination' ? classicCombination.scale : undefined;
  check('clss@10（经典风格）线路组合框缩放保持 0.65', classicScale === 0.65, classicScale);
  // 回归锁：经典线路标会被套进「色带组合框」（规则 4 的相邻合并），此时
  // **外层框也必须沿用 0.65** —— 否则会把经典线路框撑到满倍高，与规则 1 冲突。
  const classicOuter = classicPreview.layout.rows[0]!.find(
    (element) => element.type === 'combination',
  );
  check(
    'clss@10 外层色带组合框沿用经典缩放 0.65',
    classicOuter?.type === 'combination' && classicOuter.scale === 0.65,
    classicOuter?.type === 'combination' ? classicOuter.scale : classicOuter,
  );
  // 反之：色带里含 `sub@` 字母时，规则 4 要求缩放固定为 1。
  const bandDoc = createNalDocument({ elements: ['sub@04.svg', 'clss@10.svg'] });
  const bandPreview = parseMetroWayfindingImportFiles([
    { name: 'scale-band.json', size: 512, text: JSON.stringify(bandDoc) },
  ]);
  const bandOuter = bandPreview.layout.rows[0]!.find((element) => element.type === 'combination');
  check(
    '色带含 sub@ 字母时组合框缩放为 1（规则 4）',
    bandOuter?.type === 'combination' && bandOuter.scale === 1,
    bandOuter?.type === 'combination' ? bandOuter.scale : bandOuter,
  );
}

console.log('── 10. 规则 2：方向指示（way@）语义 ────────────');
// 四个出口图标统一转「向上出口」。
for (const asset of ['way@01.svg', 'way@02.svg', 'way@28.svg', 'way@29.svg']) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'exit.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const facility = preview.layout.rows[0]!.find((element) => element.type === 'facility');
  check(
    `${asset} 转向上出口`,
    facility?.type === 'facility' && facility.iconId === 'exit' && facility.direction === 'up',
    facility,
  );
}
// 步行小人 / 禁止通行：忽略（既不产元素，也不报未识别告警）。
for (const asset of ['way@24.svg', 'way@25.svg', 'way@30.svg']) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'ignored.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const hasUnknown = preview.warnings.some((warning) => warning.code === 'nal-unknown-asset');
  check(`${asset} 被忽略且不报未识别告警`, row.length === 0 && !hasUnknown, {
    row,
    warnings: preview.warnings,
  });
}
// 纯文本图标（下一站 / 内环 / 外环）转文本元素。
for (const [asset, keyword] of [
  ['way@23.svg', '下一站'],
  ['way@26.svg', '内环'],
  ['way@27.svg', '外环'],
] as const) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'direction-text.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const text = preview.layout.rows[0]!.find((element) => element.type === 'text');
  check(
    `${asset} 转文本元素（含「${keyword}」）`,
    text !== undefined && JSON.stringify(text).includes(keyword),
    text,
  );
}
// 箭头 + 下一站文本：拆成箭头 + 文本两个元素。
for (const asset of ['way@21.svg', 'way@22.svg']) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'arrow-text.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const arrow = row.find((element) => element.type === 'arrow');
  const text = row.find((element) => element.type === 'text');
  check(
    `${asset} 拆成箭头 + 下一站文本`,
    arrow !== undefined && text !== undefined && JSON.stringify(text).includes('下一站'),
    row,
  );
}

console.log('── 11. 规则 3：车站设施（stn@）号段 ────────────');
/**
 * ⚠️ 号段口径以**线上素材 SVG 实测**为准，不要按截图网格「行优先递推」：
 * vitool 的 `stn@NN` 里夹着跳过项（15/16/19–22 等），截图上的连号是「跳过后重排」的结果。
 * 权威核验命令：逐张抓 `https://centralgo.site/vitool/assets/stn/stn@NN.svg` 渲染目视。
 */
const facilityExpectations: Array<[string, string]> = [
  // 经典系列 01–22
  ['stn@01.svg', 'elevator'],
  ['stn@02.svg', 'restroom'],
  ['stn@03.svg', 'escalator'],
  ['stn@04.svg', 'escalator'],
  ['stn@05.svg', 'stairs'],
  ['stn@06.svg', 'stairs'],
  ['stn@07.svg', 'nursing-room'],
  ['stn@08.svg', 'ticket'],
  ['stn@09.svg', 'service'],
  ['stn@10.svg', 'service'],
  ['stn@11.svg', 'service'],
  ['stn@12.svg', 'police'],
  ['stn@16.svg', 'accessible-ramp'],
  ['stn@17.svg', 'wheelchair-lift'],
  ['stn@18.svg', 'wheelchair'],
  // 实验系列 23–36
  ['stn@23.svg', 'elevator'],
  ['stn@24.svg', 'restroom'],
  ['stn@25.svg', 'accessible-restroom'],
  ['stn@26.svg', 'mens-restroom'],
  ['stn@27.svg', 'womens-restroom'],
  ['stn@28.svg', 'family-restroom'],
  ['stn@29.svg', 'escalator'],
  ['stn@30.svg', 'escalator'],
  ['stn@31.svg', 'stairs'],
  ['stn@32.svg', 'stairs'],
  ['stn@33.svg', 'nursing-room'],
  ['stn@34.svg', 'wheelchair'],
  // 经典系列（回尾）37–38
  ['stn@37.svg', 'ticket'],
  ['stn@38.svg', 'accessible-restroom'],
];
for (const [asset, iconId] of facilityExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'facility.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const facility = preview.layout.rows[0]!.find((element) => element.type === 'facility');
  check(
    `${asset} → ${iconId}`,
    facility?.type === 'facility' && facility.iconId === iconId,
    facility,
  );
}
// 方向口径：03/04、05/06、29/30、31/32 都是镜像对，用 direction 表达。
const facilityDirectionExpectations: Array<[string, string, string?]> = [
  ['stn@03.svg', 'right', undefined],
  ['stn@04.svg', 'left', undefined],
  ['stn@05.svg', 'right', 'two-way'],
  ['stn@06.svg', 'left', 'two-way'],
  ['stn@29.svg', 'right', undefined],
  ['stn@30.svg', 'left', undefined],
  ['stn@31.svg', 'right', 'two-way'],
  ['stn@32.svg', 'left', 'two-way'],
];
for (const [asset, direction, variant] of facilityDirectionExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'dir.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const facility = preview.layout.rows[0]!.find((element) => element.type === 'facility');
  check(
    `${asset} 方向=${direction}${variant ? ` 变体=${variant}` : ''}`,
    facility?.type === 'facility' &&
      facility.direction === direction &&
      (variant === undefined || facility.variant === variant),
    facility,
  );
}
// 实验系列（23–36）用蓝/粉色，且不带经典外框。
const facilityAccentExpectations: Array<[string, string]> = [
  ['stn@23.svg', '#00A0E9'],
  ['stn@25.svg', '#00A0E9'],
  ['stn@27.svg', '#E6007E'],
  ['stn@33.svg', '#E6007E'],
  ['stn@34.svg', '#00A0E9'],
];
for (const [asset, color] of facilityAccentExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'accent.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const facility = preview.layout.rows[0]!.find((element) => element.type === 'facility');
  check(
    `${asset} 实验系列前景色 ${color}`,
    facility?.type === 'facility' &&
      facility.foregroundColor?.toUpperCase() === color &&
      facility.frameShape === 'none',
    facility,
  );
}
// 明确跳过的设施号：不产元素，也不报未识别告警。
for (const asset of [
  'stn@13.svg',
  'stn@14.svg',
  'stn@15.svg',
  'stn@19.svg',
  'stn@20.svg',
  'stn@21.svg',
  'stn@22.svg',
  'stn@35.svg',
  'stn@36.svg',
  'stn@39.svg',
  'stn@40.svg',
]) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'skip.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  check(`${asset} 被跳过（不产元素）`, row.length === 0, row);
}
// 相邻同图标设施合并：NaL 的 09/10/11 是「人工售票处 / 问讯处 / 乘客服务中心」
// 三个图形，但本模板只有 `service` 一个图标；用户 2026-09-19 决定**相邻时只留 1 个**。
// 判据是「任意连续同 iconId 设施」，因此 08+37（都是 ticket）也合并；
// 但镜像对（03/04 扶梯方向相反）与不同前景色（01/23）必须**保持独立**。
const facilityMergeExpectations: Array<[string, string, string[], string[]]> = [
  ['09+10+11 相邻合并为 1 个 service', 'service', ['stn@09.svg', 'stn@10.svg', 'stn@11.svg'], []],
  ['08+37 相邻合并为 1 个 ticket', 'ticket', ['stn@08.svg', 'stn@37.svg'], []],
  ['09 单独不合并', 'service', ['stn@09.svg'], []],
];
for (const [label, iconId, assets, extraIcons] of facilityMergeExpectations) {
  const doc = createNalDocument({ elements: assets });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'merge.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const facilityIds = row
    .filter((element) => element.type === 'facility')
    .map((element) => (element as Extract<typeof element, { type: 'facility' }>).iconId);
  check(
    label,
    facilityIds.length === 1 + extraIcons.length &&
      facilityIds[0] === iconId &&
      facilityIds.length === row.length,
    row,
  );
}
const facilityNonMergeExpectations: Array<[string, string[]]> = [
  ['03+04 镜像扶梯方向相反，不合并', ['stn@03.svg', 'stn@04.svg']],
  ['01+23 电梯前景色不同，不合并', ['stn@01.svg', 'stn@23.svg']],
  ['09 + 12(police) + 10 被 police 隔开，不合并', ['stn@09.svg', 'stn@12.svg', 'stn@10.svg']],
];
for (const [label, assets] of facilityNonMergeExpectations) {
  const doc = createNalDocument({ elements: assets });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'nomerge.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  check(label, row.length === assets.length, row);
}

console.log('── 12. 规则 4：色带信息（sub@）与色带合并 ───────');
// 保留原样式模式下，色带图标（01/18/19/20/21）跳过。
for (const asset of ['sub@01.svg', 'sub@18.svg', 'sub@19.svg', 'sub@20.svg', 'sub@21.svg']) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'sub-icon.json', size: 512, text: JSON.stringify(doc) },
  ]);
  check(
    `${asset} 在保留原样式模式下跳过`,
    preview.layout.rows[0]!.length === 0,
    preview.layout.rows[0],
  );
}
// sub@04-17 = 大写字母 A-N，带框大文本。
{
  const doc = createNalDocument({ elements: ['sub@04.svg', 'sub@05.svg', 'sub@06.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'sub-letters.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const combination = preview.layout.rows[0]!.find((element) => element.type === 'combination');
  const letters =
    combination?.type === 'combination'
      ? combination.children
          .filter((child) => child.type === 'largeText')
          .map((child) => (child.type === 'largeText' ? child.value : ''))
      : [];
  check(
    'sub@04/05/06 合并进同一色带组合框（A/B/C 带框）',
    combination?.type === 'combination' &&
      combination.scale === 1 &&
      JSON.stringify(letters) === JSON.stringify(['A', 'B', 'C']),
    { scale: combination?.type === 'combination' ? combination.scale : undefined, letters },
  );
}
// 色带内容与线路标合并进同一组合框。
{
  const doc = createNalDocument({ elements: ['sub@04.svg', 'line@12.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'band-merge.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const combinations = preview.layout.rows[0]!.filter((element) => element.type === 'combination');
  check(
    'sub@ 与 line@ 合并进同一组合框（只产 1 个顶层组合框）',
    combinations.length === 1,
    preview.layout.rows[0],
  );
}
// 语义模式：分割点跳过、每字母单框。
{
  const doc = createNalDocument({ elements: ['sub@03.svg', 'sub@04.svg', 'sub@05.svg'] });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'sub-semantic.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  const flattened = JSON.stringify(row);
  check('语义模式：分割点「·」被跳过', !flattened.includes('·'), row);
  check(
    '语义模式：字母 A / B 各成带框大文本',
    row.filter((element) => element.type === 'largeText').length === 2,
    row,
  );
}
// 语义模式：多个字母改为双行按列（ABCDE → ACE / BD）。
{
  const doc = createNalDocument({
    elements: ['sub@04.svg', 'sub@05.svg', 'sub@06.svg', 'sub@07.svg', 'sub@08.svg'],
  });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'sub-columns.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  const columnCombination = row.find(
    (element) => element.type === 'combination' && element.frameFillMode === 'none',
  );
  const columns =
    columnCombination?.type === 'combination'
      ? columnCombination.children
          .filter((child) => child.type === 'largeText')
          .map((child) => (child.type === 'largeText' ? child.value : ''))
      : [];
  check(
    '语义模式：ABCDE 按列分组成 ACE / BD 两个组合框',
    // 5 个字母 → 奇偶两列：第 0 列 = A/C/E（3 个），第 1 列 = B/D（2 个）。
    row.filter((element) => element.type === 'combination').length === 2 &&
      columnCombination?.type === 'combination' &&
      columnCombination.children.filter((child) => child.type === 'largeText').length === 3 &&
      JSON.stringify(columns) === JSON.stringify(['A', 'C', 'E']),
    { row, columns },
  );
}

console.log('── 13. 规则 5：oth@ 系列 ──────────────────────');
// 位次 1-4（实验）：裸图标；位次 5-8（经典）+ 9（出租车）：带框。
const othIconExpectations: Array<[string, string, boolean]> = [
  ['oth@01.svg', 'train', false],
  ['oth@02.svg', 'train', false],
  ['oth@03.svg', 'bus', false],
  ['oth@04.svg', 'airplane', false],
  ['oth@hub03.svg', 'train', true],
  ['oth@hub04.svg', 'train', true],
  ['oth@hub05.svg', 'bus', true],
  ['oth@hub01.svg', 'airplane', true],
  ['oth@hub02.svg', 'taxi', true],
];
for (const [asset, iconId, framed] of othIconExpectations) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-icon.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const facility = preview.layout.rows[0]!.find((element) => element.type === 'facility');
  check(
    `${asset} → ${iconId}（${framed ? '带框' : '裸图标'}）`,
    facility?.type === 'facility' &&
      facility.iconId === iconId &&
      (framed ? facility.frameShape === 'rectangle' : facility.frameShape === 'none'),
    facility,
  );
}
// oth@space 是空白；oth@yl 是分割线。
{
  const spaceDoc = createNalDocument({ elements: ['oth@space.svg'] });
  const spacePreview = parseMetroWayfindingImportFiles([
    { name: 'oth-space.json', size: 512, text: JSON.stringify(spaceDoc) },
  ]);
  check(
    'oth@space 转空白占位',
    spacePreview.layout.rows[0]!.some((element) => element.type === 'space'),
    spacePreview.layout.rows[0],
  );
}
// 位次 41+（实验）：无框字母 A-Z。
for (const [asset, letter] of [
  ['oth@A.svg', 'A'],
  ['oth@06.svg', 'B'],
  ['oth@13.svg', 'I'],
  ['oth@30.svg', 'Z'],
] as const) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-letter.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const largeText = preview.layout.rows[0]!.find((element) => element.type === 'largeText');
  check(
    `${asset} → 无框大文本「${letter}」`,
    largeText?.type === 'largeText' &&
      largeText.value === letter &&
      largeText.frameShape === 'none',
    largeText,
  );
}
// 位次 13-40（经典）：加框字母，带角标的走 suffix 角标功能。
for (const [asset, value, suffix] of [
  ['oth@cls01.svg', 'A', ''],
  ['oth@cls09.svg', 'I', ''],
  ['oth@cls18.svg', 'B', '3'],
  ['oth@cls28.svg', 'F', '2'],
] as const) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-cls.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const largeText = preview.layout.rows[0]!.find((element) => element.type === 'largeText');
  check(
    `${asset} → 加框大文本「${value}」角标「${suffix}」`,
    largeText?.type === 'largeText' &&
      largeText.value === value &&
      largeText.suffix === suffix &&
      largeText.frameShape === 'rectangle',
    largeText,
  );
}
// 下角标素材 `oth@one` 并入左侧字母大文本的 suffix。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@two.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-suffix.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const letters = JSON.stringify(row).match(/"value":"A"/gu);
  const hasSuffix2 = JSON.stringify(row).includes('"suffix":"2"');
  check(
    'oth@two 并入左侧字母 A 的 suffix',
    letters !== null && hasSuffix2 && row.filter((e) => e.type === 'largeText').length === 1,
    row,
  );
}
// 保留原样式模式下：相邻的非角标裸字母**拼进同一个大文本的 value**，
// 得到「一个无边框大文本」（A + B → "AB"）——内容保持不变，且不建组合框
// （建组合框会让语义模式按色带规则拆解，字母会被当成线路列排布）。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@06.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-merge.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const merged = row.filter((element) => element.type === 'largeText');
  check(
    '保留原样式：相邻裸字母 A + B 合并为一个无边框大文本「AB」',
    merged.length === 1 &&
      merged[0]?.type === 'largeText' &&
      merged[0].value === 'AB' &&
      merged[0].frameShape === 'none' &&
      !row.some((element) => element.type === 'combination'),
    row,
  );
}
// 分割点 `oth@Dot` 同样参与拼接：A + · + B → "A·B"（原样式不丢字面内容）。
// 「·」是语义模式拆分的唯一依据，若这里丢掉就再也分不回「A」「B」。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@Dot.svg', 'oth@06.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-merge-dot.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const merged = row.filter((element) => element.type === 'largeText');
  check(
    '保留原样式：A + · + B 合并为「A·B」（内容不变、无边框）',
    merged.length === 1 &&
      merged[0]?.type === 'largeText' &&
      merged[0].value === 'A·B' &&
      merged[0].frameShape === 'none',
    row,
  );
}
// 仅语义模式：合并大文本按「·」拆回「A」「B」，每个字母各带一个方框。
// 判定必须保守——只有每段都是单个字母/数字时才拆，中文线路名不能被切开。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@Dot.svg', 'oth@06.svg'] });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'oth-split.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  const letters = row.filter((element) => element.type === 'largeText');
  check(
    '仅语义：「A·B」拆成「A」「B」两个带框大文本',
    letters.length === 2 &&
      letters.every(
        (element) => element.type === 'largeText' && element.frameShape === 'rectangle',
      ) &&
      letters.map((element) => (element.type === 'largeText' ? element.value : '')).join('|') ===
        'A|B',
    row,
  );
}
// 反向回归锁：不含「·」的多字母文本（如中文线路名）**不得**被切开。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@06.svg'] });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'oth-nosplit.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  const letters = row.filter((element) => element.type === 'largeText');
  check(
    '仅语义：无「·」的合并文本保持一个整体（不误拆）',
    letters.length === 1 && letters[0]?.type === 'largeText' && letters[0].value === 'AB',
    row,
  );
}
// 加框字母（oth@cls*）**不参与**相邻合并，各自独立成框。
{
  const doc = createNalDocument({ elements: ['oth@cls01.svg', 'oth@cls02.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-cls-nomerge.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  check(
    '保留原样式：加框字母各自独立成框（不合并）',
    row.filter((element) => element.type === 'largeText').length === 2 &&
      !row.some((element) => element.type === 'combination'),
    row,
  );
}
// 未知 `oth@` 号走告警，不静默错映射。
{
  const doc = createNalDocument({ elements: ['oth@99.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-unknown.json', size: 512, text: JSON.stringify(doc) },
  ]);
  check(
    '未登记的 oth@ 号产生未识别告警',
    preview.warnings.some((warning) => warning.code === 'nal-unknown-asset'),
    preview.warnings,
  );
}

console.log('── 13.5 大文本下角标：任意位置 + legacy 兜底 ────────');
// 角标素材并入**当时的位置**：A + two + B → value "AB" + suffixes [{at:1,'2'}]，
// 而不是被挤到末尾变成 "AB₂"。这是「任意位置角标」对导入的核心价值。
{
  const doc = createNalDocument({ elements: ['oth@A.svg', 'oth@two.svg', 'oth@06.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'oth-suffix-mid.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const element = row.find((item) => item.type === 'largeText');
  check(
    '导入：A + 角标 + B 的角标停在 A 之后（value "AB" + at=1）',
    element?.type === 'largeText' &&
      element.value === 'AB' &&
      JSON.stringify(element.suffixes) === JSON.stringify([{ at: 1, value: '2' }]),
    row,
  );
}
// legacy `suffix`（旧存档 / 手填）必须被兜底成「末尾角标」，不能丢。
{
  const legacy = resolveMetroLargeTextSuffixes({ value: 'AB', suffix: '2' });
  check(
    'legacy suffix 兜底成末尾下角标',
    JSON.stringify(legacy) === JSON.stringify([{ at: 2, value: '2' }]),
    legacy,
  );
}
// `suffixes` 优先于 `suffix`：两者同时存在时以位置数据为准。
{
  const resolved = resolveMetroLargeTextSuffixes({
    value: 'AB',
    suffix: '9',
    suffixes: [{ at: 1, value: '2' }],
  });
  check(
    'suffixes 优先于 legacy suffix',
    JSON.stringify(resolved) === JSON.stringify([{ at: 1, value: '2' }]),
    resolved,
  );
}
// 切片段：中间角标两侧都要有正文，顺序不能乱。
{
  const runs = splitMetroLargeTextRuns({
    value: 'AB',
    suffix: '',
    suffixes: [{ at: 1, value: '2' }],
  });
  check(
    'splitMetroLargeTextRuns 交替切出 正文/角标/正文',
    JSON.stringify(runs) ===
      JSON.stringify([
        { kind: 'text', value: 'A' },
        { kind: 'suffix', value: '2' },
        { kind: 'text', value: 'B' },
      ]),
    runs,
  );
}
console.log('── 14. 语义模式：线路文本不重复产出 ────────────');
// 回归锁：线路标自带一个文本子元素（「号线 / Line N」）。早期版本把它当普通文本
// 另行 push，同时 `createRouteTextElement` 又重建一次，导致语义模式出现两个
// 「10号线」文本（一个「10号线 / Line 10」、一个「号线 / Line 10」）。
for (const asset of ['clss@10.svg', 'line@12.svg']) {
  const doc = createNalDocument({ elements: [asset] });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'dedupe.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  const texts = row.filter((element) => element.type === 'text');
  check(`${asset} 语义模式只产 1 个线路文本`, texts.length === 1, row);
}
// 回归锁：色带（sub@）+ 线路标合并后，语义模式拆出的线路文本同样只有一个。
{
  const doc = createNalDocument({ elements: ['sub@04.svg', 'clss@10.svg'] });
  const preview = resolveMetroWayfindingImportPreview(
    parseMetroWayfindingImportFiles([
      { name: 'dedupe-band.json', size: 512, text: JSON.stringify(doc) },
    ]),
    'semantic',
  );
  const row = preview.layout.rows[0]!;
  check(
    '色带 + 线路标：语义模式产「1 线路文本 + 1 带框字母」',
    row.filter((element) => element.type === 'text').length === 1 &&
      row.filter((element) => element.type === 'largeText').length === 1,
    row,
  );
}
// 回归锁：组合框**不得嵌套组合框**（模型词表不允许），色带合并必须摊平。
{
  const doc = createNalDocument({ elements: ['sub@04.svg', 'line@12.svg'] });
  const preview = parseMetroWayfindingImportFiles([
    { name: 'flat.json', size: 512, text: JSON.stringify(doc) },
  ]);
  const row = preview.layout.rows[0]!;
  const combination = row.find((element) => element.type === 'combination');
  const hasNestedCombination =
    combination?.type === 'combination' &&
    combination.children.some((child) => child.type === 'combination');
  check(
    '色带合并后不产生嵌套组合框（children 已摊平）',
    combination?.type === 'combination' && !hasNestedCombination,
    row,
  );
}

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);

/** 按 Chitose Sign Maker 的真实导出结构构造工程（columns → zones → components）。 */
function createChitoseDocument(component: {
  className: string;
  dataset?: Record<string, string>;
  innerHTML: string;
}) {
  return {
    addonId: 'default',
    projectName: 'check',
    canvasWidth: '900',
    signStyleId: 'XG-TypeA',
    columns: [
      {
        zones: [
          {
            category: 'exit',
            style: '',
            components: [
              {
                className: component.className,
                tagName: 'div',
                dataset: component.dataset ?? {},
                style: '',
                innerHTML: component.innerHTML,
              },
            ],
          },
        ],
      },
    ],
  };
}

interface NalDocumentOptions {
  elements: string[];
  align?: 'left' | 'center' | 'right' | 'equidistant';
  group?: boolean;
  layer2?: boolean;
  definitions?: Record<string, unknown>;
}

/** 按 vitool 真实导出结构（type/size-h/size-l/group/layers/definitions）构造工程。 */
function createNalDocument(options: NalDocumentOptions) {
  const groups = [{ id: 'g1', align: options.align ?? 'left', elements: options.elements }];
  const layers: Record<string, unknown> = { layer1: groups };
  if (options.layer2) layers.layer2 = [...groups];
  return {
    type: 'nalvitool',
    mode: 'a',
    'size-h': options.layer2 ? 2 : 1,
    'size-l': 5,
    group: options.group === true,
    layers,
    definitions: options.definitions ?? {},
  };
}

function createTextDefinition(input: {
  cn: string;
  en: string;
  drct?: string;
  extra?: Record<string, string>;
}) {
  return {
    cn: input.cn,
    en: input.en,
    drct: input.drct ?? 'start',
    clr: '',
    file: 'custom.svg',
    originalSvg: '<svg/>',
    flipH: false,
    flipV: false,
    type: 'text',
    ...(input.extra ?? {}),
  };
}
