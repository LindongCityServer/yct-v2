/**
 * 物料工作台两条回归契约：
 *
 * A. 标题栏「显示 / 隐藏全部面板」必须复用工具条的胶囊按钮，不再单独长成一个
 *    品牌色图标；材质不能在组件里写死，而要交给 `.editor-toolbar-group` 的通用
 *    规则 + `LiquidMaterialBridge` 随「材质模式」切换。
 *
 * B. 物料预览必须和导出同源：
 *    - 线路类模板套用线网时，中文「开往终点」和下一站要按行车方向一起推导，
 *      否则方向版式会只剩「开往」两个字（预览缺字）；
 *    - 本地 SVG 预览不再叠加预览卡片的描边 / 投影 / 圆角。
 */
import { readFileSync } from 'node:fs';
import { readAppStyles } from './app-styles';

const PANEL = readFileSync(
  new URL('../../apps/web/components/material-studio-panel.tsx', import.meta.url),
  'utf8',
);
const TOGGLE = readFileSync(
  new URL('../../apps/web/components/editor/editor-panel-toggle-portal.tsx', import.meta.url),
  'utf8',
);
const CSS = readAppStyles();

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

console.log('── 1. 标题栏面板开关：工具条胶囊 + 材质模式 ──────');

check(
  '面板开关挂进工具条外壳（is-in-header + 专用类）',
  /className="editor-toolbar is-in-header editor-header-panel-toggle-toolbar"/.test(TOGGLE),
);
check(
  '按钮复用 .editor-toolbar-button（与标题栏工具按钮同款）',
  /editor-toolbar-button editor-header-panel-toggle/.test(TOGGLE),
);
check(
  '单按钮包在 .editor-toolbar-group 胶囊里（材质由桥接层接管）',
  /editor-toolbar-group/.test(TOGGLE),
);
check('不再引入独立的圆形 IconButton', !/import \{ IconButton \}/.test(TOGGLE));
check(
  'CSS 提供标题栏开关的定位与尺寸覆盖',
  /\.secondary-leading-slot \.editor-header-panel-toggle-toolbar\s*\{/.test(CSS) &&
    /\.editor-header-panel-toggle-toolbar \.editor-toolbar-group\s*\{/.test(CSS),
);
check(
  '透光模式下胶囊由通用 `.editor-toolbar-group` 材质规则接管',
  /:root\[data-material-mode='advanced'\][\s\S]{0,1200}?\.editor-toolbar-group/.test(CSS),
);
check(
  '非透光模式由通用规则保持透明（不硬编码底色）',
  /:root:not\(\[data-material-mode='advanced'\]\) \.editor-toolbar-group\s*\{[\s\S]*?background: transparent;/.test(
    CSS,
  ),
);
check(
  '中等宽度跟随标题栏工具按钮缩到 34px',
  /\.editor-header-panel-toggle-toolbar \.editor-toolbar-button\s*\{[\s\S]*?width: 34px;[\s\S]*?height: 34px;/.test(
    CSS,
  ),
);

console.log('\n── 2. 线路套用：开往终点与下一站按方向推导 ──────');

check(
  '写入中文开往终点（不再只写拼音）',
  /setField\('terminalName', stationNames\[terminalIndex\]\)/.test(PANEL),
);
check(
  '末端站下标随行车方向取首站 / 末站',
  /terminalIndex = travelDirection === 'first' \? 0 : lastStationIndex/.test(PANEL),
);
check(
  '下一站按行车方向取邻站',
  /travelDirection === 'first'[\s\S]{0,80}?currentIndex - 1[\s\S]{0,40}?currentIndex \+ 1/.test(
    PANEL,
  ),
);
check(
  '模板库卡片按目标模板家族换算字段（不误用当前来源）',
  /buildTransitNetworkFieldValues\(\s*card\.template\.fields,\s*card\.template\.family,?\s*\)/.test(
    PANEL,
  ),
);
check(
  '切换行车方向时重推开往终点与下一站',
  /setInput\(\(current\) => \{[\s\S]*?terminalName: terminal,[\s\S]*?nextStationName,/.test(PANEL),
);

console.log('\n── 3. 预览与导出同源：本地 SVG 预览不叠加卡片装饰 ───────────');

check(
  '预览舞台不再用圆角 / overflow 裁掉物料牌面',
  /\.transit-material-preview-frame \.material-preview-stage\s*\{[\s\S]*?overflow: visible;[\s\S]*?border-radius: 0;/.test(
    CSS,
  ),
);
check(
  '本地 SVG 预览去掉卡片描边 / 投影 / 圆角',
  /\.transit-material-preview-frame \.material-preview-canvas\.material-preview-svg\s*\{[\s\S]*?border-radius: 0;[\s\S]*?outline: none;[\s\S]*?box-shadow: none;/.test(
    CSS,
  ),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
