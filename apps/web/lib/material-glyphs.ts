import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as opentypeModule from 'opentype.js';
import type { Font } from 'opentype.js';
import type { MaterialGlyphConfig } from '@yct/contracts';
import {
  METRO_WAYFINDING_GAP,
  METRO_WAYFINDING_HEIGHT,
  METRO_WAYFINDING_PADDING,
  METRO_WAYFINDING_TEXT_HEIGHT,
  METRO_WAYFINDING_FOREGROUND,
  metroWayfindingIconOptions,
  normalizeColor,
  parseMetroWayfindingLayout,
  resolveMetroFacilityIconAssetName,
  resolveMetroWayfindingTextMetrics,
  type MetroFacilityIconAssetName,
  type MetroWayfindingElement,
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
const metroLargeTextFontSize = 78;
const metroLargeTextSuffixFontSize = 28;
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
    const width = Number(values['canvas.widthPx']) || config.layoutWidth;
    const height = Number(values['canvas.heightPx']) || METRO_WAYFINDING_HEIGHT;
    return renderMetroWayfinding(value, width, height);
  }
  return renderVerticalChillJinshuSong(value, config);
}

function renderMetroWayfinding(value: string, canvasWidth: number, canvasHeight: number): string {
  const layout = parseMetroWayfindingLayout(value);
  const scale = canvasHeight / METRO_WAYFINDING_HEIGHT;
  const width = canvasWidth / scale;
  const innerWidth = Math.max(0, width - METRO_WAYFINDING_PADDING * 2);
  const metrics = layout.elements.map((element) => getMetroElementMetric(element));
  const fixedWidth = metrics.reduce((sum, metric) => sum + metric.width, 0);
  const flexCount = layout.elements.filter(
    (element) => element.type === 'space' && element.mode === 'flex',
  ).length;
  const fixedGapWidth = Math.max(layout.elements.length - 1, 0) * METRO_WAYFINDING_GAP;
  const remainingWidth = Math.max(0, innerWidth - fixedWidth - fixedGapWidth);
  const flexWidth = flexCount ? remainingWidth / flexCount : 0;
  const totalWidth = fixedWidth + fixedGapWidth + flexWidth * flexCount;
  const layoutScale = totalWidth > innerWidth && totalWidth > 0 ? innerWidth / totalWidth : 1;
  let cursor = (width - totalWidth * layoutScale) / 2;
  const contentStart = cursor;
  const contentEnd = contentStart + totalWidth * layoutScale;
  const backgroundColor = normalizeColor(layout.backgroundColor, '#262626');
  const firstElementBackground = layout.elements[0]
    ? resolveMetroElementBackground(layout.elements[0], layout)
    : backgroundColor;
  const lastElement = layout.elements.at(-1);
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
  const children = layout.elements.map((element, index) => {
    const metric = metrics[index]!;
    const elementWidth =
      element.type === 'space' && element.mode === 'flex' ? flexWidth : metric.width;
    const output = renderMetroWayfindingElement(element, cursor, elementWidth, layout, layoutScale);
    const nextElement = layout.elements[index + 1];
    const gap = nextElement
      ? renderMetroWayfindingGap(
          element,
          nextElement,
          cursor + elementWidth * layoutScale,
          layout,
          layoutScale,
        )
      : '';
    cursor +=
      (elementWidth + (index < layout.elements.length - 1 ? METRO_WAYFINDING_GAP : 0)) *
      layoutScale;
    return `${output}${gap}`;
  });
  return `<g transform="scale(${formatNumber(scale)})" data-metro-wayfinding="true"><rect width="${formatNumber(width)}" height="128" fill="${backgroundColor}"/>${edgeBackgrounds}${children.join('')}</g>`;
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

function getMetroElementMetric(element: MetroWayfindingElement): { width: number } {
  if (element.type === 'icon' || element.type === 'divider') {
    return { width: element.type === 'divider' ? 8 : 85 };
  }
  if (element.type === 'largeText') {
    const suffixGap = element.suffix ? 3 : 0;
    const contentWidth =
      estimateTextWidth(element.value, metroLargeTextFontSize) +
      suffixGap +
      estimateTextWidth(element.suffix, metroLargeTextSuffixFontSize);
    return { width: Math.max(85, contentWidth + 8) };
  }
  if (element.type === 'space') {
    return {
      width: element.mode === 'fixed' ? Math.max(1, element.units) * METRO_WAYFINDING_GAP : 0,
    };
  }
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  const rowWidths = element.rows.map((row) =>
    row.kind === 'main'
      ? measureMetroMainSegments(row.segments, metrics.mainFontSize)
      : estimateTextWidth(row.value, metrics.secondaryFontSize),
  );
  return { width: Math.max(85, ...rowWidths) };
}

function renderMetroWayfindingElement(
  element: MetroWayfindingElement,
  x: number,
  width: number,
  layout: ReturnType<typeof parseMetroWayfindingLayout>,
  scale: number,
): string {
  const foreground = normalizeColor(
    element.foregroundColor,
    layout.foregroundColor || METRO_WAYFINDING_FOREGROUND,
  );
  const background = normalizeColor(element.backgroundColor, layout.backgroundColor);
  const transform = `translate(${formatNumber(x)} 0) scale(${formatNumber(scale)} ${formatNumber(scale)})`;
  if (element.type === 'space') {
    return `<rect x="${formatNumber(x)}" width="${formatNumber(width * scale)}" height="128" fill="${background}"/>`;
  }
  if (element.type === 'divider') {
    return `<g><rect x="${formatNumber(x)}" width="${formatNumber(8 * scale)}" height="128" fill="${background}"/><rect x="${formatNumber(x)}" y="28" width="${formatNumber(8 * scale)}" height="72" fill="${foreground}"/></g>`;
  }
  if (element.type === 'icon') {
    const icon =
      metroWayfindingIconOptions.find((option) => option.id === element.iconId) ??
      metroWayfindingIconOptions[0]!;
    return `<g transform="${transform}" data-material-symbol="${escapeXml(icon.symbol)}"><rect width="85" height="128" fill="${background}"/>${renderMetroIcon(icon.symbol, icon.id, foreground, element.id, element.direction, element.framed)}</g>`;
  }
  if (element.type === 'largeText') {
    const text = renderMetroLargeText(element.value, element.suffix, width, foreground);
    const frame = element.framed
      ? `<rect x="1.5" y="23" width="${formatNumber(width - 3)}" height="82" rx="8.5" fill="none" stroke="${foreground}" stroke-width="3"/>`
      : '';
    return `<g transform="${transform}"><rect width="${formatNumber(width)}" height="128" fill="${background}"/>${frame}${text}</g>`;
  }
  const textAlign =
    element.align === 'left' ? 'start' : element.align === 'right' ? 'end' : 'middle';
  const textX = element.align === 'left' ? 0 : element.align === 'right' ? width : width / 2;
  const rows = renderMetroTextRows(element, width, foreground, textX, textAlign);
  return `<g transform="${transform}"><rect width="${formatNumber(width)}" height="128" fill="${background}"/>${rows}</g>`;
}

function renderMetroTextRows(
  element: Extract<MetroWayfindingElement, { type: 'text' }>,
  width: number,
  color: string,
  textX: number,
  textAnchor: string,
): string {
  const metrics = resolveMetroWayfindingTextMetrics(element.rows);
  let rowTop = (METRO_WAYFINDING_HEIGHT - METRO_WAYFINDING_TEXT_HEIGHT) / 2 + metrics.spacing;
  return element.rows
    .map((row, index) => {
      const fontSize = row.kind === 'main' ? metrics.mainFontSize : metrics.secondaryFontSize;
      const baseline = rowTop + fontSize * 0.82;
      const output =
        row.kind === 'main'
          ? renderMetroMainSegments(
              row.segments,
              fontSize,
              width,
              color,
              textX,
              textAnchor,
              baseline,
            )
          : renderMetroText(row.value, fontSize, width, color, textAnchor, textX, baseline);
      rowTop += fontSize + (index < element.rows.length - 1 ? metrics.spacing : 0);
      return output;
    })
    .join('');
}

function renderMetroMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
  width: number,
  color: string,
  textX: number,
  textAnchor: string,
  baseline: number,
): string {
  const totalWidth = measureMetroMainSegments(segments, fontSize);
  const contentScale = totalWidth > width && totalWidth > 0 ? width / totalWidth : 1;
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
        cursor += diameter + trailingGap;
        return `<g transform="translate(${formatNumber(centerX)} ${formatNumber(baseline - fontSize * 0.32)})"><circle r="${formatNumber(diameter / 2)}" fill="${normalizeColor(segment.color, '#2F80ED')}"/><text y="${formatNumber(fontSize * 0.9 * 0.34)}" fill="#FFFFFF" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize * 0.9)}" font-weight="400" text-anchor="middle" letter-spacing="${formatNumber(fontSize * -0.07)}">${escapeXml(segment.value)}</text></g>`;
      }
      const output = `<text x="${formatNumber(cursor)}" y="${formatNumber(baseline)}" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="400">${escapeXml(segment.value)}</text>`;
      cursor += estimateTextWidth(segment.value, fontSize) + trailingGap;
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
): string {
  const textWidth = estimateTextWidth(value, fontSize);
  const scale = textWidth > width && textWidth > 0 ? width / textWidth : 1;
  return `<g transform="translate(${formatNumber(x)} 0) scale(${formatNumber(scale)} 1) translate(-${formatNumber(x)} 0)"><text x="${formatNumber(x)}" y="${formatNumber(y || fontSize)}" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${formatNumber(fontSize)}" font-weight="400" text-anchor="${textAnchor}">${escapeXml(value)}</text></g>`;
}

