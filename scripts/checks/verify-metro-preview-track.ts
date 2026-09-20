/**
 * 校验「宽屏预览轨道」布局契约：
 *
 *   ≥960px 时，预览面板与导视牌辅助面板（插入建议 / 宽度警告）必须共用
 *   material-studio-layout 的**同一列**，预览在上、辅助面板在下；
 *   <960px 时预览退化为弹窗、辅助面板回到编辑器内，轨道容器必须整体透明，
 *   堆叠顺序与改动前一致。
 *
 * 这套断言约束的是「结构 + 断点一致性」：
 *   - 断点必须由 JS 的 matchMedia 单点驱动（CSS 不再自己写 960px），
 *     否则 959.5px 这类小数视口会出现 CSS/JS 判定打架的中间态；
 *   - 顺序契约（预览在上、警告在建议之上）靠肉眼 review 极易漂移。
 */
import { readFileSync } from 'node:fs';

const PANEL = readFileSync(
  new URL('../../apps/web/components/material-studio-panel.tsx', import.meta.url),
  'utf8',
);
const INSPECTOR = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-inspector.tsx', import.meta.url),
  'utf8',
);
const EDITOR = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-editor.tsx', import.meta.url),
  'utf8',
);
const CSS = readFileSync(new URL('../../apps/web/app/globals.css', import.meta.url), 'utf8');

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

const trackIndex = PANEL.indexOf('material-studio-preview-track');
const previewIndex = PANEL.indexOf('className="material-preview"');
const inspectorIndex = PANEL.indexOf('<MetroWayfindingInspector');

console.log('── C1. 宽屏：预览与辅助面板同列 ────────────────');

check('宿主存在预览轨道容器 .material-studio-preview-track', trackIndex >= 0);
check(
  '轨道容器只出现一次（不散落多处，避免顺序分叉）',
  PANEL.split('material-studio-preview-track').length === 2,
);
check(
  '预览面板位于轨道容器内、且在辅助面板之上',
  trackIndex >= 0 && previewIndex > trackIndex && inspectorIndex > previewIndex,
);
check(
  '轨道容器在辅助面板之后闭合（两者同属一个 grid 列）',
  inspectorIndex > 0 && />\s*\)\s*:\s*null\}\s*<\/div>\s*<\/div>/.test(PANEL.slice(inspectorIndex)),
);
check(
  '预览仍在渲染预览舞台（未被误移出轨道）',
  PANEL.slice(trackIndex, inspectorIndex).includes('<MaterialPreviewStage'),
);
// 编辑器列通常最长，轨道吸顶后滚动编辑元素时预览与建议仍在视野内；
// max-height + overflow 是「轨道比视口还高」时的兜底，避免吸顶后底部被永久裁掉。
check(
  '轨道容器吸顶并带 max-height + overflow 保护',
  /\.material-studio-preview-track \{[^}]*position: sticky;[^}]*max-height: calc\(100dvh[^}]*overflow-y: auto;/s.test(
    CSS,
  ),
);
// 顶栏 .topbar 是 sticky + z-index 10，轨道的吸顶偏移必须让开它，否则会被压住。
check(
  '吸顶偏移让开 sticky 顶栏（--yct-topbar-height）',
  /\.material-studio-preview-track \{[^}]*top: calc\(var\(--yct-topbar-height\) \+ var\(--yct-space-4\)\);/s.test(
    CSS,
  ),
);

console.log('\n── C2. 断点由 JS 单点驱动 ─────────────────────');

