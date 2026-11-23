import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderAsync } from '@resvg/resvg-js';
import type { MaterialCanvasConfig, MaterialTemplateVersion } from '@yct/contracts';
import { createServerMaterialGlyphAssets } from './material-glyph-server-assets';
import { composeMaterialTemplateSvg, type MaterialInputValidationOptions } from './material-svg';

export {
  MaterialInputError,
  MaterialTemplateSourceError,
  isMaterialFieldEditableInServerMode,
  resolveMaterialOutputSize,
  validateMaterialInput,
  validateMaterialTemplateSource,
} from './material-svg';
export type { MaterialInputValidationOptions } from './material-svg';

export interface MaterialPreviewWatermark {
  traceLines: [string, string];
  opacity?: number;
}

let materialWatermarkWordmarkImageCache:
  { dataUri: string; width: number; height: number } | undefined;

let serverGlyphAssets: ReturnType<typeof createServerMaterialGlyphAssets> | undefined;

export function renderMaterialTemplateToSvg(input: {
  template: MaterialTemplateVersion;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  /** 渲染前复核字段时使用的校验口径，默认严格（必填空值直接报错）。 */
  validation?: MaterialInputValidationOptions;
}): { svg: string; widthPx: number; heightPx: number; renderScale: number } {
  serverGlyphAssets ??= createServerMaterialGlyphAssets();
  // 该 SVG 只用于 resvg 光栅化：字距锚点按 resvg 口径输出，和浏览器预览视觉一致。
  return composeMaterialTemplateSvg({ ...input, assets: serverGlyphAssets, rasterize: true });
}

export async function renderMaterialTemplateToPng(input: {
  template: MaterialTemplateVersion;
  values: Record<string, string>;
  canvas: MaterialCanvasConfig;
  watermark?: MaterialPreviewWatermark;
  /** 同 `renderMaterialTemplateToSvg`，透传给渲染前的字段复核。 */
  validation?: MaterialInputValidationOptions;
  /** 中止信号：机器人断开或服务端超时时尽快停止等待。 */
  signal?: AbortSignal;
}): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  const rendered = renderMaterialTemplateToSvg(input);
  const svg = input.watermark
    ? appendMaterialPreviewWatermark(
        rendered.svg,
        rendered.widthPx,
        rendered.heightPx,
        input.watermark,
        rendered.renderScale,
      )
    : rendered.svg;
  const fallbackFontFiles = resolveMaterialFallbackFontFiles();
  // 用 renderAsync 而不是同步 render：同步渲染会阻塞 Node 事件循环，
  // 一个复杂线路图就能把整个 Web 进程卡住几十秒。
  const image = await renderAsync(
    svg,
    {
      font: {
        fontFiles: [...resolveMaterialFontFiles(), ...fallbackFontFiles],
        // 模板里的 Arial 单独加载，避免 resvg 每次扫描整个系统字体目录
        // （Windows 上实测每次多花 0.5–1 秒，是出图超时的主要固定成本之一）。
        loadSystemFonts: fallbackFontFiles.length === 0,
        defaultFontFamily: 'HarmonyOS Sans SC',
        sansSerifFamily: 'HarmonyOS Sans SC',
      },
    },
    input.signal ?? null,
  );
  return { png: image.asPng(), widthPx: rendered.widthPx, heightPx: rendered.heightPx };
}

