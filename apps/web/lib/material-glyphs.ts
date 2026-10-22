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
  const maxTextWidth = columnWidth - 4;
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
 * 地铁横板线路图渲染器。
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
