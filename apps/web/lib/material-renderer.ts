import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type {
  MaterialCanvasConfig,
  MaterialTemplateField,
  MaterialTemplateVersion,
  MaterialTypographyProfile,
} from '@yct/contracts';
import { renderMaterialGlyph } from './material-glyphs';

const prohibitedSourcePatterns = [
  /<!doctype/i,
  /<!entity/i,
  /<\/?(?:script|foreignobject|iframe|object|embed|image|use)\b/i,
  /\son[a-z]+\s*=/i,
  /\b(?:xlink:)?href\s*=\s*["']\s*(?:javascript|data|https?:|\/\/)/i,
  /\bsrc\s*=\s*["']\s*(?:javascript|data|https?:|\/\/)/i,
  /@import\b/i,
  // 仅允许同一 SVG 文档中定义的裁剪、渐变等本地片段引用，例如 url(#clip)。
  /url\s*\(\s*(?:["']\s*)?(?!#)/i,
];

export class MaterialTemplateSourceError extends Error {}
export class MaterialInputError extends Error {}

export interface MaterialPreviewWatermark {
  traceLines: [string, string];
}

let materialWatermarkWordmarkMarkupCache:
  | { viewBox: string; content: string }
  | undefined;

export function validateMaterialTemplateSource(
  source: string,
  fields: MaterialTemplateField[] = [],
): void {
  const normalized = source.trim();
  if (!/^<svg\b[^>]*>/i.test(normalized) || !/<\/svg>\s*$/i.test(normalized)) {
    throw new MaterialTemplateSourceError('模板源码必须是完整的 SVG 文档。');
  }
  if (!/\bviewBox\s*=\s*["'][^"']+["']/i.test(normalized)) {
    throw new MaterialTemplateSourceError('模板 SVG 必须声明 viewBox。');
  }
  if (prohibitedSourcePatterns.some((pattern) => pattern.test(normalized))) {
    throw new MaterialTemplateSourceError('模板源码包含不允许的 SVG 功能或外部资源。');
  }
  for (const match of normalized.matchAll(/{{([^}]+)}}/g)) {
    if (!isAllowedTemplateVariable(match[1], fields)) {
      throw new MaterialTemplateSourceError(`模板变量 ${match[1]} 不符合要求。`);
    }
  }
}

export function validateMaterialInput(
  fields: MaterialTemplateField[],
  rawInput: Record<string, string>,
): Record<string, string> {
  const allowedKeys = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(rawInput)) {
    if (!allowedKeys.has(key)) {
      throw new MaterialInputError(`字段 ${key} 不属于当前模板。`);
    }
  }

  const input: Record<string, string> = {};
  for (const field of fields) {
    const value = rawInput[field.key]?.trim() || field.defaultValue?.trim() || '';
    if (field.required && !value) {
      throw new MaterialInputError(`${field.label}不能为空。`);
    }
    if (field.maxLength && value.length > field.maxLength) {
      throw new MaterialInputError(`${field.label}不能超过 ${field.maxLength} 个字符。`);
    }
    if (field.kind === 'select' && value && !field.options?.some((item) => item.value === value)) {
      throw new MaterialInputError(`${field.label}包含无效选项。`);
    }
    if (field.kind === 'number' && value) {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) {
        throw new MaterialInputError(`${field.label}必须是数字。`);
      }
      if (field.minimum !== undefined && numberValue < field.minimum) {
        throw new MaterialInputError(`${field.label}不能小于 ${field.minimum}。`);
      }
      if (field.maximum !== undefined && numberValue > field.maximum) {
        throw new MaterialInputError(`${field.label}不能大于 ${field.maximum}。`);
      }
    }
    if (field.kind === 'color' && value && !/^#[0-9A-Fa-f]{6}$/.test(value)) {
      throw new MaterialInputError(`${field.label}必须使用 #RRGGBB 格式。`);
    }
    input[field.key] = value;
  }
  return input;
}

export function resolveMaterialOutputSize(canvas: MaterialCanvasConfig): {
  contentWidthPx: number;
  contentHeightPx: number;
  widthPx: number;
  heightPx: number;
} {
  const contentWidthPx = Math.max(1, Math.round(canvas.widthM * canvas.pxPerMeter));
  const contentHeightPx = Math.max(1, Math.round(canvas.heightM * canvas.pxPerMeter));
  const widthPx = canvas.alignToTile
    ? alignToTile(contentWidthPx, canvas.tileSizePx)
    : contentWidthPx;
  const heightPx = canvas.alignToTile
    ? alignToTile(contentHeightPx, canvas.tileSizePx)
    : contentHeightPx;
  return { contentWidthPx, contentHeightPx, widthPx, heightPx };
}

export function renderMaterialTemplateToSvg(input: {
  template: MaterialTemplateVersion;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
}): { svg: string; widthPx: number; heightPx: number } {
  validateMaterialTemplateSource(input.template.source, input.template.fields);
  const values = validateMaterialInput(input.template.fields, input.values);
  const size = resolveMaterialOutputSize(input.canvas);
  const typography = resolveTypography(
    input.template.typographyProfile,
    values,
    input.canvas,
    size,
  );
  const context: Record<string, string> = {
    ...values,
    'canvas.widthPx': String(size.contentWidthPx),
    'canvas.heightPx': String(size.contentHeightPx),
    'canvas.innerWidthPx': String(Math.max(size.contentWidthPx - 16, 0)),
    'canvas.innerHeightPx': String(Math.max(size.contentHeightPx - 16, 0)),
    'canvas.primaryFontPx': String(Math.max(Math.round(size.contentHeightPx * 0.2), 14)),
    'canvas.secondaryFontPx': String(Math.max(Math.round(size.contentHeightPx * 0.1), 11)),
    'canvas.captionFontPx': String(Math.max(Math.round(size.contentHeightPx * 0.07), 10)),
    'canvas.largeFontPx': String(Math.max(Math.round(size.contentHeightPx * 0.28), 20)),
    'typography.primaryFontPx': String(typography.primaryFontPx),
    'typography.secondaryFontPx': String(typography.secondaryFontPx),
    'typography.captionFontPx': String(typography.captionFontPx),
  };
  const trustedContext = new Set<string>();
  for (const field of input.template.fields) {
    if (field.glyph) {
      const key = `glyph.${field.key}`;
      context[key] = renderMaterialGlyph(values[field.key], field.glyph, {
        ...values,
        'canvas.widthPx': String(size.contentWidthPx),
        'canvas.heightPx': String(size.contentHeightPx),
      });
      trustedContext.add(key);
    }
    if (!field.textFit) {
      if (field.kind === 'select' && field.selectVariableValues) {
        const selectedVariables = field.selectVariableValues[values[field.key]];
        for (const [variableName, variableValue] of Object.entries(selectedVariables ?? {})) {
          context[`select.${field.key}.${variableName}`] = variableValue;
        }
      }
      continue;
    }
    const fit = resolveTextFit(values[field.key], field.textFit, values);
    context[`fit.${field.key}.letterSpacing`] = formatSvgNumber(fit.letterSpacing);
    context[`fit.${field.key}.scaleX`] = formatSvgNumber(fit.scaleX);
  }
  const resolved = input.template.source.replace(/{{([^}]+)}}/g, (_match, key: string) =>
    trustedContext.has(key) ? (context[key] ?? '') : escapeXml(context[key] ?? ''),
  );
  const sourceOpenTag = resolved.match(/^<svg\b[^>]*>/i)?.[0];
  const sourceViewBox = sourceOpenTag?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!sourceViewBox) {
    throw new MaterialTemplateSourceError('模板 SVG 未能解析 viewBox。');
  }
  const children = resolved.replace(/^<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" viewBox="0 0 ${size.widthPx} ${size.heightPx}"><svg x="0" y="0" width="${size.contentWidthPx}" height="${size.contentHeightPx}" viewBox="${sourceViewBox}">${children}</svg></svg>`;
  return { svg, widthPx: size.widthPx, heightPx: size.heightPx };
}

export async function renderMaterialTemplateToPng(input: {
  template: MaterialTemplateVersion;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  watermark?: MaterialPreviewWatermark;
}): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  const rendered = renderMaterialTemplateToSvg(input);
  const svg = input.watermark
    ? appendMaterialPreviewWatermark(
        rendered.svg,
        rendered.widthPx,
        rendered.heightPx,
        input.watermark,
      )
    : rendered.svg;
  const png = new Resvg(svg, {
    font: {
      fontFiles: resolveMaterialFontFiles(),
      // HarmonyOS 字体随部署包显式提供；仅保留系统字体供模板明确指定的 Arial 使用。
      loadSystemFonts: true,
      defaultFontFamily: 'HarmonyOS Sans SC',
      sansSerifFamily: 'HarmonyOS Sans SC',
    },
  })
    .render()
    .asPng();
  return { png, widthPx: rendered.widthPx, heightPx: rendered.heightPx };
}

