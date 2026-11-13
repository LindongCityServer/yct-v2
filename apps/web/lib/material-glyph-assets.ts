import type {
  MetroArrowIconAssetName,
  MetroFacilityIconAssetName,
} from './metro-wayfinding';
import type { MetroWayfindingSvgAssets, MetroWayfindingSvgMarkup } from './metro-wayfinding-svg';

/** 字形渲染可能用到的字体：服务端读本地字体文件，浏览器用浏览器字体度量。 */
export type MaterialGlyphFontKey = 'harmony-bold' | 'chill-jinshu-song';

export interface MaterialGlyphCharacterMetric {
  /** 单字前进宽度，单位为 em（除以字号即像素宽度）。 */
  advance: number;
  /** 字体是否包含该字符；浏览器无法判定时默认 true。 */
  supported: boolean;
}

/**
 * 材质字形渲染的素材与字体度量注入点。
 *
 * `material-glyphs.ts` 只保留纯几何计算，字体文件、图标 SVG 的读取由调用方注入：
 * 服务端从 `public` 读文件，浏览器用 Canvas 度量 + 预加载的图标片段，
 * 保证两边共用同一份排版逻辑。
 */
export interface MaterialGlyphAssets {
  getCharacterMetric(font: MaterialGlyphFontKey, character: string): MaterialGlyphCharacterMetric;
  /** 字体基线相对字号的比值（用于竖排怀旧字体逐字排版）。 */
  getBaselineRatio(font: MaterialGlyphFontKey): number;
  /** 把单个字符渲染成 path；仅竖排怀旧字体需要。 */
  getCharacterPath(
    font: MaterialGlyphFontKey,
    character: string,
    x: number,
    y: number,
    fontSize: number,
  ): string | undefined;
  getMaterialSymbolMarkup(symbol: string): MetroWayfindingSvgMarkup;
  getMetroFacilityAssetMarkup(
    assetName: MetroFacilityIconAssetName | 'frame',
    variant: 'framed' | 'plain',
  ): MetroWayfindingSvgMarkup;
  getMetroArrowAssetMarkup(assetName: MetroArrowIconAssetName): MetroWayfindingSvgMarkup;
  /** 导视牌同构渲染所需的图标素材集合。 */
  getMetroWayfindingAssets(): MetroWayfindingSvgAssets;
}
