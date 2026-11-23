import type {
  MaterialCanvasConfig,
  MaterialTemplateField,
  MaterialTemplateVersion,
  MaterialTypographyProfile,
} from '@yct/contracts';
import { renderMaterialGlyph } from './material-glyphs';
import type { MaterialGlyphAssets } from './material-glyph-assets';

/**
 * 物料模板的同构 SVG 合成核心。
 *
 * 这里不引用任何 Node 内置模块：服务端导出与浏览器实时预览都走同一份实现，
 * 字体与图标素材由 `MaterialGlyphAssets` 注入。唯一的渲染器差异是 `letter-spacing`
 * 的末尾字距锚点（浏览器计入、resvg 不计入），由 `resolveLetterSpacingAnchors`
 * 按 `rasterize` 目标补偿，保证两端视觉一致。
 */

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

/** 公交站牌概览里未填线路编号的槽位：与站牌底色一致的橙色填充 + 细黑描边占位框。 */
const routeSlotPlaceholderColor = '#E28336';

/** 字段级渲染错误：工作台预览允许带错渲染时，用它告诉画布该高亮哪块区域。 */
export interface MaterialRenderFieldError {
  fieldKey: string;
  label: string;
  message: string;
}

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
      throw new MaterialTemplateSourceError(
        `模板变量 {{${match[1]}}} 不可用，请改用已登记的数据字段。`,
      );
    }
  }
}

/**
 * 「数据来源」模式下哪些字段允许用户自行填写：`material-studio-panel` 只为
 * `serverOverride && userEditable !== false` 的字段渲染输入框（`serverOverrideFields`），
 * 其余字段的值全部由数据来源派生。
 */
export function isMaterialFieldEditableInServerMode(field: MaterialTemplateField): boolean {
  return field.serverOverride === true && field.userEditable !== false;
}

export interface MaterialInputValidationOptions {
  /**
   * 「数据来源」模式下放宽必填校验：**用户填不了**的字段（见
   * `isMaterialFieldEditableInServerMode`）在来源数据缺失时允许为空。
   */
  allowMissingServerDerivedValues?: boolean;
  /**
   * 工作台实时预览放宽必填校验：缺内容的字段按空值渲染，
   * 让画布保持可预览并把问题留给字段面板提示；导出仍走严格校验。
   */
  allowMissingRequiredValues?: boolean;
}