export function hashMaterialInput(input: Record<string, string>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function appendMaterialPreviewWatermark(
  svg: string,
  widthPx: number,
  heightPx: number,
  watermark: MaterialPreviewWatermark,
): string {
  const shorterSide = Math.min(widthPx, heightPx);
  const primaryFontSize = Math.max(10, Math.min(34, Math.round(shorterSide * 0.13)));
  const watermarkColor = '#777777';
  const watermarkOpacity = 1;
  const tileWidth = Math.max(96, Math.min(560, widthPx));
  const traceWidthUnits = Math.max(
    ...watermark.traceLines.map((line) => estimateTextWidth(line, 1)),
    1,
  );
  const traceFontSize = Math.max(
    3,
    Math.min(12, primaryFontSize * 0.72, (tileWidth * 0.44) / traceWidthUnits),
  );
  const traceLineHeight = traceFontSize * 1.38;
  const logoWidth = Math.max(48, Math.min(tileWidth * 0.24, 130));
  const logoHeight = logoWidth * (72 / 280);
  const rowHeight = Math.max(
    48,
    logoHeight + 16,
    primaryFontSize + 18,
    traceFontSize + traceLineHeight + 16,
  );
  const patternHeight = rowHeight * 2;
  const wordmark = getMaterialWatermarkWordmarkMarkup();
  const patternId = 'yct-material-preview-watermark-pattern';
  const renderPatternRow = (offsetX: number, centerY: number): string => {
    const logoCenterX = offsetX + tileWidth * 0.15;
    const traceCenterX = offsetX + tileWidth * 0.52;
    const previewCenterX = offsetX + tileWidth * 0.87;
    const traceFirstBaseline = centerY - traceLineHeight / 2 + traceFontSize * 0.34;
    return `<g><svg x="${formatSvgNumber(logoCenterX - logoWidth / 2)}" y="${formatSvgNumber(centerY - logoHeight / 2)}" width="${formatSvgNumber(logoWidth)}" height="${formatSvgNumber(logoHeight)}" viewBox="${wordmark.viewBox}" overflow="visible"><g color="${watermarkColor}" opacity="${formatSvgNumber(watermarkOpacity)}">${wordmark.content}</g></svg>${renderMaterialWatermarkTraceLines(watermark.traceLines, traceCenterX, traceFirstBaseline, traceFontSize, traceLineHeight, watermarkColor, watermarkOpacity)}<text x="${formatSvgNumber(previewCenterX)}" y="${formatSvgNumber(centerY + primaryFontSize * 0.34)}" font-family="'HarmonyOS Sans SC', sans-serif" text-anchor="middle" fill="${watermarkColor}" fill-opacity="${formatSvgNumber(watermarkOpacity)}" font-size="${formatSvgNumber(primaryFontSize)}" font-weight="700">仅供预览</text></g>`;
  };
  const firstRow = renderPatternRow(0, rowHeight / 2);
  const secondRow = renderPatternRow(tileWidth * 0.25, rowHeight * 1.5);
  const overlay = `<defs><pattern id="${patternId}" width="${formatSvgNumber(tileWidth)}" height="${formatSvgNumber(patternHeight)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">${firstRow}${secondRow}</pattern></defs><rect id="yct-material-preview-watermark" x="0" y="0" width="${formatSvgNumber(widthPx)}" height="${formatSvgNumber(heightPx)}" fill="url(#${patternId})" pointer-events="none"/>`;
  return svg.replace(/<\/svg>\s*$/i, `${overlay}</svg>`);
}

function renderMaterialWatermarkTraceLines(
  lines: readonly string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  color: string,
  opacity: number,
): string {
  return `<g font-family="'HarmonyOS Sans SC', sans-serif" text-anchor="middle" fill="${color}" fill-opacity="${formatSvgNumber(opacity)}" font-size="${formatSvgNumber(fontSize)}" font-weight="700">${lines.map((line, index) => `<text x="${formatSvgNumber(x)}" y="${formatSvgNumber(y + lineHeight * index)}">${escapeXml(line)}</text>`).join('')}</g>`;
}

function getMaterialWatermarkWordmarkMarkup(): { viewBox: string; content: string } {
  if (materialWatermarkWordmarkMarkupCache) return materialWatermarkWordmarkMarkupCache;
  const sourcePath = resolveMaterialPublicAssetPath('icons', 'yct-logo-wordmark.svg');
  const source = readFileSync(sourcePath, 'utf8');
  const viewBox = source.match(/\bviewBox="([^"]+)"/iu)?.[1];
  const rawContent = source
    .replace(/^\s*<svg\b[^>]*>/iu, '')
    .replace(/<\/svg>\s*$/iu, '')
    .trim();
  if (!viewBox || !rawContent) {
    throw new Error('雨城通 logo-wordmark 资源格式无效。');
  }
  const content = namespaceMaterialWatermarkMarkup(rawContent, 'yct-watermark-wordmark')
    .replace(/\bfill="(?!none)[^"]+"/giu, 'fill="currentColor"')
    .replace(/\bstop-color="[^"]+"/giu, 'stop-color="currentColor"');
  materialWatermarkWordmarkMarkupCache = { viewBox, content };
  return materialWatermarkWordmarkMarkupCache;
}

