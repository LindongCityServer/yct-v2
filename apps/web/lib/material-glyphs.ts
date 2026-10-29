import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as opentypeModule from 'opentype.js';
import type { Font } from 'opentype.js';
import type { MaterialGlyphConfig } from '@yct/contracts';
import { toUppercasePinyin } from './chinese-pinyin';
import { resolveMetroLineEnglishName } from './metro-wayfinding-import';
import {
  estimateMetroWayfindingLargeTextWidth,
  estimateMetroWayfindingTextWidth,
  measureMetroWayfindingSecondaryText,
  measureMetroWayfindingMainSegments,
  METRO_WAYFINDING_GAP,
  METRO_WAYFINDING_DIVIDER_WIDTH,
  METRO_WAYFINDING_HEIGHT,
  METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE,
  METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE,
  METRO_WAYFINDING_PADDING,
  METRO_WAYFINDING_TEXT_HEIGHT,
  METRO_WAYFINDING_COMBINATION_STRIPE_TOP,
  METRO_WAYFINDING_COMBINATION_GAP,
  METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH,
  METRO_WAYFINDING_FOREGROUND,
  hasMetroWayfindingTextRowContent,
  metroWayfindingIconOptions,
  normalizeColor,
  parseMetroWayfindingLayout,
  resolveMetroArrowIconAssetName,
  resolveMetroFacilityIconAssetName,
  resolveMetroFacilityMirrorTransform,
  resolveMetroWayfindingFacilityDefaultDirection,
  resolveMetroWayfindingLayoutSizing,
  resolveMetroWayfindingCombinationSizing,
  resolveMetroWayfindingElementWidth,
  resolveMetroWayfindingTextMetrics,
  resolveMetroWayfindingVerticalLayoutSizing,
  splitMetroLargeTextRuns,
  type MetroArrowIconAssetName,
  type MetroFacilityIconAssetName,
  type MetroWayfindingElement,
  type MetroWayfindingCombinationElement,
  type MetroWayfindingFrameFillMode,
  type MetroWayfindingFrameShape,
  type MetroWayfindingLargeTextElement,
  type MetroWayfindingMainSegment,
} from './metro-wayfinding';

interface NostalgicDigitGlyph {
  advance: number;
  path: string;
  transform?: string;
}

interface NostalgicSuffixGlyph {
  advance: number;
  path: string;
  sourceOffsetX: number;
}

interface TransitRouteMapPayload {
  route: Array<[number, number]>;
  roads: Array<[number, number, number, number]>;
  stations: Array<[number, number, number]>;
  transfers?: Array<[number, number, number, string[]]>;
  currentStationIndex: number;
}

const nostalgicDigitGlyphs: Record<string, NostalgicDigitGlyph> = {
  '0': {
    advance: 58,
    path: 'M570.5,28L570.5,13.000002C570.5,5.8202987,576.3202987,0,583.500002,0L615,0C622.179703,0,628,5.8202987,628,13.000002L628,72C628,79.179703,622.179703,85,615,85L583.500002,85C576.3202987,85,570.5,79.179703,570.5,72L570.5,28ZM586.75,67L586.75,18C586.75,16.895432,587.645432,16,588.75,16L609.75,16C610.854568,16,611.75,16.895432,611.75,18L611.75,67C611.75,68.104568,610.854568,69,609.75,69L588.75,69C587.645432,69,586.75,68.104568,586.75,67Z',
    transform: 'translate(-570 0)',
  },
  '1': { advance: 21, path: 'M5 0H21V85H5Z' },
  '2': {
    advance: 58,
    path: 'M31,12.000002L31,39L46.5,39L46.5,18.5C46.5,16.290861,48.290861,14.5,50.5,14.5L68.5,14.5C70.709141,14.5,72.5,16.290861,72.5,18.5L72.5,36.995171C72.5,38.256916,71.904675,39.444702,70.89381800000001,40.199799L31,70L31,85L88.5,85L88.5,70L56.5,70L83.60165,48.403374C86.69695300000001,45.936802,88.5,42.194489,88.5,38.236603L88.5,12.000003C88.5,5.3725843,83.127419,0,76.5,0L43.000001,0C36.372583399999996,0,31,5.3725834,31,12.000002Z',
    transform: 'translate(-31 0)',
  },
  '3': {
    advance: 58,
    path: 'M98.5,12.000002L98.5,27L114,27L114,18.5C114,16.290861,115.790861,14.5,118,14.5L136,14.5C138.209141,14.5,140,16.290861,140,18.5L140,33C140,35.209141,138.209141,37,136,37L122.5,37L122.5,51L136,51C138.209141,51,140,52.790859,140,55L140,65.5C140,67.709137,138.209141,69.5,136,69.5L118,69.5C115.790861,69.5,114,67.709137,114,65.5L114,56.5L98.5,56.5L98.5,72C98.5,79.179703,104.3202987,85,111.500002,85L143,85C150.17970300000002,85,156,79.179703,156,72L156,49.201561C156,47.177982,155.080151,45.264118,153.5,44C155.080151,42.735882,156,40.822018,156,38.798439L156,12.000002C156,5.3725834,150.627419,0,144,0L110.500001,0C103.8725834,0,98.5,5.3725834,98.5,12.000002Z',
    transform: 'translate(-98.5 0)',
  },
  '4': {
    advance: 58,
    path: 'M166,75.5L166,58.5L200.5,0L217.5,0L217.5,60.5L223,60.5L223,75.5L217.5,75.5L217.5,85L201.5,85L201.5,75.5L166,75.5ZM201.5,60.5L183.5,60.5L201.5,30L201.5,60.5Z',
    transform: 'translate(-166 0)',
  },
  '5': {
    advance: 58,
    path: 'M233,0L233,28L233,42L233,45L248.5,45L248.5,42L270.5,42C272.709141,42,274.5,43.790859,274.5,46L274.5,65.5C274.5,67.709137,272.709141,69.5,270.5,69.5L252.5,69.5C250.290861,69.5,248.5,67.709137,248.5,65.5L248.5,52.5L233,52.5L233,72C233,79.179703,238.8202987,85,246.000002,85L277.5,85C284.679703,85,290.5,79.179703,290.5,72L290.5,41C290.5,33.820297,284.679703,28,277.5,28L248.5,28L248.5,14.5L290.5,14.5L290.5,0L233,0Z',
    transform: 'translate(-233 0)',
  },
  '6': {
    advance: 58,
    path: 'M300.5,28L300.5,13.000002C300.5,5.8202987,306.3202987,0,313.500002,0L345,0C352.179703,0,358,5.8202987,358,13.000002L358,26.5L342,26.5L342,18.5C342,16.290861,340.209141,14.5,338,14.5L320,14.5C317.790861,14.5,316,16.290861,316,18.5L316,33L345,33C352.179703,33,358,38.820297,358,46L358,72C358,79.179703,352.179703,85,345,85L313.500002,85C306.3202987,85,300.5,79.179703,300.5,72L300.5,28ZM316.75,67L316.75,51C316.75,49.895432,317.645432,49,318.75,49L339.75,49C340.854568,49,341.75,49.895432,341.75,51L341.75,67C341.75,68.104568,340.854568,69,339.75,69L318.75,69C317.645432,69,316.75,68.104568,316.75,67Z',
    transform: 'translate(-300.5 0)',
  },
  '7': {
    advance: 58,
    path: 'M368,0L368,14.5L409,14.5L368,85L385,85L425.5,14.5L425.5,0L368,0Z',
    transform: 'translate(-368 0)',
  },
  '8': {
    advance: 58,
    path: 'M435.5,13.000002L435.5,37.295837C435.5,38.985249,436.34432435,40.562881,437.7499998,41.5C436.34432435,42.437119,435.5,44.014751,435.5,45.704163L435.5,72C435.5,79.179703,441.3202987,85,448.500002,85L480,85C487.179703,85,493,79.179703,493,72L493,45.704163C493,44.014751,492.155674,42.437119,490.75,41.5C492.155674,40.562881,493,38.985249,493,37.295837L493,13.000002C493,5.8202987,487.179703,0,480,0L448.500002,0C441.3202987,0,435.5,5.8202987,435.5,13.000002ZM451.799988,18L451.799988,34C451.799988,35.104568,452.695419,36,453.799988,36L474.799988,36C475.904556,36,476.799988,35.104568,476.799988,34L476.799988,18C476.799988,16.895432,475.904556,16,474.799988,16L453.799988,16C452.695419,16,451.799988,16.895432,451.799988,18ZM451.75,67L451.75,51C451.75,49.895432,452.645432,49,453.75,49L474.75,49C475.854568,49,476.75,49.895432,476.75,51L476.75,67C476.75,68.104568,475.854568,69,474.75,69L453.75,69C452.645432,69,451.75,68.104568,451.75,67Z',
    transform: 'translate(-435.5 0)',
  },
  '9': {
    advance: 58,
    path: 'M560.5,113L560.5,98.000002C560.5,90.8202987,566.3202987,85,573.500002,85L605,85C612.179703,85,618,90.8202987,618,98.000002L618,111.5L602,111.5L602,103.5C602,101.290861,600.209141,99.5,598,99.5L580,99.5C577.790861,99.5,576,101.290861,576,103.5L576,118L605,118C612.179703,118,618,123.820297,618,131L618,157C618,164.179703,612.179703,170,605,170L573.500002,170C566.3202987,170,560.5,164.179703,560.5,157L560.5,113ZM576.75,152L576.75,136C576.75,134.895432,577.645432,134,578.75,134L599.75,134C600.854568,134,601.75,134.895432,601.75,136L601.75,152C601.75,153.104568,600.854568,154,599.75,154L578.75,154C577.645432,154,576.75,153.104568,576.75,152Z',
    transform: 'matrix(-1 0 0 -1 618 170)',
  },
};

const nostalgicSuffixGlyphScale = 42.5 / 83.5;
const nostalgicSuffixGlyphs: Record<string, NostalgicSuffixGlyph> = {
  甲: {
    advance: 59 * nostalgicSuffixGlyphScale,
    sourceOffsetX: 0,
    path: 'M0,68L22,68L22,83.5L37,83.5L37,68L59,68L59,0L0,0L0,68ZM15,16L22,16L22,27L15,27L15,16ZM37,16L44,16L44,27L37,27L37,16ZM22,42L15,42L15,53L22,53L22,42ZM44,42L37,42L37,53L44,53L44,42Z',
  },
  乙: {
    advance: 59 * nostalgicSuffixGlyphScale,
    sourceOffsetX: 69,
    path: 'M69,63.204376L69,70.5C69,77.679703,74.8202987,83.5,82.000002,83.5L91,83.5L106,83.5L115,83.5C122.179703,83.5,128,77.679703,128,70.5L128,68L128,61L113.5,61L113.5,64C113.5,66.209137,111.709141,68,109.5,68L86.384089,68C84.669562,68,83.749826,65.983902,84.873652,64.689056L128,15L128,0L69,0L69,15L110,15L72.591414,54.233395C70.286076,56.651188,69,59.863674,69,63.204376Z',
  },
  丙: {
    advance: 59 * nostalgicSuffixGlyphScale,
    sourceOffsetX: 138,
    path: 'M138,15L138,0L197,0L197,15L174.5,15L174.5,20.5L197,20.5L197,83.5L177.5,83.5L177.5,69.174301Q171.465237,64.006264,167.442614,57.273376Q166.311413,59.682896,164.998871,62.045471L161.056179,69.142319L152,64.111107L152,83.5L138,83.5L138,20.5L159.5,20.5L159.5,15L138,15ZM158.75412,35L152,35L152,54.555679Q157.134815,45.233318,158.75412,35ZM179.496185,68.25L184,68.25L184,62.787037L179.496185,68.25ZM184,54.589561L184,35L175.613247,35Q176.104019,41.026825,178.721611,46.577305Q180.81213,51.010147,184,54.589561Z',
  },
  丁: {
    advance: 59 * nostalgicSuffixGlyphScale,
    sourceOffsetX: 207,
    path: 'M207,0L207,16L232,16L232,68.75L221,68.75L221,83.5L232,83.5L247,83.5L247,16L266,16L266,0L207,0Z',
  },
};

let chillJinshuSongFont: Font | undefined;
let harmonyOsSansBoldFont: Font | undefined;
const materialSymbolMarkupCache = new Map<string, { viewBox: string; content: string }>();
const metroFacilityAssetMarkupCache = new Map<string, { viewBox: string; content: string }>();
const metroArrowAssetMarkupCache = new Map<string, { viewBox: string; content: string }>();

export function renderMaterialGlyph(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string> = {},
): string {
  if (!value) {
    return '';
  }
  if (config.renderer === 'nostalgic_digits') {
    return renderNostalgicDigits(value, config);
  }
  if (config.renderer === 'nostalgic_address_number') {
    const suffix = config.suffixFieldKey ? (values[config.suffixFieldKey] ?? '') : '';
    return renderNostalgicAddressNumber(value, suffix, config);
  }
  if (config.renderer === 'transit_station_list') {
    const currentIndex = config.currentIndexFieldKey
      ? Number.parseInt(values[config.currentIndexFieldKey] ?? '', 10)
      : -1;
    return renderTransitStationList(value, currentIndex, config);
  }
  if (config.renderer === 'transit_horizontal_station_list') {
    const currentIndex = config.currentIndexFieldKey
      ? Number.parseInt(values[config.currentIndexFieldKey] ?? '', 10)
      : -1;
    const color = config.colorFieldKey ? values[config.colorFieldKey] : undefined;
    return renderTransitHorizontalStationList(value, currentIndex, color, config);
  }
  if (config.renderer === 'transit_route_map') {
    const color = config.colorFieldKey ? values[config.colorFieldKey] : undefined;
    return renderTransitRouteMap(value, color, config);
  }
  if (config.renderer === 'metro_wayfinding') {
    const width = Number(values['canvas.logicalWidthPx']) || config.layoutWidth;
    const height = Number(values['canvas.logicalHeightPx']) || METRO_WAYFINDING_HEIGHT;
    return renderMetroWayfinding(value, width, height);
  }
  if (config.renderer === 'metro_line_map_modern' || config.renderer === 'metro_line_map_classic') {
    return renderMetroLineMap(
      value,
      config,
      values,
      config.renderer === 'metro_line_map_classic' ? 'classic' : 'modern',
    );
  }
  if (
    config.renderer === 'metro_line_map_vertical_modern' ||
    config.renderer === 'metro_line_map_vertical_classic'
  ) {
    return renderMetroLineMapVertical(
      value,
      config,
      values,
      config.renderer === 'metro_line_map_vertical_classic' ? 'classic' : 'modern',
    );
  }
  if (
    config.renderer === 'metro_station_name_modern' ||
    config.renderer === 'metro_station_name_classic' ||
    config.renderer === 'metro_direction_modern' ||
    config.renderer === 'metro_direction_classic'
  ) {
    const style = config.renderer.endsWith('classic') ? 'classic' : 'modern';
    return config.renderer.startsWith('metro_station_name')
      ? renderMetroStationNameSign(value, config, values, style)
      : renderMetroDirectionSign(value, config, values, style);
  }
  if (config.renderer === 'metro_platform_sign') {
    return renderMetroPlatformSign(value, config, values);
  }
  return renderVerticalChillJinshuSong(value, config);
}

function renderMetroWayfinding(value: string, canvasWidth: number, canvasHeight: number): string {
  const layout = parseMetroWayfindingLayout(value);
  if (layout.mode === 'vertical') {
    return renderMetroWayfindingVertical(layout, canvasWidth, canvasHeight);
  }
  const rowCount = layout.mode === 'double' ? 2 : 1;
  const scale = canvasHeight / (METRO_WAYFINDING_HEIGHT * rowCount);
  const width = canvasWidth / scale;
  const rows = Array.from({ length: rowCount }, (_unused, index) =>
    renderMetroWayfindingRow(layout, layout.rows[index] ?? [], width, index),
  ).join('');
  const rowDivider =
    rowCount === 2 && layout.dividerBetweenRows
      ? `<rect x="${formatNumber(METRO_WAYFINDING_PADDING)}" y="${formatNumber(METRO_WAYFINDING_HEIGHT - METRO_WAYFINDING_DIVIDER_WIDTH / 2)}" width="${formatNumber(Math.max(width - METRO_WAYFINDING_PADDING * 2, 0))}" height="${METRO_WAYFINDING_DIVIDER_WIDTH}" fill="${normalizeColor(layout.foregroundColor, METRO_WAYFINDING_FOREGROUND)}"/>`
      : '';
  return `<g transform="scale(${formatNumber(scale)})" data-metro-wayfinding="true" data-metro-wayfinding-mode="${layout.mode}"><rect width="${formatNumber(width)}" height="${METRO_WAYFINDING_HEIGHT * rowCount}" fill="${normalizeColor(layout.backgroundColor, '#262626')}"/>${rows}${rowDivider}</g>`;
}

function renderMetroWayfindingVertical(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const width = Math.max(canvasWidth, 1);
  const height = Math.max(canvasHeight, METRO_WAYFINDING_HEIGHT);
  const elements = layout.rows[0] ?? [];
  const sizing = resolveMetroWayfindingVerticalLayoutSizing(elements, height);
  let cursorY = METRO_WAYFINDING_PADDING;
  const children = elements.map((element, index) => {
    const intrinsicElementHeight =
      element.type === 'space' && element.mode === 'flex'
        ? sizing.flexHeight
        : sizing.elementHeights[index]!;
    const elementScaleY =
      element.type === 'text' && element.writingMode === 'vertical' ? sizing.textScaleY : 1;
    const elementHeight = intrinsicElementHeight * elementScaleY;
    const nextElement = elements[index + 1];
    const output = renderMetroWayfindingVerticalElement(
      element,
      cursorY,
      elementHeight,
      width,
      layout,
      intrinsicElementHeight,
    );
    const gap =
      nextElement &&
      resolveMetroElementBackground(element, layout) ===
        resolveMetroElementBackground(nextElement, layout)
        ? `<rect x="0" y="${formatNumber(cursorY + elementHeight)}" width="${formatNumber(width)}" height="${METRO_WAYFINDING_GAP}" fill="${resolveMetroElementBackground(element, layout)}"/>`
        : '';
    cursorY += elementHeight + (nextElement ? METRO_WAYFINDING_GAP : 0);
    return `${output}${gap}`;
  });
  return `<g data-metro-wayfinding="true" data-metro-wayfinding-mode="vertical"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${normalizeColor(layout.backgroundColor, '#262626')}"/>${children.join('')}</g>`;
}

function renderMetroWayfindingVerticalElement(
  element: MetroWayfindingElement,
  y: number,
  height: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  contentHeight = height,
): string {
  const background = resolveMetroElementBackground(element, layout);
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  if (element.type === 'space') {
    return `<rect x="0" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>`;
  }
  if (element.type === 'divider') {
    return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/><rect x="28" width="${formatNumber(Math.max(width - 56, 0))}" height="${METRO_WAYFINDING_DIVIDER_WIDTH}" fill="${foreground}"/></g>`;
  }
  if (element.type === 'text' && element.writingMode === 'vertical') {
    const content = renderMetroVerticalTextRows(element, width, foreground, background, height);
    return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>${content}</g>`;
  }

  const naturalWidth =
    element.type === 'facility' || element.type === 'arrow'
      ? 85
      : Math.max(resolveMetroWayfindingElementWidth(element), 1);
  const availableWidth = Math.max(width - METRO_WAYFINDING_PADDING * 2, 1);
  const usesRowWidthCompression = element.type === 'text';
  const contentWidth = usesRowWidthCompression
    ? Math.min(naturalWidth, availableWidth)
    : naturalWidth;
  const scaleX = usesRowWidthCompression ? 1 : Math.min(1, availableWidth / naturalWidth);
  const displayWidth = contentWidth * scaleX;
  const x = (width - displayWidth) / 2;
  const centeredElement =
    element.type === 'text' ? { ...element, align: 'center' as const } : element;
  const content = renderMetroWayfindingElement(
    centeredElement,
    x,
    contentWidth,
    layout,
    scaleX,
    1,
    element.type === 'text',
    contentHeight,
    element.type === 'facility' || element.type === 'arrow' ? -21.5 : 0,
  );
  return `<g transform="translate(0 ${formatNumber(y)})"><rect width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${background}"/>${content}</g>`;
}

function renderMetroWayfindingRow(
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  elements: MetroWayfindingElement[],
  width: number,
  rowIndex: number,
): string {
  const sizing = resolveMetroWayfindingLayoutSizing(elements, width);
  let cursor = (width - sizing.totalDisplayWidth) / 2;
  const contentStart = cursor;
  const contentEnd = contentStart + sizing.totalDisplayWidth;
  const backgroundColor = normalizeColor(layout.backgroundColor, '#262626');
  const firstElementBackground = elements[0]
    ? resolveMetroElementBackground(elements[0], layout)
    : backgroundColor;
  const lastElement = elements.at(-1);
  const lastElementBackground = lastElement
    ? resolveMetroElementBackground(lastElement, layout)
    : backgroundColor;
  const edgeBackgrounds = [
    firstElementBackground !== backgroundColor
      ? `<rect width="${formatNumber(Math.max(contentStart, 0))}" height="128" fill="${firstElementBackground}"/>`
      : '',
    lastElementBackground !== backgroundColor
      ? `<rect x="${formatNumber(contentEnd)}" width="${formatNumber(Math.max(width - contentEnd, 0))}" height="128" fill="${lastElementBackground}"/>`
      : '',
  ].join('');
  const children = elements.map((element, index) => {
    const intrinsicElementWidth =
      element.type === 'space' && element.mode === 'flex'
        ? sizing.flexWidth
        : sizing.elementWidths[index]!;
    const elementWidth =
      element.type === 'text' ? intrinsicElementWidth * sizing.textScaleX : intrinsicElementWidth;
    const elementScaleX =
      sizing.layoutScale *
      (element.type === 'largeText' || element.type === 'combination' ? sizing.textScaleX : 1);
    const displayWidth = elementWidth * elementScaleX;
    const output = renderMetroWayfindingElement(
      element,
      cursor,
      elementWidth,
      layout,
      elementScaleX,
      sizing.layoutScale,
    );
    const nextElement = elements[index + 1];
    const gap = nextElement
      ? renderMetroWayfindingGap(
          element,
          nextElement,
          cursor + displayWidth,
          layout,
          sizing.layoutScale,
        )
      : '';
    cursor +=
      displayWidth + (index < elements.length - 1 ? METRO_WAYFINDING_GAP * sizing.layoutScale : 0);
    return `${output}${gap}`;
  });
  return `<g transform="translate(0 ${rowIndex * METRO_WAYFINDING_HEIGHT})" data-metro-wayfinding-row="${rowIndex + 1}"><rect width="${formatNumber(width)}" height="128" fill="${backgroundColor}"/>${edgeBackgrounds}${children.join('')}</g>`;
}

function renderMetroWayfindingGap(
  leftElement: MetroWayfindingElement,
  rightElement: MetroWayfindingElement,
  x: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scale: number,
): string {
  const leftBackground = resolveMetroElementBackground(leftElement, layout);
  const rightBackground = resolveMetroElementBackground(rightElement, layout);
  if (leftBackground !== rightBackground) {
    return '';
  }
  return `<rect x="${formatNumber(x)}" width="${formatNumber(METRO_WAYFINDING_GAP * scale)}" height="${formatNumber(METRO_WAYFINDING_HEIGHT * scale)}" fill="${leftBackground}"/>`;
}

function resolveMetroElementBackground(
  element: MetroWayfindingElement,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
): string {
  return normalizeColor(element.backgroundColor, layout.backgroundColor);
}

function renderMetroWayfindingElement(
  element: MetroWayfindingElement,
  x: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scaleX: number,
  scaleY: number,
  textTopAligned = false,
  elementHeight = METRO_WAYFINDING_HEIGHT,
  iconOffsetY = 0,
  suppressInheritedBackground = false,
): string {
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  const background = normalizeColor(element.backgroundColor, layout.backgroundColor);
  const backgroundRect =
    suppressInheritedBackground && element.backgroundColor === undefined
      ? ''
      : `<rect width="${formatNumber(width)}" height="${formatNumber(elementHeight)}" fill="${background}"/>`;
  const transform = `translate(${formatNumber(x)} 0) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})`;
  if (element.type === 'space') {
    return suppressInheritedBackground && element.backgroundColor === undefined
      ? ''
      : `<rect x="${formatNumber(x)}" width="${formatNumber(width * scaleX)}" height="${formatNumber(elementHeight)}" fill="${background}"/>`;
  }
  if (element.type === 'divider') {
    return `<g><rect x="${formatNumber(x)}" width="${formatNumber(METRO_WAYFINDING_DIVIDER_WIDTH * scaleX)}" height="128" fill="${background}"/><rect x="${formatNumber(x)}" y="28" width="${formatNumber(METRO_WAYFINDING_DIVIDER_WIDTH * scaleX)}" height="72" fill="${foreground}"/></g>`;
  }
  if (element.type === 'facility' || element.type === 'arrow') {
    const hasFrame = element.type === 'arrow' ? element.framed : element.frameShape !== 'none';
    const frameFillColor =
      element.frameFillMode === 'color'
        ? normalizeColor(element.frameFillColor, foreground)
        : foreground;
    const graphicForeground =
      hasFrame && element.frameFillMode === 'inverse' ? background : foreground;
    const icon =
      metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingIconOptions[0]!;
    const graphic =
      element.type === 'arrow'
        ? renderMetroArrowAsset(
            resolveMetroArrowIconAssetName(element.iconId) ?? 'south-west',
            graphicForeground,
            element.id,
            element.framed,
            element.frameFillMode,
            frameFillColor,
            element.frameStroke,
          )
        : renderMetroIcon(
            icon.symbol,
            icon.id,
            graphicForeground,
            element.id,
            element.direction,
            element.frameShape,
            element.frameFillMode,
            frameFillColor,
            element.frameStroke,
            element.variant,
          );
    const dataAttribute =
      element.type === 'arrow'
        ? `data-metro-arrow="${escapeXml(element.iconId)}"`
        : `data-material-symbol="${escapeXml(icon.symbol)}"`;
    const positionedGraphic =
      iconOffsetY === 0
        ? graphic
        : `<g transform="translate(0 ${formatNumber(iconOffsetY)})">${graphic}</g>`;
    return `<g transform="${transform}" ${dataAttribute}>${backgroundRect}${positionedGraphic}</g>`;
  }
  if (element.type === 'largeText') {
    const frameFillColor =
      element.frameFillMode === 'color'
        ? normalizeColor(element.frameFillColor, foreground)
        : foreground;
    const contentColor =
      element.frameShape !== 'none' && element.frameFillMode === 'inverse'
        ? background
        : foreground;
    const text = renderMetroLargeText(element, width, contentColor, elementHeight);
    const frame = renderMetroLargeTextFrame(
      element.frameShape,
      width,
      foreground,
      element.frameFillMode,
      frameFillColor,
      elementHeight,
      element.frameStroke,
    );
    return `<g transform="${transform}">${backgroundRect}${frame}${text}</g>`;
  }
  if (element.type === 'combination') {
    return renderMetroWayfindingCombination(
      element,
      x,
      width,
      layout,
      scaleX,
      scaleY,
      elementHeight,
    );
  }
  const textAlign =
    element.align === 'left' ? 'start' : element.align === 'right' ? 'end' : 'middle';
  const textX = element.align === 'left' ? 0 : element.align === 'right' ? width : width / 2;
  const rows = renderMetroTextRows(
    element,
    width,
    foreground,
    background,
    textX,
    textAlign,
    textTopAligned,
  );
  return `<g transform="${transform}">${backgroundRect}${rows}</g>`;
}

