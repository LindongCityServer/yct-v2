import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as opentypeModule from 'opentype.js';
import type { Font } from 'opentype.js';
import type {
  MetroArrowIconAssetName,
  MetroFacilityIconAssetName,
} from './metro-wayfinding';
import {
  metroWayfindingIconOptions,
} from './metro-wayfinding';
import { parseSvgMarkup, type MetroWayfindingSvgMarkup } from './metro-wayfinding-svg';
import type {
  MaterialGlyphAssets,
  MaterialGlyphFontKey,
} from './material-glyph-assets';

/** 服务端字形素材：字体与图标都从 `public` / `app/fonts` 读取。 */
export function createServerMaterialGlyphAssets(): MaterialGlyphAssets {
  return {
    getCharacterMetric(fontKey, character) {
      const font = resolveFont(fontKey);
      const glyph = font.charToGlyph(character);
      return {
        advance: (glyph.advanceWidth ?? font.unitsPerEm) / font.unitsPerEm,
        supported: glyph.index !== 0,
      };
    },
    getBaselineRatio(fontKey) {
      const font = resolveFont(fontKey);
      return font.ascender / font.unitsPerEm;
    },
    getCharacterPath(fontKey, character, x, y, fontSize) {
      const font = resolveFont(fontKey);
      const glyph = font.charToGlyph(character);
      if (glyph.index === 0) {
        return undefined;
      }
      return glyph.getPath(x, y, fontSize).toPathData(3);
    },
    getMaterialSymbolMarkup,
    getMetroFacilityAssetMarkup,
    getMetroArrowAssetMarkup,
    getMetroWayfindingAssets() {
      return serverWayfindingAssets;
    },
  };
}

const serverWayfindingAssets = {
  getMaterialSymbolMarkup,
  getMetroFacilityAssetMarkup,
  getMetroArrowAssetMarkup,
};

let harmonyOsSansBoldFont: Font | undefined;
let chillJinshuSongFont: Font | undefined;

function resolveFont(fontKey: MaterialGlyphFontKey): Font {
  if (fontKey === 'harmony-bold') {
    harmonyOsSansBoldFont ??= parseOpenTypeFont(
      readFontFile('harmonyos-sans', 'HarmonyOS_Sans_SC_Bold.ttf'),
    );
    return harmonyOsSansBoldFont;
  }
  chillJinshuSongFont ??= parseOpenTypeFont(readFontFile('chill-jinshu-song-wide-bold.otf'));
  return chillJinshuSongFont;
}

function readFontFile(...relativePath: string[]): ArrayBuffer {
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
  const source = readFileSync(sourcePath);
  return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
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

const materialSymbolMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();
const metroFacilityAssetMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();
const metroArrowAssetMarkupCache = new Map<string, MetroWayfindingSvgMarkup>();

function getMaterialSymbolMarkup(symbol: string): MetroWayfindingSvgMarkup {
  const cached = materialSymbolMarkupCache.get(symbol);
  if (cached) {
    return cached;
  }
  if (!metroWayfindingIconOptions.some((option) => option.symbol === symbol)) {
    throw new Error(`不支持的 Material Symbols 图标“${symbol}”。`);
  }
  const sourcePath = resolveAssetPath(
    ['material-symbols', 'outlined', `${symbol}.svg`],
    `Material Symbols 图标文件 ${symbol}.svg`,
  );
  const markup = parseSvgMarkup(readFileSync(sourcePath, 'utf8'));
  if (!markup) {
    throw new Error(`Material Symbols 图标“${symbol}”格式无效。`);
  }
  materialSymbolMarkupCache.set(symbol, markup);
  return markup;
}

function getMetroFacilityAssetMarkup(
  assetName: MetroFacilityIconAssetName | 'frame',
  variant: 'framed' | 'plain',
): MetroWayfindingSvgMarkup {
  const cacheKey = `${variant}/${assetName}`;
  const cached = metroFacilityAssetMarkupCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const sourcePath = resolveAssetPath(
    ['metro-facilities', variant, `${assetName}.svg`],
    `地铁设施图标文件 ${variant}/${assetName}.svg`,
  );
  const markup = parseSvgMarkup(readFileSync(sourcePath, 'utf8'));
  if (!markup) {
    throw new Error(`地铁设施图标“${assetName}”格式无效。`);
  }
  metroFacilityAssetMarkupCache.set(cacheKey, markup);
  return markup;
}

function getMetroArrowAssetMarkup(assetName: MetroArrowIconAssetName): MetroWayfindingSvgMarkup {
  const cached = metroArrowAssetMarkupCache.get(assetName);
  if (cached) return cached;
  const sourcePath = resolveAssetPath(
    ['metro-arrows', `${assetName}.svg`],
    `地铁箭头图标文件 ${assetName}.svg`,
  );
  const markup = parseSvgMarkup(readFileSync(sourcePath, 'utf8'));
  if (!markup) throw new Error(`地铁箭头图标“${assetName}”格式无效。`);
  metroArrowAssetMarkupCache.set(assetName, markup);
  return markup;
}

function resolveAssetPath(relativePath: string[], label: string): string {
  const candidates = [
    resolve(process.cwd(), 'public', ...relativePath),
    resolve(process.cwd(), 'apps', 'web', 'public', ...relativePath),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`${label} 不存在。`);
  }
  return sourcePath;
}