function namespaceMaterialWatermarkMarkup(content: string, prefix: string): string {
  const ids = Array.from(content.matchAll(/\bid="([^"]+)"/gu), (match) => match[1]!);
  return ids.reduce(
    (markup, id) =>
      markup
        .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
        .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
        .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`),
    content,
  );
}

function resolveMaterialPublicAssetPath(...relativePath: string[]): string {
  const candidates = [
    resolve(process.cwd(), 'public', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'public', ...relativePath),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`物料资源 ${relativePath.join('/')} 不存在。`);
  }
  return sourcePath;
}

function alignToTile(value: number, tileSizePx: number): number {
  return Math.ceil(value / tileSizePx) * tileSizePx;
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

function isAllowedTemplateVariable(variable: string, fields: MaterialTemplateField[]): boolean {
  if (
    /^(?:[a-z][a-zA-Z0-9_]*|canvas\.(?:widthPx|heightPx|innerWidthPx|innerHeightPx|primaryFontPx|secondaryFontPx|captionFontPx|largeFontPx)|typography\.(?:primaryFontPx|secondaryFontPx|captionFontPx))$/.test(
      variable,
    )
  ) {
    return true;
  }
  const fitMatch = variable.match(/^fit\.([a-z][a-zA-Z0-9_]*)\.(letterSpacing|scaleX)$/);
  if (fitMatch) {
    return fields.some((field) => field.key === fitMatch[1] && field.textFit);
  }
  const glyphMatch = variable.match(/^glyph\.([a-z][a-zA-Z0-9_]*)$/);
  if (glyphMatch) {
    return fields.some((field) => field.key === glyphMatch[1] && field.glyph);
  }
  const selectMatch = variable.match(/^select\.([a-z][a-zA-Z0-9_]*)\.([a-z][a-zA-Z0-9_]*)$/);
  return Boolean(
    selectMatch &&
    fields.some(
      (field) =>
        field.key === selectMatch[1] &&
        field.kind === 'select' &&
        Object.values(field.selectVariableValues ?? {}).every((variables) =>
          Object.hasOwn(variables, selectMatch[2]),
        ),
    ),
  );
}

function resolveTextFit(
  value: string,
  config: NonNullable<MaterialTemplateField['textFit']>,
  values: Record<string, string>,
): { letterSpacing: number; scaleX: number } {
  const defaultScaleX = config.defaultScaleX ?? 1;
  const additionalWidth = (config.additionalFields ?? []).reduce(
    (width, field) => width + estimateTextWidth(values[field.fieldKey] ?? '', field.fontSize),
    0,
  );
  const naturalWidth = estimateTextWidth(value, config.fontSize) + additionalWidth;
  const layoutWidth = config.maxWidth / defaultScaleX;
  if (naturalWidth <= layoutWidth) {
    const gapCount = Math.max(Array.from(value).length - 1, 0);
    const maxLetterSpacing = config.maxLetterSpacing ?? config.fontSize * 0.12;
    const letterSpacing = gapCount
      ? Math.min(maxLetterSpacing, Math.max(layoutWidth - naturalWidth, 0) / gapCount)
      : 0;
    return {
      letterSpacing,
      scaleX: defaultScaleX,
    };
  }
  return { letterSpacing: 0, scaleX: naturalWidth ? config.maxWidth / naturalWidth : 1 };
}

function resolveMaterialFontFiles(): string[] {
  return [
    resolveMaterialFontPath('HarmonyOS_Sans_SC_Regular.ttf'),
    resolveMaterialFontPath('HarmonyOS_Sans_SC_Bold.ttf'),
  ];
}

function resolveMaterialFontPath(fileName: string): string {
  const relativePath = ['harmonyos-sans', fileName];
  const candidates = [
    resolve(process.cwd(), 'public', 'fonts', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'public', 'fonts', ...relativePath),
    resolve(process.cwd(), 'app', 'fonts', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'app', 'fonts', ...relativePath),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`物料字体文件 ${fileName} 不存在。`);
  }
  return sourcePath;
}

function estimateTextWidth(value: string, fontSize: number): number {
  return (
    Array.from(value).reduce((width, character) => width + characterWidthFactor(character), 0) *
    fontSize
  );
}

function characterWidthFactor(character: string): number {
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

function formatSvgNumber(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}

function resolveTypography(
  profile: MaterialTypographyProfile | undefined,
  values: Record<string, string>,
  canvas: MaterialCanvasConfig,
  size: { contentHeightPx: number },
): { primaryFontPx: number; secondaryFontPx: number; captionFontPx: number } {
  const fallback = {
    primaryFontPx: Math.max(Math.round(size.contentHeightPx * 0.2), 14),
    secondaryFontPx: Math.max(Math.round(size.contentHeightPx * 0.1), 11),
    captionFontPx: Math.max(Math.round(size.contentHeightPx * 0.07), 10),
  };
  if (!profile) {
    return fallback;
  }
  const designSpeed = Number(values[profile.designSpeedFieldKey]);
  if (!Number.isFinite(designSpeed)) {
    throw new MaterialInputError('设计时速必须是数字。');
  }
  const matchingRules = profile.rules.filter(
    (item) => designSpeed >= item.minDesignSpeedKph && designSpeed <= item.maxDesignSpeedKph,
  );
  if (matchingRules.length !== 1) {
    throw new MaterialInputError('当前设计时速不在模板配置的字高范围内。');
  }
  const rule = matchingRules[0];
  const toPixels = (heightMm: number | undefined, fallbackPx: number) =>
    heightMm === undefined
      ? fallbackPx
      : Math.max(Math.round((heightMm / 1000) * canvas.pxPerMeter), 1);
  return {
    primaryFontPx: toPixels(rule.primaryTextHeightMm, fallback.primaryFontPx),
    secondaryFontPx: toPixels(rule.secondaryTextHeightMm, fallback.secondaryFontPx),
    captionFontPx: toPixels(rule.captionTextHeightMm, fallback.captionFontPx),
  };
}