function renderMetroWayfindingCombination(
  element: MetroWayfindingCombinationElement,
  x: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scaleX: number,
  scaleY: number,
  elementHeight: number,
): string {
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  const background = normalizeColor(element.backgroundColor, layout.backgroundColor);
  const fillColor = normalizeColor(element.frameFillColor, foreground);
  const frameBackground =
    element.frameFillMode === 'inverse'
      ? foreground
      : element.frameFillMode === 'color'
        ? fillColor
        : background;
  const contentColor = element.frameFillMode === 'inverse' ? background : foreground;
  const childLayout = {
    ...layout,
    backgroundColor: frameBackground,
    foregroundColor: contentColor,
  };
  const combinationScale = Math.max(0.25, Math.min(1, element.scale));
  const sizing = resolveMetroWayfindingCombinationSizing(element, width / combinationScale);
  const baseWidth = sizing.width;
  const baseHeight = METRO_WAYFINDING_HEIGHT;
  const childHeight = baseHeight;
  const childY = 0;
  const combinationY = Math.max(0, (elementHeight - baseHeight * combinationScale) / 2);
  const hasFlexibleSpace = element.children.some(
    (child) => child.type === 'space' && child.mode === 'flex',
  );
  let cursor =
    sizing.contentX +
    (hasFlexibleSpace ? 0 : Math.max(0, sizing.contentWidth - sizing.totalDisplayWidth) / 2);
  const children = element.children.map((child, index) => {
    const intrinsicWidth =
      child.type === 'space' && child.mode === 'flex'
        ? sizing.flexWidth
        : sizing.elementWidths[index]!;
    const childWidth = child.type === 'text' ? intrinsicWidth * sizing.textScaleX : intrinsicWidth;
    const childScaleX =
      sizing.layoutScale *
      (child.type === 'text' || child.type === 'largeText' ? sizing.textScaleX : 1);
    const displayWidth = childWidth * childScaleX;
    const output = renderMetroWayfindingElement(
      child,
      cursor,
      childWidth,
      childLayout,
      childScaleX,
      1,
      false,
      childHeight,
      0,
      true,
    );
    cursor +=
      displayWidth +
      (index < element.children.length - 1
        ? METRO_WAYFINDING_COMBINATION_GAP * sizing.layoutScale
        : 0);
    return output;
  });
  const totalScaleX = Math.max(Math.abs(scaleX * combinationScale), Number.EPSILON);
  const totalScaleY = Math.max(Math.abs(scaleY * combinationScale), Number.EPSILON);
  const fillRadiusX = 10 / totalScaleX;
  const fillRadiusY = 10 / totalScaleY;
  const outlineRadiusX = 8.5 / totalScaleX;
  const outlineRadiusY = 8.5 / totalScaleY;
  const frame =
    element.frameFillMode === 'inverse' || element.frameFillMode === 'color'
      ? `<rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" rx="${formatNumber(fillRadiusX)}" ry="${formatNumber(fillRadiusY)}" fill="${frameBackground}"/>`
      : '';
  const shouldStroke = element.frameStroke;
  const outline = shouldStroke
    ? `<rect x="1.5" y="1.5" width="${formatNumber(Math.max(baseWidth - 3, 0))}" height="${formatNumber(baseHeight - 3)}" rx="${formatNumber(outlineRadiusX)}" ry="${formatNumber(outlineRadiusY)}" fill="none" stroke="${foreground}" stroke-width="3"/>`
    : '';
  const stripe =
    element.frameFillMode === 'stripe'
      ? element.stripePosition === 'bottom'
        ? `<rect y="${formatNumber(baseHeight - METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH)}" width="${formatNumber(baseWidth)}" height="${METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH}" fill="${fillColor}"/>`
        : `<rect x="${formatNumber(element.stripePosition === 'right' ? baseWidth - METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH : 0)}" y="${METRO_WAYFINDING_COMBINATION_STRIPE_TOP}" width="${METRO_WAYFINDING_COMBINATION_STRIPE_WIDTH}" height="${formatNumber(baseHeight - METRO_WAYFINDING_COMBINATION_STRIPE_TOP)}" fill="${fillColor}"/>`
      : '';
  const clipId = `metro-combination-clip-${element.id}`;
  const roundedBackdrop = `<defs><clipPath id="${escapeXml(clipId)}"><rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" rx="${formatNumber(fillRadiusX)}" ry="${formatNumber(fillRadiusY)}"/></clipPath></defs><g clip-path="url(#${escapeXml(clipId)})"><rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" fill="${background}"/>${frame}${stripe}</g>`;
  const squareBackdrop = `<rect width="${formatNumber(baseWidth)}" height="${formatNumber(baseHeight)}" fill="${background}"/>${frame}${stripe}`;
  const backdrop =
    element.frameFillMode === 'none' || element.frameFillMode === 'stripe'
      ? squareBackdrop
      : roundedBackdrop;
  const transform = `translate(${formatNumber(x)} ${formatNumber(combinationY)}) scale(${formatNumber(scaleX * combinationScale)} ${formatNumber(scaleY * combinationScale)})`;
  return `<g transform="${transform}">${backdrop}<g transform="translate(0 ${formatNumber(childY)})">${children.join('')}</g>${outline}</g>`;
}

function renderMetroVerticalTextRows(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  color: string,
  background: string,
  maxHeight = Number.POSITIVE_INFINITY,
): string {
  const rows = element.rows.filter(hasMetroWayfindingTextRowContent);
  if (rows.length === 0) {
    return '';
  }
  const metrics = resolveMetroWayfindingTextMetrics(rows);
  const columns = rows.map((row) => ({
    row,
    fontSize: row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize,
    height:
      row.kind === 'main'
        ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
        : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  }));
  const contentWidth =
    columns.reduce((total, column) => total + column.fontSize, 0) +
    Math.max(columns.length - 1, 0) * metrics.spacing;
  const availableWidth = Math.max(width - METRO_WAYFINDING_PADDING * 2, 1);
  const scaleX = contentWidth > 0 ? Math.min(1, availableWidth / contentWidth) : 1;
  const contentX = (width - contentWidth * scaleX) / 2;
  let cursorRight = contentWidth;
  const markup = columns
    .map(({ row, fontSize, height }) => {
      const x = cursorRight - fontSize / 2;
      cursorRight -= fontSize + metrics.spacing;
      const columnMarkup =
        row.kind === 'main'
          ? renderMetroVerticalMainSegments(row.segments, fontSize, color, background, x)
          : renderMetroVerticalTextRun(row.value, fontSize, color, x, 0, 400);
      const columnScaleY = height > maxHeight && height > 0 ? maxHeight / height : 1;
      return `<g transform="scale(1 ${formatNumber(columnScaleY)})">${columnMarkup}</g>`;
    })
    .join('');
  return `<g transform="translate(${formatNumber(contentX)} 0) scale(${formatNumber(scaleX)} 1)">${markup}</g>`;
}

function renderMetroVerticalMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
  color: string,
  background: string,
  x: number,
): string {
  const segmentGap = fontSize * 0.12;
  let cursorY = 0;
  return segments
    .map((segment, index) => {
      const trailingGap = index < segments.length - 1 ? segmentGap : 0;
      if (segment.kind === 'line') {
        const diameter = fontSize * 1.12;
        const centerY = cursorY + diameter / 2;
        const lineColor = normalizeColor(segment.color, '#2F80ED');
        const shouldInvert = lineColor.toUpperCase() === background.toUpperCase();
        const badgeBackground = shouldInvert ? color : lineColor;
        const badgeForeground = shouldInvert ? lineColor : '#FFFFFF';
        const output = `<g transform="translate(${formatNumber(x)} ${formatNumber(centerY)})"><circle r="${formatNumber(diameter / 2)}" fill="${badgeBackground}"/><text x="0" y="${formatNumber(fontSize * 0.9 * 0.34)}" transform="rotate(90)" fill="${badgeForeground}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize * 0.9)}" font-weight="400" text-anchor="middle" letter-spacing="${formatNumber(fontSize * -0.07)}">${escapeXml(segment.value)}</text></g>`;
        cursorY += diameter + trailingGap;
        return output;
      }
      const textHeight = estimateMetroWayfindingTextWidth(segment.value, fontSize);
      const verticalPadding = segment.kind === 'boxed' ? fontSize * 0.16 : 0;
      const segmentHeight =
        segment.kind === 'boxed'
          ? Math.max(fontSize * 1.05, textHeight + verticalPadding * 2)
          : textHeight;
      const textY = cursorY + (segmentHeight - textHeight) / 2;
      const frame =
        segment.kind === 'boxed'
          ? `<rect x="${formatNumber(x - fontSize * 0.525)}" y="${formatNumber(cursorY + fontSize * 0.02)}" width="${formatNumber(fontSize * 1.05)}" height="${formatNumber(segmentHeight - fontSize * 0.04)}" rx="${formatNumber(fontSize * 0.11)}" fill="none" stroke="${color}" stroke-width="${formatNumber(Math.max(1, fontSize * 0.04))}"/>`
          : '';
      const output = `${frame}${renderMetroVerticalTextRun(segment.value, fontSize, color, x, textY)}`;
      cursorY += segmentHeight + trailingGap;
      return output;
    })
    .join('');
}

function renderMetroVerticalTextRun(
  value: string,
  fontSize: number,
  color: string,
  x: number,
  startY: number,
  fontWeight: 400 | 700 = 400,
): string {
  let cursorY = startY;
  return Array.from(value)
    .map((character) => {
      const shouldRotate = /[A-Za-z0-9]/u.test(character);
      const advance = estimateMetroWayfindingTextWidth(character, fontSize);
      const output = /\s/u.test(character)
        ? ''
        : shouldRotate
          ? `<text transform="translate(${formatNumber(x - fontSize * 0.3)} ${formatNumber(cursorY)}) rotate(90)" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}">${escapeXml(character)}</text>`
          : `<text x="${formatNumber(x)}" y="${formatNumber(cursorY + fontSize * 0.82)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}" text-anchor="middle">${escapeXml(character)}</text>`;
      cursorY += advance;
      return output;
    })
    .join('');
}

function renderMetroTextRows(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  color: string,
  background: string,
  textX: number,
  textAnchor: string,
  topAligned = false,
): string {
  const rows = topAligned ? element.rows.filter(hasMetroWayfindingTextRowContent) : element.rows;
  if (rows.length === 0) {
    return '';
  }
  const visibleElement = rows.length === element.rows.length ? element : { ...element, rows };
  const metrics = resolveMetroWayfindingTextMetrics(rows);
  const rowScales = resolveMetroTextRowScales(visibleElement, width, metrics);
  let rowTop = topAligned
    ? 0
    : (METRO_WAYFINDING_HEIGHT - METRO_WAYFINDING_TEXT_HEIGHT) / 2 + metrics.spacing;
  return rows
    .map((row, index) => {
      const fontSize = row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize;
      const baseline = rowTop + fontSize * 0.82;
      const output =
        row.kind === 'main'
          ? renderMetroMainSegments(
              row.segments,
              fontSize,
              color,
              background,
              textX,
              textAnchor,
              baseline,
              rowScales[index] ?? 1,
            )
          : renderMetroText(
              row.value,
              fontSize,
              width,
              color,
              textAnchor,
              textX,
              baseline,
              rowScales[index] ?? 1,
              400,
            );
      rowTop += fontSize + (index < rows.length - 1 ? metrics.spacing : 0);
      return output;
    })
    .join('');
}

function renderMetroMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
  color: string,
  background: string,
  textX: number,
  textAnchor: string,
  baseline: number,
  contentScale: number,
): string {
  const totalWidth = measureMetroWayfindingMainSegments(segments, fontSize);
  const renderedWidth = totalWidth * contentScale;
  const segmentGap = fontSize * 0.12;
  const startX =
    textAnchor === 'start'
      ? textX
      : textAnchor === 'end'
        ? textX - renderedWidth
        : textX - renderedWidth / 2;
  let cursor = 0;
  const content = segments
    .map((segment, index) => {
      const trailingGap = index < segments.length - 1 ? segmentGap : 0;
      if (segment.kind === 'line') {
        const diameter = fontSize * 1.12;
        const centerX = cursor + diameter / 2;
        const lineColor = normalizeColor(segment.color, '#2F80ED');
        const shouldInvert = lineColor.toUpperCase() === background.toUpperCase();
        const badgeBackground = shouldInvert ? color : lineColor;
        const badgeForeground = shouldInvert ? lineColor : '#FFFFFF';
        cursor += diameter + trailingGap;
        return `<g transform="translate(${formatNumber(centerX)} ${formatNumber(baseline - fontSize * 0.32)})"><circle r="${formatNumber(diameter / 2)}" fill="${badgeBackground}"/><text y="${formatNumber(fontSize * 0.9 * 0.34)}" fill="${badgeForeground}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize * 0.9)}" font-weight="400" text-anchor="middle" letter-spacing="${formatNumber(fontSize * -0.07)}">${escapeXml(segment.value)}</text></g>`;
      }
      const textWidth = estimateMetroWayfindingTextWidth(segment.value, fontSize);
      const horizontalPadding = segment.kind === 'boxed' ? fontSize * 0.16 : 0;
      const segmentWidth =
        segment.kind === 'boxed'
          ? Math.max(fontSize * 1.05, textWidth + horizontalPadding * 2)
          : textWidth;
      const textX = cursor + (segmentWidth - textWidth) / 2;
      const frame =
        segment.kind === 'boxed'
          ? `<rect x="${formatNumber(cursor + fontSize * 0.02)}" y="${formatNumber(baseline - fontSize * 0.84)}" width="${formatNumber(segmentWidth - fontSize * 0.04)}" height="${formatNumber(fontSize * 1.05)}" rx="${formatNumber(fontSize * 0.11)}" fill="none" stroke="${color}" stroke-width="${formatNumber(Math.max(1, fontSize * 0.04))}"/>`
          : '';
      const output = `${frame}<text x="${formatNumber(textX)}" y="${formatNumber(baseline)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="400">${escapeXml(segment.value)}</text>`;
      cursor += segmentWidth + trailingGap;
      return output;
    })
    .join('');
  return `<g transform="translate(${formatNumber(startX)} 0) scale(${formatNumber(contentScale)} 1)">${content}</g>`;
}

function renderMetroText(
  value: string,
  fontSize: number,
  width: number,
  color: string,
  textAnchor: string,
  x = width / 2,
  y = 0,
  scale = 1,
  fontWeight: 400 | 700 = 400,
): string {
  return `<g transform="translate(${formatNumber(x)} 0) scale(${formatNumber(scale)} 1) translate(-${formatNumber(x)} 0)"><text x="${formatNumber(x)}" y="${formatNumber(y || fontSize)}" fill="${color}" font-family="Arial, 'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}" text-anchor="${textAnchor}">${escapeXml(value)}</text></g>`;
}

function resolveMetroTextRowScales(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  metrics: ReturnType<typeof resolveMetroWayfindingTextMetrics>,
): number[] {
  const rowWidths = element.rows.map((row) =>
    row.kind === 'main'
      ? measureMetroWayfindingMainSegments(row.segments, metrics.mainFontSize)
      : measureMetroWayfindingSecondaryText(row.value, metrics.secondaryFontSize, row.bold),
  );
  const scales = element.rows.map(() => 1);
  let groupStart = 0;

  while (groupStart < element.rows.length) {
    const kind = element.rows[groupStart]!.kind;
    let groupEnd = groupStart + 1;
    while (groupEnd < element.rows.length && element.rows[groupEnd]!.kind === kind) {
      groupEnd += 1;
    }
    const groupWidth = Math.max(...rowWidths.slice(groupStart, groupEnd), 0);
    const groupScale = groupWidth > width && groupWidth > 0 ? width / groupWidth : 1;
    scales.fill(groupScale, groupStart, groupEnd);
    groupStart = groupEnd;
  }

  return scales;
}

/**
 * 大文本渲染：正文与**任意位置**的下角标交替排版。
 *
 * `dy` 是相对位移且会累积，所以进入下角标时 +13 下沉、离开时 -13 回到基线；
 * 相邻两个角标之间不再重复下沉。`dx` 只在「正文 ↔ 角标」交界处补 3px 间距。
 */
function renderMetroLargeText(
  element: MetroWayfindingLargeTextElement,
  width: number,
  color: string,
  height: number,
): string {
  const frameShape = element.frameShape;
  const mainFontSize =
    frameShape !== 'none'
      ? METRO_WAYFINDING_LARGE_TEXT_FRAMED_FONT_SIZE
      : METRO_WAYFINDING_LARGE_TEXT_UNFRAMED_FONT_SIZE;
  const suffixFontSize = METRO_WAYFINDING_LARGE_TEXT_SUFFIX_FONT_SIZE;
  const runs = splitMetroLargeTextRuns(element);
  let markup = '';
  let gapTotal = 0;
  let lowered = false;
  runs.forEach((run, index) => {
    const previous = runs[index - 1];
    const next = runs[index + 1];
    if (run.kind === 'suffix') {
      if (previous?.kind === 'text') gapTotal += 3;
      if (next?.kind === 'text') gapTotal += 3;
      const dx = previous?.kind === 'text' ? 3 : 0;
      const dy = lowered ? 0 : 13;
      markup += renderMetroLargeTextRuns(run.value, suffixFontSize, 700, dx, dy);
      lowered = true;
      return;
    }
    const dx = previous?.kind === 'suffix' ? 3 : 0;
    const dy = lowered ? -13 : 0;
    markup += renderMetroLargeTextRuns(run.value, mainFontSize, 400, dx, dy);
    lowered = false;
  });
  const text = `<text x="${formatNumber(width / 2 - gapTotal / 2)}" y="${formatNumber(height / 2)}" fill="${color}" text-anchor="middle" dominant-baseline="central" letter-spacing="0">${markup}</text>`;
  if (frameShape !== 'circle') {
    return text;
  }
  const contentWidth =
    runs.reduce(
      (total, run) =>
        total +
        estimateMetroWayfindingLargeTextWidth(
          run.value,
          run.kind === 'suffix' ? suffixFontSize : mainFontSize,
        ),
      0,
    ) + gapTotal;
  const scaleX = contentWidth > 72 ? 72 / contentWidth : 1;
  return scaleX < 1
    ? `<g transform="translate(${formatNumber(width / 2)} 0) scale(${formatNumber(scaleX)} 1) translate(${formatNumber(-width / 2)} 0)">${text}</g>`
    : text;
}

function renderMetroLargeTextFrame(
  frameShape: MetroWayfindingFrameShape,
  width: number,
  color: string,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  height: number,
  frameStroke: boolean,
): string {
  const usesFill = frameFillMode !== 'none';
  const frameY = (height - METRO_WAYFINDING_TEXT_HEIGHT) / 2;
  if (frameShape === 'rectangle') {
    return usesFill
      ? frameStroke
        ? `<rect x="1.5" y="${formatNumber(frameY + 1.5)}" width="${formatNumber(width - 3)}" height="${formatNumber(METRO_WAYFINDING_TEXT_HEIGHT - 3)}" rx="8.5" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<rect x="0" y="${formatNumber(frameY)}" width="${formatNumber(width)}" height="${METRO_WAYFINDING_TEXT_HEIGHT}" rx="10" fill="${frameFillColor}"/>`
      : `<rect x="1.5" y="${formatNumber(frameY + 1.5)}" width="${formatNumber(width - 3)}" height="${formatNumber(METRO_WAYFINDING_TEXT_HEIGHT - 3)}" rx="8.5" fill="none" stroke="${color}" stroke-width="3"/>`;
  }
  return frameShape === 'circle'
    ? usesFill
      ? frameStroke
        ? `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="41" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="42.5" fill="${frameFillColor}"/>`
      : `<circle cx="${formatNumber(width / 2)}" cy="${formatNumber(height / 2)}" r="41" fill="none" stroke="${color}" stroke-width="3"/>`
    : '';
}

function renderMetroLargeTextRuns(
  value: string,
  fontSize: number,
  fontWeight: 400 | 700,
  firstDx = 0,
  firstDy = 0,
): string {
  const runs = Array.from(value).reduce<Array<{ value: string; usesArial: boolean }>>(
    (result, character) => {
      const usesArial = isBasicLatinCharacter(character);
      const previous = result.at(-1);
      if (previous?.usesArial === usesArial) {
        previous.value += character;
      } else {
        result.push({ value: character, usesArial });
      }
      return result;
    },
    [],
  );
  return runs
    .map((run, index) => {
      const offset =
        index === 0 ? ` dx="${formatNumber(firstDx)}" dy="${formatNumber(firstDy)}"` : '';
      const fontFamily = run.usesArial
        ? "Arial, 'HarmonyOS Sans SC', sans-serif"
        : "'HarmonyOS Sans SC', sans-serif";
      return `<tspan${offset} font-family="${fontFamily}" font-size="${formatNumber(fontSize)}" font-weight="${fontWeight}">${escapeXml(run.value)}</tspan>`;
    })
    .join('');
}

function renderMetroIcon(
  symbol: string,
  iconId: string,
  color: string,
  instanceId: string,
  direction?: 'left' | 'right' | 'up' | 'down',
  frameShape: MetroWayfindingFrameShape = 'none',
  frameFillMode: MetroWayfindingFrameFillMode = 'none',
  frameFillColor = color,
  frameStroke = false,
  variant?: 'two-way' | 'up' | 'down',
): string {
  const assetName = resolveMetroFacilityIconAssetName(iconId, direction, variant);
  if (assetName) {
    const directionTransform = resolveMetroFacilityAssetDirectionTransform(
      iconId,
      direction,
      variant,
    );
    if (frameShape === 'rectangle' && frameFillMode === 'none') {
      return renderMetroFacilityAsset(assetName, 'framed', color, instanceId, directionTransform);
    }
    const frame = renderMetroFacilityFrame(
      frameShape,
      color,
      instanceId,
      frameFillMode,
      frameFillColor,
      frameStroke,
    );
    const icon = renderMetroFacilityAsset(
      assetName,
      'plain',
      color,
      instanceId,
      directionTransform,
      frameShape === 'circle' ? 0.86 : frameShape === 'rectangle' ? 0.9 : 1.1,
    );
    return `${frame}${icon}`;
  }

  const frame = renderMetroFacilityFrame(
    frameShape,
    color,
    instanceId,
    frameFillMode,
    frameFillColor,
    frameStroke,
  );
  const { viewBox, content } = getMaterialSymbolMarkup(symbol);
  const transform = resolveMetroIconDirectionTransform(iconId, direction);
  const scaleTransform = resolveMetroIconScaleTransform(
    frameShape === 'rectangle' ? 0.9 : frameShape === 'circle' ? 0.84 : 1,
  );
  return `${frame}<g transform="${transform}"><g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" fill="${color}" aria-hidden="true">${content}</svg></g></g>`;
}

function renderMetroFacilityFrame(
  frameShape: MetroWayfindingFrameShape,
  color: string,
  instanceId: string,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  frameStroke: boolean,
): string {
  if (frameShape === 'rectangle') {
    return frameFillMode === 'none'
      ? renderMetroFacilityAsset('frame', 'framed', color, `${instanceId}-frame`)
      : frameStroke
        ? `<rect x="1.5" y="23" width="82" height="82" rx="7" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<rect x="0" y="21.5" width="85" height="85" rx="8.5" fill="${frameFillColor}"/>`;
  }
  return frameShape === 'circle'
    ? frameFillMode === 'none'
      ? `<circle cx="42.5" cy="64" r="41" fill="none" stroke="${color}" stroke-width="3"/>`
      : frameStroke
        ? `<circle cx="42.5" cy="64" r="41" fill="${frameFillColor}" stroke="${color}" stroke-width="3"/>`
        : `<circle cx="42.5" cy="64" r="42.5" fill="${frameFillColor}"/>`
    : '';
}

function renderMetroFacilityAsset(
  assetName: MetroFacilityIconAssetName | 'frame',
  variant: 'framed' | 'plain',
  color: string,
  instanceId: string,
  transform = '',
  scale = 1,
): string {
  const { viewBox, content } = getMetroFacilityAssetMarkup(assetName, variant);
  const namespacedContent = namespaceMetroFacilityAssetMarkup(
    content,
    `${instanceId}-${variant}-${assetName}`,
  );
  const scaleTransform = resolveMetroIconScaleTransform(scale);
  return `<g transform="${transform}"><g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" color="${color}" fill="${color}" aria-hidden="true">${namespacedContent}</svg></g></g>`;
}

function renderMetroArrowAsset(
  assetName: MetroArrowIconAssetName,
  color: string,
  instanceId: string,
  framed: boolean,
  frameFillMode: MetroWayfindingFrameFillMode,
  frameFillColor: string,
  frameStroke: boolean,
): string {
  const frame = framed
    ? renderMetroFacilityFrame(
        'rectangle',
        color,
        instanceId,
        frameFillMode,
        frameFillColor,
        frameStroke,
      )
    : '';
  const { viewBox, content } = getMetroArrowAssetMarkup(assetName);
  const namespacedContent = namespaceMetroFacilityAssetMarkup(
    content,
    `${instanceId}-arrow-${assetName}`,
  );
  const scaleTransform = resolveMetroIconScaleTransform(framed ? 0.9 : 1);
  return `${frame}<g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" color="${color}" fill="${color}" aria-hidden="true">${namespacedContent}</svg></g>`;
}

