import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type {
  MaterialCanvasConfig,
  MaterialTemplateField,
  MaterialTemplateVersion,
  MaterialTypographyProfile,
} from '@yct/contracts';

const prohibitedSourcePatterns = [
  /<!doctype/i,
  /<!entity/i,
  /<\/?(?:script|foreignobject|iframe|object|embed|image|use)\b/i,
  /\son[a-z]+\s*=/i,
  /(?:javascript|data|https?):/i,
  /@import\b/i,
  /url\s*\(/i,
];

export class MaterialTemplateSourceError extends Error {}
export class MaterialInputError extends Error {}

export function validateMaterialTemplateSource(source: string): void {
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
    if (
      !/^(?:[a-z][a-zA-Z0-9_]*|canvas\.(?:widthPx|heightPx|innerWidthPx|innerHeightPx|primaryFontPx|secondaryFontPx|captionFontPx|largeFontPx)|typography\.(?:primaryFontPx|secondaryFontPx|captionFontPx))$/.test(
        match[1],
      )
    ) {
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
    const value = rawInput[field.key]?.trim() ?? '';
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
  const contentWidthPx = Math.round(canvas.widthM * canvas.pxPerMeter);
  const contentHeightPx = Math.round(canvas.heightM * canvas.pxPerMeter);
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
  validateMaterialTemplateSource(input.template.source);
  const values = validateMaterialInput(input.template.fields, input.values);
  const size = resolveMaterialOutputSize(input.canvas);
  const typography = resolveTypography(
    input.template.typographyProfile,
    values,
    input.canvas,
    size,
  );
  const context = {
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
  const resolved = input.template.source.replace(/{{([^}]+)}}/g, (_match, key: string) =>
    escapeXml(context[key as keyof typeof context] ?? ''),
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
}): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  const rendered = renderMaterialTemplateToSvg(input);
  const png = await sharp(Buffer.from(rendered.svg, 'utf8')).png().toBuffer();
  return { png, widthPx: rendered.widthPx, heightPx: rendered.heightPx };
}

export function hashMaterialInput(input: Record<string, string>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
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
