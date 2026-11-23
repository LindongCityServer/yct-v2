/**
 * 校验物料模板「两端对齐」文本在浏览器预览与 resvg 导出之间的排版一致性。
 *
 * 背景：模板用 `letter-spacing` 实现两端对齐。浏览器会把最后一个字之后的字距也算进
 * `text-anchor` 的排版宽度，resvg 不会；若两边共用同一份补偿，导出图会整体偏移半个字距，
 * 出现「预览居中、导出顶到边框」的问题（公交站牌站名是典型例子）。
 *
 * 运行：`pnpm --filter @yct/web exec tsx ../../scripts/checks/verify-material-letter-spacing.ts`
 *
 * 覆盖：
 * 1. 所有系统模板里 `{{fit.*.letterSpacing}}` 的两端对齐文本；
 * 2. 浏览器口径 SVG 与光栅化口径 SVG 只允许存在「尾部字距补偿」的差异；
 * 3. 实际 PNG 出图里，站名 / 路名 / 地址 / 地铁站名等文字仍居中（不被补偿推偏）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { MaterialCanvasConfig, MaterialTemplateVersion } from '@yct/contracts';
import { systemMaterialTemplateRecords } from '../../apps/web/lib/system-material-templates';
import { renderMaterialTemplateToPng } from '../../apps/web/lib/material-renderer';
import { composeMaterialTemplateSvg } from '../../apps/web/lib/material-svg';
import { createServerMaterialGlyphAssets } from '../../apps/web/lib/material-glyph-server-assets';
import {
  BUILDING_ADDRESS_TEMPLATE_ID,
  BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
  BUS_STOP_OVERVIEW_TEMPLATE_ID,
  BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
  BUS_STOP_TERMINAL_TEMPLATE_ID,
  METRO_STATION_NAME_OLD_TEMPLATE_ID,
  ROAD_NAME_DIRECTION_TEMPLATE_ID,
} from '../../apps/web/lib/material-template-ids';

const assets = createServerMaterialGlyphAssets();

interface TextSample {
  templateId: string;
  fieldKey: string;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  /** 该文字在设计坐标里的视觉中心；PNG 出图后按画布比例换算。 */
  expectedCenterX: number;
}

/** 用模板字段定义 + 模板族常见值，拼出一份能通过校验的示例输入。 */
function buildSampleValues(template: MaterialTemplateVersion): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) {
    if (field.defaultValue !== undefined) {
      values[field.key] = field.defaultValue;
      continue;
    }
    if (field.kind === 'select') {
      values[field.key] = field.options?.[0]?.value ?? '';
      continue;
    }
    if (field.kind === 'number') {
      values[field.key] = String(field.minimum ?? 0);
      continue;
    }
    if (field.kind === 'color') {
      values[field.key] = '#123456';
      continue;
    }
    values[field.key] = sampleTextForField(field.key);
  }
  return values;
}

function sampleTextForField(key: string): string {
  const samples: Record<string, string> = {
    stationName: '临东站南',
    stationNamePinyin: 'LINDONGZHANNAN',
    roadName: '临东大道',
    roadNamePinyin: 'LINDONG DADAO',
    postalCode: '123456',
    buildingNumber: '123',
    buildingSuffix: '号',
    routeNumber: '环',
    routeSuffix: '路',
    routeOrigin: '临东站',
    routeTerminal: '南站',
    routeServiceTime: '06:00-22:00',
    routeFirstLast: '06:00-22:00',
    footerText: '开往南站',
    operator: '临东公交',
    nextStation: '临东站',
    nextStationName: '临东站',
    nextStationPinyin: 'LINDONGZHAN',
    terminalName: '南站',
    terminalNamePinyin: 'NANZHAN',
    lineLabel: '1',
    lineEnglishLabel: 'Line 1',
    routeStations: '临东站/东站/南站',
    routeMapData: '',
    currentStationIndex: '0',
  };
  return samples[key] ?? '示例';
}