function resolveMetroIconScaleTransform(scale: number): string {
  return scale === 1 ? '' : `translate(42.5 64) scale(${scale}) translate(-42.5 -64)`;
}

function resolveMetroFacilityAssetDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
  variant?: 'two-way' | 'up' | 'down',
): string {
  // 楼梯：每个「变种 × 方向」都有独立素材（-right 后缀为朝右版），
  // 翻转已经烘焙在素材自身（双向 / 向上为水平镜像，向下为垂直镜像），因此这里不再叠加变换。
  // 其余声明了 assetNameByDirection 的图标（扶梯 / 轮椅升降机 / 轮椅）素材只有朝右一份，
  // 朝左时靠镜像复用，因此这里继续往下走镜像分支。
  if (iconId === 'stairs' || iconId === 'stairs-down') {
    return '';
  }
  if (iconId === 'escalator' || iconId === 'wheelchair-lift' || iconId === 'wheelchair') {
    const effectiveDirection =
      direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'left';
    // 素材原始朝向为“朝右”，朝左时按图标声明的镜像轴翻转。
    return effectiveDirection === 'left'
      ? resolveMetroFacilityMirrorTransform(iconId, effectiveDirection, variant)
      : '';
  }
  if (iconId !== 'exit') {
    return '';
  }
  const effectiveDirection =
    direction ?? resolveMetroWayfindingFacilityDefaultDirection(iconId) ?? 'up';
  if (effectiveDirection === 'left') return 'rotate(-90 42.5 64)';
  if (effectiveDirection === 'up') return '';
  if (effectiveDirection === 'down') return 'rotate(180 42.5 64)';
  return 'rotate(90 42.5 64)';
}

function resolveMetroIconDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): string {
  if (iconId === 'no-entry') {
    return 'rotate(-45 42.5 64)';
  }
  // 声明了 assetNameByDirection 的图标（如楼梯三向）由图形本身决定朝向，不再做镜像。
  if (metroWayfindingIconOptions.find((option) => option.id === iconId)?.assetNameByDirection) {
    return '';
  }
  if (iconId === 'turn-left-up' || iconId === 'turn-left-down') {
    return 'rotate(-90 42.5 64)';
  }
  if (iconId === 'turn-right-up' || iconId === 'turn-right-down') {
    return 'rotate(90 42.5 64)';
  }
  const fallbackDirection = resolveMetroWayfindingFacilityDefaultDirection(iconId);
  if (!fallbackDirection) {
    return '';
  }
  const effectiveDirection = direction ?? fallbackDirection;
  if (iconId !== 'exit') {
    return effectiveDirection === 'left' ? 'translate(85 0) scale(-1 1)' : '';
  }
  if (effectiveDirection === 'left') return 'translate(85 0) scale(-1 1)';
  if (effectiveDirection === 'up') return 'rotate(-90 42.5 64)';
  if (effectiveDirection === 'down') return 'rotate(90 42.5 64)';
  return '';
}

function renderTransitStationList(
  value: string,
  currentIndex: number,
  config: MaterialGlyphConfig,
): string {
  const stations = value
    .split(/\r?\n|\s*\/\s*/u)
    .map((station) => station.trim())
    .filter(Boolean);
  if (!stations.length) {
    return '';
  }
  const leftCount = Math.ceil(stations.length / 2);
  const rowCount = Math.max(leftCount, stations.length - leftCount);
  const rowHeight = config.layoutHeight / rowCount;
  const fontSize = Math.min(config.fontSize ?? 5, rowHeight * 0.72);
  const columnWidth = config.layoutWidth / 2;
  // 站名列表按列宽的 90% 撑满字间距，给相邻列留出呼吸空间。
  const maxTextWidth = (columnWidth - 4) * 0.9;
  const paths = stations.map((station, index) => {
    const isLeft = index < leftCount;
    const row = isLeft ? index : index - leftCount;
    const x = columnWidth * (isLeft ? 0.5 : 1.5);
    const y = rowHeight * (row + 0.7);
    const color = index === currentIndex ? '#C11111' : '#1D2F78';
    return renderTransitStationName(station, x, y, maxTextWidth, fontSize, color);
  });
  return `<g>${paths.join('')}</g>`;
}

function renderTransitStationName(
  station: string,
  centerX: number,
  y: number,
  layoutWidth: number,
  fontSize: number,
  color: string,
): string {
  const characters = Array.from(station);
  const attributes = `y="${formatNumber(y)}" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="700" text-anchor="middle"`;
  if (characters.length === 1) {
    return `<text x="${formatNumber(centerX)}" ${attributes}>${escapeXml(station)}</text>`;
  }

  const font = getHarmonyOsSansBoldFont();
  const characterWidths = characters.map((character) => {
    const glyph = font.charToGlyph(character);
    return ((glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm) * fontSize;
  });
  const naturalWidth = characterWidths.reduce((sum, width) => sum + width, 0);
  const scaleX = Math.min(1, layoutWidth / naturalWidth);
  const contentWidth = scaleX < 1 ? naturalWidth : layoutWidth;
  const letterSpacing = scaleX < 1 ? 0 : (layoutWidth - naturalWidth) / (characters.length - 1);
  let cursorX = centerX - contentWidth / 2;
  const content = characters
    .map((character, index) => {
      const characterWidth = characterWidths[index];
      const x = cursorX + characterWidth / 2;
      cursorX += characterWidth + (index < characters.length - 1 ? letterSpacing : 0);
      return `<text x="${formatNumber(x)}" ${attributes}>${escapeXml(character)}</text>`;
    })
    .join('');
  return scaleX < 1
    ? `<g transform="translate(${formatNumber(centerX)} 0) scale(${formatNumber(scaleX)} 1) translate(-${formatNumber(centerX)} 0)">${content}</g>`
    : content;
}

function renderTransitHorizontalStationList(
  value: string,
  currentIndex: number,
  rawColor: string | undefined,
  config: MaterialGlyphConfig,
): string {
  const stations = value
    .split(/\r?\n|\s*\/\s*/u)
    .map((station) => station.replace(/[\s\u3000]+/gu, ''))
    .filter(Boolean);
  if (!stations.length) {
    return '';
  }
  const preferredFontSize = config.fontSize ?? 4.5;
  const singleRowLayout = resolveTransitHorizontalStationLayout(
    stations,
    config,
    preferredFontSize,
    1,
  );
  const twoRowLayout = resolveTransitHorizontalStationLayout(
    stations,
    config,
    preferredFontSize,
    2,
  );
  const layout = twoRowLayout.fontSize > singleRowLayout.fontSize ? twoRowLayout : singleRowLayout;
  const accentColor = rawColor && /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : '#26CABA';
  const backgrounds = layout.rows
    .map(
      (_, rowIndex) =>
        `<rect x="0" y="${formatNumber(rowIndex * (layout.rowHeight + layout.rowGap))}" width="${formatNumber(config.layoutWidth)}" height="${formatNumber(layout.rowHeight)}" fill="#FFFFFF"/>`,
    )
    .join('');
  const columns = layout.rows
    .map((row, rowIndex) => {
      let cursorX = 0;
      const rowTopPadding = layout.rows.length === 2 && rowIndex === 1 ? 2 : 0;
      const startY =
        rowIndex * (layout.rowHeight + layout.rowGap) + rowTopPadding + layout.fontSize * 0.82;
      return row
        .flatMap((entry) =>
          entry.chunks.flatMap((characters, chunkIndex) => {
            const x = cursorX + layout.columnWidth / 2;
            cursorX +=
              layout.columnWidth +
              (chunkIndex < entry.chunks.length - 1 ? layout.wrappedColumnGap : layout.columnGap);
            const characterGap = Math.min(
              layout.fontSize * 0.12,
              Math.max(
                (layout.rowHeight - rowTopPadding - characters.length * layout.fontSize) /
                  Math.max(characters.length - 1, 1),
                0,
              ),
            );
            const color = entry.stationIndex === currentIndex ? '#E28336' : '#000000';
            return characters.map(
              (character, characterIndex) =>
                `<text x="${formatNumber(x)}" y="${formatNumber(startY + characterIndex * (layout.fontSize + characterGap))}" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(layout.fontSize)}" font-weight="700" text-anchor="middle">${escapeXml(character)}</text>`,
            );
          }),
        )
        .join('');
    })
    .join('');
  const secondRowArrow =
    layout.rows.length === 2
      ? `<path d="M5 35L8.5 35L8.5 37L12 33L8.5 29L8.5 31L5 31L5 35Z" fill="${accentColor}"/>`
      : '';
  return `<g>${backgrounds}${columns}${secondRowArrow}</g>`;
}

function resolveTransitHorizontalStationLayout(
  stations: string[],
  config: MaterialGlyphConfig,
  preferredFontSize: number,
  rowCount: 1 | 2,
): {
  fontSize: number;
  rowHeight: number;
  rowGap: number;
  columnWidth: number;
  columnGap: number;
  wrappedColumnGap: number;
  rows: Array<Array<{ stationIndex: number; chunks: string[][] }>>;
} {
  const rowGap = rowCount === 2 ? 3 : 0;
  const rowHeight = (config.layoutHeight - rowGap) / rowCount;
  const stationsPerRow = Math.ceil(stations.length / rowCount);
  const stationRows = Array.from({ length: rowCount }, (_, rowIndex) =>
    stations.slice(rowIndex * stationsPerRow, (rowIndex + 1) * stationsPerRow),
  );
  let fallback: ReturnType<typeof createTransitHorizontalStationLayout> | undefined;
  for (let fontSize = preferredFontSize; fontSize >= 1.5; fontSize -= 0.1) {
    const candidate = createTransitHorizontalStationLayout(
      stationRows,
      config.layoutWidth,
      rowHeight,
      fontSize,
      rowCount === 2,
    );
    if (!candidate) {
      continue;
    }
    fallback = candidate;
    if (fontSize <= candidate.columnWidth * 0.82) {
      return { ...candidate, rowHeight, rowGap };
    }
  }
  if (!fallback) {
    throw new Error('无法计算公交站序的排版。');
  }
  return { ...fallback, rowHeight, rowGap };
}

function createTransitHorizontalStationLayout(
  stationRows: string[][],
  layoutWidth: number,
  rowHeight: number,
  fontSize: number,
  allowsWrap: boolean,
):
  | {
      fontSize: number;
      columnWidth: number;
      columnGap: number;
      wrappedColumnGap: number;
      rows: Array<Array<{ stationIndex: number; chunks: string[][] }>>;
    }
  | undefined {
  // 不同站名间需明显分隔；同站名断列另行使用紧凑间距。
  const columnGap = fontSize * 0.5;
  const characterGap = fontSize * 0.12;
  const availableRowHeight = rowHeight - (allowsWrap ? 2 : 0);
  const maximumCharactersPerColumn = Math.max(
    1,
    Math.floor((availableRowHeight + characterGap) / (fontSize + characterGap)),
  );
  let stationIndex = 0;
  const rows = stationRows.map((stations) =>
    stations.map((station) => {
      const characters = Array.from(station);
      const chunks = splitTransitStationCharacters(
        characters,
        maximumCharactersPerColumn,
        allowsWrap,
      );
      if (!chunks) {
        return undefined;
      }
      const entry = { stationIndex, chunks };
      stationIndex += 1;
      return entry;
    }),
  );
  if (rows.some((row) => row.some((entry) => entry === undefined))) {
    return undefined;
  }
  const resolvedRows = rows as Array<Array<{ stationIndex: number; chunks: string[][] }>>;
  const maximumColumnCount = Math.max(
    ...resolvedRows.map((row) => row.reduce((count, entry) => count + entry.chunks.length, 0)),
    1,
  );
  const maximumInternalColumnGapCount = Math.max(
    ...resolvedRows.map((row) =>
      row.reduce((count, entry) => count + Math.max(entry.chunks.length - 1, 0), 0),
    ),
    0,
  );
  const stationColumnGapCount = Math.max(maximumColumnCount - maximumInternalColumnGapCount - 1, 0);
  const columnWidth = Math.max(
    1,
    (layoutWidth - stationColumnGapCount * columnGap) / maximumColumnCount,
  );
  return {
    fontSize,
    columnWidth,
    columnGap,
    // 同一站名换列时仅保留约 1px 的视觉间隔；不同站名仍使用完整列距。
    wrappedColumnGap: -Math.max(0, columnWidth - fontSize - 1),
    rows: resolvedRows,
  };
}

function splitTransitStationCharacters(
  characters: string[],
  maximumCharactersPerColumn: number,
  allowsWrap: boolean,
): string[][] | undefined {
  if (characters.length <= maximumCharactersPerColumn) {
    return [characters];
  }
  if (!allowsWrap) {
    return undefined;
  }
  const columnCount = Math.ceil(characters.length / maximumCharactersPerColumn);
  if (characters.length < columnCount * 3) {
    return undefined;
  }
  const baseLength = Math.floor(characters.length / columnCount);
  const longerColumnCount = characters.length % columnCount;
  let offset = 0;
  return Array.from({ length: columnCount }, (_, index) => {
    const length = baseLength + (index < longerColumnCount ? 1 : 0);
    const chunk = characters.slice(offset, offset + length);
    offset += length;
    return chunk;
  });
}

function renderTransitRouteMap(
  value: string,
  rawColor: string | undefined,
  config: MaterialGlyphConfig,
): string {
  const payload = parseTransitRouteMapPayload(value);
  if (!payload) {
    return '';
  }
  const color = rawColor && /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : '#26CABA';
  const allCoordinates = [
    ...payload.route,
    ...payload.stations.map(([x, z]) => [x, z] as [number, number]),
  ];
  const minX = Math.min(...allCoordinates.map((coordinate) => coordinate[0]));
  const maxX = Math.max(...allCoordinates.map((coordinate) => coordinate[0]));
  const minZ = Math.min(...allCoordinates.map((coordinate) => coordinate[1]));
  const maxZ = Math.max(...allCoordinates.map((coordinate) => coordinate[1]));
  const spanX = Math.max(maxX - minX, 1);
  const spanZ = Math.max(maxZ - minZ, 1);
  const padding = 4;
  const scale = Math.min(
    (config.layoutWidth - padding * 2) / spanX,
    (config.layoutHeight - padding * 2) / spanZ,
  );
  const offsetX = (config.layoutWidth - spanX * scale) / 2;
  const offsetY = (config.layoutHeight - spanZ * scale) / 2;
  const project = ([x, z]: [number, number]): [number, number] => [
    offsetX + (x - minX) * scale,
    offsetY + (z - minZ) * scale,
  ];
  const roads = payload.roads
    .map(([startX, startZ, endX, endZ]) => {
      const start = project([startX, startZ]);
      const end = project([endX, endZ]);
      return `<path d="M${formatNumber(start[0])} ${formatNumber(start[1])}L${formatNumber(end[0])} ${formatNumber(end[1])}" fill="none" stroke="#D4D4D4" stroke-width="0.75"/>`;
    })
    .join('');
  const routePath = payload.route
    .map((coordinate, index) => {
      const point = project(coordinate);
      return `${index ? 'L' : 'M'}${formatNumber(point[0])} ${formatNumber(point[1])}`;
    })
    .join('');
  const transferColorsByStation = new Map(
    (payload.transfers ?? []).map((transfer) => [transfer[2], transfer[3]] as const),
  );
  const stations = payload.stations
    .map(([x, z, stationIndex]) => {
      const point = project([x, z]);
      const isCurrent = stationIndex === payload.currentStationIndex;
      const transferRings = (transferColorsByStation.get(stationIndex) ?? [])
        .slice(0, 3)
        .map(
          (transferColor, index) =>
            `<circle cx="${formatNumber(point[0])}" cy="${formatNumber(point[1])}" r="${formatNumber(2.05 + index * 0.42)}" fill="none" stroke="${transferColor}" stroke-width="0.34"/>`,
        )
        .join('');
      return `${transferRings}<circle cx="${formatNumber(point[0])}" cy="${formatNumber(point[1])}" r="${isCurrent ? '2.4' : '1.35'}" fill="${isCurrent ? '#E28336' : '#FFFFFF'}" stroke="${isCurrent ? '#FFFFFF' : color}" stroke-width="${isCurrent ? '0.9' : '0.65'}"/>`;
    })
    .join('');
  return `<svg x="0" y="0" width="${formatNumber(config.layoutWidth)}" height="${formatNumber(config.layoutHeight)}" viewBox="0 0 ${formatNumber(config.layoutWidth)} ${formatNumber(config.layoutHeight)}" overflow="hidden"><rect width="${formatNumber(config.layoutWidth)}" height="${formatNumber(config.layoutHeight)}" fill="#FFFFFF"/>${roads}<path d="${routePath}" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${routePath}" fill="none" stroke="${color}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>${stations}</svg>`;
}

function parseTransitRouteMapPayload(value: string): TransitRouteMapPayload | undefined {
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    throw new Error('线路地图数据不是有效的 JSON。');
  }
  if (!input || typeof input !== 'object') {
    throw new Error('线路地图数据格式无效。');
  }
  const candidate = input as Partial<TransitRouteMapPayload>;
  const route = parseCoordinatePairs(candidate.route, 256);
  const roads = parseRoadSegments(candidate.roads, 256);
  const stations = parseRouteStations(candidate.stations, 256);
  const transfers = parseRouteTransfers(candidate.transfers, 256);
  const currentStationIndex = candidate.currentStationIndex;
  if (
    !route ||
    route.length < 2 ||
    !roads ||
    !stations ||
    !transfers ||
    !Number.isInteger(currentStationIndex)
  ) {
    throw new Error('线路地图数据缺少有效的线路或站点坐标。');
  }
  return { route, roads, stations, transfers, currentStationIndex: currentStationIndex as number };
}

function parseCoordinatePairs(
  value: unknown,
  maximumCount: number,
): Array<[number, number]> | undefined {
  if (!Array.isArray(value) || value.length > maximumCount) {
    return undefined;
  }
  const coordinates = value.filter(
    (coordinate): coordinate is [number, number] =>
      Array.isArray(coordinate) &&
      coordinate.length === 2 &&
      coordinate.every((part) => typeof part === 'number' && Number.isFinite(part)),
  );
  return coordinates.length === value.length ? coordinates : undefined;
}

function parseRoadSegments(
  value: unknown,
  maximumCount: number,
): Array<[number, number, number, number]> | undefined {
  if (!Array.isArray(value) || value.length > maximumCount) {
    return undefined;
  }
  const segments = value.filter(
    (segment): segment is [number, number, number, number] =>
      Array.isArray(segment) &&
      segment.length === 4 &&
      segment.every((part) => typeof part === 'number' && Number.isFinite(part)),
  );
  return segments.length === value.length ? segments : undefined;
}

function parseRouteStations(
  value: unknown,
  maximumCount: number,
): Array<[number, number, number]> | undefined {
  if (!Array.isArray(value) || value.length > maximumCount) {
    return undefined;
  }
  const stations = value.filter(
    (station): station is [number, number, number] =>
      Array.isArray(station) &&
      station.length === 3 &&
      station.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
      Number.isInteger(station[2]),
  );
  return stations.length === value.length ? stations : undefined;
}

function parseRouteTransfers(
  value: unknown,
  maximumCount: number,
): Array<[number, number, number, string[]]> | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumCount) return undefined;
  const transfers = value.filter(
    (transfer): transfer is [number, number, number, string[]] =>
      Array.isArray(transfer) &&
      transfer.length === 4 &&
      transfer.slice(0, 2).every((part) => typeof part === 'number' && Number.isFinite(part)) &&
      Number.isInteger(transfer[2]) &&
      Array.isArray(transfer[3]) &&
      transfer[3].length <= 8 &&
      transfer[3].every((color) => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)),
  );
  return transfers.length === value.length ? transfers : undefined;
}

interface MetroLineMapTransfer {
  label: string;
  color: string;
}

const metroLineMapDefaultTransferColors: Record<string, string> = {
  '1': '#C11111',
  '2': '#EC6941',
  '3': '#F29DB4',
  '4': '#8957A1',
  '5': '#00A0E9',
  '6': '#E8CE07',
  '7': '#7CDA11',
  '8': '#00C1D4',
  '9': '#00A0E9',
  '10': '#A0A0A0',
};

// 以下图形数据直接取自设计导出的单个 SVG，避免用近似几何替代。
const metroLineMapStationRingPath =
  'M5.5 11C8.53757 11 11 8.53757 11 5.5C11 2.46243 8.53757 0 5.5 0C2.46243 0 0 2.46243 0 5.5C0 8.53757 2.46243 11 5.5 11ZM5.5 1.5C7.70914 1.5 9.5 3.29086 9.5 5.5C9.5 7.70914 7.70914 9.5 5.5 9.5C3.29086 9.5 1.5 7.70914 1.5 5.5C1.5 3.29086 3.29086 1.5 5.5 1.5Z';
const metroLineMapCurrentArrowPath =
  'M5.5 3.5L3.5 5.5L5.5 7.5L5.81579 7.18421L4.34211 5.71053L7.5 5.71053L7.5 5.23684L4.34211 5.23684L5.81579 3.81579L5.5 3.5Z';
const metroLineMapOldTransferRingPath =
  'M10 4.5C10 2.01472 7.98528 0 5.5 0C3.01472 0 1 2.01472 1 4.5L1 14.5C1 16.9853 3.01472 19 5.5 19C7.98528 19 10 16.9853 10 14.5L10 4.5ZM2 4.5C2 2.567 3.567 1 5.5 1C7.433 1 9 2.567 9 4.5L9 14.5C9 16.433 7.433 18 5.5 18C3.567 18 2 16.433 2 14.5L2 4.5Z';
const metroLineMapOldTransferUpStroke = 'M4 10L4 5C4 5 4.00002 3.5 5.5 3.5C6.99998 3.5 7 5 7 5L7 7';
const metroLineMapOldTransferUpArrow = 'M7 8L8 6L6 6L7 8Z';
const metroLineMapOldTransferDownStroke =
  'M7 9L7 14C7 14 6.99998 15.5 5.5 15.5C4.00002 15.5 4 14 4 14L4 12';
const metroLineMapOldTransferDownArrow = 'M4 11L3 13L5 13L4 11Z';
const metroLineMapNewTransferPathTop =
  'M19.25 10.79C16.3333 11.9567 13.9044 12.54 11.96 12.54C10.0156 12.54 7.38557 11.1822 4.08 8.46L2.33 9.92L2.33 4.37L7 4.37L7 3.5L0 3.5L0 14L3.21 11.37C6.12667 13.12 9.04333 14 11.96 14C14.8767 14 17.3056 12.9289 19.25 10.79Z';
const metroLineMapNewTransferPathBottom =
  'M0.580017 3.21C3.49668 2.04333 5.92559 1.46 7.87002 1.46C9.81444 1.46 12.4444 2.81778 15.75 5.54L17.5 4.08L17.5 9.62L12.83 9.62L12.83 10.5L19.83 10.5L19.83 0L16.62 2.62C13.7034 0.87 10.7867 0 7.87002 0C4.95335 0 2.52446 1.07111 0.580017 3.21Z';
const metroLineMapNewTransferPathGlyph =
  'M8.86002 8.32001C8.6422 8.16292 8.48644 7.97843 8.39002 7.77001L9.66002 7.77001L9.66002 7.38001L9.33002 7.38001L9.33002 6.17001L8.64002 6.17001L9.06002 5.60001L9.06002 5.24001L7.86002 5.24001C7.90348 5.14668 7.94644 5.04891 7.99002 4.94001L7.59002 4.82001C7.4905 5.05333 7.37323 5.27999 7.23002 5.49001C7.08693 5.69998 6.90541 5.90152 6.70002 6.11001L6.70002 5.70001L6.32002 5.70001L6.32002 4.88001L5.90002 4.88001L5.90002 5.70001L5.43002 5.70001L5.43002 6.13001L5.90002 6.13001L5.90002 7.00001C5.61072 7.10582 5.42021 7.17195 5.33002 7.20001L5.43002 7.65001L5.90002 7.46001L5.90002 8.43001C5.90002 8.52334 5.88329 8.58577 5.86002 8.62001C5.83668 8.65425 5.7916 8.67001 5.72002 8.67001C5.62052 8.67001 5.52405 8.65492 5.44002 8.63001L5.52002 9.06001C5.60404 9.07558 5.70868 9.09001 5.83002 9.09001C6.01045 9.09001 6.13844 9.04467 6.21002 8.97001C6.28153 8.89534 6.32002 8.76667 6.32002 8.58001L6.32002 7.30001L6.73002 7.14001L6.64002 6.70001L6.32002 6.83001L6.32002 6.13001L6.69002 6.13001L6.59002 6.23001L6.84002 6.56001L6.96002 6.44001L6.96002 7.38001L6.59002 7.38001L6.59002 7.77001L7.86002 7.77001C7.79153 7.97534 7.65468 8.15225 7.44002 8.30001C7.22535 8.44777 6.91444 8.58558 6.51002 8.71001L6.73002 9.13001C7.11578 8.9931 7.42978 8.85243 7.66002 8.70001C7.89026 8.54758 8.05111 8.36467 8.16002 8.15001C8.42759 8.59801 8.87026 8.91777 9.48002 9.12001L9.67002 8.70001C9.34959 8.60667 9.07778 8.47716 8.86002 8.32001ZM13.88 7.98001C13.5752 7.77158 13.3109 7.50801 13.09 7.20001L13.09 6.14001L14.95 6.14001L14.95 5.77001L13.09 5.77001L13.09 5.40001C13.706 5.372 14.1886 5.34797 14.54 5.32001L14.5 4.95001C14.0551 4.98737 13.5078 5.01891 12.87 5.05001C12.2322 5.0811 11.6905 5.11001 11.23 5.11001L11.25 5.46001C11.5954 5.46001 12.0387 5.44179 12.58 5.42001L12.68 5.42001L12.68 5.77001L10.86 5.77001L10.86 6.14001L12.68 6.14001L12.68 7.21001C12.4684 7.50243 12.22 7.74862 11.94 7.94001C11.66 8.13128 11.2672 8.3391 10.76 8.56001L10.97 8.96001C11.3621 8.77643 11.7009 8.58977 11.97 8.40001C12.2392 8.21025 12.4716 8.00267 12.68 7.76001L12.68 9.10001L13.09 9.10001L13.09 7.75001C13.2984 7.99892 13.5523 8.21401 13.84 8.41001C14.1278 8.60601 14.468 8.78892 14.86 8.96001L15.03 8.54001C14.5697 8.37201 14.185 8.18843 13.88 7.98001ZM7.64002 5.63001L8.54002 5.63001L8.12002 6.17001L7.21002 6.17001C7.38111 5.98019 7.52802 5.80108 7.64002 5.63001ZM11.22 7.28001C10.9991 7.3391 10.8674 7.38001 10.83 7.38001L10.91 7.72001L11.82 7.46001L11.82 7.68001L12.2 7.68001L12.2 6.28001L11.82 6.28001L11.82 6.55001L10.95 6.55001L10.95 6.88001L11.82 6.88001L11.82 7.12001C11.6427 7.16977 11.4409 7.22092 11.22 7.28001ZM13.95 6.28001L13.58 6.28001L13.58 7.26001C13.58 7.41867 13.6084 7.53158 13.68 7.60001C13.7516 7.66843 13.8782 7.71001 14.04 7.71001L14.2 7.72001L14.37 7.71001C14.566 7.71001 14.7006 7.6791 14.78 7.62001C14.8594 7.56092 14.91 7.44873 14.91 7.29001L14.93 6.95001L14.6 6.88001C14.6 6.95777 14.59 7.06177 14.59 7.18001C14.59 7.24534 14.5703 7.29207 14.55 7.32001C14.5298 7.34807 14.4951 7.37001 14.45 7.37001C14.4049 7.37001 14.3334 7.39001 14.24 7.39001L14.14 7.38001C14.0716 7.38001 14.0181 7.36486 13.99 7.34001C13.962 7.3151 13.95 7.2691 13.95 7.21001L13.95 7.02001C14.3482 6.86752 14.6509 6.74262 14.85 6.64001L14.7 6.33001C14.5134 6.44201 14.2612 6.55867 13.95 6.68001L13.95 6.28001ZM7.36002 7.38001L7.36002 6.57001L7.92002 6.57001L7.92002 7.38001L7.36002 7.38001ZM8.93002 7.38001L8.32002 7.38001L8.32002 6.57001L8.93002 6.57001L8.93002 7.38001Z';
