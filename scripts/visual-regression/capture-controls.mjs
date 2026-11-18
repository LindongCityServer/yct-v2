#!/usr/bin/env node
/**
 * /dev/controls 视觉回归截图采集（Phase 3 Stage 0 基础设施）。
 *
 * 仓库不直接依赖 Playwright：与现有 browser 检查脚本一致，通过 PLAYWRIGHT_MODULE_PATH
 * 注入外部安装的 Playwright 模块。基线目录默认 .screenshots/controls-baseline。
 *
 * 用法：
 *   # 先启动本地 Web（pnpm --filter @yct/web exec next dev -p 3333）
 *   PLAYWRIGHT_MODULE_PATH=<path-to-playwright> node scripts/visual-regression/capture-controls.mjs
 *
 * 环境变量：
 *   YCT_TEST_BASE_URL      本地服务地址，默认 http://127.0.0.1:3333（仅允许回环地址）
 *   YCT_SCREENSHOT_DIR     输出目录，默认 .screenshots/controls-baseline
 *
 * 说明：图片 diff 需要额外像素对比依赖，当前脚本只负责采集基线；
 * 基线入库后可在 CI 中增加 compare 步骤（见 docs/PHASE3_CSS_SPLIT_PLAN.md Stage 0）。
 */
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.YCT_TEST_BASE_URL || 'http://127.0.0.1:3333';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  throw new Error('只允许对回环地址截图');
}
const outputDir = process.env.YCT_SCREENSHOT_DIR || '.screenshots/controls-baseline';
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';

async function loadPlaywright(spec) {
  if (isAbsolute(spec) || spec.includes('\\')) {
    const stats = statSync(spec);
    if (stats.isDirectory()) {
      const pkg = JSON.parse(readFileSync(join(spec, 'package.json'), 'utf8'));
      const entry = pkg.module || pkg.main || 'index.js';
      return import(pathToFileURL(join(spec, entry)).href);
    }
    return import(pathToFileURL(spec).href);
  }
  return import(spec);
}

let playwrightModule;
try {
  playwrightModule = await loadPlaywright(modulePath);
} catch {
  throw new Error(
    '未找到 Playwright。请设置 PLAYWRIGHT_MODULE_PATH 指向已安装的 playwright 模块（见 docs/PHASE3_CSS_SPLIT_PLAN.md）。',
  );
}
// CJS 模块经 ESM import 后命名导出可能落在 default 上。
const playwright = playwrightModule.default ?? playwrightModule;
const { chromium } = playwright;

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];
const schemes = ['light', 'dark'];
const materialModes = [
  { name: 'performance', label: '简约' },
  { name: 'balanced', label: '均衡' },
  { name: 'advanced', label: '透光' },
];

mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  // 无内置浏览器时使用系统浏览器：PLAYWRIGHT_CHANNEL=msedge 或 PLAYWRIGHT_EXECUTABLE_PATH。
  channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
const written = [];
try {
  for (const scheme of schemes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      // dev server 的 HMR 长连接会让 networkidle 永不触发，改用 DOM 就绪 + 选择器等待。
      await page.goto(base + '/dev/controls', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForSelector('.controls-showcase', { timeout: 60000 });
      await page.waitForTimeout(1200);
      const prefix = outputDir + '/' + scheme + '-' + viewport.name;
      await page.screenshot({ path: prefix + '.png', fullPage: true });
      written.push(prefix + '.png');

      // 三档材质：展开外观 dock 后点击对应分段按钮；选择器不存在时跳过，避免阻塞基线采集。
      const heading = page.locator('.controls-appearance-heading');
      if (await heading.count()) {
        if ((await heading.getAttribute('aria-expanded')) !== 'true') await heading.click();
        for (const mode of materialModes) {
          const button = page.getByRole('button', { name: mode.label, exact: true });
          if (!(await button.count())) continue;
          await button.first().click();
          await page.waitForTimeout(350);
          const modePath = prefix + '-' + mode.name + '.png';
          await page.screenshot({ path: modePath, fullPage: true });
          written.push(modePath);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log('视觉基线已采集 ' + written.length + ' 张：' + outputDir);
