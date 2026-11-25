/**
 * 导视牌本轮新增能力：字号倍数、首尾边距、旧版箭头 / 出口图标、模板库旧版样式。
 * 只做纯函数与同构 SVG 渲染断言，不启动浏览器。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyMetroWayfindingTemplateStyle,
  hasMetroWayfindingFixedTextSegments,
  parseMetroWayfindingLayout,
  resolveMetroWayfindingElementWidth,
  resolveMetroWayfindingLayoutPadding,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingTextMetrics,
  resolveMetroWayfindingVerticalElementHeight,
  serializeMetroWayfindingLayout,
  type MetroWayfindingLayout,
} from '../../apps/web/lib/metro-wayfinding';
import { renderMetroWayfindingSvg } from '../../apps/web/lib/metro-wayfinding-svg';
import { buildMetroWayfindingTemplateExamples } from '../../apps/web/lib/metro-wayfinding-examples';

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

const markup = { viewBox: '0 0 100 100', content: '<rect width="100" height="100"/>' };
const requestedAssets: string[] = [];
const assets = {
  getMaterialSymbolMarkup: () => markup,
  getMetroFacilityAssetMarkup: (assetName: string) => {
    requestedAssets.push(assetName);
    return markup;
  },
  getMetroArrowAssetMarkup: () => markup,
};

const textLayout = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    paddingStart: false,
    paddingEnd: true,
    rows: [
      [
        {
          id: 't',
          type: 'text',
          align: 'center',
          writingMode: 'horizontal',
          scale: 2,
          rows: [{ id: 'r', kind: 'main', segments: [{ kind: 'text', value: '测试' }] }],
        },
      ],
    ],
  }),
);
check(
  '解析字号倍数与首尾边距开关',
  textLayout.rows[0]![0]!.type === 'text' &&
    textLayout.rows[0]![0]!.scale === 2 &&
    textLayout.paddingStart === false &&
    textLayout.paddingEnd === true,
);
check(
  '首尾边距换算为实际像素',
  resolveMetroWayfindingLayoutPadding(textLayout).start === 0 &&
    resolveMetroWayfindingLayoutPadding(textLayout).end === 22,
);
const textElement = textLayout.rows[0]![0]!;
const scaledMetrics = resolveMetroWayfindingTextMetrics(
  textElement.type === 'text' ? textElement.rows : [],
  2,
);
const defaultMetrics = resolveMetroWayfindingTextMetrics(
  textElement.type === 'text' ? textElement.rows : [],
  1,
);
check(
  '字号倍数影响字号与宽度',
  scaledMetrics.mainFontSize === defaultMetrics.mainFontSize * 2 &&
    resolveMetroWayfindingElementWidth(textElement) > 0,
);
check('竖向布局高度随字号倍数变化', resolveMetroWayfindingVerticalElementHeight(textElement) > 0);

const iconDefault = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'i',
          type: 'facility',
          iconId: 'stairs',
          frameShape: 'none',
          frameFillMode: 'none',
          frameStroke: false,
        },
      ],
    ],
  }),
).rows[0]![0]!;
const iconFullHeight = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'i',
          type: 'facility',
          iconId: 'stairs',
          scale: 1,
          frameShape: 'none',
          frameFillMode: 'none',
          frameStroke: false,
        },
      ],
    ],
  }),
).rows[0]![0]!;
check(
  '图标默认保持原尺寸，缩放为 1 时撑满 128px 高度',
  Math.round(resolveMetroWayfindingElementWidth(iconDefault)) === 85 &&
    Math.round(resolveMetroWayfindingElementWidth(iconFullHeight)) === 128 &&
    Math.round(resolveMetroWayfindingVerticalElementHeight(iconFullHeight)) === 128,
);

const oldArrowLayout = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'a',
          type: 'arrow',
          iconId: 'north',
          style: 'classic',
          framed: false,
          frameFillMode: 'none',
          frameStroke: false,
        },
      ],
    ],
  }),
);
const oldArrowSvg = renderMetroWayfindingSvg(
  serializeMetroWayfindingLayout(oldArrowLayout),
  512,
  128,
  assets,
);
check(
  '旧版箭头渲染为八方向旋转路径',
  oldArrowSvg.includes('rotate(90)') && oldArrowSvg.includes('M0.424316'),
);

const styleLayout = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'a',
          type: 'arrow',
          iconId: 'north',
          framed: false,
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'e',
          type: 'facility',
          iconId: 'exit',
          frameShape: 'rectangle',
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 't',
          type: 'text',
          align: 'center',
          writingMode: 'horizontal',
          rows: [
            { id: 'r', kind: 'main', segments: [{ kind: 'text', value: '出口' }] },
            { id: 'r2', kind: 'main', segments: [{ kind: 'text', value: 'EXIT' }] },
          ],
        },
        {
          id: 's',
          type: 'facility',
          iconId: 'subway',
          frameShape: 'rectangle',
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'l',
          type: 'text',
          align: 'center',
          writingMode: 'horizontal',
          rows: [
            { id: 'lr', kind: 'main', segments: [{ kind: 'line', value: '1', color: '#E4002B' }] },
          ],
        },
      ],
    ],
  }),
) as MetroWayfindingLayout;
const styled = applyMetroWayfindingTemplateStyle(styleLayout, 'classic');
const styledRow = styled.rows[0]!;
check(
  '模板库旧版样式：只有箭头变黄色，牌面前景保持原色',
  styled.foregroundColor === '#FFFFFF' &&
    styledRow.find((element) => element.type === 'arrow')?.foregroundColor === '#F2C94C',
);
const styledArrow = styledRow.find((element) => element.type === 'arrow');
const styledExit = styledRow.find((element) => element.type === 'facility' && element.id === 'e');
const styledSubway = styledRow.find((element) => element.type === 'facility' && element.id === 's');
check(
  '模板库旧版样式：箭头切旧版、出口换单色旧图标、去掉出口/EXIT 文本',
  styledArrow?.type === 'arrow' &&
    styledArrow.style === 'classic' &&
    styledArrow.scale === 0.9 &&
    styledExit?.type === 'facility' &&
    styledExit.iconId === 'exit-classic' &&
    styledExit.scale === 0.9 &&
    !styledRow.some((element) => element.type === 'text' && element.id === 't'),
);
check(
  '模板库旧版样式：单线路地铁图标使用外框填充线路色，背景跟随导视牌',
  styledSubway?.type === 'facility' &&
    styledSubway.frameFillMode === 'color' &&
    styledSubway.frameFillColor === '#E4002B' &&
    styledSubway.frameStroke === true &&
    styledSubway.backgroundColor === undefined,
);

const classicExitSvg = renderMetroWayfindingSvg(
  serializeMetroWayfindingLayout(
    parseMetroWayfindingLayout(
      JSON.stringify({
        backgroundColor: '#262626',
        foregroundColor: '#FFFFFF',
        mode: 'single',
        dividerBetweenRows: false,
        rows: [
          [
            {
              id: 'e',
              type: 'facility',
              iconId: 'exit-classic',
              frameShape: 'none',
              frameFillMode: 'none',
              frameStroke: false,
            },
          ],
        ],
      }),
    ),
  ),
  512,
  128,
  assets,
);
check(
  '旧版出口图标加载 exit-classic 素材',
  requestedAssets.includes('exit-classic') && classicExitSvg.includes('data-metro-wayfinding'),
);

const paddingWidth = resolveMetroWayfindingLayoutSizing([textElement], 512, { start: 0, end: 0 });
const defaultWidth = resolveMetroWayfindingLayoutSizing([textElement], 512);
check(
  '关闭首尾边距后可用宽度变大',
  paddingWidth.hasUnresolvedOverflow === false && defaultWidth.elementWidths.length === 1,
);

const doubleExitLayout = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'a1',
          type: 'arrow',
          iconId: 'west',
          framed: false,
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'e1',
          type: 'facility',
          iconId: 'exit',
          frameShape: 'none',
          frameFillMode: 'none',
          frameStroke: false,
        },
        { id: 'sp1', type: 'space', mode: 'flex', units: 1 },
        {
          id: 'la',
          type: 'largeText',
          value: 'A',
          frameShape: 'rectangle',
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'lc',
          type: 'largeText',
          value: 'C',
          frameShape: 'rectangle',
          frameFillMode: 'none',
          frameStroke: false,
        },
        { id: 'd', type: 'divider' },
        { id: 'sp2', type: 'space', mode: 'flex', units: 1 },
        {
          id: 'lb',
          type: 'largeText',
          value: 'B',
          frameShape: 'rectangle',
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'e2',
          type: 'facility',
          iconId: 'exit',
          frameShape: 'none',
          frameFillMode: 'none',
          frameStroke: false,
        },
        {
          id: 'a2',
          type: 'arrow',
          iconId: 'east',
          framed: false,
          frameFillMode: 'none',
          frameStroke: false,
        },
      ],
    ],
  }),
);
const styledDouble = applyMetroWayfindingTemplateStyle(doubleExitLayout, 'classic', {
  remark: '双侧出口编号',
  exitSides: {
    left: [{ code: 'A', description: '临东路 路东', hasAccessibleElevator: true }],
    right: [{ code: 'B', description: '临东路 路西' }],
  },
});
const doubleRow = styledDouble.rows[0]!;
const doubleExitClassics = doubleRow.filter(
  (element) => element.type === 'facility' && element.iconId === 'exit-classic',
);
check(
  '旧版双侧出口在两端箭头与出口文本之间保留两个绿底出字标，中间保留分割线',
  doubleRow.some((element) => element.type === 'divider') &&
    doubleExitClassics.length === 2 &&
    doubleExitClassics.every(
      (element) => element.type === 'facility' && element.backgroundColor === '#009F3C',
    ),
);
const rightDescription = doubleRow.find(
  (element) => element.type === 'text' && element.align === 'right',
);
check(
  '旧版双侧出口右对齐描述放在方框编号左侧，电梯图标在出口标识对应侧',
  rightDescription?.type === 'text' &&
    rightDescription.rows[0]?.kind === 'main' &&
    rightDescription.rows[0].segments[0]?.kind === 'text' &&
    rightDescription.rows[0].segments.at(-1)?.kind === 'boxed' &&
    rightDescription.rows.length === 2 &&
    doubleRow.filter((element) => element.type === 'facility' && element.iconId === 'elevator')
      .length === 1,
);

const fixedTextLayout = parseMetroWayfindingLayout(
  JSON.stringify({
    backgroundColor: '#262626',
    foregroundColor: '#FFFFFF',
    mode: 'single',
    dividerBetweenRows: false,
    rows: [
      [
        {
          id: 'fixed',
          type: 'text',
          align: 'left',
          writingMode: 'horizontal',
          rows: [{ id: 'fr', kind: 'main', segments: [{ kind: 'boxed', value: 'A' }] }],
        },
        {
          id: 'normal',
          type: 'text',
          align: 'left',
          writingMode: 'horizontal',
          rows: [
            {
              id: 'nr',
              kind: 'main',
              segments: [{ kind: 'text', value: '一段非常非常长的普通说明文字' }],
            },
          ],
        },
      ],
    ],
  }),
);
const fixedTextSizing = resolveMetroWayfindingLayoutSizing(fixedTextLayout.rows[0]!, 220);
check(
  '线路编号 / 方框文本不参与空间不足的横向压缩',
  hasMetroWayfindingFixedTextSegments(fixedTextLayout.rows[0]![0]!) &&
    fixedTextSizing.textScaleX < 1 &&
    fixedTextSizing.elementWidths[0] ===
      resolveMetroWayfindingElementWidth(fixedTextLayout.rows[0]![0]!),
);

const exitUpExamples = buildMetroWayfindingTemplateExamples(
  {
    name: '测试站',
    lines: [{ id: 'L1', name: '1号线', color: '#E4002B', secondaryName: 'Line 1' }],
    exits: [{ code: 'A', direction: 'upwards', description: '临东路 路东' }],
    overGround: false,
  },
  'L1',
);
const exitUp = exitUpExamples.find((example) => example.source.remark === '出口与上楼');
const modernExitUpRow = exitUp?.project.layout.rows[0] ?? [];
const exitUpRow =
  exitUp === undefined
    ? []
    : (applyMetroWayfindingTemplateStyle(exitUp.project.layout, 'classic', {
        remark: exitUp.source.remark,
        currentExits: exitUp.currentExits,
        lineColor: exitUp.lineColor,
      }).rows[0] ?? []);
const descriptionIndex = exitUpRow.findIndex(
  (element) =>
    element.type === 'text' &&
    element.rows.some(
      (row) => row.kind === 'main' && row.segments.some((segment) => segment.kind === 'boxed'),
    ),
);
check(
  '旧版出口与上楼在出口图标和上楼图标之间加入方框出口描述和弹性空白',
  descriptionIndex > 0 &&
    exitUpRow[descriptionIndex - 1]?.type === 'facility' &&
    exitUpRow.some((element) => element.type === 'space' && element.mode === 'flex') &&
    exitUpRow.some(
      (element) =>
        element.type === 'text' &&
        element.rows.some(
          (row) =>
            row.kind === 'main' &&
            row.segments.some(
              (segment) => segment.kind === 'text' && !segment.value.includes(' / '),
            ),
        ),
    ),
);
check(
  '新版出口与上楼不插入出口编号/描述，末尾保留左对齐出口/EXIT',
  !modernExitUpRow.some(
    (element) =>
      element.type === 'text' &&
      element.rows.some(
        (row) => row.kind === 'main' && row.segments.some((segment) => segment.kind === 'boxed'),
      ),
  ) &&
    modernExitUpRow.some(
      (element) =>
        element.type === 'text' &&
        element.align === 'left' &&
        element.rows.some((row) =>
          row.kind === 'main'
            ? row.segments.some((segment) => segment.value.trim() === '出口')
            : row.value.trim() === 'EXIT',
        ),
    ),
);

const leftDescriptionIndex = doubleRow.findIndex(
  (element) =>
    element.type === 'text' &&
    element.align === 'left' &&
    element.rows.some(
      (row) => row.kind === 'main' && row.segments.some((segment) => segment.kind === 'boxed'),
    ),
);
const elevatorIndex = doubleRow.findIndex(
  (element) => element.type === 'facility' && element.iconId === 'elevator',
);
const dividerIndex = doubleRow.findIndex((element) => element.type === 'divider');
check(
  '旧版双侧出口设施图标位于出口文本和中间分割线之间',
  leftDescriptionIndex >= 0 && elevatorIndex > leftDescriptionIndex && dividerIndex > elevatorIndex,
);

const exitClassicAsset = readFileSync(
  new URL('../../apps/web/public/metro-facilities/plain/exit-classic.svg', import.meta.url),
  'utf8',
);
check(
  '旧版出口图标为单色素材并保留边距',
  exitClassicAsset.includes('currentColor') &&
    !exitClassicAsset.includes('#009f3c') &&
    exitClassicAsset.includes('viewBox="0 0 150 150"'),
);

const exteriorExamples = buildMetroWayfindingTemplateExamples(
  {
    name: '滂江街',
    secondaryName: 'PANG JIANG JIE',
    lines: [{ id: 'L1', name: '1号线', color: '#E4002B', secondaryName: 'Line 1' }],
    exits: [],
  },
  'L1',
);
const exterior = exteriorExamples.find((example) => example.source.remark === '站外线路标识');
check(
  '旧版站外线路标识使用 1×6 竖向工程',
  exterior?.classicProject?.canvas.widthM === 1 &&
    exterior.classicProject.canvas.heightM === 6 &&
    exterior.classicProject.layout.mode === 'vertical' &&
    exterior.classicProject.layout.rows[0]?.some(
      (element) => element.type === 'text' && element.scale === 0.5 && element.align === 'center',
    ) &&
    exterior.classicProject.layout.rows[0]?.some(
      (element) =>
        element.type === 'combination' &&
        element.backgroundColor === '#E53935' &&
        element.foregroundColor === '#FFFFFF' &&
        element.children.some(
          (child) =>
            child.type === 'facility' &&
            child.iconId === 'subway' &&
            child.scale === 0.7 &&
            child.frameShape === 'rectangle' &&
            child.frameFillMode === 'none',
        ),
    ),
);

const mergedExitExamples = buildMetroWayfindingTemplateExamples(
  {
    name: '合并出口站',
    lines: [{ id: 'L1', name: '1号线', color: '#E4002B' }],
    exits: [
      { code: 'A1', direction: 'upwards', description: '同一段描述' },
      { code: 'A2', direction: 'upwards', description: '同一段描述' },
      { code: 'B', direction: 'downwards', description: '另一段描述' },
    ],
    overGround: false,
  },
  'L1',
);
const mergedExitUp = mergedExitExamples.find((example) => example.source.remark === '出口与上楼');
const mergedRow =
  mergedExitUp === undefined
    ? []
    : (applyMetroWayfindingTemplateStyle(mergedExitUp.project.layout, 'classic', {
        remark: mergedExitUp.source.remark,
        currentExits: mergedExitUp.currentExits,
      }).rows[0] ?? []);
const mergedDescription = mergedRow
  .flatMap((element) => (element.type === 'text' ? element.rows : []))
  .flatMap((row) => (row.kind === 'main' ? row.segments : []))
  .filter((segment) => segment.kind === 'boxed')
  .map((segment) => segment.value);
check(
  '旧版出口描述合并 A1/A2 并去掉重复描述段',
  mergedDescription.includes('A') &&
    mergedDescription.includes('B') &&
    !mergedDescription.includes('A1') &&
    !mergedDescription.includes('A2'),
);

if (failed > 0) {
  console.error(`\n${passed}/${passed + failed} 通过，${failed} 项失败。`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed}/${passed + failed} 通过。`);
}