const metroLineMapNewTransferWidth = 19.83331298828125;
const metroLineMapStemLong = 'M0 0L0 23.2632L1.5 26L3 23.2632L3 0Z';
const metroLineMapStemShortDown = 'M0 0L0 19.2944L1.5 23L3 19.2944L3 0Z';
const metroLineMapStemLongUp = 'M0 26L0 2.7368L1.5 0L3 2.7368L3 26Z';
const metroLineMapFontFamily =
  "Arial, Helvetica, 'HarmonyOS Sans SC', 'Source Han Sans SC', sans-serif";
const metroLineMapLegacyTransferFontFamily =
  "'HarmonyOS Sans SC', 'Source Han Sans SC', Arial, Helvetica, sans-serif";

/**
 * 地铁横版线路图渲染器。
 * 旧版 / 新版共用同一套站序排版：站名在站线两侧交替排列，
 * 开门方向决定终点站在左端还是右端，当前站圆圈内的箭头始终指向终点站。
 */
function renderMetroLineMap(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string>,
  style: 'modern' | 'classic',
): string {
  const stations = value
    .split(/\r?\n|\s*\/\s*/u)
    .map((station) => station.replace(/[\s\u3000]+/gu, '').trim())
    .filter(Boolean);
  if (!stations.length) {
    return '';
  }
  const canvasWidth = Math.max(
    Number(values['canvas.logicalWidthPx']) || config.layoutWidth || 768,
    320,
  );
  const canvasHeight = Math.max(
    Number(values['canvas.logicalHeightPx']) || config.layoutHeight || 128,
    64,
  );
  const rawAccent = config.colorFieldKey ? (values[config.colorFieldKey] ?? '') : '';
  const accentColor = /^#[0-9A-Fa-f]{6}$/u.test(rawAccent) ? rawAccent : '#F29DB4';
  const rawCurrentIndex = config.currentIndexFieldKey
    ? Number.parseInt(values[config.currentIndexFieldKey] ?? '', 10)
    : 0;
  const currentIndex = Math.min(
    Math.max(Number.isFinite(rawCurrentIndex) ? rawCurrentIndex : 0, 0),
    stations.length - 1,
  );
  const terminusOnLast = values.travelDirection !== 'first';
  const doorDirection = values.doorDirection === 'right' ? 'right' : 'left';
  const terminusSide = doorDirection;
  const reverseDisplay =
    (terminusOnLast && terminusSide === 'left') || (!terminusOnLast && terminusSide === 'right');
  const displayStations = reverseDisplay ? [...stations].reverse() : stations;
  const displayCurrentIndex = reverseDisplay ? stations.length - 1 - currentIndex : currentIndex;
  const transfersByStation = parseMetroLineMapTransfers(values.transferLines ?? '');

  const paddingX = Math.min(26, canvasWidth * 0.08);
  const left = paddingX;
  const right = canvasWidth - paddingX;
  const spacing =
    displayStations.length > 1 ? (right - left) / (displayStations.length - 1) : right - left;
  const labelFontSize = Math.min(9, Math.max(4.2, spacing * 0.34));
  const pinyinFontSize = Math.max(2.4, Math.min(4, labelFontSize * 0.44));
  const maxLabelWidth = Math.max(spacing * 2 - 3, 10);
  const lineWidth = Math.max(right - left, 1);
  const yScale = canvasHeight / 128;

  const stationXs = displayStations.map((_, index) =>
    displayStations.length > 1 ? left + spacing * index : (left + right) / 2,
  );
  const currentX = stationXs[displayCurrentIndex] ?? (left + right) / 2;
  const passedStartX = terminusSide === 'left' ? currentX : left;
  const passedWidth = terminusSide === 'left' ? right - currentX : currentX - left;

  const labels: string[] = [];
  const transferStems: string[] = [];
  const markers: string[] = [];
  const transfers: string[] = [];

  displayStations.forEach((station, displayIndex) => {
    const x = stationXs[displayIndex];
    const isCurrent = displayIndex === displayCurrentIndex;
    const isPassed =
      terminusSide === 'left'
        ? displayIndex > displayCurrentIndex
        : displayIndex < displayCurrentIndex;
    const labelColor = isPassed ? '#A5A5A5' : '#000000';
    const markerColor = isPassed ? '#A5A5A5' : accentColor;
    const labelAbove = displayIndex % 2 === 0;
    const pinyin = toUppercasePinyin(station);
    const transferList = transfersByStation.get(station) ?? [];

    if (isCurrent) {
      const nameWidth = Math.min(
        estimateMetroLineMapTextWidth(station, labelFontSize),
        Math.max(maxLabelWidth, spacing * 1.2),
      );
      const pinyinWidth = Math.min(
        estimateMetroLineMapTextWidth(pinyin, pinyinFontSize),
        Math.max(maxLabelWidth, spacing * 1.2),
      );
      const boxWidth = Math.max(nameWidth, pinyinWidth) + 8;
      const boxHeight = 19;
      const boxNameBaseline = labelAbove ? 39 : 79.2;
      const boxPinyinBaseline = labelAbove ? 44.6 : 84.6;
      const boxTop = boxNameBaseline - 10.2;
      const boxX = Math.min(Math.max(x - boxWidth / 2, 2), Math.max(canvasWidth - boxWidth - 2, 2));
      labels.push(
        `<rect x="${formatNumber(boxX)}" y="${formatNumber(boxTop)}" width="${formatNumber(boxWidth)}" height="${boxHeight}" rx="2" fill="${accentColor}"/>`,
      );
      labels.push(
        renderMetroLineMapText(
          station,
          boxX + boxWidth / 2,
          boxNameBaseline,
          boxWidth - 8,
          labelFontSize,
          '#FFFFFF',
          400,
        ),
      );
      if (pinyin) {
        labels.push(
          renderMetroLineMapText(
            pinyin,
            boxX + boxWidth / 2,
            boxPinyinBaseline,
            boxWidth - 8,
            pinyinFontSize,
            '#FFFFFF',
            400,
          ),
        );
      }
      const tickStart = labelAbove ? boxTop + boxHeight : 64;
      const tickEnd = labelAbove ? 53 : boxTop;
      labels.push(
        `<path d="M${formatNumber(x)} ${formatNumber(Math.min(tickStart, tickEnd))}L${formatNumber(x)} ${formatNumber(Math.max(tickStart, tickEnd))}" stroke="${markerColor}" stroke-width="1.5" fill="none"/>`,
      );
    } else {
      const nameY = labelAbove ? 39 : 79.2;
      const pinyinY = labelAbove ? 44.6 : 84.6;
      const barY = labelAbove ? 46.9 : 70.1;
      const nameWidth = Math.min(
        estimateMetroLineMapTextWidth(station, labelFontSize),
        maxLabelWidth,
      );
      const pinyinWidth = Math.min(
        estimateMetroLineMapTextWidth(pinyin, pinyinFontSize),
        maxLabelWidth,
      );
      const barWidth = Math.max(nameWidth, pinyinWidth);
      labels.push(
        `<path d="M${formatNumber(x - barWidth / 2)} ${formatNumber(barY)}L${formatNumber(x + barWidth / 2)} ${formatNumber(barY)}" stroke="${labelColor}" stroke-width="0.5" fill="none"/>`,
      );
      labels.push(
        `<path d="M${formatNumber(x)} ${labelAbove ? '47' : '64'}L${formatNumber(x)} ${labelAbove ? '53' : '70'}" stroke="${labelColor}" stroke-width="0.5" fill="none"/>`,
      );
      labels.push(
        renderMetroLineMapText(station, x, nameY, maxLabelWidth, labelFontSize, labelColor, 400),
      );
      if (pinyin) {
        labels.push(
          renderMetroLineMapText(
            pinyin,
            x,
            pinyinY,
            maxLabelWidth,
            pinyinFontSize,
            labelColor,
            400,
          ),
        );
      }
    }

    const isTerminusSide = displayIndex === 0 || displayIndex === displayStations.length - 1;
    const isTerminusEnd =
      (terminusSide === 'left' && displayIndex === 0) ||
      (terminusSide === 'right' && displayIndex === displayStations.length - 1);
    markers.push(
      renderMetroLineMapStationMarker({
        x,
        kind:
          style === 'classic'
            ? isCurrent
              ? 'current'
              : isTerminusSide
                ? 'terminal'
                : 'normal'
            : 'normal',
        ringColor: markerColor,
        terminalColor: isTerminusEnd ? accentColor : '#A5A5A5',
        doorDirection,
      }),
    );

    if (transferList.length) {
      const transferPart =
        style === 'classic'
          ? renderMetroLineMapOldTransfer({
              x,
              labelAbove,
              transferList,
              mainColor: accentColor,
              passed: isPassed,
            })
          : renderMetroLineMapNewTransfer({
              x,
              labelAbove,
              transferList,
              mainColor: accentColor,
              passed: isPassed,
            });
      transferStems.push(transferPart.stem);
      transfers.push(transferPart.badge);
    }
  });

  const legend =
    style === 'classic' ? renderMetroLineMapClassicLegend(accentColor, doorDirection) : '';
  const body = [
    `<rect width="${formatNumber(canvasWidth)}" height="128" fill="#FFFFFF"/>`,
    `<rect x="${formatNumber(left)}" y="56" width="${formatNumber(lineWidth)}" height="5" fill="${accentColor}"/>`,
    passedWidth > 0
      ? `<rect x="${formatNumber(passedStartX)}" y="56" width="${formatNumber(passedWidth)}" height="5" fill="#A5A5A5"/>`
      : '',
    `<rect x="0" y="115" width="${formatNumber(canvasWidth)}" height="13" fill="${accentColor}"/>`,
    labels.join(''),
    transferStems.join(''),
    markers.join(''),
    transfers.join(''),
    legend,
  ].join('');

  return yScale === 1
    ? `<g data-metro-line-map="${style}">${body}</g>`
    : `<g data-metro-line-map="${style}" transform="scale(1 ${formatNumber(yScale)})">${body}</g>`;
}

// 竖版线路图：设计稿 128 × 320（1 m × 2.5 m），以下坐标均取自设计导出的 SVG。
const metroVerticalReferenceWidth = 128;
const metroVerticalHeaderHeight = 32;
const metroVerticalHeaderAccentHeight = 4;
const metroVerticalHeaderBackground = '#42464D';
const metroVerticalPassedColor = '#A0A0A0';
// 页头方向箭头（设计稿绝对坐标，左侧）；右侧通过水平镜像复用。
const metroVerticalHeaderArrowPath =
  'M22.6765 23.2502L19.0139 19.4409L29.9382 19.4409L29.9382 16.3284L19.1712 16.3284L22.6765 12.683L19.0186 12.683L13.9382 17.9666L17.4881 17.9666L13.9382 17.9666L19.0186 23.2502L22.6765 23.2502Z';
// 当前站旁的向上箭头（4 × 4.784 的局部坐标）。
// 依据更正后的「两侧均有轨道」参考图：轨道在右时当前站箭头同样向上。
const metroVerticalCurrentArrowPath =
  'M2 0L3.992 1.992L4 2.744L2.312 1L2.312 4.784L1.752 4.784L1.752 1L0 2.744L0 2L2 0Z';
// 换乘图标：上下两条循环箭头 + 中间「换乘」字形，来自设计稿的绝对坐标（中心 y = 188）。
const metroVerticalTransferTopPath =
  'M35.3733 186.105C36.8316 185.522 38.0461 185.23 39.0183 185.23C39.9905 185.23 41.3055 185.909 42.9583 187.27L43.8333 186.54L43.8333 189.31L41.4983 189.31L41.4983 189.75L44.9983 189.75L44.9983 184.5L43.3933 185.81C41.935 184.935 40.4766 184.5 39.0183 184.5C37.56 184.5 36.3455 185.036 35.3733 186.105Z';
const metroVerticalTransferBottomPath =
  'M44.7083 189.895C43.2499 190.478 42.0355 190.77 41.0633 190.77C40.091 190.77 38.776 190.091 37.1233 188.73L36.2483 189.46L36.2483 186.685L38.5833 186.685L38.5833 186.25L35.0833 186.25L35.0833 191.5L36.6883 190.185C38.1466 191.06 39.6049 191.5 41.0633 191.5C42.5216 191.5 43.736 190.964 44.7083 189.895Z';
const metroVerticalTransferGlyphPaths = [  'M39.736 188.152L39.736 188.316L39.1155 188.316C39.181 188.477 39.3384 188.595 39.3384 188.595C39.4957 188.713 39.7339 188.783 39.7339 188.783L39.6596 188.956C39.2116 188.807 39.0324 188.48 39.0324 188.48C38.9581 188.637 38.7954 188.751 38.7954 188.751C38.6326 188.864 38.355 188.963 38.355 188.963L38.2655 188.792C38.5583 188.702 38.7123 188.589 38.7123 188.589C38.8664 188.475 38.9123 188.316 38.9123 188.316L38.2917 188.316L38.2917 188.152L38.4862 188.152L38.4862 187.684C38.4512 187.724 38.4075 187.763 38.4075 187.763L38.3026 187.634C38.473 187.468 38.5856 187.303 38.5856 187.303C38.6981 187.138 38.779 186.95 38.779 186.95L38.9407 186.998C38.9013 187.099 38.8707 187.155 38.8707 187.155L39.4389 187.155L39.4389 187.302L39.2335 187.59L39.5678 187.59L39.5678 188.152L39.736 188.152ZM38.3594 188.023L38.1584 188.099L38.1584 188.705C38.1584 188.831 38.1103 188.882 38.1103 188.882C38.0622 188.932 37.9399 188.932 37.9399 188.932C37.8568 188.932 37.7978 188.921 37.7978 188.921L37.7651 188.748C37.8284 188.766 37.9005 188.766 37.9005 188.766C37.9552 188.766 37.9727 188.74 37.9727 188.74C37.9901 188.713 37.9901 188.643 37.9901 188.643L37.9901 188.163L37.8918 188.202C37.859 188.215 37.823 188.229 37.823 188.229C37.7869 188.244 37.752 188.259 37.752 188.259L37.7083 188.075C37.8699 188.021 37.9901 187.975 37.9901 187.975L37.9901 187.544L37.7541 187.544L37.7541 187.374L37.9901 187.374L37.9901 186.976L38.1584 186.976L38.1584 187.374L38.3507 187.374L38.3507 187.544L38.1584 187.544L38.1584 187.909L38.2065 187.89C38.2436 187.877 38.3223 187.842 38.3223 187.842L38.3594 188.023ZM38.7833 187.313C38.7003 187.448 38.5736 187.59 38.5736 187.59L39.0237 187.59L39.2269 187.313L38.7833 187.313ZM38.6457 187.752L38.6457 188.152L38.9341 188.152L38.9341 188.145L38.9341 187.752L38.6457 187.752ZM39.0958 188.152L39.4105 188.152L39.4105 187.752L39.0958 187.752L39.0958 188.152Z',
  'M41.5422 188.06C41.6951 188.281 41.9126 188.43 41.9126 188.43C42.13 188.58 42.4577 188.7 42.4577 188.7L42.3878 188.871C42.1038 188.751 41.8973 188.607 41.8973 188.607C41.6908 188.464 41.5422 188.281 41.5422 188.281L41.5422 188.945L41.3761 188.945L41.3761 188.281C41.2275 188.46 41.0352 188.598 41.0352 188.598C40.8429 188.735 40.5545 188.871 40.5545 188.871L40.4693 188.707C40.832 188.547 41.0287 188.411 41.0287 188.411C41.2253 188.274 41.3761 188.064 41.3761 188.064L41.3761 187.551L40.5064 187.551L40.5064 187.398L41.3761 187.398L41.3761 187.214C40.8648 187.232 40.69 187.234 40.69 187.234L40.6812 187.09C41.0046 187.085 41.4548 187.064 41.4548 187.064C41.9049 187.042 42.2152 187.016 42.2152 187.016L42.2349 187.166C41.9814 187.186 41.5422 187.206 41.5422 187.206L41.5422 187.398L42.425 187.398L42.425 187.551L41.5422 187.551L41.5422 188.06ZM40.5021 188.15C40.548 188.141 40.974 188.023 40.974 188.023L40.974 187.894L40.5545 187.894L40.5545 187.759L40.974 187.759L40.974 187.616L41.127 187.616L41.127 188.272L40.974 188.272L40.974 188.165C40.8517 188.198 40.7239 188.235 40.7239 188.235C40.596 188.272 40.5327 188.292 40.5327 188.292L40.5021 188.15ZM41.7913 187.616L41.9421 187.616L41.9421 187.824C42.1628 187.741 42.3092 187.654 42.3092 187.654L42.3703 187.783C42.2218 187.859 41.9421 187.966 41.9421 187.966L41.9421 188.064C41.9421 188.113 41.9639 188.131 41.9639 188.131C41.9858 188.15 42.0382 188.154 42.0382 188.154C42.0885 188.156 42.1365 188.154 42.1365 188.154C42.2086 188.15 42.2327 188.13 42.2327 188.13C42.2567 188.11 42.2633 188.049 42.2633 188.049C42.2676 188.003 42.2676 187.909 42.2676 187.909L42.4031 187.938L42.3944 188.095C42.39 188.204 42.3365 188.244 42.3365 188.244C42.2829 188.283 42.1496 188.287 42.1496 188.287L42.0732 188.289L41.9967 188.287C41.8874 188.283 41.8394 188.237 41.8394 188.237C41.7913 188.191 41.7913 188.084 41.7913 188.084L41.7913 187.616Z',
];

// 以下旧版两侧版式的图形全部直接取自参考 SVG，避免用近似几何替代。
const metroVerticalClassicDirectionLeftPath =
  'M8.79587 43.797L7.19349 42.1305L11.9729 42.1305L11.9729 40.7687L7.26232 40.7687L8.79587 39.1739L7.19554 39.1739L4.9729 41.4854L6.52598 41.4854L4.9729 41.4854L7.19554 43.797L8.79587 43.797Z';
const metroVerticalClassicDirectionRightPath =
  'M119.204 43.797L120.807 42.1305L116.027 42.1305L116.027 40.7687L120.738 40.7687L119.204 39.1739L120.804 39.1739L123.027 41.4854L121.474 41.4854L123.027 41.4854L120.804 43.797L119.204 43.797Z';
const metroVerticalClassicHeaderTabPath =
  'M0 21L0 0C0 0 0 0 0 0L36 0C36 0 36 0 36 0L36 21C36 23.2091 34.2091 25 32 25L4 25C1.79086 25 0 23.2091 0 21Z';
const metroVerticalClassicHeaderTabCirclePath =
  'M0 8Q0 7.80361 0.00963635 7.60746Q0.0192727 7.41131 0.0385222 7.21586Q0.0577717 7.02042 0.0865879 6.82616Q0.115404 6.63189 0.153718 6.43928Q0.192031 6.24666 0.23975 6.05616Q0.287469 5.86565 0.344477 5.67772Q0.401486 5.48979 0.467647 5.30488Q0.533809 5.11997 0.608964 4.93853Q0.684118 4.75709 0.768086 4.57956Q0.852053 4.40203 0.94463 4.22883Q1.03721 4.05563 1.13817 3.88718Q1.23914 3.71873 1.34824 3.55544Q1.45735 3.39215 1.57434 3.23441Q1.69133 3.07666 1.81592 2.92485Q1.9405 2.77304 2.07239 2.62753Q2.20428 2.48201 2.34315 2.34315Q2.48201 2.20428 2.62753 2.07239Q2.77304 1.9405 2.92485 1.81592Q3.07666 1.69133 3.23441 1.57434Q3.39215 1.45735 3.55544 1.34824Q3.71873 1.23914 3.88718 1.13817Q4.05563 1.03721 4.22883 0.94463Q4.40203 0.852053 4.57956 0.768086Q4.75709 0.684118 4.93853 0.608964Q5.11997 0.533809 5.30488 0.467647Q5.48979 0.401486 5.67772 0.344477Q5.86565 0.287469 6.05616 0.23975Q6.24666 0.192031 6.43928 0.153718Q6.63189 0.115404 6.82616 0.0865879Q7.02042 0.0577717 7.21586 0.0385222Q7.41131 0.0192727 7.60746 0.00963635Q7.80361 0 8 0Q8.19639 0 8.39254 0.00963635Q8.58869 0.0192727 8.78414 0.0385222Q8.97958 0.0577717 9.17384 0.0865879Q9.36811 0.115404 9.56072 0.153718Q9.75334 0.192031 9.94384 0.23975Q10.1343 0.287469 10.3223 0.344477Q10.5102 0.401486 10.6951 0.467647Q10.88 0.533809 11.0615 0.608964Q11.2429 0.684118 11.4204 0.768086Q11.598 0.852053 11.7712 0.94463Q11.9444 1.03721 12.1128 1.13817Q12.2813 1.23914 12.4446 1.34824Q12.6079 1.45735 12.7656 1.57434Q12.9233 1.69133 13.0751 1.81592Q13.227 1.9405 13.3725 2.07239Q13.518 2.20428 13.6569 2.34315Q13.7957 2.48201 13.9276 2.62753Q14.0595 2.77304 14.1841 2.92485Q14.3087 3.07666 14.4257 3.23441Q14.5426 3.39215 14.6518 3.55544Q14.7609 3.71873 14.8618 3.88718Q14.9628 4.05563 15.0554 4.22883Q15.1479 4.40203 15.2319 4.57956Q15.3159 4.75709 15.391 4.93853Q15.4662 5.11997 15.5324 5.30488Q15.5985 5.48979 15.6555 5.67772Q15.7125 5.86565 15.7602 6.05616Q15.808 6.24666 15.8463 6.43928Q15.8846 6.63189 15.9134 6.82616Q15.9422 7.02042 15.9615 7.21586Q15.9807 7.41131 15.9904 7.60746Q16 7.80361 16 8Q16 8.19639 15.9904 8.39254Q15.9807 8.58869 15.9615 8.78414Q15.9422 8.97958 15.9134 9.17384Q15.8846 9.36811 15.8463 9.56072Q15.808 9.75334 15.7602 9.94384Q15.7125 10.1343 15.6555 10.3223Q15.5985 10.5102 15.5324 10.6951Q15.4662 10.88 15.391 11.0615Q15.3159 11.2429 15.2319 11.4204Q15.1479 11.598 15.0554 11.7712Q14.9628 11.9444 14.8618 12.1128Q14.7609 12.2813 14.6518 12.4446Q14.5426 12.6079 14.4257 12.7656Q14.3087 12.9233 14.1841 13.0751Q14.0595 13.227 13.9276 13.3725Q13.7957 13.518 13.6569 13.6569Q13.518 13.7957 13.3725 13.9276Q13.227 14.0595 13.0751 14.1841Q12.9233 14.3087 12.7656 14.4257Q12.6079 14.5426 12.4446 14.6518Q12.2813 14.7609 12.1128 14.8618Q11.9444 14.9628 11.7712 15.0554Q11.598 15.1479 11.4204 15.2319Q11.2429 15.3159 11.0615 15.391Q10.88 15.4662 10.6951 15.5324Q10.5102 15.5985 10.3223 15.6555Q10.1343 15.7125 9.94384 15.7602Q9.75334 15.808 9.56072 15.8463Q9.36811 15.8846 9.17384 15.9134Q8.97958 15.9422 8.78414 15.9615Q8.58869 15.9807 8.39254 15.9904Q8.19639 16 8 16Q7.80361 16 7.60746 15.9904Q7.41131 15.9807 7.21586 15.9615Q7.02042 15.9422 6.82616 15.9134Q6.63189 15.8846 6.43928 15.8463Q6.24666 15.808 6.05616 15.7602Q5.86565 15.7125 5.67772 15.6555Q5.48979 15.5985 5.30488 15.5324Q5.11997 15.4662 4.93853 15.391Q4.75709 15.3159 4.57956 15.2319Q4.40203 15.1479 4.22883 15.0554Q4.05563 14.9628 3.88718 14.8618Q3.71873 14.7609 3.55544 14.6518Q3.39215 14.5426 3.23441 14.4257Q3.07666 14.3087 2.92485 14.1841Q2.77304 14.0595 2.62753 13.9276Q2.48201 13.7957 2.34315 13.6569Q2.20428 13.518 2.07239 13.3725Q1.9405 13.227 1.81592 13.0751Q1.69133 12.9233 1.57434 12.7656Q1.45735 12.6079 1.34824 12.4446Q1.23914 12.2813 1.13817 12.1128Q1.03721 11.9444 0.94463 11.7712Q0.852053 11.598 0.768086 11.4204Q0.684118 11.2429 0.608964 11.0615Q0.533809 10.88 0.467647 10.6951Q0.401486 10.5102 0.344477 10.3223Q0.287469 10.1343 0.23975 9.94384Q0.192031 9.75334 0.153718 9.56072Q0.115404 9.36811 0.0865879 9.17384Q0.0577717 8.97958 0.0385222 8.78414Q0.0192727 8.58869 0.00963635 8.39254Q0 8.19639 0 8Z';
