// 从单张设施图标 master 雪碧图切分 apps/web/public/metro-facilities 下的
// plain / framed 单图标 SVG。新资产与历史资产同源（master 导出、85.33 逻辑方格、
// currentColor 染色），渲染侧见 apps/web/lib/material-glyphs.ts。
//
// 用法：
//   node scripts/sync-metro-facility-icons.mjs --analyze --source <雪碧图路径>
//   node scripts/sync-metro-facility-icons.mjs --write   --source <雪碧图路径>
//
// --analyze 仅输出每个格子与现有资产的路径指纹相似度，不落盘；
// --write   按 cellMap 生成 plain/framed 文件（UTF-8 无 BOM）。
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const outputDirectory = join(workspaceRoot, 'apps', 'web', 'public', 'metro-facilities');

// 逻辑网格原点：master 雪碧图按约 105.33 间距排版，clipPath 自带 2~4px 出血，
// 单图统一裁成 0 0 85.33 85.33（与历史资产一致，出血由 svg viewport 裁掉）。
const GRID = 105.33;
const CELL = 85.33;
const COLUMNS = 8;
const COLUMN_ORIGINS = [0, 105.33, 210.66, 315.99, 421.32, 526.65, 631.98, 737.31];
const ROW_ORIGINS = [0, 105.33, 210.66];

// 雪碧图格子（先行后列，0 起）→ 资产名。
// 未列入的格子仅参与指纹分析、不生成资产。
const cellMap = new Map([
  [0, { asset: 'frame', variants: ['framed'] }],
  [1, { asset: 'nursing-room', variants: ['plain', 'framed'] }],
  [2, { asset: 'waiting-room', variants: ['plain', 'framed'] }],
  // 格 3 经 path 指纹比对与历史 exit 资产 100% 同形（出口，非直梯）。
  [3, { asset: 'exit', variants: ['plain', 'framed'] }],
  [4, { asset: 'subway', variants: ['plain', 'framed'] }],
  [5, { asset: 'passenger-service-center', variants: ['plain', 'framed'] }],
  [6, { asset: 'ticket-machine', variants: ['plain', 'framed'] }],
  [7, { asset: 'meeting-point', variants: ['plain', 'framed'] }],
  [8, { asset: 'wheelchair', variants: ['plain', 'framed'] }],
  [9, { asset: 'mens-restroom', variants: ['plain', 'framed'] }],
  [10, { asset: 'womens-restroom', variants: ['plain', 'framed'] }],
  [11, { asset: 'restroom', variants: ['plain', 'framed'] }],
  [12, { asset: 'family-restroom', variants: ['plain', 'framed'] }],
  // 格 13 图形为“男 + 女 + 轮椅”，即无障碍卫生间；历史上曾误用 third-restroom 资源名。
  [13, { asset: 'accessible-restroom', variants: ['plain', 'framed'] }],
  [14, { asset: 'accessible-elevator', variants: ['plain', 'framed'] }],
  [15, { asset: 'wheelchair-lift', variants: ['plain', 'framed'] }],
  // 16：导轨式斜挂升降平台，本轮不启用；
  // 17：与历史 escalator 资产 100% 同形（本轮无更新，保留原 escalator.svg）。
  [18, { asset: 'escalator-and-stairs', variants: ['plain'] }],
  [19, { asset: 'stairs-two-way', variants: ['plain', 'framed'] }],
  [20, { asset: 'stairs-down', variants: ['plain', 'framed'] }],
  [21, { asset: 'stairs-up', variants: ['plain', 'framed'] }],
]);

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const sourcePath =
    sourceIndex >= 0
      ? resolve(args[sourceIndex + 1] ?? '')
      : resolve(process.env.USERPROFILE ?? '', 'Downloads', '设施图标 (3).svg');

  const source = await readFile(sourcePath, 'utf8');
  const { defs, cells } = parseSprite(source);
  if (cells.length === 0) {
    throw new Error('雪碧图中没有解析到任何图标格子。');
  }

  if (args.includes('--analyze')) {
    await analyze(cells);
    return;
  }
  if (!args.includes('--write')) {
    throw new Error('请指定 --analyze 或 --write。');
  }
  await writeAssets(defs, cells);
}

// 提取 <defs> 原文与顶层（svg 直接子级）的 <g> 格子节点。
function parseSprite(source) {
  const defsMatch = source.match(/<defs>[\s\S]*?<\/defs>/u);
  const defs = defsMatch ? defsMatch[0].replaceAll('#FFFFFF', 'currentColor') : '';
  const bodyStart = source.lastIndexOf('</defs>') + '</defs>'.length;
  const body = source.slice(bodyStart, source.lastIndexOf('</svg>'));

  const cells = [];
  let index = 0;
  while (index < body.length) {
    const open = body.indexOf('<g', index);
    if (open < 0) {
      break;
    }
    const tagEnd = body.indexOf('>', open);
    const tagText = body.slice(open, tagEnd + 1);
    if (tagText.endsWith('/>')) {
      index = tagEnd + 1;
      continue;
    }
    const close = findMatchingClose(body, open);
    const markup = body.slice(open, close + '</g>'.length).replaceAll('#FFFFFF', 'currentColor');
    const cellIndex = cells.length;
    const row = Math.floor(cellIndex / COLUMNS);
    const column = cellIndex % COLUMNS;
    cells.push({
      index: cellIndex,
      originX: COLUMN_ORIGINS[column] ?? column * GRID,
      originY: ROW_ORIGINS[row] ?? row * GRID,
      markup,
    });
    index = close + '</g>'.length;
  }
  return { defs, cells };
}