function renderMetroLargeText(value: string, suffix: string, width: number, color: string): string {
  const suffixGap = suffix ? 3 : 0;
  const mainWidth = estimateTextWidth(value, metroLargeTextFontSize);
  const suffixWidth = estimateTextWidth(suffix, metroLargeTextSuffixFontSize);
  const contentWidth = Math.max(mainWidth + suffixGap + suffixWidth, 1);
  const startX = (width - contentWidth) / 2;
  const suffixX = mainWidth + suffixGap;
  const suffixMarkup = suffix
    ? `<text x="${formatNumber(suffixX)}" y="99" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${metroLargeTextSuffixFontSize}" font-weight="700">${escapeXml(suffix)}</text>`
    : '';
  return `<g transform="translate(${formatNumber(startX)} 0)"><text x="0" y="96" fill="${color}" font-family="'HarmonyOS Sans SC', sans-serif" font-size="${metroLargeTextFontSize}" font-weight="400">${escapeXml(value)}</text>${suffixMarkup}</g>`;
}

function measureMetroMainSegments(
  segments: MetroWayfindingMainSegment[],
  fontSize: number,
): number {
  const contentWidth = segments.reduce(
    (width, segment) =>
      width +
      (segment.kind === 'line' ? fontSize * 1.12 : estimateTextWidth(segment.value, fontSize)),
    0,
  );
  return contentWidth + Math.max(segments.length - 1, 0) * fontSize * 0.12;
}