const metroVerticalClassicPillLeftBackgroundPath =
  'M48.7417 77.1792L48.7417 77.1792C48.7417 78.3564 47.7874 79.3108 46.6101 79.3108L41.8733 79.3108C40.696 79.3108 39.7417 78.3564 39.7417 77.1792L39.7417 77.1792C39.7417 76.0019 40.696 75.0476 41.8733 75.0476L46.6101 75.0476C47.7874 75.0476 48.7417 76.0019 48.7417 77.1792Z';
const metroVerticalClassicPillRightBackgroundPath =
  'M88.0417 77.1792L88.0417 77.1792C88.0417 78.3564 87.0874 79.3108 85.9102 79.3108L81.1733 79.3108C79.9961 79.3108 79.0417 78.3564 79.0417 77.1792L79.0417 77.1792C79.0417 76.0019 79.9961 75.0476 81.1733 75.0476L85.9102 75.0476C87.0874 75.0476 88.0417 76.0019 88.0417 77.1792Z';
const metroVerticalClassicPillLeftOutlinePath =
  'M48.7417 77.1792C48.7417 78.3564 47.7874 79.3108 46.6101 79.3108L41.8733 79.3108C40.696 79.3108 39.7417 78.3564 39.7417 77.1792C39.7417 76.0019 40.696 75.0476 41.8733 75.0476L46.6101 75.0476C47.7874 75.0476 48.7417 76.0019 48.7417 77.1792ZM48.268 77.1792C48.268 76.2636 47.5258 75.5213 46.6101 75.5213L41.8733 75.5213C40.9576 75.5213 40.2154 76.2636 40.2154 77.1792C40.2154 78.0948 40.9576 78.8371 41.8733 78.8371L46.6101 78.8371C47.5258 78.8371 48.268 78.0948 48.268 77.1792Z';
const metroVerticalClassicPillRightOutlinePath =
  'M88.0417 77.1792C88.0417 78.3564 87.0874 79.3108 85.9102 79.3108L81.1733 79.3108C79.9961 79.3108 79.0417 78.3564 79.0417 77.1792C79.0417 76.0019 79.9961 75.0476 81.1733 75.0476L85.9102 75.0476C87.0874 75.0476 88.0417 76.0019 88.0417 77.1792ZM87.5681 77.1792C87.5681 76.2636 86.8258 75.5213 85.9102 75.5213L81.1733 75.5213C80.2577 75.5213 79.5154 76.2636 79.5154 77.1792C79.5154 78.0948 80.2577 78.8371 81.1733 78.8371L85.9102 78.8371C86.8258 78.8371 87.5681 78.0948 87.5681 77.1792Z';
const metroVerticalClassicPillLeftGlyphTransferPath =
  'M46.3732 76.2318L44.0048 76.2318L44.0048 76.7055L46.3732 76.7055C46.3897 76.7055 46.4138 76.7081 46.4453 76.7134C46.5107 76.7243 46.5698 76.7429 46.6225 76.7693C46.7721 76.8441 46.8469 76.9807 46.8469 77.1792C46.8469 77.3776 46.7721 77.5143 46.6225 77.5891C46.5698 77.6154 46.5107 77.6341 46.4453 77.645C46.4138 77.6502 46.3897 77.6529 46.3732 77.6529L45.8995 77.6529L45.8995 77.416L44.9521 77.8897L45.8995 78.3634L45.8995 78.1265L46.3732 78.1265C46.4159 78.1265 46.4659 78.1218 46.5231 78.1122C46.6354 78.0935 46.7391 78.0603 46.8344 78.0127C46.9755 77.9422 47.0873 77.845 47.1698 77.7213C47.2703 77.5705 47.3206 77.3898 47.3206 77.1792C47.3206 76.9685 47.2703 76.7878 47.1698 76.637C47.0873 76.5133 46.9755 76.4162 46.8344 76.3456C46.7391 76.298 46.6354 76.2648 46.5231 76.2461C46.4659 76.2366 46.4159 76.2318 46.3732 76.2318L46.3732 76.2318Z';
const metroVerticalClassicPillLeftGlyphMainPath =
  'M42.1101 78.1266L44.4785 78.1266L44.4785 77.6529L42.1101 77.6529C42.0936 77.6529 42.0695 77.6503 42.038 77.645C41.9726 77.6341 41.9135 77.6155 41.8608 77.5891C41.7112 77.5143 41.6364 77.3777 41.6364 77.1792C41.6364 76.9807 41.7112 76.8441 41.8608 76.7693C41.9135 76.7429 41.9726 76.7243 42.038 76.7134C42.0695 76.7081 42.0936 76.7055 42.1101 76.7055L42.1101 76.7055L42.5838 76.7055L42.5838 76.9424L43.5311 76.4687L43.0575 76.2318L42.5838 75.995L42.5838 76.2318L42.1101 76.2318L42.1101 76.2318C42.0674 76.2318 42.0174 76.2366 41.9601 76.2462C41.8479 76.2649 41.7442 76.298 41.6489 76.3457C41.5078 76.4162 41.396 76.5134 41.3135 76.6371C41.213 76.7879 41.1627 76.9686 41.1627 77.1792C41.1627 77.3898 41.213 77.5706 41.3135 77.7214C41.396 77.8451 41.5078 77.9422 41.6489 78.0127C41.7442 78.0604 41.8479 78.0935 41.9601 78.1123C42.0174 78.1218 42.0674 78.1266 42.1101 78.1266L42.1101 78.1266Z';
const metroVerticalClassicPillRightGlyphTransferPath =
  'M85.6732 76.2318L83.3048 76.2318L83.3048 76.7055L85.6732 76.7055C85.6898 76.7055 85.7138 76.7081 85.7453 76.7134C85.8107 76.7243 85.8698 76.7429 85.9226 76.7693C86.0721 76.8441 86.1469 76.9807 86.1469 77.1792C86.1469 77.3776 86.0721 77.5143 85.9226 77.5891C85.8698 77.6154 85.8107 77.6341 85.7453 77.645C85.7138 77.6502 85.6898 77.6529 85.6732 77.6529L85.1996 77.6529L85.1996 77.416L84.2522 77.8897L85.1996 78.3634L85.1996 78.1265L85.6732 78.1265C85.7159 78.1265 85.7659 78.1218 85.8232 78.1122C85.9354 78.0935 86.0392 78.0603 86.1344 78.0127C86.2755 77.9422 86.3873 77.845 86.4698 77.7213C86.5703 77.5705 86.6206 77.3898 86.6206 77.1792C86.6206 76.9685 86.5703 76.7878 86.4698 76.637C86.3873 76.5133 86.2755 76.4162 86.1344 76.3456C86.0392 76.298 85.9354 76.2648 85.8232 76.2461C85.7659 76.2366 85.7159 76.2318 85.6732 76.2318L85.6732 76.2318Z';
const metroVerticalClassicPillRightGlyphMainPath =
  'M81.4101 78.1266L83.7786 78.1266L83.7786 77.6529L81.4101 77.6529C81.3936 77.6529 81.3696 77.6503 81.3381 77.645C81.2727 77.6341 81.2136 77.6155 81.1608 77.5891C81.0112 77.5143 80.9365 77.3777 80.9365 77.1792C80.9365 76.9807 81.0112 76.8441 81.1608 76.7693C81.2136 76.7429 81.2727 76.7243 81.3381 76.7134C81.3696 76.7081 81.3936 76.7055 81.4101 76.7055L81.4101 76.7055L81.8838 76.7055L81.8838 76.9424L82.8312 76.4687L82.3575 76.2318L81.8838 75.995L81.8838 76.2318L81.4101 76.2318L81.4101 76.2318C81.3675 76.2318 81.3175 76.2366 81.2602 76.2462C81.1479 76.2649 81.0442 76.298 80.949 76.3457C80.8078 76.4162 80.696 76.5134 80.6136 76.6371C80.513 76.7879 80.4628 76.9686 80.4628 77.1792C80.4628 77.3898 80.513 77.5706 80.6136 77.7214C80.696 77.8451 80.8078 77.9422 80.949 78.0127C81.0442 78.0604 81.1479 78.0935 81.2602 78.1123C81.3175 78.1218 81.3675 78.1266 81.4101 78.1266L81.4101 78.1266Z';
const metroVerticalClassicStemLeftPath =
  'M45.5417 75.6739L51.2517 75.6739L53.5417 77.1739L51.2517 78.6739L45.5417 78.6739L45.5417 75.6739Z';
const metroVerticalClassicStemRightPath =
  'M82.4585 75.6739L76.7485 75.6739L74.4585 77.1739L76.7485 78.6739L82.4585 78.6739L82.4585 75.6739Z';
const metroVerticalClassicCurrentUpPath =
  'M44.2917 90.1565L45.7857 91.6505L45.7917 92.2145L44.5257 90.9065L44.5257 93.7445L44.1057 93.7445L44.1057 90.9065L42.7917 92.2145L42.7917 91.6565L44.2917 90.1565Z';
const metroVerticalClassicCurrentDownPath =
  'M83.6917 93.7465L85.1857 92.2525L85.1917 91.6885L83.9257 92.9965L83.9256 90.1585L83.5056 90.1585L83.5057 92.9965L82.1917 91.6885L82.1917 92.2465L83.6917 93.7465Z';
const metroVerticalClassicPillLeftCenterX = 44.2417;
const metroVerticalClassicPillRightCenterX = 83.5417;
const metroVerticalClassicPillCenterY = 77.1792;
const metroVerticalClassicStemCenterY = 77.1739;
const metroVerticalClassicCurrentUpCenterX = 44.2917;
const metroVerticalClassicCurrentDownCenterX = 83.6917;
const metroVerticalClassicCurrentCenterY = 92.056;

/**
 * 地铁竖版线路图的站点文字与徽标比例。
 */
const metroVerticalStationNameFontSize = 5.2;
const metroVerticalStationPinyinFontSize = 2.6;
const metroVerticalNameBaselineOffset = 0.5;
const metroVerticalPinyinBaselineOffset = 3.55;
const metroVerticalBothTrackXs = [44.3, 83.7] as const;
const metroVerticalTransferBadgeScale = 0.62;

type MetroVerticalDirection = 'first' | 'last';
type MetroVerticalTrackPosition = 'left' | 'right' | 'both';

const metroVerticalHarmonyFontFamily =
  "'HarmonyOS Sans SC', 'Source Han Sans SC', Arial, Helvetica, sans-serif";

/** 从线路名中提取编号；提取不到时返回空串，页头不显示圆圈。 */
function extractMetroVerticalLineNumber(value: string): string {
  return value.match(/[0-9]+/u)?.[0] ?? '';
}

/**
 * 地铁竖版线路图渲染器。
 * 设计稿为 128 × 320：页头显示开往方向、线路编号与方向箭头；
 * 站点自上而下等距排列，轨道位于开门方向一侧，当前站用线路色圆角框高亮。
 */
function renderMetroLineMapVertical(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string>,
  style: 'modern' | 'classic',
): string {
  const stations = value
    .split(/\r?\n|\s*\/\s*/u)
    .map((station) => station.replace(/[\s\u3000]+/gu, '').trim())
    .filter(Boolean);
  if (!stations.length) {
    return '';
  }
  const canvasWidth = Math.max(
    Number(values['canvas.logicalWidthPx']) || config.layoutWidth || metroVerticalReferenceWidth,
    64,
  );
  const canvasHeight = Math.max(
    Number(values['canvas.logicalHeightPx']) || config.layoutHeight || 320,
    96,
  );
  const widthScale = canvasWidth / metroVerticalReferenceWidth;
  const rawAccent = config.colorFieldKey ? (values[config.colorFieldKey] ?? '') : '';
  const accentColor = /^#[0-9A-Fa-f]{6}$/u.test(rawAccent) ? rawAccent : '#F29DB4';
  const rawCurrentIndex = config.currentIndexFieldKey
    ? Number.parseInt(values[config.currentIndexFieldKey] ?? '', 10)
    : 0;
  const currentIndex = Math.min(
    Math.max(Number.isFinite(rawCurrentIndex) ? rawCurrentIndex : 0, 0),
    stations.length - 1,
  );
  const trackPosition: MetroVerticalTrackPosition =
    values.trackPosition === 'both' ||
    values.trackPosition === 'right' ||
    values.trackPosition === 'left'
      ? values.trackPosition
      : values.doorDirection === 'right'
        ? 'right'
        : 'left';
  const primaryDirection: MetroVerticalDirection =
    values.travelDirection === 'first' ? 'first' : 'last';
  let secondaryDirection: MetroVerticalDirection =
    values.travelDirectionSecondary === 'first' || values.travelDirectionSecondary === 'last'
      ? values.travelDirectionSecondary
      : primaryDirection === 'first'
        ? 'last'
        : 'first';
  if (secondaryDirection === primaryDirection) {
    secondaryDirection = primaryDirection === 'first' ? 'last' : 'first';
  }
  const isBoth = trackPosition === 'both';
  const isClassicBoth = style === 'classic' && isBoth;
  // 两侧轨道时，页头左侧方向对应的终点站在上方，右侧方向对应下方。
  const displayStations = primaryDirection === 'first' ? stations : [...stations].reverse();
  const displayCurrentIndex =
    primaryDirection === 'first' ? currentIndex : stations.length - 1 - currentIndex;
  const transfersByStation = parseMetroLineMapTransfers(values.transferLines ?? '');
  const lineLabel = (values.lineLabel ?? '').replace(/(?:号线|线)$/u, '').trim();
  const lineNumber = extractMetroVerticalLineNumber(lineLabel);

  // 旧版两侧版式带标题栏和方向栏，首站从方向栏下方开始。
  const headerHeight = (isClassicBoth ? 50 : metroVerticalHeaderHeight) * widthScale;
  const margin = 12 * widthScale;
  const firstY = headerHeight + margin;
  const lastY = Math.max(canvasHeight - margin, firstY);
  const spacing =
    displayStations.length > 1 ? (lastY - firstY) / (displayStations.length - 1) : 0;
  const rowScale = Math.min(1, Math.max(spacing / (12 * widthScale), 0.5));
  const layoutScale = widthScale * rowScale;
  const classicStationScale = isClassicBoth ? 0.77 : 1;
  const currentY = firstY + spacing * displayCurrentIndex;
  const markerRadius = isClassicBoth
    ? Math.min(2.5 * widthScale, Math.max(spacing * 0.38, 0.8))
    : Math.min(2.25 * widthScale, Math.max(spacing * 0.38, 0.8));
  const singleTrackX = (trackPosition === 'left' ? 57.3 : 70.7) * widthScale;
  const leftTrackX = metroVerticalBothTrackXs[0] * widthScale;
  const rightTrackX = metroVerticalBothTrackXs[1] * widthScale;
  const yForIndex = (index: number) =>
    displayStations.length > 1 ? firstY + spacing * index : (firstY + lastY) / 2;

  const parts: string[] = [
    `<rect width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" fill="#FFFFFF"/>`,
  ];
  parts.push(
    isClassicBoth
      ? `<rect x="0" y="0" width="${formatNumber(canvasWidth)}" height="${formatNumber(metroVerticalHeaderAccentHeight * widthScale)}" fill="${accentColor}"/><rect x="0" y="${formatNumber(3 * widthScale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(29 * widthScale)}" fill="${metroVerticalHeaderBackground}"/>`
      : style === 'classic'
        ? `<rect x="0" y="0" width="${formatNumber(canvasWidth)}" height="${formatNumber(metroVerticalHeaderAccentHeight * widthScale)}" fill="${accentColor}"/>`
        : `<rect x="0" y="0" width="${formatNumber(canvasWidth)}" height="${formatNumber(metroVerticalHeaderAccentHeight * widthScale)}" fill="${accentColor}"/><rect x="0" y="${formatNumber(metroVerticalHeaderAccentHeight * widthScale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber((metroVerticalHeaderHeight - metroVerticalHeaderAccentHeight) * widthScale)}" fill="${metroVerticalHeaderBackground}"/>`,
  );
  parts.push(
    isClassicBoth
      ? renderMetroVerticalClassicBothHeader({
          canvasWidth,
          widthScale,
          accentColor,
          primaryName: displayStations[0]!,
          secondaryName: displayStations[displayStations.length - 1]!,
          lineLabel: lineNumber,
        })
      : renderMetroVerticalLineMapHeader({
          canvasWidth,
          widthScale,
          accentColor,
          style,
          trackPosition,
          primaryName: displayStations[0]!,
          secondaryName: displayStations[displayStations.length - 1]!,
          lineLabel: lineNumber,
        }),
  );

  const trackWidth = 4 * widthScale;
  const trackY = firstY;
  const trackHeight = Math.max(lastY - firstY, 0);
  if (isBoth) {
    parts.push(
      `<rect x="${formatNumber(leftTrackX - trackWidth / 2)}" y="${formatNumber(trackY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(trackHeight)}" fill="${metroVerticalPassedColor}"/>`,
      `<rect x="${formatNumber(rightTrackX - trackWidth / 2)}" y="${formatNumber(trackY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(trackHeight)}" fill="${metroVerticalPassedColor}"/>`,
    );
    if (currentY > firstY + 0.01) {
      parts.push(
        `<rect x="${formatNumber(leftTrackX - trackWidth / 2)}" y="${formatNumber(trackY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(currentY - firstY)}" fill="${accentColor}"/>`,
      );
    }
    if (lastY > currentY + 0.01) {
      parts.push(
        `<rect x="${formatNumber(rightTrackX - trackWidth / 2)}" y="${formatNumber(currentY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(lastY - currentY)}" fill="${accentColor}"/>`,
      );
    }
  } else {
    parts.push(
      `<rect x="${formatNumber(singleTrackX - trackWidth / 2)}" y="${formatNumber(trackY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(trackHeight)}" fill="${metroVerticalPassedColor}"/>`,
    );
    if (currentY > firstY + 0.01) {
      parts.push(
        `<rect x="${formatNumber(singleTrackX - trackWidth / 2)}" y="${formatNumber(trackY)}" width="${formatNumber(trackWidth)}" height="${formatNumber(currentY - firstY)}" fill="${accentColor}"/>`,
      );
    }
  }

  const labelParts: string[] = [];
  const transferParts: string[] = [];
  const classicTransferParts: string[] = [];
  const markerParts: string[] = [];
  const currentParts: string[] = [];

  displayStations.forEach((station, displayIndex) => {
    const y = yForIndex(displayIndex);
    const pinyin = toUppercasePinyin(station);
    const transferList = transfersByStation.get(station) ?? [];
    const isCurrent = displayIndex === displayCurrentIndex;

    if (isBoth) {
      const leftPassed = displayIndex > displayCurrentIndex;
      const rightPassed = displayIndex < displayCurrentIndex;
      const stationLayoutScale = layoutScale * classicStationScale;
      if (isCurrent) {
        if (isClassicBoth) {
          // 旧版不画实心框：本站站名用线路色，中间标注「本站」。
          currentParts.push(
            renderMetroVerticalLabelPair({
              station,
              pinyin,
              x: 37.5 * widthScale,
              y,
              anchor: 'end',
              color: accentColor,
              layoutScale: stationLayoutScale,
              maxWidth: 30 * widthScale,
            }),
            renderMetroVerticalLabelPair({
              station,
              pinyin,
              x: 90.5 * widthScale,
              y,
              anchor: 'start',
              color: accentColor,
              layoutScale: stationLayoutScale,
              maxWidth: 30 * widthScale,
            }),
            renderMetroVerticalClassicThisStation({
              centerX: (leftTrackX + rightTrackX) / 2,
              y,
              widthScale,
            }),
          );
        } else {
          currentParts.push(
            renderMetroVerticalCurrentLabel({
              station,
              pinyin,
              x: 37.5 * widthScale,
              y,
              anchor: 'end',
              accentColor,
              widthScale,
              layoutScale,
              maxWidth: 28 * widthScale,
              padding: 1.5,
              arrowGap: 3,
              arrowDirection: 'up',
            }),
            renderMetroVerticalCurrentLabel({
              station,
              pinyin,
              x: 90.5 * widthScale,
              y,
              anchor: 'start',
              accentColor,
              widthScale,
              layoutScale,
              maxWidth: 28 * widthScale,
              padding: 1.5,
              arrowGap: 3,
              arrowDirection: 'down',
            }),
          );
        }
      } else {
        labelParts.push(
          renderMetroVerticalLabelPair({
            station,
            pinyin,
            x: 37.5 * widthScale,
            y,
            anchor: 'end',
            color: leftPassed ? metroVerticalPassedColor : '#000000',
            layoutScale: isClassicBoth ? stationLayoutScale : layoutScale,
            maxWidth: (isClassicBoth ? 30 : 28) * widthScale,
          }),
          renderMetroVerticalLabelPair({
            station,
            pinyin,
            x: 90.5 * widthScale,
            y,
            anchor: 'start',
            color: rightPassed ? metroVerticalPassedColor : '#000000',
            layoutScale: isClassicBoth ? stationLayoutScale : layoutScale,
            maxWidth: (isClassicBoth ? 30 : 28) * widthScale,
          }),
        );
      }
      if (transferList.length) {
        if (isClassicBoth) {
          classicTransferParts.push(
            renderMetroVerticalClassicBothTransfer({
              y,
              transferList,
              leftPassed,
              rightPassed,
              leftTrackX,
              rightTrackX,
              mainColor: accentColor,
              widthScale,
            }),
          );
        } else {
          transferParts.push(
            renderMetroVerticalBothTransfer({
              y,
              transferList,
              mainColor: accentColor,
              leftPassed,
              rightPassed,
              leftTrackX,
              rightTrackX,
              widthScale,
              markerRadius,
            }),
          );
        }
      }
      markerParts.push(
        renderMetroVerticalMarker({
          x: leftTrackX,
          y,
          radius: markerRadius,
          inkColor: isClassicBoth
            ? leftPassed
              ? metroVerticalPassedColor
              : accentColor
            : leftPassed
              ? metroVerticalPassedColor
              : '#000000',
          widthScale,
          style,
          innerRadius: isClassicBoth ? 1 * widthScale : undefined,
          currentArrow: isClassicBoth && isCurrent ? 'up' : undefined,
          terminalFill:
            style === 'classic' && displayIndex === 0
              ? leftPassed
                ? metroVerticalPassedColor
                : accentColor
              : style === 'classic' && displayIndex === displayStations.length - 1
                ? metroVerticalPassedColor
                : undefined,
        }),
        renderMetroVerticalMarker({
          x: rightTrackX,
          y,
          radius: markerRadius,
          inkColor: isClassicBoth
            ? rightPassed
              ? metroVerticalPassedColor
              : accentColor
            : rightPassed
              ? metroVerticalPassedColor
              : '#000000',
          widthScale,
          style,
          innerRadius: isClassicBoth ? 1 * widthScale : undefined,
          currentArrow: isClassicBoth && isCurrent ? 'down' : undefined,
          terminalFill:
            style === 'classic' && displayIndex === displayStations.length - 1
              ? rightPassed
                ? metroVerticalPassedColor
                : accentColor
              : style === 'classic' && displayIndex === 0
                ? metroVerticalPassedColor
                : undefined,
        }),
      );
      return;
    }

    const passed = displayIndex > displayCurrentIndex;
    const labelAnchor: 'start' | 'end' = trackPosition === 'left' ? 'start' : 'end';
    const labelX = (trackPosition === 'left' ? 66 : 62) * widthScale;
    const maxLabelWidth = Math.max(
      (trackPosition === 'left' ? canvasWidth - labelX : labelX) - 2 * widthScale,
      8,
    );
    if (isCurrent) {
      currentParts.push(
        renderMetroVerticalCurrentLabel({
          station,
          pinyin,
          x: labelX,
          y,
          anchor: labelAnchor,
          accentColor,
          widthScale,
          layoutScale,
          maxWidth: maxLabelWidth,
        }),
      );
    } else {
      labelParts.push(
        renderMetroVerticalLabelPair({
          station,
          pinyin,
          x: labelX,
          y,
          anchor: labelAnchor,
          color: passed ? metroVerticalPassedColor : '#000000',
          layoutScale,
          maxWidth: maxLabelWidth,
        }),
      );
    }
    if (transferList.length) {
      transferParts.push(
        style === 'classic'
          ? renderMetroVerticalClassicTransfer({
              y,
              trackSide: trackPosition === 'left' ? 'left' : 'right',
              transferList,
              inkColor: passed ? metroVerticalPassedColor : '#000000',
              widthScale,
            })
          : renderMetroVerticalSingleTransfer({
              y,
              trackSide: trackPosition === 'left' ? 'left' : 'right',
              transferList,
              mainColor: accentColor,
              passed,
              widthScale,
              trackX: singleTrackX,
            }),
      );
    }
    markerParts.push(
      renderMetroVerticalMarker({
        x: singleTrackX,
        y,
        radius: markerRadius,
        inkColor: passed ? metroVerticalPassedColor : '#000000',
        widthScale,
        style,
        terminalFill:
          style === 'classic' && (displayIndex === 0 || displayIndex === displayStations.length - 1)
            ? displayIndex === 0 && !passed
              ? accentColor
              : metroVerticalPassedColor
            : undefined,
      }),
    );
  });

  // 旧版两侧换乘胶囊压在站点圆点上，因此先画圆点再画换乘；新版保持圆点最上层。
  const orderedParts = isClassicBoth
    ? [...parts, ...labelParts, ...markerParts, ...classicTransferParts, ...currentParts]
    : [...parts, ...labelParts, ...transferParts, ...markerParts, ...currentParts];
  return `<g data-metro-line-map-vertical="${style}">${orderedParts.join('')}</g>`;
}