/** 找出模板源码里真正使用了两端对齐字距的字段。 */
function collectLetterSpacedFields(template: MaterialTemplateVersion): string[] {
  const keys = new Set<string>();
  for (const match of template.source.matchAll(
    /\{\{fit\.([a-z][a-zA-Z0-9_]*)\.letterSpacing\}\}/gu,
  )) {
    keys.add(match[1]);
  }
  return [...keys];
}

interface SpacedTextTag {
  attributes: string;
  spacing: number;
  anchor?: string;
  x: number;
  dx?: number;
  glyphMarked: boolean;
}

function parseSpacedTextTags(svg: string): SpacedTextTag[] {
  const tags: SpacedTextTag[] = [];
  for (const match of svg.matchAll(/<text\b([^>]*\bletter-spacing="[^"]+"[^>]*)>/gu)) {
    const attributes = match[1];
    const spacing = Number(attributes.match(/\bletter-spacing="([^"]+)"/u)?.[1]);
    if (!Number.isFinite(spacing) || spacing === 0) {
      continue;
    }
    const x = Number(attributes.match(/\bx="([^"]+)"/u)?.[1] ?? 0);
    const dxText = attributes.match(/\bdx="([^"]+)"/u)?.[1];
    tags.push({
      attributes,
      spacing,
      anchor: attributes.match(/\btext-anchor="(middle|end)"/u)?.[1],
      x: Number.isFinite(x) ? x : 0,
      dx: dxText === undefined ? undefined : Number(dxText),
      glyphMarked: attributes.includes('data-yct-spacing="glyph-middle"'),
    });
  }
  return tags;
}

function letterSpacedTemplates(): { template: MaterialTemplateVersion; fields: string[] }[] {
  const entries: { template: MaterialTemplateVersion; fields: string[] }[] = [];
  for (const record of systemMaterialTemplateRecords) {
    for (const version of record.versions) {
      const fields = collectLetterSpacedFields(version);
      if (fields.length) {
        entries.push({ template: version, fields });
      }
    }
  }
  return entries;
}

test('所有两端对齐字段都同时出现在浏览器与光栅化产物中', () => {
  const entries = letterSpacedTemplates();
  assert.ok(entries.length >= 6, `应至少覆盖 6 个含两端对齐的模板，实际 ${entries.length}`);
  for (const { template, fields } of entries) {
    const values = buildSampleValues(template);
    const canvas = template.defaultCanvas;
    const browser = composeMaterialTemplateSvg({
      template,
      values,
      canvas,
      assets,
      tolerateFieldErrors: true,
    });
    const raster = composeMaterialTemplateSvg({
      template,
      values,
      canvas,
      assets,
      rasterize: true,
      tolerateFieldErrors: true,
    });
    const browserTags = parseSpacedTextTags(browser.svg);
    const rasterTags = parseSpacedTextTags(raster.svg);
    assert.equal(
      browserTags.length,
      rasterTags.length,
      `${template.title} 的两端对齐文本数量不一致：${browserTags.length} / ${rasterTags.length}`,
    );
    assert.ok(
      browserTags.length >= 1,
      `${template.title} 没有渲染出任何两端对齐文本（${fields.join('、')}）`,
    );
    assert.ok(
      !/(?:^|\s)data-yct-spacing=/u.test(browser.svg) &&
        !/(?:^|\s)data-yct-spacing=/u.test(raster.svg),
      `${template.title} 的中间标记不应残留到产物 SVG`,
    );
  }
});