function renderMetroIcon(
  symbol: string,
  iconId: string,
  color: string,
  instanceId: string,
  direction?: 'left' | 'right' | 'up' | 'down',
  framed = false,
): string {
  const assetName = resolveMetroFacilityIconAssetName(iconId, direction);
  if (assetName) {
    return renderMetroFacilityAsset(
      assetName,
      framed ? 'framed' : 'plain',
      color,
      instanceId,
      resolveMetroFacilityAssetDirectionTransform(iconId, direction),
      framed ? 1 : 1.1,
    );
  }

  const frame = framed
    ? renderMetroFacilityAsset('frame', 'framed', color, `${instanceId}-frame`)
    : '';
  const { viewBox, content } = getMaterialSymbolMarkup(symbol);
  const transform = resolveMetroIconDirectionTransform(iconId, direction);
  const scaleTransform = resolveMetroIconScaleTransform(framed ? 0.9 : 1);
  return `${frame}<g transform="${transform}"><g transform="${scaleTransform}"><svg x="0" y="21.5" width="85" height="85" viewBox="${viewBox}" fill="${color}" aria-hidden="true">${content}</svg></g></g>`;
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

function resolveMetroIconScaleTransform(scale: number): string {
  return scale === 1 ? '' : `translate(42.5 64) scale(${scale}) translate(-42.5 -64)`;
}

function resolveMetroFacilityAssetDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): string {
  if (iconId === 'stairs' || iconId === 'stairs-down' || iconId === 'escalator') {
    return direction === 'left' ? 'translate(85 0) scale(-1 1)' : '';
  }
  if (iconId !== 'exit') {
    return '';
  }
  if (direction === 'left') return 'rotate(-90 42.5 64)';
  if (direction === 'up') return '';
  if (direction === 'down') return 'rotate(180 42.5 64)';
  return 'rotate(90 42.5 64)';
}