function renderMetroVerticalLabelPair(input: {
  station: string;
  pinyin: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  color: string;
  layoutScale: number;
  maxWidth: number;
}): string {
  const { station, pinyin, x, y, anchor, color, layoutScale, maxWidth } = input;
  const name = renderMetroSignText({
    value: station,
    x,
    y: y + metroVerticalNameBaselineOffset * layoutScale,
    fontSize: metroVerticalStationNameFontSize * layoutScale,
    color,
    weight: 400,
    anchor,
    maxWidth,
  });
  const pinyinText = pinyin
    ? renderMetroSignText({
        value: pinyin,
        x,
        y: y + metroVerticalPinyinBaselineOffset * layoutScale,
        fontSize: metroVerticalStationPinyinFontSize * layoutScale,
        color,
        weight: 400,
        anchor,
        maxWidth,
      })
    : '';
  return name + pinyinText;
}

function renderMetroVerticalCurrentLabel(input: {
  station: string;
  pinyin: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  accentColor: string;
  widthScale: number;
  layoutScale: number;
  maxWidth: number;
  padding?: number;
  arrowGap?: number;
  arrowDirection?: 'up' | 'down';
}): string {
  const {
    station,
    pinyin,
    x,
    y,
    anchor,
    accentColor,
    widthScale,
    layoutScale,
    maxWidth,
    padding = 2,
    arrowGap = 6,
    arrowDirection = 'up',
  } = input;
  const nameFont = metroVerticalStationNameFontSize * layoutScale;
  const pinyinFont = metroVerticalStationPinyinFontSize * layoutScale;
  const nameWidth = estimateMetroLineMapTextWidth(station, nameFont);
  const pinyinWidth = pinyin ? estimateMetroLineMapTextWidth(pinyin, pinyinFont) : 0;
  const paddingPx = padding * layoutScale;
  const textWidth = Math.min(
    Math.max(nameWidth, pinyinWidth, 1),
    Math.max(maxWidth - paddingPx * 2, 1),
  );
  const boxWidth = textWidth + paddingPx * 2;
  const boxHeight = 9.8 * layoutScale;
  const boxTop = y - boxHeight / 2;
  const boxX = anchor === 'start' ? x - paddingPx : x + paddingPx - boxWidth;
  const arrowX =
    anchor === 'start'
      ? boxX + boxWidth + arrowGap * widthScale
      : boxX - arrowGap * widthScale - 4 * widthScale;
  return [
    `<rect x="${formatNumber(boxX)}" y="${formatNumber(boxTop)}" width="${formatNumber(boxWidth)}" height="${formatNumber(boxHeight)}" rx="${formatNumber(1 * layoutScale)}" fill="${accentColor}"/>`,
    renderMetroSignText({
      value: station,
      x,
      y: y + metroVerticalNameBaselineOffset * layoutScale,
      fontSize: nameFont,
      color: '#FFFFFF',
      weight: 400,
      anchor,
      maxWidth: textWidth,
    }),
    pinyin
      ? renderMetroSignText({
          value: pinyin,
          x,
          y: y + metroVerticalPinyinBaselineOffset * layoutScale,
          fontSize: pinyinFont,
          color: '#FFFFFF',
          weight: 400,
          anchor,
          maxWidth: textWidth,
        })
      : '',
    `<g transform="translate(${formatNumber(arrowX)} ${formatNumber(
      arrowDirection === 'down' ? y + 2.392 * widthScale : y - 2.392 * widthScale,
    )}) scale(${formatNumber(widthScale)} ${formatNumber(
      arrowDirection === 'down' ? -widthScale : widthScale,
    )})"><path d="${metroVerticalCurrentArrowPath}" fill="#000000" stroke="#000000" stroke-width="${formatNumber(0.6 * widthScale)}" stroke-linejoin="round"/></g>`,
  ].join('');
}

function renderMetroVerticalMarker(input: {
  x: number;
  y: number;
  radius: number;
  inkColor: string;
  widthScale: number;
  style: 'modern' | 'classic';
  terminalFill?: string;
  innerRadius?: number;
  currentArrow?: 'up' | 'down';
}): string {
  const { x, y, radius, inkColor, widthScale, terminalFill, innerRadius, currentArrow } = input;
  const parts = [
    `<circle cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="${formatNumber(radius)}" fill="#FFFFFF" stroke="${inkColor}" stroke-width="${formatNumber(0.6 * widthScale)}"/>`,
  ];
  if (terminalFill !== undefined) {
    parts.push(
      `<circle cx="${formatNumber(x)}" cy="${formatNumber(y)}" r="${formatNumber(
        innerRadius ?? Math.max(radius - 1 * widthScale, 0.4),
      )}" fill="${terminalFill}"/>`,
    );
  }
  if (currentArrow) {
    const isDown = currentArrow === 'down';
    const path = isDown
      ? metroVerticalClassicCurrentDownPath
      : metroVerticalClassicCurrentUpPath;
    const referenceCenterX = isDown
      ? metroVerticalClassicCurrentDownCenterX
      : metroVerticalClassicCurrentUpCenterX;
    const transform = `translate(${formatNumber(x)} ${formatNumber(y)}) scale(${formatNumber(
      widthScale,
    )}) translate(${formatNumber(-referenceCenterX)} ${formatNumber(
      -metroVerticalClassicCurrentCenterY,
    )})`;
    parts.push(
      `<g transform="${transform}"><path d="${path}" fill="${inkColor}" stroke="${inkColor}" stroke-width="0.1"/></g>`,
    );
  }
  return parts.join('');
}

/** 旧版两侧版式的标题栏与方向栏。 */
function renderMetroVerticalClassicBothHeader(input: {
  canvasWidth: number;
  widthScale: number;
  accentColor: string;
  primaryName: string;
  secondaryName: string;
  lineLabel: string;
}): string {
  const { canvasWidth, widthScale, accentColor, primaryName, secondaryName, lineLabel } = input;
  const parts: string[] = [];
  const title = lineLabel ? `地铁${lineLabel}号线行车示意图` : '地铁行车示意图';
  parts.push(
    renderMetroSignText({
      value: title,
      x: 6.5 * widthScale,
      y: 17.5 * widthScale,
      fontSize: 8 * widthScale,
      color: '#FFFFFF',
      weight: 400,
      anchor: 'start',
      maxWidth: 78 * widthScale,
    }),
    renderMetroSignText({
      value: `Direction For Subway Line${lineLabel ? ` ${lineLabel}` : ''}`,
      x: 6.5 * widthScale,
      y: 24.5 * widthScale,
      fontSize: 5 * widthScale,
      color: '#FFFFFF',
      weight: 400,
      anchor: 'start',
      maxWidth: 78 * widthScale,
    }),
  );
  if (lineLabel) {
    const numberFontSize = (Array.from(lineLabel).length > 2 ? 10 : Array.from(lineLabel).length > 1 ? 11.5 : 14) * widthScale;
    parts.push(
      `<g transform="translate(${formatNumber(87 * widthScale)} ${formatNumber(3 * widthScale)}) scale(${formatNumber(widthScale)})"><path d="${metroVerticalClassicHeaderTabPath}" fill="${accentColor}"/></g>`,
      `<g transform="translate(${formatNumber(97 * widthScale)} ${formatNumber(7.5 * widthScale)}) scale(${formatNumber(widthScale)})"><path d="${metroVerticalClassicHeaderTabCirclePath}" fill="none" stroke="#FFFFFF" stroke-width="1.2"/></g>`,
      `<text x="${formatNumber(105 * widthScale)}" y="${formatNumber(15.5 * widthScale + numberFontSize * 0.36)}" fill="#FFFFFF" font-family="${metroVerticalHarmonyFontFamily}" font-size="${formatNumber(numberFontSize)}" font-weight="400" text-anchor="middle">${escapeXml(lineLabel)}</text>`,
    );
  }
  parts.push(
    renderMetroVerticalClassicDirectionArrow(widthScale, false),
    renderMetroVerticalClassicDirectionArrow(widthScale, true),
    renderMetroSignText({
      value: `${primaryName}方向`,
      x: 14 * widthScale,
      y: 44 * widthScale,
      fontSize: 6 * widthScale,
      color: '#000000',
      weight: 700,
      anchor: 'start',
      maxWidth: 48 * widthScale,
    }),
    renderMetroSignText({
      value: `To ${toUppercasePinyin(primaryName)}`,
      x: 14 * widthScale,
      y: 48.5 * widthScale,
      fontSize: 3 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'start',
      maxWidth: 48 * widthScale,
    }),
    renderMetroSignText({
      value: `${secondaryName}方向`,
      x: canvasWidth - 15 * widthScale,
      y: 44 * widthScale,
      fontSize: 6 * widthScale,
      color: '#000000',
      weight: 700,
      anchor: 'end',
      maxWidth: 48 * widthScale,
    }),
    renderMetroSignText({
      value: `To ${toUppercasePinyin(secondaryName)}`,
      x: canvasWidth - 15 * widthScale,
      y: 48.5 * widthScale,
      fontSize: 3 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'end',
      maxWidth: 48 * widthScale,
    }),
  );
  return parts.join('');
}

/** 旧版方向栏的黑色块状箭头，直接复用参考 SVG 的路径。 */
function renderMetroVerticalClassicDirectionArrow(
  widthScale: number,
  mirrored: boolean,
): string {
  const path = mirrored
    ? metroVerticalClassicDirectionRightPath
    : metroVerticalClassicDirectionLeftPath;
  return `<g transform="scale(${formatNumber(widthScale)})"><path d="${path}" fill="#000000" fill-rule="evenodd"/></g>`;
}

function renderMetroVerticalLineMapHeader(input: {
  canvasWidth: number;
  widthScale: number;
  accentColor: string;
  style: 'modern' | 'classic';
  trackPosition: MetroVerticalTrackPosition;
  primaryName: string;
  secondaryName: string;
  lineLabel: string;
}): string {
  const {
    canvasWidth,
    widthScale,
    accentColor,
    style,
    trackPosition,
    primaryName,
    secondaryName,
    lineLabel,
  } = input;
  const arrowColor = style === 'classic' ? accentColor : '#FFFFFF';
  const textColor = style === 'classic' ? '#000000' : '#FFFFFF';
  const englishColor = style === 'classic' ? '#666666' : '#FFFFFF';
  const parts: string[] = [];

  if (trackPosition === 'both') {
    // 两侧轨道：左右方向文案分别贴住两端箭头，中间留弹性空格。
    const arrowWidth = 16 * widthScale;
    const leftArrow = 2 * widthScale;
    const rightArrow = canvasWidth - 2 * widthScale - arrowWidth;
    parts.push(
      renderMetroVerticalHeaderArrow(leftArrow, widthScale, arrowColor, false),
      renderMetroVerticalHeaderArrow(rightArrow, widthScale, arrowColor, true),
    );
    const textMaxWidth = 42 * widthScale;
    const leftX = 20 * widthScale;
    const rightX = canvasWidth - 20 * widthScale;
    parts.push(
      renderMetroSignText({
        value: `${primaryName}方向`,
        x: leftX,
        y: 17.6 * widthScale,
        fontSize: 8 * widthScale,
        color: textColor,
        weight: 400,
        anchor: 'start',
        maxWidth: textMaxWidth,
      }),
      renderMetroSignText({
        value: `To ${toUppercasePinyin(primaryName)}`,
        x: leftX,
        y: 23.8 * widthScale,
        fontSize: 4 * widthScale,
        color: englishColor,
        weight: 400,
        anchor: 'start',
        maxWidth: textMaxWidth,
      }),
      renderMetroSignText({
        value: `${secondaryName}方向`,
        x: rightX,
        y: 17.6 * widthScale,
        fontSize: 8 * widthScale,
        color: textColor,
        weight: 400,
        anchor: 'end',
        maxWidth: textMaxWidth,
      }),
      renderMetroSignText({
        value: `To ${toUppercasePinyin(secondaryName)}`,
        x: rightX,
        y: 23.8 * widthScale,
        fontSize: 4 * widthScale,
        color: englishColor,
        weight: 400,
        anchor: 'end',
        maxWidth: textMaxWidth,
      }),
    );
    return parts.join('');
  }

  const title = `${primaryName}方向`;
  const pinyin = toUppercasePinyin(primaryName);
  const titleFontSize = 10 * widthScale;
  const englishFontSize = 5 * widthScale;
  const textMaxWidth = 78 * widthScale;
  const titleWidth = Math.min(
    estimateMetroLineMapTextWidth(title, titleFontSize),
    textMaxWidth,
  );
  const englishWidth = pinyin
    ? Math.min(
        estimateMetroLineMapTextWidth(`To ${pinyin}`, englishFontSize),
        textMaxWidth,
      )
    : 0;
  const textWidth = Math.max(titleWidth, englishWidth, 1);
  const hasBadge = Boolean(lineLabel);
  const gap = 4 * widthScale;
  const arrowWidth = 16 * widthScale;
  const badgeSize = 16 * widthScale;
  const groupWidth =
    arrowWidth + gap + (hasBadge ? badgeSize + gap : 0) + textWidth;
  const start = Math.max((canvasWidth - groupWidth) / 2, 2 * widthScale);
  const isLeft = trackPosition === 'left';
  const arrowLeft = isLeft ? start : canvasWidth - start - arrowWidth;
  const textX = isLeft
    ? start + arrowWidth + gap + (hasBadge ? badgeSize + gap : 0)
    : start + textWidth;
  const badgeCenterX = isLeft
    ? start + arrowWidth + gap + badgeSize / 2
    : start + textWidth + gap + badgeSize / 2;
  parts.push(renderMetroVerticalHeaderArrow(arrowLeft, widthScale, arrowColor, !isLeft));
  if (hasBadge) {
    const digits = Array.from(lineLabel).length;
    parts.push(
      `<circle cx="${formatNumber(badgeCenterX)}" cy="${formatNumber(18 * widthScale)}" r="${formatNumber(8 * widthScale)}" fill="${accentColor}"/>`,
      `<text x="${formatNumber(badgeCenterX)}" y="${formatNumber(22.7 * widthScale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber((digits > 2 ? 10 : digits > 1 ? 11.5 : 14) * widthScale)}" font-weight="400" text-anchor="middle">${escapeXml(lineLabel)}</text>`,
    );
  }
  parts.push(
    renderMetroSignText({
      value: title,
      x: textX,
      y: 18.8 * widthScale,
      fontSize: titleFontSize,
      color: textColor,
      weight: 400,
      anchor: isLeft ? 'start' : 'end',
      maxWidth: textWidth,
    }),
  );
  if (pinyin) {
    parts.push(
      renderMetroSignText({
        value: `To ${pinyin}`,
        x: textX,
        y: 25.5 * widthScale,
        fontSize: englishFontSize,
        color: englishColor,
        weight: 400,
        anchor: isLeft ? 'start' : 'end',
        maxWidth: textWidth,
      }),
    );
  }
  return parts.join('');
}

function renderMetroVerticalHeaderArrow(
  left: number,
  widthScale: number,
  color: string,
  mirrored: boolean,
): string {
  const transform = mirrored
    ? `translate(${formatNumber(left + 16 * widthScale)} 0) scale(${formatNumber(-widthScale)} ${formatNumber(widthScale)}) translate(${formatNumber(-13.9382 * widthScale)} 0)`
    : `translate(${formatNumber(left - 13.9382 * widthScale)} 0) scale(${formatNumber(widthScale)})`;
  return `<g transform="${transform}"><path d="${metroVerticalHeaderArrowPath}" fill="${color}"/></g>`;
}

function renderMetroVerticalTransferIcon(input: {
  left: number;
  centerY: number;
  widthScale: number;
  mainColor: string;
  transferColor: string;
  glyphColor: string;
  mirrored: boolean;
}): string {
  const { left, centerY, widthScale, mainColor, transferColor, glyphColor, mirrored } = input;
  const transform = mirrored
    ? `translate(${formatNumber(left + 44.9983 * widthScale)} ${formatNumber(centerY - 188 * widthScale)}) scale(${formatNumber(-widthScale)} ${formatNumber(widthScale)})`
    : `translate(${formatNumber(left - 35.0833 * widthScale)} ${formatNumber(centerY - 188 * widthScale)}) scale(${formatNumber(widthScale)})`;
  return `<g transform="${transform}"><path d="${metroVerticalTransferTopPath}" fill="${mainColor}"/><path d="${metroVerticalTransferBottomPath}" fill="${transferColor}"/>${metroVerticalTransferGlyphPaths.map((path) => `<path d="${path}" fill="${glyphColor}"/>`).join('')}</g>`;
}

function renderMetroVerticalTransferBadge(input: {
  label: string;
  left: number;
  top: number;
  scale: number;
  color: string;
}): string {
  const { label, left, top, scale, color } = input;
  const width = getMetroLineMapBadgeWidth(label) * scale;
  const number = label.replace(/(?:号线|线)$/u, '').trim();
  const rect = `<rect x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(width)}" height="${formatNumber(11 * scale)}" rx="${formatNumber(1.5 * scale)}" fill="${color}"/>`;
  if (!isMetroLineMapNumericLine(label)) {
    const english = resolveMetroLineEnglishName(label);
    const chineseY = english ? 5.3 : 7.4;
    return `${rect}<text x="${formatNumber(left + width / 2)}" y="${formatNumber(top + chineseY * scale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(5.2 * scale)}" font-weight="400" text-anchor="middle">${escapeXml(label)}</text>${
      english
        ? `<text x="${formatNumber(left + width / 2)}" y="${formatNumber(top + 9.4 * scale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(2.8 * scale)}" font-weight="400" text-anchor="middle">${escapeXml(english)}</text>`
        : ''
    }`;
  }
  const digits = Array.from(number).length;
  const suffixX = digits > 1 ? 10.5 : 7;
  const lineX = digits > 1 ? 10 : 7.5;
  const letterSpacing = (digits > 1 ? -2 : -1) * scale;
  return [
    rect,
    `<text x="${formatNumber(left + 1 * scale)}" y="${formatNumber(top + 8.9668 * scale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(10 * scale)}" font-weight="400" letter-spacing="${formatNumber(letterSpacing)}">${escapeXml(number)}</text>`,
    `<text x="${formatNumber(left + suffixX * scale)}" y="${formatNumber(top + 5.8 * scale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(5 * scale)}" font-weight="400">号线</text>`,
    `<text x="${formatNumber(left + lineX * scale)}" y="${formatNumber(top + 8.7158 * scale)}" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(3 * scale)}" font-weight="400">Line ${escapeXml(number)}</text>`,
  ].join('');
}

/** 单侧轨道：换乘徽标与换乘图标位于轨道另一侧，连接线尖端朝向图标。 */
function renderMetroVerticalSingleTransfer(input: {
  y: number;
  trackSide: 'left' | 'right';
  transferList: MetroLineMapTransfer[];
  mainColor: string;
  passed: boolean;
  widthScale: number;
  trackX: number;
}): string {
  const { y, trackSide, transferList, mainColor, passed, widthScale, trackX } = input;
  const badgeScale = metroVerticalTransferBadgeScale * widthScale;
  const iconWidth = 9.915 * widthScale;
  const badgeGap = 1 * widthScale;
  const badgeStackGap = 0.5 * widthScale;
  const badgeSizes = transferList.map((transfer) => ({
    transfer,
    width: getMetroLineMapBadgeWidth(transfer.label) * badgeScale,
    height: 11 * badgeScale,
  }));
  const stackHeight =
    badgeSizes.length * (11 * badgeScale) + Math.max(badgeSizes.length - 1, 0) * badgeStackGap;
  const iconLeft =
    trackSide === 'left'
      ? trackX - 12.3 * widthScale - iconWidth
      : trackX + 12.3 * widthScale;
  const transferColor = passed ? metroVerticalPassedColor : (transferList[0]?.color ?? '#666666');
  const mainColorResolved = passed ? metroVerticalPassedColor : mainColor;
  const glyphColor = passed ? metroVerticalPassedColor : '#000000';
  const stemDirection = trackSide === 'left' ? -1 : 1;
  const stemInner = trackX + stemDirection * 1.3 * widthScale;
  const stemBody = trackX + stemDirection * 9.91 * widthScale;
  const stemTip = trackX + stemDirection * 11.3 * widthScale;
  const parts: string[] = [
    `<path d="M${formatNumber(stemInner)} ${formatNumber(y - 1.5 * widthScale)}L${formatNumber(stemBody)} ${formatNumber(y - 1.5 * widthScale)}L${formatNumber(stemTip)} ${formatNumber(y)}L${formatNumber(stemBody)} ${formatNumber(y + 1.5 * widthScale)}L${formatNumber(stemInner)} ${formatNumber(y + 1.5 * widthScale)}Z" fill="${transferColor}"/>`,
    renderMetroVerticalTransferIcon({
      left: iconLeft,
      centerY: y,
      widthScale,
      mainColor: mainColorResolved,
      transferColor,
      glyphColor,
      // 图标内部带「换乘」字形，左右两侧都保持正向，不能水平翻转。
      mirrored: false,
    }),
  ];
  let cursorTop = y - stackHeight / 2;
  for (const item of badgeSizes) {
    const left =
      trackSide === 'left'
        ? iconLeft - badgeGap - item.width
        : iconLeft + iconWidth + badgeGap;
    parts.push(
      renderMetroVerticalTransferBadge({
        label: item.transfer.label,
        left,
        top: cursorTop,
        scale: badgeScale,
        color: passed ? metroVerticalPassedColor : item.transfer.color,
      }),
    );
    cursorTop += item.height + badgeStackGap;
  }
  return parts.join('');
}

/** 两侧轨道：换乘线条横跨两条轨道，徽标与图标居中放在两轨之间。 */
function renderMetroVerticalBothTransfer(input: {
  y: number;
  transferList: MetroLineMapTransfer[];
  mainColor: string;
  leftPassed: boolean;
  rightPassed: boolean;
  leftTrackX: number;
  rightTrackX: number;
  widthScale: number;
  markerRadius: number;
}): string {
  const {
    y,
    transferList,
    mainColor,
    leftPassed,
    rightPassed,
    leftTrackX,
    rightTrackX,
    widthScale,
    markerRadius,
  } = input;
  const badgeScale = metroVerticalTransferBadgeScale * widthScale;
  const iconWidth = 9.915 * widthScale;
  const badgeGap = 1 * widthScale;
  const badgeStackGap = 0.5 * widthScale;
  const badgeSizes = transferList.map((transfer) => ({
    transfer,
    width: getMetroLineMapBadgeWidth(transfer.label) * badgeScale,
    height: 11 * badgeScale,
  }));
  const maxBadgeWidth = Math.max(...badgeSizes.map((item) => item.width));
  const clusterWidth = iconWidth + badgeGap + maxBadgeWidth;
  const clusterLeft = (leftTrackX + rightTrackX) / 2 - clusterWidth / 2;
  const badgeLeft = clusterLeft + iconWidth + badgeGap;
  const clusterRight = badgeLeft + maxBadgeWidth;
  const stackHeight =
    badgeSizes.length * (11 * badgeScale) + Math.max(badgeSizes.length - 1, 0) * badgeStackGap;
  const transferColor = transferList[0]?.color ?? '#666666';
  const parts: string[] = [
    // 换乘徽标与图标保留线路颜色；只有已过站那一侧的连接箭头变灰。
    renderMetroVerticalTransferStem({
      trackX: leftTrackX,
      clusterX: clusterLeft,
      y,
      color: leftPassed ? metroVerticalPassedColor : transferColor,
      widthScale,
      markerRadius,
    }),
    renderMetroVerticalTransferStem({
      trackX: rightTrackX,
      clusterX: clusterRight,
      y,
      color: rightPassed ? metroVerticalPassedColor : transferColor,
      widthScale,
      markerRadius,
    }),
    renderMetroVerticalTransferIcon({
      left: clusterLeft,
      centerY: y,
      widthScale,
      mainColor,
      transferColor,
      glyphColor: '#000000',
      mirrored: false,
    }),
  ];
  let cursorTop = y - stackHeight / 2;
  for (const item of badgeSizes) {
    parts.push(
      renderMetroVerticalTransferBadge({
        label: item.transfer.label,
        left: badgeLeft,
        top: cursorTop,
        scale: badgeScale,
        color: item.transfer.color,
      }),
    );
    cursorTop += item.height + badgeStackGap;
  }
  return parts.join('');
}

/** 两侧轨道换乘连接线：从站点圆点指向中间的换乘徽标，末端带箭头。 */
function renderMetroVerticalTransferStem(input: {
  trackX: number;
  clusterX: number;
  y: number;
  color: string;
  widthScale: number;
  markerRadius: number;
  startX?: number;
}): string {
  const { trackX, clusterX, y, color, widthScale, markerRadius, startX } = input;
  const direction = clusterX >= trackX ? 1 : -1;
  const start = startX ?? trackX + direction * markerRadius;
  const length = Math.abs(clusterX - start);
  if (length <= 0.05) {
    return '';
  }
  const barHeight = 3 * widthScale;
  // 指向中间的连接线保持等宽：箭柄与尖端同宽，只在末端收成尖角。
  const headLength = Math.min(barHeight / 2, length);
  const barEnd = clusterX - direction * headLength;
  const points: Array<[number, number]> = [
    [start, y - barHeight / 2],
    [barEnd, y - barHeight / 2],
    [clusterX, y],
    [barEnd, y + barHeight / 2],
    [start, y + barHeight / 2],
  ];
  return `<path d="M${points
    .map((point) => `${formatNumber(point[0])} ${formatNumber(point[1])}`)
    .join('L')}Z" fill="${color}"/>`;
}

