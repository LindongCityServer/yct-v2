/**
 * 校验全局单选框规范与「选择行」布局。
 *
 * 背景：项目此前**根本没有** `input[type='radio']` 的任何样式。而
 * `.material-canvas-editor input` 这类「不限类型」的文本框规则会直接命中 radio——
 * `width:100% + min-height:44px + 1px 描边 + 12px 内边距`，把它撑成占满整行的
 * 大方块并挤掉同行标签。多选模式因为 checkbox 有全局尺寸锁定所以一直正常，
 * 于是这个坑只在「单选」模式才暴露。
 *
 * 所以这里的断言重点不是「有没有样式」，而是：
 *   1. 尺寸是否被 !important 双向锁定（压过容器规则）；
 *   2. 文本框的描边/圆角/底色是否被重置（否则 radio 顶着一个方框底）；
 *   3. 行布局类是否有单选语义版本，且标签侧能收缩。
 */
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../apps/web/app/globals.css', import.meta.url), 'utf8');
const PANEL = readFileSync(
  new URL('../../apps/web/components/material-studio-panel.tsx', import.meta.url),
  'utf8',
);
const SHOWCASE = readFileSync(
  new URL('../../apps/web/app/dev/controls/controls-showcase.tsx', import.meta.url),
  'utf8',
);

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`);
  }
}

const radioBlock = CSS.match(/input\[type='radio'\] \{[^}]*\}/)?.[0] ?? '';

console.log('── 1. 单选框有全局规范 ─────────────────────────');

check('存在 input[type=radio] 基础规则', radioBlock.length > 0);
check(
  '尺寸双向锁定 18px（width/height/min/max 全带 !important）',
  /width: 18px !important;/.test(radioBlock) &&
    /height: 18px !important;/.test(radioBlock) &&
    /min-width: 18px !important;/.test(radioBlock) &&
    /min-height: 18px !important;/.test(radioBlock) &&
    /max-width: 18px !important;/.test(radioBlock) &&
    /max-height: 18px !important;/.test(radioBlock),
);
check('flex: 0 0 auto（不参与拉伸）', /flex: 0 0 auto;/.test(radioBlock));
check('padding 清零（挡掉文本框内边距）', /padding: 0 !important;/.test(radioBlock));

console.log('── 2. 重置文本框外观（关键：否则顶着方框底）─────');

check('border: 0 !important', /border: 0 !important;/.test(radioBlock));
check('background: transparent !important', /background: transparent !important;/.test(radioBlock));
check('border-radius: 50% !important', /border-radius: 50% !important;/.test(radioBlock));
check('accent-color 用主色', /accent-color: var\(--yct-color-primary\);/.test(radioBlock));

console.log('── 3. 状态齐全（与复选框一致）──────────────────');

check(
  '悬停切 primary-hover',
  /input\[type='radio'\]:not\(:disabled\):hover \{\s*accent-color: var\(--yct-color-primary-hover\);/.test(
    CSS,
  ),
);
check(
  '焦点可见环',
  /input\[type='radio'\]:focus-visible \{\s*outline: 2px solid var\(--yct-color-primary\);/.test(
    CSS,
  ),
);
check(
  '禁用降透明度且禁止点击',
  /input\[type='radio'\]:disabled \{\s*cursor: not-allowed;\s*opacity: 0\.48;/.test(CSS),
);

console.log('── 4. 选择行布局覆盖单选语义类名 ────────────────');

check(
  'material-radio-row / radio-row 与复选框行同源',
  /\.material-checkbox-row,\s*\.material-radio-row,\s*\.checkbox-row,\s*\.radio-row \{/.test(CSS),
);
check(
  '标签侧可收缩（> span 规则覆盖单选行）',
  /\.material-checkbox-row > span,\s*\.material-radio-row > span,\s*\.checkbox-row > span,\s*\.radio-row > span \{/.test(
    CSS,
  ),
);
check('字段集内单选行同样跨整行', /\.material-canvas-editor \.material-radio-row,/.test(CSS));

console.log('── 5. 使用方已改过来 ───────────────────────────');

check(
  '线路选择在单选模式下用 material-radio-row（不是永远 checkbox 行）',
  /className=\{\s*usesSingleTransitLineSelection\s*\?\s*'material-radio-row'\s*:\s*'material-checkbox-row'\s*\}/.test(
    PANEL,
  ),
);
check(
  'dev/controls 有单选框回归场景（字段集内 + 超长标签）',
  /id="controls-radio-in-fieldset"/.test(SHOWCASE) &&
    /material-canvas-editor/.test(SHOWCASE) &&
    /很长很长很长很长很长很长的线路名称/.test(SHOWCASE),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