export function validateMaterialInput(
  fields: MaterialTemplateField[],
  rawInput: Record<string, string>,
  options?: MaterialInputValidationOptions,
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
    const allowMissing =
      options?.allowMissingServerDerivedValues === true &&
      !isMaterialFieldEditableInServerMode(field);
    if (field.required && !value && !allowMissing && !options?.allowMissingRequiredValues) {
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

export function composeMaterialTemplateSvg(input: {
  template: Pick<MaterialTemplateVersion, 'source' | 'fields' | 'typographyProfile'>;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  assets: MaterialGlyphAssets;
  /** 渲染前复核字段时使用的校验口径，默认严格（必填空值直接报错）。 */
  validation?: MaterialInputValidationOptions;
  /**
   * 字段级容错：某个字形渲染失败时保留版面并画出错误占位，而不是放弃整张预览。
   * 导出仍保持严格（不开此开关）。
   */
  tolerateFieldErrors?: boolean;
  /**
   * 输出是否交给 resvg 光栅化。浏览器与 resvg 对 `letter-spacing` 末尾间距的
   * 锚点算法不同，见 `resolveLetterSpacingAnchors`；默认按浏览器预览口径输出。
   */
  rasterize?: boolean;
}): {
  svg: string;
  widthPx: number;
  heightPx: number;
  renderScale: number;
  errors: MaterialRenderFieldError[];
} {
  if (!(input.canvas.widthM > 0)) {
    throw new MaterialInputError('画布宽度必须大于 0。');
  }
  if (!(input.canvas.heightM > 0)) {
    throw new MaterialInputError('画布高度必须大于 0。');
  }
  validateMaterialTemplateSource(input.template.source, input.template.fields);
  const values = validateMaterialInput(input.template.fields, input.values, input.validation);
  const size = resolveMaterialOutputSize(input.canvas);
  if (Math.max(size.widthPx, size.heightPx) > 4096) {
    throw new MaterialInputError(
      `画布最长边不能超过 4096 像素（当前 ${Math.max(size.widthPx, size.heightPx)} 像素），请降低每米像素数或缩小画布。`,
    );
  }
  const logicalWidthPx = Math.max(1, Math.round(input.canvas.widthM * 128));
  const logicalHeightPx = Math.max(1, Math.round(input.canvas.heightM * 128));
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
    // 设计坐标：与像素密度解耦，对齐单位（PPI）变化时整体等比缩放。
    'canvas.logicalWidthPx': String(logicalWidthPx),
    'canvas.logicalHeightPx': String(logicalHeightPx),
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
  // 公交站牌：板面上所有已填线路都开启临时停靠时，站名同步变红。
  const temporaryStopAll = resolveMaterialTemporaryStopAll(values);
  context['temporaryStopAll.stationNameFill'] = temporaryStopAll ? '#C11111' : '#073764';
  context['temporaryStopAll.stationNamePinyinFill'] = temporaryStopAll ? '#C11111' : '#073764';
  // 公交站牌概览：空槽位（未填线路编号）用橙底黑框占位，填了编号才显示线路配色。
  for (let slot = 1; slot <= 6; slot += 1) {
    const filled = Boolean((values[`route${slot}Number`] ?? '').trim());
    // 拟真版的临时停靠高亮块：既要求有编号，又要求处于临时停靠状态。
    const temporaryField = input.template.fields.find(
      (field) => field.key === `route${slot}TemporaryStop`,
    );
    const temporaryVariables =
      temporaryField?.selectVariableValues?.[values[`route${slot}TemporaryStop`] ?? ''] ?? {};
    context[`routeSlot.${slot}.opacity`] = '1';
    context[`routeSlot.${slot}.fill`] = filled
      ? (temporaryVariables.background ?? '#000099')
      : routeSlotPlaceholderColor;
    context[`routeSlot.${slot}.blockFill`] = filled
      ? (temporaryVariables.background ?? '#FFFFFF')
      : routeSlotPlaceholderColor;
    context[`routeSlot.${slot}.stroke`] = filled ? 'none' : '#000000';
    context[`routeSlot.${slot}.strokeWidth`] = filled ? '0' : '0.75';
    context[`routeSlot.${slot}.blockOpacity`] = filled
      ? (temporaryVariables.blockOpacity ?? '1')
      : '1';
  }
  const trustedContext = new Set<string>();
  const fieldErrors: MaterialRenderFieldError[] = [];
  for (const field of input.template.fields) {
    if (field.glyph) {
      const key = `glyph.${field.key}`;
      try {
        context[key] = renderMaterialGlyph(
          values[field.key],
          field.glyph,
          {
            ...values,
            'canvas.widthPx': String(size.contentWidthPx),
            'canvas.heightPx': String(size.contentHeightPx),
            'canvas.logicalWidthPx': String(logicalWidthPx),
            'canvas.logicalHeightPx': String(logicalHeightPx),
          },
          input.assets,
        );
      } catch (error) {
        if (!input.tolerateFieldErrors) {
          throw error;
        }
        const message = error instanceof Error ? error.message : '渲染失败。';
        fieldErrors.push({ fieldKey: field.key, label: field.label, message });
        context[key] = renderMaterialFieldErrorPlaceholder(field, message);
      }
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
  const resolved = markTemplateSpacingTexts(input.template.source).replace(
    /{{([^}]+)}}/g,
    (_match, key: string) => (trustedContext.has(key) ? (context[key] ?? '') : escapeXml(context[key] ?? '')),
  );
  const sourceOpenTag = resolved.match(/^<svg\b[^>]*>/i)?.[0];
  const sourceViewBox = sourceOpenTag?.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!sourceViewBox) {
    throw new MaterialTemplateSourceError('模板 SVG 未能解析 viewBox。');
  }
  const children = resolveLetterSpacingAnchors(
    resolved.replace(/^<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, ''),
    input.rasterize === true,
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.widthPx}" height="${size.heightPx}" viewBox="0 0 ${size.widthPx} ${size.heightPx}"><svg x="0" y="0" width="${size.contentWidthPx}" height="${size.contentHeightPx}" viewBox="${sourceViewBox}">${children}</svg></svg>`;
  return {
    svg,
    widthPx: size.widthPx,
    heightPx: size.heightPx,
    renderScale: size.contentWidthPx / logicalWidthPx,
    errors: fieldErrors,
  };
}

/** 字形渲染失败时在版面原位置画出的错误占位，尺寸取该字形的版位。 */
function renderMaterialFieldErrorPlaceholder(
  field: MaterialTemplateField,
  message: string,
): string {
  const width = Math.max(field.glyph?.layoutWidth ?? 64, 8);
  const height = Math.max(field.glyph?.layoutHeight ?? 32, 8);
  const titleSize = Math.max(Math.min(height * 0.09, width * 0.14, 4), 1.8);
  const captionSize = titleSize * 0.62;
  const truncate = (value: string, maximum: number) =>
    value.length > maximum ? `${value.slice(0, maximum)}…` : value;
  return `<svg x="0" y="0" width="${formatSvgNumber(width)}" height="${formatSvgNumber(height)}" viewBox="0 0 ${formatSvgNumber(width)} ${formatSvgNumber(height)}" overflow="hidden"><rect x="0.4" y="0.4" width="${formatSvgNumber(width - 0.8)}" height="${formatSvgNumber(height - 0.8)}" fill="#FDECEC" stroke="#D64545" stroke-width="0.6" stroke-dasharray="2 1.2"/><text x="${formatSvgNumber(width / 2)}" y="${formatSvgNumber(height / 2 - titleSize * 0.4)}" fill="#B3261E" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="${formatSvgNumber(titleSize)}" font-weight="600" text-anchor="middle">${escapeXml(truncate(field.label, 10))}渲染失败</text><text x="${formatSvgNumber(width / 2)}" y="${formatSvgNumber(height / 2 + titleSize * 0.9)}" fill="#B3261E" font-family="'HarmonyOS Sans SC', Arial, Helvetica, sans-serif" font-size="${formatSvgNumber(captionSize)}" text-anchor="middle">${escapeXml(truncate(message, 18))}</text></svg>`;
}

export function alignToTile(value: number, tileSizePx: number): number {
  return Math.ceil(value / tileSizePx) * tileSizePx;
}

export function escapeXml(value: string): string {
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

/** 模板里的 `<text>` 标记：浏览器需要补尾部字距，resvg 不需要。 */
const templateSpacingMarker = 'data-yct-spacing="template"';
/** 字形渲染器（如 `renderMetroSignText`）已经按浏览器口径补过半个字距的标记。 */
const glyphSpacingMarker = 'data-yct-spacing="glyph-middle"';

/** 只给模板自身的 `<text>` 打标记；字形插件生成的文本不参与尾部间距补偿。 */
function markTemplateSpacingTexts(source: string): string {
  return source.replace(
    /<text\b([^>]*\bletter-spacing="[^"]+"[^>]*)>/g,
    `<text$1 ${templateSpacingMarker}>`,
  );
}

/**
 * 统一处理 `letter-spacing` 与 `text-anchor` 的末尾间距差异。
 *
 * SVG/CSS 的 `letter-spacing` 会在最后一个字之后也加一段间距：
 * - 浏览器把它算进 `text-anchor` 的排版宽度，中锚文字整体左偏半个字距；
 * - resvg（导出 PNG 用）只在字与字之间加间距，中锚文字按实际字宽居中。
 *
 * 因此浏览器预览给模板文字补 `dx`，光栅化时不补；字形渲染器内部已按浏览器
 * 口径预补偿的文本，则在光栅化时把这段补偿扣回去。两种产物最终落在同一视觉中心，
 * 不会出现「预览居中、导出顶到边框」的分叉。
 */
function resolveLetterSpacingAnchors(children: string, rasterize: boolean): string {
  return children.replace(/<text\b[^>]*\bletter-spacing="[^"]+"[^>]*>/g, (tag) => {
    const spacing = Number(tag.match(/\bletter-spacing="([^"]+)"/u)?.[1]);
    const isTemplate = tag.includes(templateSpacingMarker);
    const isGlyphMiddle = tag.includes(glyphSpacingMarker);
    const cleaned = tag
      .replace(new RegExp(`\\s${templateSpacingMarker}`, 'u'), '')
      .replace(new RegExp(`\\s${glyphSpacingMarker}`, 'u'), '');
    if (!Number.isFinite(spacing) || spacing === 0) {
      return cleaned;
    }
    if (rasterize) {
      return isGlyphMiddle ? shiftTextX(cleaned, -spacing / 2) : cleaned;
    }
    const anchor = tag.match(/\btext-anchor="(middle|end)"/u)?.[1];
    if (!isTemplate || !anchor) {
      return cleaned;
    }
    const offset = anchor === 'middle' ? spacing / 2 : spacing;
    if (/\bdx="/u.test(cleaned)) {
      return cleaned;
    }
    return cleaned.replace(/<text\b/u, `<text dx="${formatSvgNumber(offset)}"`);
  });
}

/** 改写 `<text>` 的 x 坐标；没有 x 时补一个。 */
function shiftTextX(tag: string, delta: number): string {
  const match = tag.match(/\bx="([^"]+)"/u);
  if (!match) {
    return tag.replace(/<text\b/u, `<text x="${formatSvgNumber(delta)}"`);
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return tag;
  }
  return tag.replace(match[0], `x="${formatSvgNumber(value + delta)}"`);
}