/** 旧版两侧轨道：换乘胶囊压在本侧圆点上，向中间引出等宽箭头，中间写「换乘X号线」。 */
function renderMetroVerticalClassicBothTransfer(input: {
  y: number;
  transferList: MetroLineMapTransfer[];
  leftPassed: boolean;
  rightPassed: boolean;
  leftTrackX: number;
  rightTrackX: number;
  mainColor: string;
  widthScale: number;
}): string {
  const {
    y,
    transferList,
    leftPassed,
    rightPassed,
    leftTrackX,
    rightTrackX,
    mainColor,
    widthScale,
  } = input;
  const transferColor = transferList[0]?.color ?? '#666666';
  const leftColor = leftPassed ? metroVerticalPassedColor : transferColor;
  const rightColor = rightPassed ? metroVerticalPassedColor : transferColor;
  const leftMainColor = leftPassed ? metroVerticalPassedColor : mainColor;
  const rightMainColor = rightPassed ? metroVerticalPassedColor : mainColor;
  const textX = (leftTrackX + rightTrackX) / 2;
  const textMaxWidth = 20 * widthScale;
  const labels = transferList.map((transfer) =>
    /号线$/u.test(transfer.label) ? transfer.label : `${transfer.label}号线`,
  );
  return [
    renderMetroVerticalClassicTransferStem({
      side: 'left',
      y,
      color: leftColor,
      widthScale,
    }),
    renderMetroVerticalClassicTransferStem({
      side: 'right',
      y,
      color: rightColor,
      widthScale,
    }),
    renderMetroVerticalClassicTransferPill({
      centerX: leftTrackX,
      y,
      side: 'left',
      outlineColor: leftColor,
      glyphTransferColor: leftColor,
      glyphMainColor: leftMainColor,
      widthScale,
    }),
    renderMetroVerticalClassicTransferPill({
      centerX: rightTrackX,
      y,
      side: 'right',
      outlineColor: rightColor,
      glyphTransferColor: rightColor,
      glyphMainColor: rightMainColor,
      widthScale,
    }),
    renderMetroSignText({
      value: `换乘${labels.join('、')}`,
      x: textX,
      y: y - 0.8 * widthScale,
      fontSize: 3 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'middle',
      maxWidth: textMaxWidth,
      fontFamily: metroVerticalHarmonyFontFamily,
    }),
    renderMetroSignText({
      value: `Transfer to Line ${transferList.map((transfer) => transfer.label).join('、')}`,
      x: textX,
      y: y + 2.4 * widthScale,
      fontSize: 2 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'middle',
      maxWidth: textMaxWidth,
      fontFamily: metroVerticalHarmonyFontFamily,
    }),
  ].join('');
}

/** 旧版换乘连接带，直接复用参考 SVG 的左右两条路径。 */
function renderMetroVerticalClassicTransferStem(input: {
  side: 'left' | 'right';
  y: number;
  color: string;
  widthScale: number;
}): string {
  const { side, y, color, widthScale } = input;
  const path =
    side === 'left'
      ? metroVerticalClassicStemLeftPath
      : metroVerticalClassicStemRightPath;
  return `<g transform="translate(0 ${formatNumber(
    y - metroVerticalClassicStemCenterY * widthScale,
  )}) scale(${formatNumber(widthScale)})"><path d="${path}" fill="${color}"/></g>`;
}

/** 旧版换乘胶囊：白底圆角矩形 + 线路色描边和循环箭头，全部取自参考 SVG。 */
function renderMetroVerticalClassicTransferPill(input: {
  centerX: number;
  y: number;
  side: 'left' | 'right';
  outlineColor: string;
  glyphTransferColor: string;
  glyphMainColor: string;
  widthScale: number;
}): string {
  const {
    centerX,
    y,
    side,
    outlineColor,
    glyphTransferColor,
    glyphMainColor,
    widthScale,
  } = input;
  const isLeft = side === 'left';
  const referenceCenterX = isLeft
    ? metroVerticalClassicPillLeftCenterX
    : metroVerticalClassicPillRightCenterX;
  const backgroundPath = isLeft
    ? metroVerticalClassicPillLeftBackgroundPath
    : metroVerticalClassicPillRightBackgroundPath;
  const outlinePath = isLeft
    ? metroVerticalClassicPillLeftOutlinePath
    : metroVerticalClassicPillRightOutlinePath;
  const glyphTransferPath = isLeft
    ? metroVerticalClassicPillLeftGlyphTransferPath
    : metroVerticalClassicPillRightGlyphTransferPath;
  const glyphMainPath = isLeft
    ? metroVerticalClassicPillLeftGlyphMainPath
    : metroVerticalClassicPillRightGlyphMainPath;
  const transform = `translate(${formatNumber(
    centerX - referenceCenterX * widthScale,
  )} ${formatNumber(y - metroVerticalClassicPillCenterY * widthScale)}) scale(${formatNumber(widthScale)})`;
  return `<g transform="${transform}"><path d="${backgroundPath}" fill="#FFFFFF"/><path d="${outlinePath}" fill="${outlineColor}" fill-rule="evenodd"/><path d="${glyphTransferPath}" fill="${glyphTransferColor}" fill-rule="evenodd"/><path d="${glyphMainPath}" fill="${glyphMainColor}" fill-rule="evenodd"/></g>`;
}

/** 旧版两侧轨道：本站标注。 */
function renderMetroVerticalClassicThisStation(input: {
  centerX: number;
  y: number;
  widthScale: number;
}): string {
  const { centerX, y, widthScale } = input;
  return [
    renderMetroSignText({
      value: '本站',
      x: centerX,
      y: y - 0.2 * widthScale,
      fontSize: 3 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'middle',
    }),
    renderMetroSignText({
      value: 'This Station',
      x: centerX,
      y: y + 2.3 * widthScale,
      fontSize: 2 * widthScale,
      color: '#000000',
      weight: 400,
      anchor: 'middle',
    }),
  ].join('');
}

/** 旧版竖版线路图的换乘标注：沿用旧版横版的文字换乘说明。 */
function renderMetroVerticalClassicTransfer(input: {
  y: number;
  trackSide: 'left' | 'right';
  transferList: MetroLineMapTransfer[];
  inkColor: string;
  widthScale: number;
}): string {
  const { y, trackSide, transferList, inkColor, widthScale } = input;
  const labels = transferList.map((transfer) =>
    /号线$/u.test(transfer.label) ? transfer.label : `${transfer.label}号线`,
  );
  const chinese = `换乘 ${labels.join('、')}`;
  const english = `Transfer to Line ${transferList.map((transfer) => transfer.label).join('、')}`;
  const x = 34.0833 * widthScale;
  const anchor: 'start' | 'end' = trackSide === 'left' ? 'end' : 'start';
  const textX = trackSide === 'left' ? x : 128 * widthScale - x;
  return [
    renderMetroSignText({
      value: chinese,
      x: textX,
      y: y - 0.4 * widthScale,
      fontSize: 3.4 * widthScale,
      color: inkColor,
      weight: 400,
      anchor,
      maxWidth: 40 * widthScale,
    }),
    renderMetroSignText({
      value: english,
      x: textX,
      y: y + 3.6 * widthScale,
      fontSize: 2.2 * widthScale,
      color: inkColor,
      weight: 400,
      anchor,
      maxWidth: 40 * widthScale,
    }),
  ].join('');
}


// 新版方向箭头：设计稿中位于 50×33 的局部坐标，左开门时指向左侧。
const metroDirectionModernArrowPath =
  'M112.114 70.4069L100.668 58.503L134.807 58.503L134.807 48.7762L101.16 48.7762L112.114 37.3845L100.683 37.3845L84.8067 53.8956L95.9001 53.8956L84.8067 53.8956L100.683 70.4069L112.114 70.4069Z';
// 旧版方向箭头：来自附件「旧版箭头.svg」，带 0.6 描边。
const metroDirectionClassicArrowPath =
  'M0.424316 20.8928L20.9401 0.369168L28.7222 0.306091L10.7137 17.6759L41.4243 17.6759L41.4243 23.4632L10.7137 23.4632L28.7222 41.4717L21.0347 41.5032L0.424316 20.8928Z';
// 右侧开门：新版 / 旧版箭头在设计稿中的绝对坐标（箭头朝右）。
const metroDirectionModernRightArrowPath =
  'M463.886 70.4069L475.332 58.503L441.193 58.503L441.193 48.7762L474.84 48.7762L463.886 37.3845L475.317 37.3845L491.193 53.8956L480.1 53.8956L491.193 53.8956L475.317 70.4069L463.886 70.4069Z';
const metroDirectionClassicRightArrowPath =
  'M531 55.9882L510.484 35.4645L502.702 35.4014L520.711 52.7713L490 52.7712L490 58.5586L520.711 58.5586L502.702 76.567L510.39 76.5986L531 55.9882Z';
const metroSignReferenceWidth = 576;
const metroSignReferenceHeight = 128;

/**
 * 站台站名标志（512×512）。
 * 设计稿：站名与拼音居中，线路色条横贯中部，色条下方为「下一站 + 下一站名」。
 */
function renderMetroPlatformSign(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string>,
): string {
  const canvasWidth = Math.max(
    Number(values['canvas.logicalWidthPx']) || config.layoutWidth || 512,
    128,
  );
  const canvasHeight = Math.max(
    Number(values['canvas.logicalHeightPx']) || config.layoutHeight || 512,
    128,
  );
  const scale = Math.min(canvasWidth / 512, canvasHeight / 512);
  const accentColor = resolveMetroSignAccentColor(config, values);
  const stationName = value.trim();
  const stationPinyin = (values.stationNamePinyin ?? '').trim();
  const nextStationName = (values.nextStationName ?? '').trim();
  const nextStationPinyin = (values.nextStationPinyin ?? '').trim();
  const stationCenterX = canvasWidth / 2;
  const nextGroupCenterX = canvasWidth * (342 / 512);

  const parts = [
    `<rect x="0" y="${formatNumber(72 * scale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(369 * scale)}" fill="#FFFFFF"/>`,
    renderMetroSignText({
      value: stationName,
      x: stationCenterX,
      y: 194 * scale,
      fontSize: 88 * scale,
      color: '#000000',
      weight: 700,
      anchor: 'middle',
      maxWidth: canvasWidth - 40 * scale,
    }),
    stationPinyin
      ? renderMetroSignText({
          value: stationPinyin,
          x: stationCenterX,
          y: 246.68 * scale,
          fontSize: 35 * scale,
          color: '#000000',
          weight: 400,
          anchor: 'middle',
          maxWidth: canvasWidth - 40 * scale,
        })
      : '',
    `<rect x="0" y="${formatNumber(293 * scale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(28 * scale)}" fill="${accentColor}"/>`,
    renderMetroSignText({
      value: '下一站',
      x: 43 * scale,
      y: 400 * scale,
      fontSize: 26 * scale,
      color: '#000000',
      weight: 400,
      maxWidth: 110 * scale,
    }),
    renderMetroSignText({
      value: 'Next Station',
      x: 43 * scale,
      y: 420.48 * scale,
      fontSize: 16 * scale,
      color: '#000000',
      weight: 400,
      maxWidth: 150 * scale,
    }),
    renderMetroSignText({
      value: nextStationName,
      x: nextGroupCenterX,
      y: 392 * scale,
      fontSize: 36 * scale,
      color: '#000000',
      weight: 500,
      anchor: 'middle',
      maxWidth: 250 * scale,
    }),
    renderMetroSignText({
      value: nextStationPinyin,
      x: nextGroupCenterX,
      y: 418.9 * scale,
      fontSize: 22 * scale,
      color: '#000000',
      weight: 400,
      anchor: 'middle',
      maxWidth: 250 * scale,
    }),
  ];
  return `<g data-metro-platform-sign="true">${parts.join('')}</g>`;
}

/**
 * 地铁站名版式（新版 / 旧版）。
 * 设计稿为 576×128 单行版面：居中站名 + 拼音，底部线路色条。
 * 旧版站名与拼音使用线路色，新版使用黑色；旧版拼音按字分空格暂未实现。
 */
function renderMetroStationNameSign(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string>,
  style: 'modern' | 'classic',
): string {
  const canvasWidth = Math.max(
    Number(values['canvas.logicalWidthPx']) || config.layoutWidth || metroSignReferenceWidth,
    64,
  );
  const canvasHeight = Math.max(
    Number(values['canvas.logicalHeightPx']) || config.layoutHeight || metroSignReferenceHeight,
    32,
  );
  const yScale = canvasHeight / metroSignReferenceHeight;
  const accentColor = resolveMetroSignAccentColor(config, values);
  const centerX = canvasWidth / 2;
  const color = style === 'classic' ? accentColor : '#000000';
  const nameLetterSpacing = style === 'classic' ? 8 * yScale : 0;
  const pinyinFontSize = (style === 'classic' ? 18 : 20) * yScale;
  const pinyinLetterSpacing = style === 'classic' ? 0 : 1 * yScale;
  const maxTextWidth = Math.max(canvasWidth - 32, 20);
  const stationName = value.trim();
  const pinyin = (values.stationNamePinyin ?? '').trim();

  const parts = [
    `<rect width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" fill="#FFFFFF"/>`,
    renderMetroSignText({
      value: stationName,
      x: centerX,
      y: (style === 'classic' ? 62 : 63) * yScale,
      fontSize: 44 * yScale,
      color,
      weight: 700,
      anchor: 'middle',
      letterSpacing: nameLetterSpacing,
      maxWidth: maxTextWidth,
    }),
    pinyin
      ? renderMetroSignText({
          value: pinyin,
          x: centerX,
          y: (style === 'classic' ? 92 : 93) * yScale,
          fontSize: pinyinFontSize,
          color,
          weight: 400,
          anchor: 'middle',
          letterSpacing: pinyinLetterSpacing,
          maxWidth: maxTextWidth,
        })
      : '',
    `<rect x="0" y="${formatNumber(112 * yScale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(16 * yScale)}" fill="${accentColor}"/>`,
    `<rect x="0.5" y="0.5" width="${formatNumber(Math.max(canvasWidth - 1, 1))}" height="${formatNumber(Math.max(canvasHeight - 1, 1))}" fill="none" stroke="#CCCCCC" stroke-width="1"/>`,
  ];
  return `<g data-metro-station-name="${style}">${parts.join('')}</g>`;
}

/**
 * 地铁方向及下一站版式（新版 / 旧版）。
 * 设计稿为 576×128：左侧开门箭头与开往方向，右侧线路标识和下一站信息。
 * 画布加长时左侧保持原位、右侧信息簇贴右，字号只随画布高度缩放。
 */
function renderMetroDirectionSign(
  value: string,
  config: MaterialGlyphConfig,
  values: Record<string, string>,
  style: 'modern' | 'classic',
): string {
  const canvasWidth = Math.max(
    Number(values['canvas.logicalWidthPx']) || config.layoutWidth || metroSignReferenceWidth,
    320,
  );
  const canvasHeight = Math.max(
    Number(values['canvas.logicalHeightPx']) || config.layoutHeight || metroSignReferenceHeight,
    32,
  );
  const yScale = canvasHeight / metroSignReferenceHeight;
  const accentColor = resolveMetroSignAccentColor(config, values);
  const rightShift = canvasWidth - metroSignReferenceWidth;
  const doorRight = values.doorDirection === 'right';
  /**
   * 新版整组居中；旧版保持两端布局，让箭头尖端到同侧边缘的距离恒定。
   * `infoShift` 用于线路标与下一站信息，`destinationShift` 用于箭头与开往文本。
   */
  const centerShift = rightShift / 2;
  const infoShift = style === 'classic' ? (doorRight ? 0 : rightShift) : centerShift;
  const destinationShift = style === 'classic' ? (doorRight ? rightShift : 0) : centerShift;
  const nextStationName = value.trim();
  const nextStationPinyin = (values.nextStationPinyin ?? '').trim();
  const terminalName = (values.terminalName ?? '').trim();
  const terminalPinyin = (values.terminalNamePinyin ?? '').trim();
  const lineLabel = (values.lineLabel ?? '').trim();
  const lineEnglishLabel = (values.lineEnglishLabel ?? '').trim();
  const destinationText = `开往${terminalName}`;
  const destinationEnglishText = `To ${terminalPinyin || terminalName}`;
  // 保持设计稿中的组内间距；新版整体居中，旧版箭头与开往跟随同侧边缘。
  const nextLabelX =
    (style === 'classic' ? (doorRight ? 23.2 : 446) : (doorRight ? 115 : 374)) + infoShift;
  const stationColumnX =
    (style === 'classic' ? (doorRight ? 83.1 : 506) : (doorRight ? 163 : 422)) + infoShift;
  const nextColumnWidth = 44;
  const stationColumnWidth = doorRight ? 150 : 138;
  const badgeCy = style === 'classic' ? 56 : 43.5;
  const badgeRadius = style === 'classic' ? 21 : 18;
  // 旧版线路标跟随开往文本，保持设计稿中的短间距；新版保持固定列位置后整组居中。
  const classicDestinationWidth = estimateMetroLineMapTextWidth(destinationText, 32 * yScale);
  const badgeCx =
    style === 'classic'
      ? doorRight
        ? 463.6 + destinationShift - classicDestinationWidth - 20.9 - badgeRadius
        : 106 + destinationShift + classicDestinationWidth + 24 + badgeRadius
      : (doorRight ? 133 : 392) + infoShift;

  const arrow = doorRight
    ? `<g transform="translate(${formatNumber(destinationShift)} 0) scale(1 ${formatNumber(yScale)})"><path d="${style === 'classic' ? metroDirectionClassicRightArrowPath : metroDirectionModernRightArrowPath}" fill="#000000"${style === 'classic' ? ' stroke="#000000" stroke-width="0.6"' : ''}/></g>`
    : style === 'classic'
      ? `<g transform="translate(${formatNumber(45 + destinationShift)} ${formatNumber(35.4 * yScale)}) scale(${formatNumber(yScale)})"><path d="${metroDirectionClassicArrowPath}" fill="#000000" stroke="#000000" stroke-width="0.6"/></g>`
      : `<g transform="translate(${formatNumber(destinationShift)} 0) scale(1 ${formatNumber(yScale)})"><path d="${metroDirectionModernArrowPath}" fill="#000000"/></g>`;

  const badge = `<circle cx="${formatNumber(badgeCx)}" cy="${formatNumber(badgeCy * yScale)}" r="${formatNumber(badgeRadius * yScale)}" fill="${accentColor}"/>${renderMetroSignText({
    value: lineLabel,
    x: badgeCx,
    y: (style === 'classic' ? 68.7 : 52.85) * yScale,
    fontSize: 28 * yScale,
    color: '#FFFFFF',
    weight: 400,
    anchor: 'middle',
    letterSpacing: -3 * yScale,
    maxWidth: (badgeRadius * 2 - 8) * yScale,
  })}`;

  // 新版右开门时，线路标与下一站信息作为一组整体右对齐（统一右端），组内仍左对齐避免重叠。
  const modernRightAligned = style === 'modern' && doorRight;
  const stationTextWidth = Math.min(
    Math.max(
      estimateMetroLineMapTextWidth(nextStationName, 12 * yScale) +
        Math.max(nextStationName.length - 1, 0) * 1 * yScale,
      estimateMetroLineMapTextWidth(nextStationPinyin, 7 * yScale),
      20,
    ),
    80,
  );
  const stationLabelTextX = modernRightAligned
    ? 206 + infoShift - stationTextWidth
    : stationColumnX;
  const nextLabelTextX = modernRightAligned
    ? stationLabelTextX - 4 - 44
    : nextLabelX;

  const nextLabel = renderMetroSignText({
    value: '下一站',
    x: nextLabelTextX,
    y: (style === 'classic' ? 90.06 : 94.36) * yScale,
    fontSize: 12 * yScale,
    color: '#000000',
    weight: 400,
    letterSpacing: 1 * yScale,
    maxWidth: nextColumnWidth,
  });
  const nextEnglishLabel = renderMetroSignText({
    value: 'Next Station',
    x: nextLabelTextX,
    y: (style === 'classic' ? 101.5 : 105.84) * yScale,
    fontSize: (style === 'classic' ? 6 : 7) * yScale,
    color: '#000000',
    weight: 400,
    maxWidth: nextColumnWidth,
  });
  const stationLabel = renderMetroSignText({
    value: nextStationName,
    x: stationLabelTextX,
    y: (style === 'classic' ? 90.06 : 94.36) * yScale,
    fontSize: 12 * yScale,
    color: '#000000',
    weight: 400,
    letterSpacing: 1 * yScale,
    maxWidth: stationColumnWidth,
  });
  const stationPinyinLabel = renderMetroSignText({
    value: nextStationPinyin,
    x: stationLabelTextX,
    y: (style === 'classic' ? 101.5 : 105.84) * yScale,
    fontSize: (style === 'classic' ? 6 : 7) * yScale,
    color: '#000000',
    weight: 400,
    maxWidth: stationColumnWidth,
  });
  const destinationAnchor = doorRight ? 'end' : 'start';
  const destinationX =
    (style === 'classic' ? (doorRight ? 463.6 : 106) : (doorRight ? 421 : 160.87)) +
    destinationShift;
  const destinationChinese = renderMetroSignText({
    value: destinationText,
    x: destinationX,
    y: (style === 'classic' ? 60.84 : 58.34) * yScale,
    fontSize: (style === 'classic' ? 32 : 35) * yScale,
    color: '#000000',
    weight: 500,
    anchor: destinationAnchor,
    maxWidth: 200,
  });
  const destinationEnglish = renderMetroSignText({
    value: destinationEnglishText,
    x:
      (style === 'classic' ? (doorRight ? 463.6 : 105.19) : (doorRight ? 421 : 159)) +
      destinationShift,
    y: (style === 'classic' ? 81.5 : 80.48) * yScale,
    fontSize: 16 * yScale,
    color: '#000000',
    weight: 400,
    anchor: destinationAnchor,
    maxWidth: 200,
  });

  const parts =
    style === 'classic'
      ? [
          `<rect width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" fill="#FFFFFF"/>`,
          arrow,
          destinationChinese,
          destinationEnglish,
          badge,
          nextLabel,
          nextEnglishLabel,
          stationLabel,
          stationPinyinLabel,
        ]
      : [
          `<rect width="${formatNumber(canvasWidth)}" height="${formatNumber(canvasHeight)}" fill="#FFFFFF"/>`,
          arrow,
          destinationChinese,
          destinationEnglish,
          badge,
          renderMetroSignText({
            value: '号线',
            x: doorRight ? 206 + infoShift : 414.94 + infoShift,
            y: 45.94 * yScale,
            fontSize: 20 * yScale,
            color: '#000000',
            weight: 400,
            anchor: doorRight ? 'end' : 'start',
            maxWidth: doorRight ? 160 : 146,
          }),
          renderMetroSignText({
            value: lineEnglishLabel,
            x: doorRight ? 206 + infoShift : 414 + infoShift,
            y: 57.86 * yScale,
            fontSize: 12 * yScale,
            color: '#000000',
            weight: 400,
            anchor: doorRight ? 'end' : 'start',
            maxWidth: doorRight ? 160 : 146,
          }),
          nextLabel,
          nextEnglishLabel,
          stationLabel,
          stationPinyinLabel,
        ];

  parts.push(
    `<rect x="0" y="${formatNumber(112 * yScale)}" width="${formatNumber(canvasWidth)}" height="${formatNumber(16 * yScale)}" fill="${accentColor}"/>`,
    `<rect x="0.5" y="0.5" width="${formatNumber(Math.max(canvasWidth - 1, 1))}" height="${formatNumber(Math.max(canvasHeight - 1, 1))}" fill="none" stroke="#CCCCCC" stroke-width="1"/>`,
  );
  return `<g data-metro-direction="${style}">${parts.join('')}</g>`;
}

function resolveMetroSignAccentColor(
  config: MaterialGlyphConfig,
  values: Record<string, string>,
): string {
  const rawAccent = config.colorFieldKey ? (values[config.colorFieldKey] ?? '') : '';
  return /^#[0-9A-Fa-f]{6}$/u.test(rawAccent) ? rawAccent : '#F29DB4';
}

/** 站名/方向版式的文字渲染：超宽时缩字号，居中时补偿 letter-spacing 的尾部空隙。 */
function renderMetroSignText(input: {
  value: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
  maxWidth?: number;
  fontFamily?: string;
}): string {
  const value = input.value.trim();
  if (!value) {
    return '';
  }
  const letterSpacing = input.letterSpacing ?? 0;
  const naturalWidth =
    estimateMetroLineMapTextWidth(value, input.fontSize) +
    Math.max(value.length - 1, 0) * letterSpacing;
  const fit =
    input.maxWidth && naturalWidth > input.maxWidth ? input.maxWidth / naturalWidth : 1;
  const fontSize = input.fontSize * fit;
  const spacing = letterSpacing * fit;
  const anchor = input.anchor ?? 'start';
  const x = anchor === 'middle' ? input.x + spacing / 2 : input.x;
  const spacingAttribute =
    Math.abs(spacing) > 0.01 ? ` letter-spacing="${formatNumber(spacing)}"` : '';
  return `<text x="${formatNumber(x)}" y="${formatNumber(input.y)}" fill="${input.color}" font-family="${input.fontFamily ?? metroLineMapFontFamily}" font-size="${formatNumber(fontSize)}" font-weight="${input.weight ?? 400}" text-anchor="${anchor}"${spacingAttribute}>${escapeXml(value)}</text>`;
}

function renderMetroLineMapText(
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  color: string,
  fontWeight: number,
): string {
  const naturalWidth = estimateMetroLineMapTextWidth(value, fontSize);
  // 超宽时等比缩小字号，避免横向压缩字形。
  const fittedFontSize =
    naturalWidth > maxWidth ? Math.max(fontSize * (maxWidth / naturalWidth), 2.2) : fontSize;
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" fill="${color}" font-family="${metroLineMapFontFamily}" font-size="${formatNumber(fittedFontSize)}" font-weight="${fontWeight}" text-anchor="middle">${escapeXml(value)}</text>`;
}

/** 线路图的字体宽度估算：拉丁字母按 Arial/Helvetica 的字宽比例，中文仍按 1em。 */
function estimateMetroLineMapTextWidth(value: string, fontSize: number): number {
  return (
    Array.from(value).reduce((width, character) => {
      if (isBasicLatinCharacter(character)) {
        if (/\s/u.test(character)) {
          return width + 0.28;
        }
        return width + (/[A-Z0-9]/u.test(character) ? 0.7 : 0.56);
      }
      return width + metroCharacterWidthFactor(character);
    }, 0) * fontSize
  );
}

function parseMetroLineMapTransfers(value: string): Map<string, MetroLineMapTransfer[]> {
  const result = new Map<string, MetroLineMapTransfer[]>();
  for (const rawEntry of value.split(/[;\n]/u)) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const stationName = entry
      .slice(0, separatorIndex)
      .replace(/[\s\u3000]+/gu, '')
      .trim();
    if (!stationName) {
      continue;
    }
    const items = entry
      .slice(separatorIndex + 1)
      .split(/[,，、]/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((item) => {
        const [rawLabel, rawColor] = item.split(':');
        const label = (rawLabel ?? '').replace(/号线$/u, '').trim();
        if (!label) {
          return undefined;
        }
        const color = /^#[0-9A-Fa-f]{6}$/u.test(rawColor ?? '')
          ? rawColor!.toUpperCase()
          : (metroLineMapDefaultTransferColors[label] ?? '#666666');
        return { label, color };
      })
      .filter((item): item is MetroLineMapTransfer => Boolean(item));
    if (items.length) {
      result.set(stationName, items);
    }
  }
  return result;
}

