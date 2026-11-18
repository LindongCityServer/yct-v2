#!/usr/bin/env node
/**
 * 把 apps/web/app/globals.css 按顺序拆分为 app/styles/ 下的多个领域文件。
 *
 * 只在顶层规则结束处切分，并保持原有顺序（layout.tsx 按 import 顺序加载），
 * 因此级联语义不变。已拆出的 80-controls-board.css 插回原位置。
 *
 *   node scripts/codemods/split-globals-css.mjs           # 预览
 *   node scripts/codemods/split-globals-css.mjs --write   # 写入
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const globalsPath = join(root, 'apps/web/app/globals.css');
const raw = readFileSync(globalsPath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const text = raw.replaceAll('\r\n', '\n');
const lines = text.split('\n');
const controlsMarkerLine = 33655; // 原 controls 区块所在位置前一条顶层规则结束行（当前 globals 行号）

function topLevelRuleEnds(source) {
  const ends = [];
  let depth = 0;
  let line = 1;
  let inComment = false;
  let inString = false;
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (char === '\n') line += 1;
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) ends.push(line);
      if (depth < 0) throw new Error('CSS 花括号不配平（行 ' + line + '）');
    }
  }
  if (depth !== 0) throw new Error('CSS 花括号不配平（结尾 depth=' + depth + '）');
  return ends;
}

const ruleEnds = topLevelRuleEnds(text);
const pickBoundary = (target) => {
  let best = ruleEnds[0];
  for (const line of ruleEnds) {
    if (line <= target) best = line;
    else break;
  }
  return best;
};

const total = lines.length;
const chunkCount = 7;
const targets = [];
for (let index = 0; index < chunkCount - 1; index += 1) {
  targets.push(pickBoundary(Math.round(((index + 1) * total) / chunkCount)));
}
targets.push(controlsMarkerLine);
const boundaries = [...new Set(targets)].sort((a, b) => a - b);
if (boundaries[boundaries.length - 1] !== controlsMarkerLine) {
  boundaries.push(controlsMarkerLine);
}
const segments = [];
let start = 1;
for (const end of boundaries) {
  if (end <= start) continue;
  segments.push({ start, end });
  start = end + 1;
}
if (start <= total) segments.push({ start, end: total });

const names = [
  '10-base',
  '20-layout',
  '30-components',
  '40-admin',
  '50-materials',
  '60-pages',
  '70-data',
  '90-compat-standard',
];
const header = (name) =>
  '/* 从 apps/web/app/globals.css 按顺序拆出（' +
  name +
  '）：本文件顺序参与全局级联，勿调换 layout.tsx 的 import 顺序。 */' +
  eol;

const stylesDir = join(root, 'apps/web/app/styles');
mkdirSync(stylesDir, { recursive: true });
const written = [];
segments.forEach((segment, index) => {
  const name = names[index] || '99-extra-' + index;
  const chunkLines = lines.slice(segment.start - 1, segment.end);
  const content = header(name) + chunkLines.join(eol) + eol;
  const file = join(stylesDir, name + '.css');
  written.push({
    file,
    name,
    lines: chunkLines.length,
    start: segment.start,
    end: segment.end,
    content,
  });
});

const controlsFile = join(stylesDir, '80-controls-board.css');
if (!existsSync(controlsFile)) throw new Error('缺少 80-controls-board.css');

const importOrder = [];
const beforeControls = written.filter((chunk) => chunk.end <= controlsMarkerLine);
const afterControls = written.filter((chunk) => chunk.start > controlsMarkerLine);
for (const chunk of beforeControls) importOrder.push(chunk.name);
importOrder.push('80-controls-board');
for (const chunk of afterControls) importOrder.push(chunk.name);

const layoutPath = join(root, 'apps/web/app/layout.tsx');
const layout = readFileSync(layoutPath, 'utf8').replaceAll('\r\n', '\n');
const importBlock = importOrder.map((name) => "import './styles/" + name + ".css';").join('\n');
const nextLayout = layout.replace(
  /import '\.\/globals\.css';\nimport '\.\/styles\/80-controls-board\.css';/,
  importBlock,
);
if (nextLayout === layout) throw new Error('未找到 layout.tsx 的 globals/controls import');

if (process.argv.includes('--write')) {
  for (const chunk of written) writeFileSync(chunk.file, chunk.content, 'utf8');
  writeFileSync(layoutPath, nextLayout, 'utf8');
  writeFileSync(
    globalsPath,
    '/* 已拆分：样式按顺序位于 apps/web/app/styles/*.css（layout.tsx 逐文件 import）。 */' + eol,
    'utf8',
  );
  console.log('已拆分 ' + written.length + ' 个文件 + 80-controls-board，import 顺序：');
} else {
  console.log('（预览）将拆分 ' + written.length + ' 个文件 + 80-controls-board，import 顺序：');
}
for (const name of importOrder) console.log('  ' + name);
for (const chunk of written) {
  console.log(
    '  ' + chunk.name + '：行 ' + chunk.start + '-' + chunk.end + '（' + chunk.lines + ' 行）',
  );
}
