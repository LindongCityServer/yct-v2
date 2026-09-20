// NaL vitool 素材号核验工具。
//
// 背景：`stn@NN` 号段**中间夹着跳过项**（15/16/19–22/35/36/39/40 等），
// 4 列截图网格的「行优先连号递推」**不成立**。2026-09-19 曾因此把整张
// `nalFacilityAssetMap` 前移错位，靠逐张抓线上 SVG 渲染目视才发现。
//
// 本工具把那次核验固化成可复现流程：把线上素材抓下来、渲染成带编号的
// 对照图，并把每个素材的真实解析结果并排打印，用于人工确证。
//
// 用法：
//   node scripts/inspect-nal-assets.mjs --prefix stn --range 1-40
//   node scripts/inspect-nal-assets.mjs --prefix stn --range 1-40 --grid
//   node scripts/inspect-nal-assets.mjs --prefix way --range 1-30
//   node scripts/inspect-nal-assets.mjs --prefix oth --names hub01,hub02,cls01,A,Dot
//
// 产出（写在 .tmp-nal-assets/ 下）：
//   <prefix>@NN.svg   抓下来的原始素材（缓存，已存在则跳过，加 --force 重抓）
//   contact-sheet.png 带编号标签的拼图（需 sharp；`--grid` 时另出 grid.html）
//
// ⚠️ 素材号**不连续可用**——清单核对时务必逐号抓取，不要按号段区间假设存在性。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ASSET_BASE = 'https://centralgo.site/vitool/assets';
const workspaceRoot = resolve(import.meta.dirname, '..');
const outputRoot = join(workspaceRoot, '.tmp-nal-assets');

function parseArguments(argv) {
  const options = { prefix: 'stn', range: null, names: [], grid: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--prefix') options.prefix = argv[++index];
    else if (flag === '--range') options.range = argv[++index];
    else if (flag === '--names') options.names = argv[++index].split(',').filter(Boolean);
    else if (flag === '--grid') options.grid = true;
    else if (flag === '--force') options.force = true;
    else if (flag === '--help' || flag === '-h') options.help = true;
    else throw new Error(`未知参数 ${flag}`);
  }
  return options;
}

/** 展开成待核验的素材文件名列表（不含前缀目录）。 */
function resolveAssetNames({ prefix, range, names }) {
  const result = [];
  if (range) {
    const [start, end] = range.split('-').map((value) => Number(value.trim()));
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(`--range 需形如 1-40，收到 ${range}`);
    }
    for (let n = start; n <= end; n += 1) {
      result.push(`${prefix}@${String(n).padStart(2, '0')}.svg`);
    }
  }
  for (const name of names) result.push(`${prefix}@${name}.svg`);
  if (!result.length) throw new Error('请用 --range 或 --names 指定要核验的素材');
  return result;
}

async function fetchAsset(prefix, assetName, force) {
  const localPath = join(outputRoot, assetName);
  if (!force && existsSync(localPath)) {
    const cached = await readFile(localPath, 'utf8');
    return { assetName, localPath, cached: true, text: cached, isSvg: isSvgText(cached) };
  }
  const url = `${ASSET_BASE}/${prefix}/${assetName}`;
  const response = await fetch(url);
  if (!response.ok) return { assetName, missing: true, status: response.status };
  const text = await response.text();
  await writeFile(localPath, text, 'utf8');
  return { assetName, localPath, cached: false, text, isSvg: isSvgText(text) };
}

/**
 * 判断抓回来的内容**是不是 SVG**。
 *
 * ⚠️ 个别素材（已知 `stn@39` / `stn@40` 这对长条横幅）线上返回的是 **HTML 错误页**
 * 而不是 SVG。若把它当 SVG 内联进对照页，浏览器解析时会吞掉其后的整个 DOM
 * ——曾导致用户在对照表里「13 往后的卡片全部消失」。**非 SVG 一律只出占位。**
 */
function isSvgText(text) {
  const head = text.trimStart();
  return head.startsWith('<svg') || head.startsWith('<?xml');
}

/** 从 SVG 里抽出用于人工判读的线索（颜色 / 外框 / viewBox）。 */
function describeSvg(text) {
  const viewBox = /viewBox="([^"]+)"/u.exec(text)?.[1] ?? '?';
  const colors = [...text.matchAll(/(?:fill|stroke)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{3,8})/gu)].map(
    (match) => match[1].toLowerCase(),
  );
  const usesModeItem = /var\(--mode-item\)/u.test(text);
  // 经典系列带 90×90 圆角外框矩形，实验系列是裸图形。
  const hasClassicFrame = /5,\s*5v90|V30c0-1\.1|M95,28c1\.1/iu.test(text);
  return {
    viewBox,
    colors: [...new Set(colors)],
    tint: usesModeItem ? 'var(--mode-item)' : '',
    hasClassicFrame,
  };
}

