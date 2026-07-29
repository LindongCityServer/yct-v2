import { readFileSync } from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import type { MaterialGlyphConfig } from '@yct/contracts';

interface NostalgicDigitGlyph {
  advance: number;
  path: string;
  transform?: string;
}

const nostalgicDigitGlyphs: Record<string, NostalgicDigitGlyph> = {
  '0': {
    advance: 58,
    path:
      'M570.5,28L570.5,13.000002C570.5,5.8202987,576.3202987,0,583.500002,0L615,0C622.179703,0,628,5.8202987,628,13.000002L628,72C628,79.179703,622.179703,85,615,85L583.500002,85C576.3202987,85,570.5,79.179703,570.5,72L570.5,28ZM586.75,67L586.75,18C586.75,16.895432,587.645432,16,588.75,16L609.75,16C610.854568,16,611.75,16.895432,611.75,18L611.75,67C611.75,68.104568,610.854568,69,609.75,69L588.75,69C587.645432,69,586.75,68.104568,586.75,67Z',
    transform: 'translate(-570 0)',
  },
  '1': { advance: 21, path: 'M5 0H21V85H5Z' },
  '2': {
    advance: 58,
    path:
      'M31,12.000002L31,39L46.5,39L46.5,18.5C46.5,16.290861,48.290861,14.5,50.5,14.5L68.5,14.5C70.709141,14.5,72.5,16.290861,72.5,18.5L72.5,36.995171C72.5,38.256916,71.904675,39.444702,70.89381800000001,40.199799L31,70L31,85L88.5,85L88.5,70L56.5,70L83.60165,48.403374C86.69695300000001,45.936802,88.5,42.194489,88.5,38.236603L88.5,12.000003C88.5,5.3725843,83.127419,0,76.5,0L43.000001,0C36.372583399999996,0,31,5.3725834,31,12.000002Z',
    transform: 'translate(-31 0)',
  },
  '3': {
    advance: 58,
    path:
      'M98.5,12.000002L98.5,27L114,27L114,18.5C114,16.290861,115.790861,14.5,118,14.5L136,14.5C138.209141,14.5,140,16.290861,140,18.5L140,33C140,35.209141,138.209141,37,136,37L122.5,37L122.5,51L136,51C138.209141,51,140,52.790859,140,55L140,65.5C140,67.709137,138.209141,69.5,136,69.5L118,69.5C115.790861,69.5,114,67.709137,114,65.5L114,56.5L98.5,56.5L98.5,72C98.5,79.179703,104.3202987,85,111.500002,85L143,85C150.17970300000002,85,156,79.179703,156,72L156,49.201561C156,47.177982,155.080151,45.264118,153.5,44C155.080151,42.735882,156,40.822018,156,38.798439L156,12.000002C156,5.3725834,150.627419,0,144,0L110.500001,0C103.8725834,0,98.5,5.3725834,98.5,12.000002Z',
    transform: 'translate(-98.5 0)',
  },
  '4': {
    advance: 58,
    path:
      'M166,75.5L166,58.5L200.5,0L217.5,0L217.5,60.5L223,60.5L223,75.5L217.5,75.5L217.5,85L201.5,85L201.5,75.5L166,75.5ZM201.5,60.5L183.5,60.5L201.5,30L201.5,60.5Z',
    transform: 'translate(-166 0)',
  },
  '5': {
    advance: 58,
    path:
      'M233,0L233,28L233,42L233,45L248.5,45L248.5,42L270.5,42C272.709141,42,274.5,43.790859,274.5,46L274.5,65.5C274.5,67.709137,272.709141,69.5,270.5,69.5L252.5,69.5C250.290861,69.5,248.5,67.709137,248.5,65.5L248.5,52.5L233,52.5L233,72C233,79.179703,238.8202987,85,246.000002,85L277.5,85C284.679703,85,290.5,79.179703,290.5,72L290.5,41C290.5,33.820297,284.679703,28,277.5,28L248.5,28L248.5,14.5L290.5,14.5L290.5,0L233,0Z',
    transform: 'translate(-233 0)',
  },
  '6': {
    advance: 58,
    path:
      'M300.5,28L300.5,13.000002C300.5,5.8202987,306.3202987,0,313.500002,0L345,0C352.179703,0,358,5.8202987,358,13.000002L358,26.5L342,26.5L342,18.5C342,16.290861,340.209141,14.5,338,14.5L320,14.5C317.790861,14.5,316,16.290861,316,18.5L316,33L345,33C352.179703,33,358,38.820297,358,46L358,72C358,79.179703,352.179703,85,345,85L313.500002,85C306.3202987,85,300.5,79.179703,300.5,72L300.5,28ZM316.75,67L316.75,51C316.75,49.895432,317.645432,49,318.75,49L339.75,49C340.854568,49,341.75,49.895432,341.75,51L341.75,67C341.75,68.104568,340.854568,69,339.75,69L318.75,69C317.645432,69,316.75,68.104568,316.75,67Z',
    transform: 'translate(-300.5 0)',
  },
  '7': {
    advance: 58,
    path: 'M368,0L368,14.5L409,14.5L368,85L385,85L425.5,14.5L425.5,0L368,0Z',
    transform: 'translate(-368 0)',
  },
  '8': {
    advance: 58,
    path:
      'M435.5,13.000002L435.5,37.295837C435.5,38.985249,436.34432435,40.562881,437.7499998,41.5C436.34432435,42.437119,435.5,44.014751,435.5,45.704163L435.5,72C435.5,79.179703,441.3202987,85,448.500002,85L480,85C487.179703,85,493,79.179703,493,72L493,45.704163C493,44.014751,492.155674,42.437119,490.75,41.5C492.155674,40.562881,493,38.985249,493,37.295837L493,13.000002C493,5.8202987,487.179703,0,480,0L448.500002,0C441.3202987,0,435.5,5.8202987,435.5,13.000002ZM451.799988,18L451.799988,34C451.799988,35.104568,452.695419,36,453.799988,36L474.799988,36C475.904556,36,476.799988,35.104568,476.799988,34L476.799988,18C476.799988,16.895432,475.904556,16,474.799988,16L453.799988,16C452.695419,16,451.799988,16.895432,451.799988,18ZM451.75,67L451.75,51C451.75,49.895432,452.645432,49,453.75,49L474.75,49C475.854568,49,476.75,49.895432,476.75,51L476.75,67C476.75,68.104568,475.854568,69,474.75,69L453.75,69C452.645432,69,451.75,68.104568,451.75,67Z',
    transform: 'translate(-435.5 0)',
  },
  '9': {
    advance: 58,
    path:
      'M560.5,113L560.5,98.000002C560.5,90.8202987,566.3202987,85,573.500002,85L605,85C612.179703,85,618,90.8202987,618,98.000002L618,111.5L602,111.5L602,103.5C602,101.290861,600.209141,99.5,598,99.5L580,99.5C577.790861,99.5,576,101.290861,576,103.5L576,118L605,118C612.179703,118,618,123.820297,618,131L618,157C618,164.179703,612.179703,170,605,170L573.500002,170C566.3202987,170,560.5,164.179703,560.5,157L560.5,113ZM576.75,152L576.75,136C576.75,134.895432,577.645432,134,578.75,134L599.75,134C600.854568,134,601.75,134.895432,601.75,136L601.75,152C601.75,153.104568,600.854568,154,599.75,154L578.75,154C577.645432,154,576.75,153.104568,576.75,152Z',
    transform: 'matrix(-1 0 0 -1 618 170)',
  },
};