export function hashMaterialInput(input: Record<string, string>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function appendMaterialPreviewWatermark(
  svg: string,
  widthPx: number,
  heightPx: number,
  watermark: MaterialPreviewWatermark,
  renderScale = 1,
): string {
  const scale = Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  const layoutWidthPx = widthPx / scale;
  const layoutHeightPx = heightPx / scale;
  const shorterSide = Math.min(layoutWidthPx, layoutHeightPx);
  const primaryFontSize = Math.max(10, Math.min(34, Math.round(shorterSide * 0.13)));
  const watermarkColor = '#777777';
  const watermarkOpacity = clampWatermarkOpacity(watermark.opacity ?? 0.62);
  const layoutReferenceWidth = Math.max(200, Math.min(520, layoutWidthPx * 0.92));
  const traceWidthUnits = Math.max(
    ...watermark.traceLines.map((line) => estimateTextWidth(line, 1)),
    1,
  );
  const traceFontSize = Math.max(
    3,
    Math.min(12, primaryFontSize * 0.72, (layoutReferenceWidth * 0.38) / traceWidthUnits),
  );
  const traceLineHeight = traceFontSize * 1.38;
  const wordmark = getMaterialWatermarkWordmarkImage();
  const logoWidth = Math.max(48, Math.min(layoutReferenceWidth * 0.22, 130));
  const logoHeight = logoWidth * (wordmark.height / wordmark.width);
  const traceBlockWidth = traceWidthUnits * traceFontSize * 1.05;
  const previewBlockWidth = estimateTextWidth('仅供预览', primaryFontSize) * 1.05;
  const blockGap = Math.max(64, primaryFontSize * 2.75);
  const sidePadding = blockGap / 2;
  const compositionWidth =
    logoWidth + traceBlockWidth + previewBlockWidth + blockGap * 2 + sidePadding * 2;
  const rowHeight = Math.max(
    48,
    logoHeight + 16,
    primaryFontSize + 18,
    traceFontSize + traceLineHeight + 16,
  );
  const patternHeight = rowHeight * 2;
  const patternId = 'yct-material-preview-watermark-pattern';
  const renderWatermarkRow = (centerX: number, centerY: number): string => {
    const contentStartX = centerX - compositionWidth / 2 + sidePadding;
    const logoCenterX = contentStartX + logoWidth / 2;
    const traceCenterX = contentStartX + logoWidth + blockGap + traceBlockWidth / 2;
    const previewCenterX =
      contentStartX + logoWidth + blockGap + traceBlockWidth + blockGap + previewBlockWidth / 2;
    const traceFirstBaseline = centerY - traceLineHeight / 2 + traceFontSize * 0.34;
    return `<g><image x="${formatSvgNumber(logoCenterX - logoWidth / 2)}" y="${formatSvgNumber(centerY - logoHeight / 2)}" width="${formatSvgNumber(logoWidth)}" height="${formatSvgNumber(logoHeight)}" href="${wordmark.dataUri}" opacity="${formatSvgNumber(watermarkOpacity)}" preserveAspectRatio="xMidYMid meet"/>${renderMaterialWatermarkTraceLines(watermark.traceLines, traceCenterX, traceFirstBaseline, traceFontSize, traceLineHeight, watermarkColor, watermarkOpacity)}<text x="${formatSvgNumber(previewCenterX)}" y="${formatSvgNumber(centerY + primaryFontSize * 0.34)}" font-family="'HarmonyOS Sans SC', sans-serif" text-anchor="middle" fill="${watermarkColor}" fill-opacity="${formatSvgNumber(watermarkOpacity)}" font-size="${formatSvgNumber(primaryFontSize)}" font-weight="700">仅供预览</text></g>`;
  };
  const firstRow = renderWatermarkRow(compositionWidth / 2, rowHeight / 2);
  const secondRowLeft = renderWatermarkRow(0, rowHeight * 1.5);
  const secondRowRight = renderWatermarkRow(compositionWidth, rowHeight * 1.5);
  const overlay = `<g transform="scale(${formatSvgNumber(scale)})"><defs><pattern id="${patternId}" width="${formatSvgNumber(compositionWidth)}" height="${formatSvgNumber(patternHeight)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">${firstRow}${secondRowLeft}${secondRowRight}</pattern></defs><rect id="yct-material-preview-watermark" x="0" y="0" width="${formatSvgNumber(layoutWidthPx)}" height="${formatSvgNumber(layoutHeightPx)}" fill="url(#${patternId})" pointer-events="none"/></g>`;
  return svg.replace(/<\/svg>\s*$/i, `${overlay}</svg>`);
}

function clampWatermarkOpacity(value: number): number {
  return Math.max(0.05, Math.min(0.62, Number.isFinite(value) ? value : 0.62));
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

function getMaterialWatermarkWordmarkImage(): {
  dataUri: string;
  width: number;
  height: number;
} {
  if (materialWatermarkWordmarkImageCache) return materialWatermarkWordmarkImageCache;
  const sourcePath = resolveMaterialPublicAssetPath(
    'material-templates',
    'preview-watermark-wordmark.png',
  );
  const png = readFileSync(sourcePath);
  materialWatermarkWordmarkImageCache = {
    dataUri: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
    width: 1794,
    height: 428,
  };
  return materialWatermarkWordmarkImageCache;
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

function resolveMaterialFontFiles(): string[] {
  return [
    resolveMaterialFontPath('HarmonyOS_Sans_SC_Regular.ttf'),
    resolveMaterialFontPath('HarmonyOS_Sans_SC_Bold.ttf'),
  ];
}

/**
 * 模板里大量拉丁字母和数字写死了 Arial；把这些字体文件单独交给 resvg，
 * 就不必再 `loadSystemFonts` 扫描整个系统字体目录。
 * 找不到 Arial（非 Windows 部署）时返回空数组，调用方退回扫描系统字体。
 */
function resolveMaterialFallbackFontFiles(): string[] {
  const candidates =
    process.platform === 'win32'
      ? ['arial.ttf', 'arialbd.ttf'].map((fileName) =>
          resolve(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', fileName),
        )
      : process.platform === 'darwin'
        ? [
            '/System/Library/Fonts/Supplemental/Arial.ttf',
            '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
          ]
        : [];
  return candidates.filter((candidate) => existsSync(candidate));
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

function formatSvgNumber(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}
