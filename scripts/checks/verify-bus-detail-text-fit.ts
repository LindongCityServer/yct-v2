/**
 * 竖版公交站牌（线路详情）的文字适配回归：
 * - 站点列表在行高不足时按纵向压扁字高，保持字号/字宽，避免整体缩成小字；
 * - 头部「下一站」向右避开小字标题，「首末站」给箭头留出宽度，长文本继续横向压缩。
 *
 * 运行：`pnpm exec tsx scripts/checks/verify-bus-detail-text-fit.ts`
 */
import assert from 'node:assert/strict';
import { renderMaterialTemplateToSvg } from '../../apps/web/lib/material-renderer';
import { BUS_STOP_DETAIL_TEMPLATE_ID } from '../../apps/web/lib/material-template-ids';
import { resolveQqBotMaterialTemplate } from '../../apps/web/lib/qq-bot-material';

const template = resolveQqBotMaterialTemplate(BUS_STOP_DETAIL_TEMPLATE_ID);
const nextStationField = template.fields.find((field) => field.key === 'nextStation');
const routeOriginField = template.fields.find((field) => field.key === 'routeOrigin');
const routeStationsField = template.fields.find((field) => field.key === 'routeStations');

let passed = 0;
function check(name: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`✅ ${name}`);
}

function baseValues(overrides: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    values[field.key] = field.defaultValue ?? '';
  }
  return { ...values, ...overrides };
}

function renderSvg(stationNames: string[], header: Record<string, string>): string {
  return renderMaterialTemplateToSvg({
    template,
    values: baseValues({
      routeNumber: '1',
      routeStationState: 'next_station',
      travelDirection: 'last',
      routeFirstLast: '05:30-23:00',
      operator: '沈阳地铁',
      routeStations: stationNames.join('\n'),
      currentStationIndex: '0',
      ...header,
    }),
    canvas: { ...template.defaultCanvas, pxPerMeter: 128, alignToTile: false },
    validation: { allowMissingServerDerivedValues: true },
  }).svg;
}

const manyStations = Array.from(
  { length: 32 },
  (_, index) => `测试站${String(index + 1).padStart(2, '0')}`,
);
const fewStations = manyStations.slice(0, 8);
const longHeader = {
  routeOrigin: '临东站西公交枢纽',
  routeTerminal: '世纪新城东',
  nextStation: '云峰街铁道口地铁站',
};

check('下一站自带 90% 横向压缩，超宽时按 48 宽度继续压缩', () => {
  assert.equal(nextStationField?.textFit?.maxWidth, 48);
  assert.equal(nextStationField?.textFit?.defaultScaleX, 0.9);
});

check('首末站组合自带 90% 横向压缩（给箭头留位）', () => {
  assert.equal(routeOriginField?.textFit?.maxWidth, 58);
  assert.equal(routeOriginField?.textFit?.defaultScaleX, 0.9);
});

check('站点列表自带 90% 纵向压缩', () => {
  assert.equal(routeStationsField?.glyph?.defaultScaleY, 0.9);
});

check('32 站时在自带压缩基础上继续压扁，站名字号保持 5', () => {
  const svg = renderSvg(manyStations, longHeader);
  assert.match(svg, /scale\(1 0\.7\d+\)/, '应出现比默认 0.9 更小的纵向缩放');
  const listStart = svg.indexOf('translate(16 41)');
  const listSvg = svg.slice(listStart, listStart + 8000);
  assert.match(listSvg, /font-size="5"/, '站名不应因为行多而整体缩小字号');
});

check('8 站时只使用自带的 0.9 纵向压缩，字号不变', () => {
  const svg = renderSvg(fewStations, longHeader);
  assert.match(svg, /scale\(1 0\.9\)/, '应出现模板自带的 0.9 纵向压缩');
  assert.ok(!/scale\(1 0\.[0-8]/.test(svg), '行高充足时不应继续压缩');
});

check('短「下一站」也使用自带的 90% 横向压缩', () => {
  const svg = renderSvg(fewStations, {
    routeOrigin: '临东站',
    routeTerminal: '南站',
    nextStation: '怀远门',
  });
  assert.match(svg, /translate\(80 0\) scale\(0\.9 1\)/);
  assert.match(svg, /translate\(77 0\) scale\(0\.9 1\)/);
});

check('长「下一站」文本会继续横向缩放，避开左侧小字', () => {
  const svg = renderSvg(fewStations, longHeader);
  assert.match(svg, /translate\(80 0\) scale\(0\.[0-8]\d+ 1\)/);
});

check('长「首末站」文本会继续横向缩放，给箭头和左右边距留位', () => {
  const svg = renderSvg(fewStations, longHeader);
  assert.match(svg, /translate\(77 0\) scale\(0\.[0-8]\d+ 1\)/);
});

console.log(`\n${passed} 项检查通过。`);
