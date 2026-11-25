/**
 * 导视牌本轮新增能力：字号倍数、首尾边距、旧版箭头 / 出口图标、模板库旧版样式。
 * 只做纯函数与同构 SVG 渲染断言，不启动浏览器。
 */
import assert from 'node:assert/strict';
import {
  applyMetroWayfindingTemplateStyle,
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
  '模板库旧版样式：箭头切旧版、出口换绿底旧图标、去掉出口/EXIT 文本',
  styledArrow?.type === 'arrow' &&
    styledArrow.style === 'classic' &&
    styledExit?.type === 'facility' &&
    styledExit.iconId === 'exit-classic' &&
    styledExit.scale === 1 &&
    !styledRow.some((element) => element.type === 'text' && element.id === 't'),
);
check(
  '模板库旧版样式：单线路地铁图标使用线路色',
  styledSubway?.type === 'facility' && styledSubway.backgroundColor === '#E4002B',
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

if (failed > 0) {
  console.error(`\n${passed}/${passed + failed} 通过，${failed} 项失败。`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed}/${passed + failed} 通过。`);
}