// 从某个 <g> 开标签位置找到匹配的 </g>（不进入 defs，仅处理 body）。
function findMatchingClose(markup, openIndex) {
  let depth = 0;
  let cursor = openIndex;
  const openTag = /<g\b[^>]*?>/gu;
  const closeTag = /<\/g>/gu;
  openTag.lastIndex = openIndex;
  const nextEvents = [];
  let openMatch;
  while ((openMatch = openTag.exec(markup)) !== null) {
    if (!openMatch[0].endsWith('/>')) {
      nextEvents.push({ index: openMatch.index, type: 'open' });
    }
  }
  let closeMatch;
  while ((closeMatch = closeTag.exec(markup)) !== null) {
    nextEvents.push({ index: closeMatch.index, type: 'close' });
  }
  nextEvents.sort((left, right) => left.index - right.index);
  for (const event of nextEvents) {
    if (event.index < cursor) {
      continue;
    }
    if (event.type === 'open') {
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        return event.index;
      }
    }
  }
  throw new Error('SVG <g> 标签没有闭合，无法切图。');
}

// --- 指纹分析：path 坐标点归一化后做多重集合重合度比对 ---------------------

async function analyze(cells) {
  const legacy = await readLegacySignatures();
  console.log(`解析到 ${cells.length} 个格子，比对 ${legacy.length} 个历史 plain 资产。\n`);
  for (const cell of cells) {
    const signature = pathPointSignature(cell.markup, cell.originX, cell.originY);
    const ranked = legacy
      .map((item) => ({
        asset: item.asset,
        score: overlapScore(signature, item.signature),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    const target = cellMap.get(cell.index)?.asset ?? '（不启用）';
    const top = ranked.map((item) => `${item.asset} ${(item.score * 100).toFixed(1)}%`).join(' | ');
    console.log(`格 ${String(cell.index).padStart(2, ' ')} -> ${target.padEnd(26)} 近似：${top}`);
  }
}

async function readLegacySignatures() {
  const plainDirectory = join(outputDirectory, 'plain');
  const fileNames = await readdir(plainDirectory);
  const signatures = [];
  for (const fileName of fileNames.filter((name) => name.endsWith('.svg'))) {
    const source = await readFile(join(plainDirectory, fileName), 'utf8');
    const translate = source.match(/<g transform="translate\((-?[\d.]+)\s+(-?[\d.]+)\)">/u);
    const originX = translate ? Number(translate[1]) * -1 : 0;
    const originY = translate ? Number(translate[2]) * -1 : 0;
    const body = source.slice(source.lastIndexOf('</defs>') + '</defs>'.length);
    signatures.push({
      asset: fileName.replace(/\.svg$/u, ''),
      signature: pathPointSignature(body, originX, originY),
    });
  }
  return signatures;
}

// 提取所有 <path d> 中的数字，按 (x,y) 成对、减去格子原点后量化。
function pathPointSignature(markup, originX, originY) {
  const points = [];
  for (const match of markup.matchAll(/<path\b[^>]*\sd="([^"]+)"/gu)) {
    const numbers = [...match[1].matchAll(/-?\d+(?:\.\d+)?/gu)].map((item) => Number(item[0]));
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push(
        `${Math.round((numbers[i] - originX) * 10) / 10},${
          Math.round((numbers[i + 1] - originY) * 10) / 10
        }`,
      );
    }
  }
  return new Set(points);
}

function overlapScore(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let common = 0;
  for (const value of left) {
    if (right.has(value)) {
      common += 1;
    }
  }
  return (common * 2) / (left.size + right.size);
}

// --- 资产生成 ---------------------------------------------------------------

async function writeAssets(defs, cells) {
  let written = 0;
  for (const cell of cells) {
    const config = cellMap.get(cell.index);
    if (!config) {
      continue;
    }
    for (const variant of config.variants) {
      const directory = join(outputDirectory, variant);
      await mkdir(directory, { recursive: true });
      const svg = renderCellSvg(defs, cell, variant, config.asset);
      await writeFile(join(directory, `${config.asset}.svg`), svg, 'utf8');
      written += 1;
      console.log(`已生成 ${variant}/${config.asset}.svg`);
    }
  }
  console.log(`完成，共写入 ${written} 个文件。`);
}

function renderCellSvg(defs, cell, variant, asset) {
  const frameRect =
    variant === 'framed' && asset !== 'frame'
      ? `<rect x="${formatNumber(cell.originX + 1.5)}" y="${formatNumber(
          cell.originY + 1.5,
        )}" width="${formatNumber(CELL - 3)}" height="${formatNumber(
          CELL - 3.01,
        )}" rx="8.5" fill-opacity="0" stroke-opacity="1" stroke="currentColor" fill="none" stroke-width="3"/>`
      : '';
  return (
    `<svg viewBox="0 0 ${CELL} ${CELL}" xmlns="http://www.w3.org/2000/svg">` +
    `${defs}` +
    `<g transform="translate(-${formatNumber(cell.originX)} -${formatNumber(cell.originY)})">` +
    `${cell.markup}${frameRect}</g></svg>\n`
  );
}

function formatNumber(value) {
  return Number(value.toFixed(2)).toString();
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