async function buildContactSheet(entries, { grid }) {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    console.log('\n（未安装 sharp，跳过拼图。看图请直接打开 .tmp-nal-assets/ 下的 SVG。）');
    return;
  }
  const CELL_W = 150;
  const CELL_H = 172;
  const COLS = 5;
  const rows = Math.ceil(entries.length / COLS);
  const composites = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    // 非 SVG（HTML 错误页）绝不参与渲染，只在标签处留空。
    if (entry.missing || !entry.isSvg) continue;
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const left = col * CELL_W;
    const top = row * CELL_H;
    // var(--mode-item) 在源工程里由主题决定颜色；截图时统一成浅色便于目视。
    // 注意：多数素材本身已带 `xmlns`，**重复注入会让 XML 解析器报
    // `Attribute xmlns redefined`**——必须先判断再补。
    let svg = entry.text.replace(/var\(--mode-item\)/gu, '#e8e8e8');
    if (!/xmlns=/u.test(svg)) {
      svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }
    try {
      const buffer = await sharp(Buffer.from(svg), { density: 300 })
        .resize(CELL_W - 30, CELL_H - 46, {
          fit: 'contain',
          background: { r: 40, g: 40, b: 40, alpha: 1 },
        })
        .png()
        .toBuffer();
      composites.push({ input: buffer, left: left + 15, top: top + 42 });
    } catch (error) {
      console.log(`  ${entry.assetName} 渲染失败：${error.message}`);
    }
    composites.push({
      input: Buffer.from(
        `<svg width="${CELL_W}" height="40" xmlns="http://www.w3.org/2000/svg">
          <text x="8" y="28" font-family="monospace" font-size="24" font-weight="bold" fill="#ffd400">${entry.assetName.replace(/^\w+@|\.svg$/gu, '')}</text>
        </svg>`,
      ),
      left,
      top,
    });
  }
  const pngPath = join(outputRoot, 'contact-sheet.png');
  await sharp({
    create: {
      width: COLS * CELL_W,
      height: rows * CELL_H,
      channels: 4,
      background: { r: 20, g: 20, b: 20, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(pngPath);
  console.log(`\n拼图已生成：${pngPath}`);

  if (grid) {
    // ⚠️ 只内联真正的 SVG。非 SVG 内容（39/40 的 HTML 错误页）一旦内联，
    // 浏览器会把其后的 DOM 全部吞掉，页面看起来「后面的卡片都不见了」。
    const cards = entries
      .map((entry) => {
        const tag = `<span class="tag">${entry.assetName}</span>`;
        if (entry.missing || !entry.isSvg) {
          return `<div class="cell"><span class="tag">${entry.assetName}</span><div class="none">无 SVG 内容（线上返回 HTML）</div></div>`;
        }
        const svg = entry.text.replace(/var\(--mode-item\)/gu, '#e8e8e8');
        return `<div class="cell">${tag}${svg}</div>`;
      })
      .join('\n');
    const htmlPath = join(outputRoot, 'contact-sheet.html');
    await writeFile(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><title>NaL 素材核验</title>
<style>
body{background:#141414;margin:0;padding:16px;font-family:system-ui;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;}
.cell{background:#242424;border-radius:6px;padding:6px;position:relative;}
.cell svg{width:100%;height:180px;display:block;}
.tag{color:#ffd400;font:600 13px monospace;display:block;margin-bottom:4px;}
.none{height:180px;display:flex;align-items:center;justify-content:center;color:#6a6a6a;font-size:12px;text-align:center;padding:0 10px;}
</style>
<div class="grid">${cards}</div>`,
      'utf8',
    );
    console.log(`网格页已生成：${htmlPath}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      '用法：node scripts/inspect-nal-assets.mjs --prefix stn --range 1-40 [--grid] [--force]',
    );
    return;
  }
  await mkdir(outputRoot, { recursive: true });

  const assetNames = resolveAssetNames(options);
  console.log(`核验 ${options.prefix}@ 素材 ${assetNames.length} 个：\n`);

  const entries = [];
  for (const assetName of assetNames) {
    const result = await fetchAsset(options.prefix, assetName, options.force);
    if (result.missing) {
      console.log(`  ${assetName.padEnd(18)} ✗ 不存在（HTTP ${result.status}）`);
      entries.push(result);
      continue;
    }
    if (!result.isSvg) {
      console.log(`  ${assetName.padEnd(18)} ⚠ 线上返回的不是 SVG（HTML 错误页），已跳过渲染`);
      entries.push(result);
      continue;
    }
    const info = describeSvg(result.text);
    const series = info.hasClassicFrame ? '经典' : '实验/裸图';
    const colors = [info.tint, ...info.colors].filter(Boolean).join(' ');
    console.log(
      `  ${assetName.padEnd(18)} ${series.padEnd(9)} vb=${info.viewBox.padEnd(16)} ${colors}${
        result.cached ? '  [缓存]' : ''
      }`,
    );
    entries.push({ ...result, info });
  }

  const missing = entries.filter((entry) => entry.missing).length;
  const notSvg = entries.filter((entry) => !entry.missing && !entry.isSvg).length;
  console.log(`\n小计：存在 ${entries.length - missing}（其中非 SVG ${notSvg}），缺失 ${missing}`);
  console.log('提示：素材号不连续可用，映射表必须逐号登记，勿按区间假设。');

  await buildContactSheet(entries, options);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