test('浏览器口径与光栅化口径只差尾部字距补偿', () => {
  for (const { template } of letterSpacedTemplates()) {
    const values = buildSampleValues(template);
    const canvas = template.defaultCanvas;
    const browser = composeMaterialTemplateSvg({
      template,
      values,
      canvas,
      assets,
      tolerateFieldErrors: true,
    });
    const raster = composeMaterialTemplateSvg({
      template,
      values,
      canvas,
      assets,
      rasterize: true,
      tolerateFieldErrors: true,
    });
    const browserTags = parseSpacedTextTags(browser.svg);
    const rasterTags = parseSpacedTextTags(raster.svg);
    for (let index = 0; index < browserTags.length; index += 1) {
      const browserTag = browserTags[index]!;
      const rasterTag = rasterTags[index]!;
      const label = `${template.title} 第 ${index + 1} 段字距文本`;
      assert.equal(rasterTag.spacing, browserTag.spacing, `${label} 字距不一致`);
      assert.equal(rasterTag.anchor, browserTag.anchor, `${label} 锚点不一致`);
      if (browserTag.glyphMarked) {
        // 字形渲染器已按浏览器口径 +字距/2，光栅化时扣回。
        assert.equal(rasterTag.dx, undefined, `${label} 光栅化产物不应再带 dx`);
        assert.ok(
          Math.abs(rasterTag.x - (browserTag.x - browserTag.spacing / 2)) < 0.02,
          `${label} 光栅化 x 应扣回半个字距：${rasterTag.x} vs ${browserTag.x}`,
        );
        continue;
      }
      if (browserTag.anchor === 'middle' || browserTag.anchor === 'end') {
        const expectedDx =
          browserTag.anchor === 'middle' ? browserTag.spacing / 2 : browserTag.spacing;
        assert.ok(
          browserTag.dx !== undefined && Math.abs(browserTag.dx - expectedDx) < 0.02,
          `${label} 浏览器口径应补 dx=${expectedDx}，实际 ${browserTag.dx}`,
        );
        assert.equal(rasterTag.dx, undefined, `${label} 光栅化产物不应带 dx`);
        assert.ok(Math.abs(rasterTag.x - browserTag.x) < 0.02, `${label} 两种口径 x 应一致`);
      }
    }
  }
});

