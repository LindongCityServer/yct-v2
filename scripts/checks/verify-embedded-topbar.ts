/**
 * 校验嵌入模式下二级顶栏的观感与布局规则。
 *
 * 这里防的是两个真实出现过的缺陷：
 *
 * 1. **二级页面的工具栏与返回按钮缺少背景/投影。**
 *    一级工具栏类名是 `.topbar-actions`，二级是 `.secondary-actions`，两者不同；
 *    而返回按钮那条又写成 `.topbar:not(.secondary-topbar) > .icon-button`，
 *    把二级顶栏（`<header class="topbar secondary-topbar">`）排除在外。
 *    嵌入模式下页面背景本身就是透明的，于是这两处等于「隐形」。
 *
 * 2. **二级页面的工具栏跑到标题右侧，而不是右上角。**
 *    根因是 `:root[data-embedded] .secondary-topbar { display: flex; }` 覆盖了基础规则的
 *    `display: grid; grid-template-columns: 40px minmax(0, 1fr) auto`。标题列是 `1fr`，
 *    只有 grid 下它才撑满并把 `.secondary-actions` 顶到右边缘；改成 flex 之后，
 *    `.secondary-actions`（它没有 `margin-left: auto`，靠的是 grid 第三列）就紧贴标题了。
 *
 * 断言一律先在**剥离注释**后的 CSS 上匹配——中文注释里会反引号引用类名字面量
 * （例如 `.topbar:not(.secondary-topbar)`），直接在原文上匹配会误伤反向哨兵。
 */
import { readFileSync } from 'node:fs';

const rawCss = readFileSync(new URL('../../apps/web/app/globals.css', import.meta.url), 'utf8');
const CSS = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

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

/** 取出匹配到的那条规则（选择器 + 规则体）。 */
function ruleBody(pattern: RegExp): string {
  const match = pattern.exec(CSS);
  return match ? match[0] : '';
}

const floatingSurface =
  /background:\s*color-mix\(in srgb, var\(--yct-color-surface-panel\) 92%, transparent\);/;

const embeddedSecondaryTopbar = ruleBody(/:root\[data-embedded\]\s+\.secondary-topbar\s*\{[^}]*\}/);
// 药丸背景按「只命中一次」拆成两条规则：一级页面加在 .topbar 的直接子级，
// 二级页面加在 .secondary-topbar 的直接子级，并排除内层工作台工具栏。
const embeddedPrimaryActions = ruleBody(
  /:root\[data-embedded\]:not\(\[data-material-mode='advanced'\]\)\s+\.topbar:not\(\.secondary-topbar\)\s*>\s*\.topbar-actions:has\(> \*\)\s*\{[^}]*\}/,
);
const embeddedSecondaryActions = ruleBody(
  /:root\[data-embedded\]:not\(\[data-material-mode='advanced'\]\)\s+\.secondary-topbar\s*>\s*\.secondary-actions:has\(> \*\):not\(:has\(> \.material-studio-topbar-actions\)\)\s*\{[^}]*\}/,
);
const embeddedTopbarIcon = ruleBody(
  /:root\[data-embedded\]:not\(\[data-material-mode='advanced'\]\)\s+\.topbar\s*>\s*\.icon-button\s*\{[^}]*\}/,
);

console.log('── 1. 二级顶栏在嵌入模式下必须保持 grid 三列 ──────');

check('嵌入模式规则声明 display: grid', /display:\s*grid;/.test(embeddedSecondaryTopbar));
check(
  '嵌入模式规则声明 grid-template-columns: 40px minmax(0, 1fr) auto',
  /grid-template-columns:\s*40px minmax\(0,\s*1fr\) auto;/.test(embeddedSecondaryTopbar),
);
check(
  '嵌入模式规则不再把二级顶栏改成 flex（否则工具栏会紧贴标题右侧）',
  embeddedSecondaryTopbar.length > 0 && !/display:\s*flex;/.test(embeddedSecondaryTopbar),
);
check(
  '基础 .secondary-topbar 仍是 grid 三列（单一真源）',
  /\.secondary-topbar\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*40px minmax\(0,\s*1fr\) auto;/.test(
    CSS,
  ),
);

console.log('── 2. 非透光材质下，工具栏与返回按钮要有背景/投影 ──────');

check(
  '一级工具栏药丸只作用于 .topbar 的直接子级 .topbar-actions',
  embeddedPrimaryActions.length > 0,
);
check(
  '二级工具栏药丸只作用于 .secondary-topbar 的直接子级 .secondary-actions',
  embeddedSecondaryActions.length > 0,
);
check(
  '两条药丸规则都带 :has(> *)（`secondaryActions` 是可选 prop，防空 div 渲染出空药丸）',
  /:has\(> \*\)/.test(embeddedPrimaryActions) && /:has\(> \*\)/.test(embeddedSecondaryActions),
);
check(
  '两条药丸规则都声明 box-shadow: var(--yct-shadow-floating)',
  /box-shadow:\s*var\(--yct-shadow-floating\);/.test(embeddedPrimaryActions) &&
    /box-shadow:\s*var\(--yct-shadow-floating\);/.test(embeddedSecondaryActions),
);
check(
  '两条药丸规则都声明不透明背景',
  floatingSurface.test(embeddedPrimaryActions) && floatingSurface.test(embeddedSecondaryActions),
);
check(
  '二级规则排除内层工作台工具栏（避免药丸套药丸）',
  /:not\(:has\(> \.material-studio-topbar-actions\)\)/.test(embeddedSecondaryActions),
);
check(
  '不存在同时命中内外两层的并列药丸规则',
  !/:is\(\.topbar-actions, \.secondary-actions\):has\(> \*\)[^{]*\{[^}]*border-radius:\s*var\(--yct-radius-pill\)/.test(
    CSS,
  ),
);
check(
  '返回按钮规则用 .topbar > .icon-button（不再排除 .secondary-topbar）',
  /\.topbar\s*>\s*\.icon-button\s*\{/.test(embeddedTopbarIcon),
);
check(
  '返回按钮规则声明投影与背景',
  /box-shadow:\s*var\(--yct-shadow-floating\);/.test(embeddedTopbarIcon) &&
    floatingSurface.test(embeddedTopbarIcon),
);

console.log('── 3. 悬停反馈也要覆盖二级页面 ──────');

check(
  '存在 .topbar > .icon-button:hover（二级返回按钮的非透光悬停）',
  /:root\[data-embedded\]\s+\.topbar\s*>\s*\.icon-button:hover/.test(CSS),
);
check(
  '工具栏内按钮的悬停同样并列了两个工具栏类名',
  /:root\[data-embedded\]\s+:is\(\.topbar-actions, \.secondary-actions\)\s*>\s*\.icon-button:hover/.test(
    CSS,
  ),
);

console.log('── 4. 反向哨兵：不要再出现「排除二级顶栏」的写法 ──────');

check(
  '不存在 .topbar:not(.secondary-topbar) > .icon-button 选择器',
  !/\.topbar:not\(\.secondary-topbar\)\s*>\s*\.icon-button/.test(CSS),
);

console.log(`\n${passed} 通过，${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
