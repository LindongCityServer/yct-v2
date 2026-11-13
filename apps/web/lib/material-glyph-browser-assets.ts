import type {
  MetroArrowIconAssetName,
  MetroFacilityIconAssetName,
} from './metro-wayfinding';
import type { MetroWayfindingSvgAssets, MetroWayfindingSvgMarkup } from './metro-wayfinding-svg';
import type { MaterialGlyphAssets } from './material-glyph-assets';

let measureContext: CanvasRenderingContext2D | null | undefined;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureContext !== undefined) {
    return measureContext;
  }
  if (typeof document === 'undefined') {
    measureContext = null;
    return measureContext;
  }
  const canvas = document.createElement('canvas');
  measureContext = canvas.getContext('2d');
  return measureContext;
}

/**
 * 浏览器字形素材：
 * - 字体度量用 Canvas 读取 `HarmonyOS Sans SC`（`globals.css` 已声明 @font-face），
 *   与服务端 OpenType 的 advanceWidth 口径一致；
 * - 怀旧楼牌字体只在路牌模板使用，本工作台不涉及，直接按“不支持”返回；
 * - 导视牌图标素材只由导视牌画布自己渲染，这里不做兜底。
 */
export function createBrowserMaterialGlyphAssets(): MaterialGlyphAssets {
  return {
    getCharacterMetric(fontKey, character) {
      if (fontKey === 'chill-jinshu-song') {
        // 怀旧楼牌字体：浏览器用 @font-face 声明的同名系统字体度量，
        // 字形路径由 <text> 直接渲染（getCharacterPath 返回 undefined 时走回退文本）。
        const context = getMeasureContext();
        if (!context) {
          return { advance: 1, supported: true };
        }
        context.font = '100px "YctChillJinshuSong", "HarmonyOS Sans SC", serif';
        const width = context.measureText(character).width;
        return { advance: width > 0 ? width / 100 : 1, supported: true };
      }
      if (fontKey !== 'harmony-bold') {
        return { advance: 1, supported: false };
      }
      const context = getMeasureContext();
      if (!context) {
        return { advance: fallbackCharacterWidthFactor(character), supported: true };
      }
      context.font = '700 100px "HarmonyOS Sans SC", Arial, sans-serif';
      const width = context.measureText(character).width;
      return {
        advance: width > 0 ? width / 100 : fallbackCharacterWidthFactor(character),
        supported: true,
      };
    },
    getBaselineRatio() {
      return 0.88;
    },
    getCharacterPath() {
      return undefined;
    },
    getMaterialSymbolMarkup(symbol) {
      throw new Error(`浏览器预览暂不支持 Material Symbols 图标“${symbol}”。`);
    },
    getMetroFacilityAssetMarkup(assetName: MetroFacilityIconAssetName | 'frame') {
      throw new Error(`浏览器预览暂不支持地铁设施图标“${assetName}”。`);
    },
    getMetroArrowAssetMarkup(assetName: MetroArrowIconAssetName) {
      throw new Error(`浏览器预览暂不支持地铁箭头图标“${assetName}”。`);
    },
    getMetroWayfindingAssets(): MetroWayfindingSvgAssets {
      return {
        getMaterialSymbolMarkup: (_symbol: string): MetroWayfindingSvgMarkup => {
          throw new Error('导视牌画布使用独立渲染器。');
        },
        getMetroFacilityAssetMarkup: (): MetroWayfindingSvgMarkup => {
          throw new Error('导视牌画布使用独立渲染器。');
        },
        getMetroArrowAssetMarkup: (): MetroWayfindingSvgMarkup => {
          throw new Error('导视牌画布使用独立渲染器。');
        },
      };
    },
  };
}

/** Canvas 不可用（SSR）时的近似宽度系数，与服务端排版估算保持一致。 */
function fallbackCharacterWidthFactor(character: string): number {
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