/** 判断板面上所有已填线路是否都开启了临时停靠。 */
function resolveMaterialTemporaryStopAll(values: Record<string, string>): boolean {
  let activeCount = 0;
  let allTemporary = true;
  for (const [key, value] of Object.entries(values)) {
    const match = key.match(/^route(\d+)Number$/u);
    if (!match || !value.trim()) {
      continue;
    }
    activeCount += 1;
    if (!isTemporaryStopValue(values[`route${match[1]}TemporaryStop`])) {
      allTemporary = false;
    }
  }
  if (values.routeNumber?.trim()) {
    activeCount += 1;
    if (!isTemporaryStopValue(values.routeTemporaryStop)) {
      allTemporary = false;
    }
  }
  return activeCount > 0 && allTemporary;
}

function isTemporaryStopValue(value: string | undefined): boolean {
  return ['yes', 'true', '1'].includes((value ?? '').trim().toLowerCase());
}

function isAllowedTemplateVariable(variable: string, fields: MaterialTemplateField[]): boolean {
  if (
    /^(?:[a-z][a-zA-Z0-9_]*|canvas\.(?:widthPx|heightPx|logicalWidthPx|logicalHeightPx|innerWidthPx|innerHeightPx|primaryFontPx|secondaryFontPx|captionFontPx|largeFontPx)|typography\.(?:primaryFontPx|secondaryFontPx|captionFontPx))$/.test(
      variable,
    )
  ) {
    return true;
  }
  if (/^temporaryStopAll\.(?:stationNameFill|stationNamePinyinFill)$/.test(variable)) {
    return true;
  }
  if (
    /^routeSlot\.[1-6]\.(?:opacity|blockOpacity|fill|blockFill|stroke|strokeWidth)$/.test(variable)
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

export function formatSvgNumber(value: number): string {
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