function resolveMetroIconDirectionTransform(
  iconId: string,
  direction: 'left' | 'right' | 'up' | 'down' | undefined,
): string {
  if (iconId === 'no-entry') {
    return 'rotate(-45 42.5 64)';
  }
  if (iconId === 'turn-left-up' || iconId === 'turn-left-down') {
    return 'rotate(-90 42.5 64)';
  }
  if (iconId === 'turn-right-up' || iconId === 'turn-right-down') {
    return 'rotate(90 42.5 64)';
  }
  if (!direction || !['stairs', 'escalator', 'exit'].includes(iconId)) {
    return '';
  }
  if (iconId !== 'exit') {
    return direction === 'left' ? 'translate(85 0) scale(-1 1)' : '';
  }
  if (direction === 'left') return 'translate(85 0) scale(-1 1)';
  if (direction === 'up') return 'rotate(-90 42.5 64)';
  if (direction === 'down') return 'rotate(90 42.5 64)';
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
  const dividerArrow =
    layout.rows.length === 2
      ? `<path d="M8 35L11.5 35L11.5 37L15 33L11.5 29L11.5 31L8 31L8 35Z" fill="${accentColor}"/>`
      : '';
  return `<g>${backgrounds}${columns}${dividerArrow}</g>`;
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
  const stations = payload.stations
    .map(([x, z, stationIndex]) => {
      const point = project([x, z]);
      const isCurrent = stationIndex === payload.currentStationIndex;
      return `<circle cx="${formatNumber(point[0])}" cy="${formatNumber(point[1])}" r="${isCurrent ? '2.4' : '1.35'}" fill="${isCurrent ? '#E28336' : '#FFFFFF'}" stroke="${isCurrent ? '#FFFFFF' : color}" stroke-width="${isCurrent ? '0.9' : '0.65'}"/>`;
    })
    .join('');
  return `<g><rect width="${formatNumber(config.layoutWidth)}" height="${formatNumber(config.layoutHeight)}" fill="#FFFFFF"/>${roads}<path d="${routePath}" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${routePath}" fill="none" stroke="${color}" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>${stations}</g>`;
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
  const currentStationIndex = candidate.currentStationIndex;
  if (!route || route.length < 2 || !roads || !stations || !Number.isInteger(currentStationIndex)) {
    throw new Error('线路地图数据缺少有效的线路或站点坐标。');
  }
  return { route, roads, stations, currentStationIndex: currentStationIndex as number };
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

function estimateTextWidth(value: string, fontSize: number): number {
  return (
    Array.from(value).reduce(
      (width, character) => width + metroCharacterWidthFactor(character),
      0,
    ) * fontSize
  );
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
