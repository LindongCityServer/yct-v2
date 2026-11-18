#!/usr/bin/env node
/**
 * /dev/controls 视觉基线对比（PNG 像素级）。
 *
 * 依赖外部安装的 pngjs + pixelmatch：
 *   npm install pngjs@7 pixelmatch@7 --prefix .tmp/pw --no-save
 *   PNG_COMPARE_MODULES=.tmp/pw/node_modules node scripts/visual-regression/compare-controls.mjs
 *
 * 环境变量：
 *   BASELINE_DIR 默认 .screenshots/controls-baseline
 *   CANDIDATE_DIR 默认 .screenshots/controls-after-split
 *   MAX_DIFF_RATIO 默认 0.01（同代码重复截图实测噪声 ~0.75%）
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';

const modulesDir = process.env.PNG_COMPARE_MODULES || '.tmp/pw/node_modules';
const require = createRequire(
  isAbsolute(modulesDir)
    ? join(modulesDir, 'noop.cjs')
    : join(process.cwd(), modulesDir, 'noop.cjs'),
);
const { PNG } = require('pngjs');
const pixelmatchModule = require('pixelmatch');
const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;

const baselineDir = process.env.BASELINE_DIR || '.screenshots/controls-baseline';
const candidateDir = process.env.CANDIDATE_DIR || '.screenshots/controls-after-split';
// 实测同代码重复截图噪声可达 ~0.75%（动画/字体抗锯齿），默认 1% 阈值。
const maxDiff = Number(process.env.MAX_DIFF_RATIO || 0.01);

const baselineFiles = new Set(readdirSync(baselineDir).filter((name) => name.endsWith('.png')));
const candidateFiles = new Set(readdirSync(candidateDir).filter((name) => name.endsWith('.png')));
const missing = [...baselineFiles].filter((name) => !candidateFiles.has(name));
const extra = [...candidateFiles].filter((name) => !baselineFiles.has(name));
let failed = 0;
let maxRatio = 0;
let checked = 0;
for (const name of [...baselineFiles].sort()) {
  if (!candidateFiles.has(name)) continue;
  const before = PNG.sync.read(readFileSync(join(baselineDir, name)));
  const after = PNG.sync.read(readFileSync(join(candidateDir, name)));
  if (before.width !== after.width || before.height !== after.height) {
    console.log(
      name +
        ': 尺寸变化 ' +
        before.width +
        'x' +
        before.height +
        ' -> ' +
        after.width +
        'x' +
        after.height,
    );
    failed += 1;
    continue;
  }
  const diff = new PNG({ width: before.width, height: before.height });
  const changed = pixelmatch(before.data, after.data, diff.data, before.width, before.height, {
    threshold: 0.1,
  });
  const ratio = changed / (before.width * before.height);
  maxRatio = Math.max(maxRatio, ratio);
  checked += 1;
  if (ratio > maxDiff) {
    failed += 1;
    console.log(name + ': 差异 ' + (ratio * 100).toFixed(3) + '%');
    if (process.env.DIFF_DIR) {
      mkdirSync(process.env.DIFF_DIR, { recursive: true });
      writeFileSync(join(process.env.DIFF_DIR, name), PNG.sync.write(diff));
    }
  }
}
console.log(
  '视觉对比：' +
    checked +
    ' 张，最大差异 ' +
    (maxRatio * 100).toFixed(3) +
    '%，缺失 ' +
    missing.length +
    '，多余 ' +
    extra.length,
);
if (missing.length || extra.length)
  console.log('缺失：' + missing.join(', ') + ' 多余：' + extra.join(', '));
if (failed || missing.length || extra.length) {
  console.error('视觉回归：存在差异');
  process.exit(1);
}
console.log('视觉回归通过：像素差异在阈值内');