function renderMetroLineMapStationMarker(input: {
  x: number;
  kind: 'current' | 'terminal' | 'normal';
  ringColor: string;
  terminalColor: string;
  doorDirection: 'left' | 'right';
}): string {
  const white = `<circle cx="${formatNumber(input.x)}" cy="58.5" r="4" fill="#FFFFFF"/>`;
  const ring = `<path transform="translate(${formatNumber(input.x - 5.5)} 53)" fill="${input.ringColor}" fill-rule="evenodd" d="${metroLineMapStationRingPath}"/>`;
  if (input.kind === 'current') {
    const arrowTransform =
      input.doorDirection === 'left'
        ? `translate(${formatNumber(input.x - 5.5)} 53)`
        : `translate(${formatNumber(input.x + 5.5)} 53) scale(-1 1)`;
    return `${white}${ring}<path transform="${arrowTransform}" d="${metroLineMapCurrentArrowPath}" stroke="#000000" stroke-width="0.6" fill="#000000"/>`;
  }
  if (input.kind === 'terminal') {
    return `${white}${ring}<circle cx="${formatNumber(input.x)}" cy="58.5" r="2.5" fill="${input.terminalColor}"/>`;
  }
  return `${white}${ring}`;
}

function renderMetroLineMapOldTransferBadgeMarkup(
  mainColor: string,
  transferColor: string,
): string {
  return `<rect x="2" y="1" width="7" height="17" rx="3.5" fill="#FFFFFF"/><path fill-rule="evenodd" fill="${mainColor}" d="${metroLineMapOldTransferRingPath}"/><path fill="none" stroke="${mainColor}" stroke-width="1" d="${metroLineMapOldTransferUpStroke}"/><path d="${metroLineMapOldTransferUpArrow}" fill="${mainColor}"/><path fill="none" stroke="${transferColor}" stroke-width="1" d="${metroLineMapOldTransferDownStroke}"/><path d="${metroLineMapOldTransferDownArrow}" fill="${transferColor}"/>`;
}

function renderMetroLineMapOldTransfer(input: {
  x: number;
  labelAbove: boolean;
  transferList: MetroLineMapTransfer[];
  mainColor: string;
  passed: boolean;
}): { stem: string; badge: string } {
  const rawTransferColor = input.transferList[0]?.color ?? '#666666';
  const transferColor = input.passed ? '#A5A5A5' : rawTransferColor;
  const mainColor = input.passed ? '#A5A5A5' : input.mainColor;
  const badgeTop = input.labelAbove ? 50 : 48;
  const badge = `<g transform="translate(${formatNumber(input.x - 5.5)} ${badgeTop})">${renderMetroLineMapOldTransferBadgeMarkup(mainColor, transferColor)}</g>`;
  const stem = input.labelAbove
    ? `<path transform="translate(${formatNumber(input.x - 1.5)} 65)" fill="${transferColor}" d="${metroLineMapStemLong}"/>`
    : `<path transform="translate(${formatNumber(input.x - 1.5)} 22)" fill="${transferColor}" d="${metroLineMapStemLongUp}"/>`;
  const transferredLines = input.transferList
    .map((transfer) => (/号线$/u.test(transfer.label) ? transfer.label : `${transfer.label}号线`))
    .join('、');
  const chineseY = input.labelAbove ? 97.28 : 15.86;
  const englishY = input.labelAbove ? 101.14 : 19.72;
  const textColor = input.passed ? '#A5A5A5' : '#000000';
  const text = `<text x="${formatNumber(input.x - 14)}" y="${formatNumber(chineseY)}" fill="${textColor}" font-family="${metroLineMapLegacyTransferFontFamily}" font-size="6" font-weight="400">换乘 ${escapeXml(transferredLines)}</text><text x="${formatNumber(input.x - 12)}" y="${formatNumber(englishY)}" fill="${textColor}" font-family="${metroLineMapLegacyTransferFontFamily}" font-size="3" font-weight="400">Transfer to Line ${escapeXml(
    input.transferList.map((transfer) => transfer.label).join('、'),
  )}</text>`;
  return { stem, badge: `<g>${badge}${text}</g>` };
}

function renderMetroLineMapNewTransferGlyphMarkup(
  mainColor: string,
  transferColor: string,
  glyphColor = '#000000',
): string {
  return `<path d="${metroLineMapNewTransferPathTop}" fill="${transferColor}" fill-rule="evenodd"/><path d="${metroLineMapNewTransferPathBottom}" fill="${mainColor}" fill-rule="evenodd"/><path d="${metroLineMapNewTransferPathGlyph}" fill="${glyphColor}" fill-rule="evenodd"/>`;
}

function isMetroLineMapNumericLine(label: string): boolean {
  return /^[a-z]?\d+[a-z]?(?:号线|线)?$/iu.test(label.trim());
}

function getMetroLineMapBadgeWidth(label: string): number {
  if (isMetroLineMapNumericLine(label)) {
    const number = label.replace(/(?:号线|线)$/u, '').trim();
    return 18 + Math.max(Array.from(number).length - 1, 0) * 4;
  }
  const english = resolveMetroLineEnglishName(label);
  const textWidth = Math.max(
    estimateMetroLineMapTextWidth(label, 5.2),
    estimateMetroLineMapTextWidth(english, 2.8),
  );
  return Math.max(18, Math.ceil(textWidth) + 6);
}

function renderMetroLineMapLineBadge(input: {
  label: string;
  color: string;
  left: number;
  top: number;
}): string {
  const width = getMetroLineMapBadgeWidth(input.label);
  if (!isMetroLineMapNumericLine(input.label)) {
    // 文字线路：没有大数字编号，中文线路名与英文名在胶囊内居中。
    const english = resolveMetroLineEnglishName(input.label);
    const chineseRow = english
      ? `<text x="${formatNumber(width / 2)}" y="5.3" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="5.2" font-weight="400" text-anchor="middle">${escapeXml(input.label)}</text>`
      : `<text x="${formatNumber(width / 2)}" y="7.4" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="5.2" font-weight="400" text-anchor="middle">${escapeXml(input.label)}</text>`;
    const englishRow = english
      ? `<text x="${formatNumber(width / 2)}" y="9.4" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="2.8" font-weight="400" text-anchor="middle">${escapeXml(english)}</text>`
      : '';
    return `<g transform="translate(${formatNumber(input.left)} ${formatNumber(input.top)})"><rect x="0" y="0" width="${formatNumber(width)}" height="11" rx="1.5" fill="${input.color}"/>${chineseRow}${englishRow}</g>`;
  }
  const number = input.label.replace(/(?:号线|线)$/u, '').trim();
  const digitCount = Array.from(number).length;
  const suffixX = digitCount > 1 ? 10.5 : 7;
  const lineX = digitCount > 1 ? 10 : 7.5;
  const letterSpacing = digitCount > 1 ? -2 : -1;
  return `<g transform="translate(${formatNumber(input.left)} ${formatNumber(input.top)})"><rect x="0" y="0" width="${formatNumber(width)}" height="11" rx="1.5" fill="${input.color}"/><text x="1" y="8.9668" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="10" font-weight="400" letter-spacing="${letterSpacing}">${escapeXml(number)}</text><text x="${formatNumber(suffixX)}" y="5.8" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="5" font-weight="400">号线</text><text x="${formatNumber(lineX)}" y="8.7158" fill="#FFFFFF" font-family="${metroLineMapFontFamily}" font-size="3" font-weight="400">Line ${escapeXml(number)}</text></g>`;
}

function renderMetroLineMapNewTransfer(input: {
  x: number;
  labelAbove: boolean;
  transferList: MetroLineMapTransfer[];
  mainColor: string;
  passed: boolean;
}): { stem: string; badge: string } {
  const rawTransferColor = input.transferList[0]?.color ?? '#666666';
  const transferColor = input.passed ? '#A5A5A5' : rawTransferColor;
  const mainColor = input.passed ? '#A5A5A5' : input.mainColor;
  const glyphColor = input.passed ? '#A5A5A5' : '#000000';
  const glyphTop = input.labelAbove ? 87 : 16;
  const badgeTop = input.labelAbove ? 102 : 4;
  const stem = input.labelAbove
    ? `<path transform="translate(${formatNumber(input.x - 1.5)} 63)" fill="${transferColor}" d="${metroLineMapStemShortDown}"/>`
    : `<path transform="translate(${formatNumber(input.x - 1.5)} 32)" fill="${transferColor}" d="${metroLineMapStemLongUp}"/>`;
  const glyph = `<g transform="translate(${formatNumber(input.x - metroLineMapNewTransferWidth / 2)} ${glyphTop})">${renderMetroLineMapNewTransferGlyphMarkup(mainColor, transferColor, glyphColor)}</g>`;
  const badges = input.transferList.map((transfer) => ({
    label: transfer.label,
    color: input.passed ? '#A5A5A5' : transfer.color,
  }));
  const gap = 3;
  const totalWidth =
    badges.reduce((sum, badge) => sum + getMetroLineMapBadgeWidth(badge.label), 0) +
    gap * Math.max(badges.length - 1, 0);
  let cursor = input.x - totalWidth / 2;
  const badgeMarkup = badges
    .map((badge) => {
      const markup = renderMetroLineMapLineBadge({
        label: badge.label,
        color: badge.color,
        left: cursor,
        top: badgeTop,
      });
      cursor += getMetroLineMapBadgeWidth(badge.label) + gap;
      return markup;
    })
    .join('');
  return { stem, badge: `<g>${glyph}${badgeMarkup}</g>` };
}

function renderMetroLineMapClassicLegend(
  accentColor: string,
  doorDirection: 'left' | 'right',
): string {
  const currentArrowTransform =
    doorDirection === 'left' ? '' : 'transform="translate(83 0) scale(-1 1)"';
  return `<g><text transform="translate(17 95)"><tspan x="0" y="7.2421875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="8" font-weight="400">图例</tspan><tspan x="0" y="13.4638671875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="5">Legend</tspan></text><circle cx="41.5" cy="102.5" r="3.5" fill="#FFFFFF"/><path fill-rule="evenodd" fill="${accentColor}" d="M41.5 106C43.433 106 45 104.433 45 102.5C45 100.567 43.433 99 41.5 99C39.567 99 38 100.567 38 102.5C38 104.433 39.567 106 41.5 106ZM41.5 100C42.8807 100 44 101.119 44 102.5C44 103.881 42.8807 105 41.5 105C40.1193 105 39 103.881 39 102.5C39 101.119 40.1193 100 41.5 100Z"/><path ${currentArrowTransform} d="M41.5 101.227L40.2273 102.5L41.5 103.773L41.701 103.572L40.7632 102.634L42.7727 102.634L42.7727 102.333L40.7632 102.333L41.701 101.428L41.5 101.227Z" stroke="#000000" stroke-width="0.4" fill="#000000"/><text transform="translate(47 95)"><tspan x="0" y="7.2421875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="8">本站</tspan><tspan x="0" y="13.4638671875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="5">This Station</tspan></text><circle cx="79.5" cy="102.5" r="3.5" fill="#FFFFFF"/><path fill-rule="evenodd" fill="${accentColor}" d="M79.5 106C81.433 106 83 104.433 83 102.5C83 100.567 81.433 99 79.5 99C77.567 99 76 100.567 76 102.5C76 104.433 77.567 106 79.5 106ZM79.5 100C80.8807 100 82 101.119 82 102.5C82 103.881 80.8807 105 79.5 105C78.1193 105 77 103.881 77 102.5C77 101.119 78.1193 100 79.5 100Z"/><circle cx="79.5" cy="102.5" r="1.5909090042114258" fill="${accentColor}"/><text transform="translate(85 95)"><tspan x="0" y="7.2421875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="8">终始站</tspan><tspan x="0" y="13.4638671875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="5">Terminal Station</tspan></text><rect x="125" y="97" width="5" height="11" rx="2.5" fill="#FFFFFF"/><path fill-rule="evenodd" fill="${accentColor}" d="M130 99.5C130 98.1193 128.881 97 127.5 97C126.119 97 125 98.1193 125 99.5L125 105.5C125 106.881 126.119 108 127.5 108C128.881 108 130 106.881 130 105.5L130 99.5ZM125.7 99.5C125.7 98.5059 126.506 97.7 127.5 97.7C128.494 97.7 129.3 98.5059 129.3 99.5L129.3 105.5C129.3 106.494 128.494 107.3 127.5 107.3C126.506 107.3 125.7 106.494 125.7 105.5L125.7 99.5Z"/><path fill="none" stroke="${accentColor}" stroke-width="0.7" d="M126.667 102.762L126.667 99.619C126.667 99.619 126.667 98.8333 127.5 98.8333C128.333 98.8333 128.333 99.619 128.333 99.619L128.333 101"/><path d="M128.333 101.714L128.889 100.667L127.778 100.667L128.333 101.714Z" fill="${accentColor}"/><path fill="none" stroke="#A5A5A5" stroke-width="0.7" d="M128.333 102.238L128.333 105.381C128.333 105.381 128.333 106.167 127.5 106.167C126.667 106.167 126.667 105.381 126.667 105.381L126.667 104"/><path d="M126.667 103.286L126.111 104.333L127.222 104.333L126.667 103.286Z" fill="#A5A5A5"/><text transform="translate(133 95)"><tspan x="0" y="7.2421875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="8">换乘站</tspan><tspan x="0" y="13.4638671875" fill="#000000" font-family="${metroLineMapFontFamily}" font-size="5">Transfer Station</tspan></text></g>`;
}

function renderNostalgicDigits(value: string, config: MaterialGlyphConfig): string {
  const glyphs = Array.from(value).map((character) => nostalgicDigitGlyphs[character]);
  if (glyphs.some((glyph) => !glyph)) {
    throw new Error('怀旧楼牌门牌号只能包含阿拉伯数字。');
  }
  const resolvedGlyphs = glyphs as NostalgicDigitGlyph[];
  const letterSpacing = config.maxLetterSpacing ?? 0;
  const naturalWidth =
    resolvedGlyphs.reduce((sum, glyph) => sum + glyph.advance, 0) +
    Math.max(resolvedGlyphs.length - 1, 0) * letterSpacing;
  const scaleX = Math.min(1, config.layoutWidth / naturalWidth);
  const scaleY = config.layoutHeight / 85;
  const offsetXInLayout = (config.layoutWidth - naturalWidth * scaleX) / 2;
  let offsetX = 0;
  const paths = resolvedGlyphs.map((glyph, index) => {
    const output = `<path d="${glyph.path}" fill-rule="evenodd" clip-rule="evenodd"${glyph.transform ? ` transform="${glyph.transform}"` : ''}/>`;
    const wrapped = `<g transform="translate(${formatNumber(offsetX)} 0)">${output}</g>`;
    offsetX += glyph.advance + (index < resolvedGlyphs.length - 1 ? letterSpacing : 0);
    return wrapped;
  });
  return `<g transform="translate(${formatNumber(offsetXInLayout)} 0) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})">${paths.join('')}</g>`;
}

function renderNostalgicAddressNumber(
  value: string,
  rawSuffix: string,
  config: MaterialGlyphConfig,
): string {
  const suffix = rawSuffix.replace(/[－—–]/gu, '-');
  const glyphs = [
    ...Array.from(value).map((character) => ({ character, kind: 'digit' as const })),
    ...Array.from(suffix).map((character) => {
      if (character === '-') {
        return { character, kind: 'connector' as const };
      }
      if (nostalgicDigitGlyphs[character]) {
        return { character, kind: 'digit' as const };
      }
      return { character, kind: 'suffix' as const };
    }),
  ];
  if (
    glyphs.some(
      (glyph) =>
        (glyph.kind === 'digit' && !nostalgicDigitGlyphs[glyph.character]) ||
        (glyph.kind === 'suffix' && !nostalgicSuffixGlyphs[glyph.character]),
    )
  ) {
    throw new Error('怀旧楼牌门牌号仅支持数字、连接符及甲乙丙丁。');
  }

  const glyphAdvance = (glyph: (typeof glyphs)[number]) => {
    if (glyph.kind === 'connector') {
      return 30;
    }
    if (glyph.kind === 'digit') {
      return nostalgicDigitGlyphs[glyph.character].advance;
    }
    return nostalgicSuffixGlyphs[glyph.character].advance;
  };
  const letterSpacing = config.maxLetterSpacing ?? 0;
  const naturalWidth =
    glyphs.reduce((sum, glyph) => sum + glyphAdvance(glyph), 0) +
    Math.max(glyphs.length - 1, 0) * letterSpacing;
  const scaleX = Math.min(1, config.layoutWidth / naturalWidth);
  const scaleY = config.layoutHeight / 85;
  const offsetXInLayout = (config.layoutWidth - naturalWidth * scaleX) / 2;
  let offsetX = 0;
  const paths = glyphs.map((glyph, index) => {
    let output: string;
    if (glyph.kind === 'connector') {
      output = `<rect x="0" y="37.5" width="30" height="10"/>`;
    } else if (glyph.kind === 'digit') {
      const digit = nostalgicDigitGlyphs[glyph.character];
      output = `<path d="${digit.path}" fill-rule="evenodd" clip-rule="evenodd"${digit.transform ? ` transform="${digit.transform}"` : ''}/>`;
    } else {
      const suffixGlyph = nostalgicSuffixGlyphs[glyph.character];
      output = `<g transform="translate(0 42.5) scale(${formatNumber(nostalgicSuffixGlyphScale)})"><path d="${suffixGlyph.path}" fill-rule="evenodd" clip-rule="evenodd" transform="translate(-${suffixGlyph.sourceOffsetX} 0)"/></g>`;
    }
    const wrapped = `<g transform="translate(${formatNumber(offsetX)} 0)">${output}</g>`;
    offsetX += glyphAdvance(glyph) + (index < glyphs.length - 1 ? letterSpacing : 0);
    return wrapped;
  });
  return `<g transform="translate(${formatNumber(offsetXInLayout)} 0) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})">${paths.join('')}</g>`;
}

function renderVerticalChillJinshuSong(value: string, config: MaterialGlyphConfig): string {
  const fontSize = config.fontSize;
  if (!fontSize) {
    throw new Error('竖排道路名称缺少字形字号配置。');
  }
  const font = getChillJinshuSongFont();
  const characters = Array.from(value.replace(/[\s\u3000]+/g, ''));
  const naturalHeight = characters.length * fontSize;
  const gapCount = Math.max(characters.length - 1, 0);
  const letterSpacing =
    naturalHeight <= config.layoutHeight && gapCount > 0
      ? Math.min(
          config.maxLetterSpacing ?? fontSize * 0.12,
          (config.layoutHeight - naturalHeight) / gapCount,
        )
      : 0;
  const scaleY = naturalHeight > config.layoutHeight ? config.layoutHeight / naturalHeight : 1;
  const paths = characters.map((character, index) => {
    const glyph = font.charToGlyph(character);
    if (glyph.index === 0) {
      throw new Error(`怀旧楼牌字体不支持字符“${character}”。`);
    }
    const advance = ((glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm) * fontSize;
    const x = (config.layoutWidth - advance) / 2;
    const baseline = (font.ascender / font.unitsPerEm) * fontSize;
    const y = index * (fontSize + letterSpacing) + baseline;
    return `<path d="${glyph.getPath(x, y, fontSize).toPathData(3)}"/>`;
  });
  return `<g transform="scale(1 ${formatNumber(scaleY)})">${paths.join('')}</g>`;
}

function getChillJinshuSongFont(): Font {
  if (chillJinshuSongFont) {
    return chillJinshuSongFont;
  }
  const sourcePath = resolveMaterialFontPath('chill-jinshu-song-wide-bold.otf');
  const source = readFileSync(sourcePath);
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  chillJinshuSongFont = parseOpenTypeFont(buffer);
  return chillJinshuSongFont;
}

function getHarmonyOsSansBoldFont(): Font {
  if (harmonyOsSansBoldFont) {
    return harmonyOsSansBoldFont;
  }
  const sourcePath = resolveMaterialFontPath('harmonyos-sans', 'HarmonyOS_Sans_SC_Bold.ttf');
  const source = readFileSync(sourcePath);
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  harmonyOsSansBoldFont = parseOpenTypeFont(buffer);
  return harmonyOsSansBoldFont;
}

function parseOpenTypeFont(buffer: ArrayBuffer): Font {
  const runtime = opentypeModule as unknown as {
    default?: { parse?: (source: ArrayBuffer) => Font };
    parse?: (source: ArrayBuffer) => Font;
  };
  const parse = runtime.parse ?? runtime.default?.parse;
  if (!parse) {
    throw new Error('当前 OpenType 运行时不支持字体解析。');
  }
  return parse(buffer);
}

function resolveMaterialFontPath(...relativePath: string[]): string {
  const candidates = [
    resolve(process.cwd(), 'public', 'fonts', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'public', 'fonts', ...relativePath),
    resolve(process.cwd(), 'app', 'fonts', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'app', 'fonts', ...relativePath),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`物料字体文件 ${relativePath.join('/')} 不存在。`);
  }
  return sourcePath;
}

function getMaterialSymbolMarkup(symbol: string): { viewBox: string; content: string } {
  const cached = materialSymbolMarkupCache.get(symbol);
  if (cached) {
    return cached;
  }
  if (!metroWayfindingIconOptions.some((option) => option.symbol === symbol)) {
    throw new Error(`不支持的 Material Symbols 图标“${symbol}”。`);
  }
  const sourcePath = resolveMaterialSymbolPath(`${symbol}.svg`);
  const source = readFileSync(sourcePath, 'utf8');
  const viewBox = source.match(/\bviewBox="([^"]+)"/u)?.[1];
  const content = source
    .replace(/^\s*<svg\b[^>]*>/u, '')
    .replace(/<\/svg>\s*$/u, '')
    .trim();
  if (!viewBox || !content) {
    throw new Error(`Material Symbols 图标“${symbol}”格式无效。`);
  }
  const markup = { viewBox, content };
  materialSymbolMarkupCache.set(symbol, markup);
  return markup;
}

function getMetroFacilityAssetMarkup(
  assetName: MetroFacilityIconAssetName | 'frame',
  variant: 'framed' | 'plain',
): { viewBox: string; content: string } {
  const cacheKey = `${variant}/${assetName}`;
  const cached = metroFacilityAssetMarkupCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const sourcePath = resolveMetroFacilityAssetPath(variant, `${assetName}.svg`);
  const source = readFileSync(sourcePath, 'utf8');
  const viewBox = source.match(/\bviewBox="([^"]+)"/u)?.[1];
  const content = source
    .replace(/^\s*<svg\b[^>]*>/u, '')
    .replace(/<\/svg>\s*$/u, '')
    .trim();
  if (!viewBox || !content) {
    throw new Error(`地铁设施图标“${assetName}”格式无效。`);
  }
  const markup = { viewBox, content };
  metroFacilityAssetMarkupCache.set(cacheKey, markup);
  return markup;
}

function getMetroArrowAssetMarkup(assetName: MetroArrowIconAssetName): {
  viewBox: string;
  content: string;
} {
  const cached = metroArrowAssetMarkupCache.get(assetName);
  if (cached) return cached;
  const sourcePath = resolveMetroArrowAssetPath(`${assetName}.svg`);
  const source = readFileSync(sourcePath, 'utf8');
  const viewBox = source.match(/\bviewBox="([^"]+)"/u)?.[1];
  const content = source
    .replace(/^\s*<svg\b[^>]*>/u, '')
    .replace(/<\/svg>\s*$/u, '')
    .trim();
  if (!viewBox || !content) throw new Error(`地铁箭头图标“${assetName}”格式无效。`);
  const markup = { viewBox, content };
  metroArrowAssetMarkupCache.set(assetName, markup);
  return markup;
}

function namespaceMetroFacilityAssetMarkup(content: string, instanceId: string): string {
  const prefix = instanceId.replace(/[^a-zA-Z0-9_-]/gu, '-');
  const ids = Array.from(content.matchAll(/\bid="([^"]+)"/gu), (match) => match[1]!);
  return ids.reduce(
    (markup, id) =>
      markup
        .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
        .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
        .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`)
        .replaceAll(`xlink:href="#${id}"`, `xlink:href="#${prefix}-${id}"`),
    content,
  );
}

function resolveMaterialSymbolPath(fileName: string): string {
  const candidates = [
    resolve(process.cwd(), 'public', 'material-symbols', 'outlined', fileName),
    resolve(process.cwd(), 'apps', 'web', 'public', 'material-symbols', 'outlined', fileName),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`Material Symbols 图标文件 ${fileName} 不存在。`);
  }
  return sourcePath;
}

function resolveMetroFacilityAssetPath(variant: 'framed' | 'plain', fileName: string): string {
  const candidates = [
    resolve(process.cwd(), 'public', 'metro-facilities', variant, fileName),
    resolve(process.cwd(), 'apps', 'web', 'public', 'metro-facilities', variant, fileName),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`地铁设施图标文件 ${variant}/${fileName} 不存在。`);
  }
  return sourcePath;
}

function resolveMetroArrowAssetPath(fileName: string): string {
  const candidates = [
    resolve(process.cwd(), 'public', 'metro-arrows', fileName),
    resolve(process.cwd(), 'apps', 'web', 'public', 'metro-arrows', fileName),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) throw new Error(`地铁箭头图标文件 ${fileName} 不存在。`);
  return sourcePath;
}

function estimateTextWidth(value: string, fontSize: number): number {
  return (
    Array.from(value).reduce(
      (width, character) => width + metroCharacterWidthFactor(character),
      0,
    ) * fontSize
  );
}

function isBasicLatinCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint >= 0x20 && codePoint <= 0x7e;
}

function metroCharacterWidthFactor(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (/\s/u.test(character)) {
    return 0.34;
  }
  if (
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 1;
  }
  if (/[,.;:!?，。；：！？、]/u.test(character)) {
    return 0.38;
  }
  if (/[A-Z0-9]/u.test(character)) {
    return 0.62;
  }
  return 0.56;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => {
    const entityByCharacter: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entityByCharacter[character];
  });
}