let chillJinshuSongFont: opentype.Font | undefined;

export function renderMaterialGlyph(
  value: string,
  config: MaterialGlyphConfig,
): string {
  if (!value) {
    return '';
  }
  if (config.renderer === 'nostalgic_digits') {
    return renderNostalgicDigits(value, config);
  }
  return renderVerticalChillJinshuSong(value, config);
}

function renderNostalgicDigits(value: string, config: MaterialGlyphConfig): string {
  const glyphs = Array.from(value).map((character) => nostalgicDigitGlyphs[character]);
  if (glyphs.some((glyph) => !glyph)) {
    throw new Error('怀旧楼牌门牌号只能包含阿拉伯数字。');
  }
  const resolvedGlyphs = glyphs as NostalgicDigitGlyph[];
  const naturalWidth = resolvedGlyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
  const scaleX = Math.min(1, config.layoutWidth / naturalWidth);
  const scaleY = config.layoutHeight / 85;
  let offsetX = 0;
  const paths = resolvedGlyphs.map((glyph) => {
    const output = `<path d="${glyph.path}"${glyph.transform ? ` transform="${glyph.transform}"` : ''}/>`;
    const wrapped = `<g transform="translate(${formatNumber(offsetX)} 0)">${output}</g>`;
    offsetX += glyph.advance;
    return wrapped;
  });
  return `<g transform="scale(${formatNumber(scaleX)} ${formatNumber(scaleY)})">${paths.join('')}</g>`;
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

function getChillJinshuSongFont(): opentype.Font {
  if (chillJinshuSongFont) {
    return chillJinshuSongFont;
  }
  const sourcePath = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    'public',
    'fonts',
    'chill-jinshu-song-wide-bold.otf',
  );
  const source = readFileSync(sourcePath);
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  chillJinshuSongFont = opentype.parse(buffer);
  return chillJinshuSongFont;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1_000) / 1_000);
}