/** 渲染时把目标字段清空，前后两张 PNG 的差异区域就是这段文字的实际墨迹。 */
async function measureTextCenter(
  template: MaterialTemplateVersion,
  values: Record<string, string>,
  canvas: MaterialCanvasConfig,
  fieldKey: string,
): Promise<{ centerDesign: number; leftDesign: number; rightDesign: number }> {
  const render = (input: Record<string, string>) =>
    renderMaterialTemplateToPng({
      template,
      values: input,
      canvas,
      validation: { allowMissingRequiredValues: true },
    });
  const withText = await render(values);
  const withoutText = await render({ ...values, [fieldKey]: '' });
  const before = await sharp(withText.png)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const after = await sharp(withoutText.png)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(before.info.width, after.info.width);
  assert.equal(before.info.height, after.info.height);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let y = 0; y < before.info.height; y += 1) {
    for (let x = 0; x < before.info.width; x += 1) {
      const i = (y * before.info.width + x) * before.info.channels;
      const diff =
        Math.abs(before.data[i]! - after.data[i]!) +
        Math.abs(before.data[i + 1]! - after.data[i + 1]!) +
        Math.abs(before.data[i + 2]! - after.data[i + 2]!);
      if (diff > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  assert.ok(Number.isFinite(minX), `清空 ${fieldKey} 后画面没有变化，无法测量`);
  const scale = before.info.width / (canvas.widthM * 128);
  return {
    leftDesign: minX / scale,
    rightDesign: (maxX + 1) / scale,
    centerDesign: (minX + maxX + 1) / 2 / scale,
  };
}

const visualCases: TextSample[] = [
  {
    templateId: BUS_STOP_TERMINAL_REALISTIC_TEMPLATE_ID,
    fieldKey: 'stationName',
    values: {
      stationName: '临东站南',
      stationNamePinyin: 'LINDONGZHANNAN',
      routeNumber: '环',
      routeTemporaryStop: 'no',
      terminalRole: '始发站',
    },
    canvas: { widthM: 1, heightM: 1.40625, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 64,
  },
  {
    templateId: BUS_STOP_TERMINAL_TEMPLATE_ID,
    fieldKey: 'stationName',
    values: {
      stationName: '临东站南',
      stationNamePinyin: 'LINDONGZHANNAN',
      routeNumber: '环',
      routeTemporaryStop: 'no',
      terminalRole: '始发站',
    },
    canvas: { widthM: 1, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 64,
  },
  {
    templateId: BUS_STOP_OVERVIEW_TEMPLATE_ID,
    fieldKey: 'stationName',
    values: { stationName: '临东站南', route1Number: '1', route2Number: '2' },
    canvas: { widthM: 1, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 64,
  },
  {
    templateId: BUS_STOP_OVERVIEW_REALISTIC_TEMPLATE_ID,
    fieldKey: 'stationName',
    values: { stationName: '临东站南', route1Number: '1', route2Number: '2' },
    canvas: { widthM: 1, heightM: 1.40625, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 64,
  },
  {
    templateId: ROAD_NAME_DIRECTION_TEMPLATE_ID,
    fieldKey: 'roadName',
    values: {
      roadName: '临东大道',
      roadNamePinyin: 'LINDONG DADAO',
      signColor: '#004796',
      directionMode: 'west_east',
      arrowMode: 'dual_arrow',
    },
    canvas: { widthM: 2, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 128,
  },
  {
    templateId: BUILDING_ADDRESS_TEMPLATE_ID,
    fieldKey: 'roadName',
    values: {
      roadName: '临东大道',
      roadNamePinyin: 'LINDONG DADAO',
      postalCode: '123456',
      buildingNumber: '123',
      buildingSuffix: '号',
    },
    canvas: { widthM: 2, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 70,
  },
  {
    templateId: METRO_STATION_NAME_OLD_TEMPLATE_ID,
    fieldKey: 'stationName',
    values: {
      accentColor: '#57D33E',
      stationName: '临东站南',
      stationNamePinyin: 'LINDONGZHANNAN',
    },
    canvas: { widthM: 4.5, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 288,
  },
  {
    templateId: BUS_STOP_HORIZONTAL_DETAIL_TEMPLATE_ID,
    fieldKey: 'footerText',
    values: {
      accentColor: '#26CABA',
      routeNumber: '环',
      routeSuffix: '路',
      travelDirection: 'last',
      routeOrigin: '临东站',
      routeTerminal: '南站',
      routeServiceTime: '06:00-22:00',
      routeStations: '临东站/东站/南站',
      currentStationIndex: '0',
      footerText: '开往南站',
      operator: '临东公交',
      footerMode: 'destination',
    },
    canvas: { widthM: 2, heightM: 1, pxPerMeter: 128, alignToTile: false, tileSizePx: 128 },
    expectedCenterX: 128,
  },
];

test('PNG 导出里两端对齐文字仍然居中', async () => {
  for (const sample of visualCases) {
    const record = systemMaterialTemplateRecords.find((item) => item.id === sample.templateId);
    const template = record?.versions[0];
    if (!template) {
      // 平台站名标志等模板由其它检查覆盖；这里只跳过不存在的模板。
      continue;
    }
    const measured = await measureTextCenter(
      template,
      sample.values,
      sample.canvas,
      sample.fieldKey,
    );
    assert.ok(
      Math.abs(measured.centerDesign - sample.expectedCenterX) <= 1.2,
      `${template.title} 的 ${sample.fieldKey} 未居中：中心 ${measured.centerDesign.toFixed(2)}，期望 ${sample.expectedCenterX}`,
    );
    const symmetric = Math.abs(
      sample.expectedCenterX -
        measured.leftDesign -
        (measured.rightDesign - sample.expectedCenterX),
    );
    assert.ok(
      symmetric <= 2,
      `${template.title} 的 ${sample.fieldKey} 左右留白不对称：${(sample.expectedCenterX - measured.leftDesign).toFixed(2)} / ${(measured.rightDesign - sample.expectedCenterX).toFixed(2)}`,
    );
  }
});