check(
  '断点常量为 (max-width: 959px)，与「宽屏 ≥960px」互补',
  /const MATERIAL_PREVIEW_DIALOG_MEDIA_QUERY = '\(max-width: 959px\)'/.test(PANEL),
);
check(
  '轨道容器用 is-stacked 条件类切换（不再由 CSS 媒体查询切）',
  /className=\{`material-studio-preview-track\$\{isPreviewDialogViewport \? ' is-stacked' : ''\}`\}/.test(
    PANEL,
  ),
);
// 顶层规则缩进为 0；被 @media 包裹的规则会有前导空格。
// 轨道容器的断点必须完全交给 JS，CSS 侧一旦出现 @media 版本就会与 matchMedia 判定打架。
// 只匹配**单行**的选择器声明（行首必须是 `.`，中间不允许跨行，避免匹配到块注释里
// 出现的 `.material-studio-preview-track` 字面量引用）。
const trackSelectorLines = CSS.match(/^\.material-studio-preview-track[^{}\n]*\{$/gm) ?? [];
check(
  'CSS 侧不为轨道容器写媒体查询断点（顶层规则，避免与 JS 判定漂移）',
  trackSelectorLines.length >= 2 && trackSelectorLines.every((line) => !/^\s/.test(line)),
);
check(
  'CSS 有 .material-studio-preview-track 基础规则（grid + align-content: start + min-width: 0）',
  /\.material-studio-preview-track \{[^}]*display: grid;[^}]*align-content: start;[^}]*min-width: 0;/s.test(
    CSS,
  ),
);
check(
  'CSS 有 .is-stacked { display: contents }（窄屏容器整体透明）',
  /\.material-studio-preview-track\.is-stacked \{\s*display: contents;\s*\}/.test(CSS),
);
check(
  '预览是否退化为弹窗与辅助面板是否挂到轨道共用同一判定 isPreviewDialogViewport',
  /const isMetroInspectorDetached = isMetroWayfinding && !isPreviewDialogViewport;/.test(PANEL) &&
    /\{!isPreviewDialogViewport \? \([\s\S]{0,200}?<section className="material-preview"/.test(
      PANEL,
    ),
);

console.log('\n── C3. 视口变化及时更新 ───────────────────────');

const viewportBlock = PANEL.slice(
  PANEL.indexOf('const previewDialogQuery = window.matchMedia'),
  PANEL.indexOf('const previewDialogQuery = window.matchMedia') + 1200,
);
check(
  'syncViewport 同时刷新预览断点与单列断点',
  /setIsPreviewDialogViewport\(previewDialogQuery\.matches\);/.test(viewportBlock) &&
    /setIsSingleColumnViewport\(singleColumnQuery\.matches\);/.test(viewportBlock),
);
check(
  '两个断点都注册了 change 监听（视口变化即重渲染）',
  /previewDialogQuery\.addEventListener\('change', syncViewport\);/.test(viewportBlock) &&
    /singleColumnQuery\.addEventListener\('change', syncViewport\);/.test(viewportBlock),
);
check('挂载时先同步一次（首帧不残留 SSR 默认值）', /syncViewport\(\);/.test(viewportBlock));

console.log('\n── C4. 轨道内顺序：警告在上、建议在下方 ────────');

check(
  'Inspector 内宽度警告排在插入建议之前',
  INSPECTOR.indexOf('metro-wayfinding-width-warning') >= 0 &&
    INSPECTOR.indexOf('<MetroWayfindingInsertionSuggestions') >= 0 &&
    INSPECTOR.indexOf('metro-wayfinding-width-warning') <
      INSPECTOR.indexOf('<MetroWayfindingInsertionSuggestions'),
);
check(
  'Inspector 仍是网格容器（align-content: start），顺序由源码决定而非样式',
  /\.metro-wayfinding-inspector \{[^}]*display: grid;[^}]*align-content: start;/s.test(CSS),
);

console.log('\n── C5. 窄屏堆叠不受影响 ───────────────────────');

check(
  '窄屏回落：编辑器按 rendersInspector 就地渲染同一个 Inspector',
  /rendersInspector=\{!isMetroInspectorDetached\}/.test(PANEL) &&
    /\{rendersInspector \? \([\s\S]{0,200}?<MetroWayfindingInspector/.test(EDITOR),
);
check(
  '编辑器内的 Inspector 与轨道内的共用同一组件（不复制一份）',
  /import \{ MetroWayfindingInspector \} from '\.\/metro-wayfinding-inspector';/.test(EDITOR) &&
    /import \{ MetroWayfindingInspector \} from '\.\/metro-wayfinding-inspector';/.test(PANEL),
);
check(
  '窄屏下 layout 仍退化为单列（≤760px 媒体查询保留）',
  /@media \(max-width: 760px\)/.test(CSS) &&
    /\.material-studio-layout \{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/.test(
      CSS.slice(CSS.indexOf('@media (max-width: 760px)')),
    ),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
