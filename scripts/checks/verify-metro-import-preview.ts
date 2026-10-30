/**
 * 校验「工程转换预览 + 后台物料审核」的图形化预览契约。
 */
import { readFileSync } from 'node:fs';
const IMPORT_LIB = readFileSync(
  new URL('../../apps/web/lib/metro-wayfinding-import.ts', import.meta.url),
  'utf8',
);
const EDITOR = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-editor.tsx', import.meta.url),
  'utf8',
);
const ADMIN = readFileSync(
  new URL('../../apps/web/components/admin-materials-panel.tsx', import.meta.url),
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
// D1
check(
  'MetroWayfindingImportRowSource 含 elements 字段',
  /export interface MetroWayfindingImportRowSource \{[\s\S]*?elements: readonly MetroWayfindingElement\[\];/.test(
    IMPORT_LIB,
  ),
);
check(
  'buildRowSources 填充 elements',
  /function buildRowSources[\s\S]*?elements: \[\.\.\.row\],[\s\S]*?\};/.test(IMPORT_LIB),
);
check(
  'retainedRows 路径也填充 elements',
  /rowSources: retainedRows\.map\([\s\S]*?elements: item\.row,[\s\S]*?\}\)\),/.test(IMPORT_LIB),
);
check(
  'reorder 同时 swap rowSources',
  /\[rowSources\[fromIndex\], rowSources\[toIndex\]\] = \[rowSources\[toIndex\]!, rowSources\[fromIndex\]!\];/.test(
    IMPORT_LIB,
  ),
);
// D2
check(
  'MetroWayfindingExamplePreviewElement 被导出',
  /^export function MetroWayfindingExamplePreviewElement\(/m.test(EDITOR),
);
check(
  '弹窗用 strip 容器渲染每行',
  /className="metro-wayfinding-import-row-preview metro-wayfinding-element-strip"/.test(EDITOR),
);
check(
  '弹窗不再 <strong>{row.summary}</strong>',
  !/<strong>\{row\.summary\}<\/strong>/.test(EDITOR),
);
check(
  '弹窗用 MetroWayfindingExamplePreviewElement',
  /<MetroWayfindingExamplePreviewElement[\s\S]*?element=\{element\}/.test(EDITOR),
);
check(
  '弹窗中性色（transparent/inherit）',
  /inheritedBackgroundColor="transparent"/.test(EDITOR) &&
    /inheritedForegroundColor="inherit"/.test(EDITOR),
);
check(
  '弹窗保留 sr-only 文本摘要',
  /<span className="sr-only">\{row\.summary\}<\/span>/.test(EDITOR),
);
// D3
check(
  '中间内容包在 import-scroll 内',
  /<div className="metro-wayfinding-import-scroll">/.test(EDITOR),
);
check(
  'panel 是 grid 三行',
  /\.metro-wayfinding-import-dialog\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto;/.test(
    CSS,
  ),
);
check(
  '中间滚动区 overflow:auto',
  /\.metro-wayfinding-import-scroll\s*\{[\s\S]*?overflow: auto;/.test(CSS),
);
check(
  'footer 不再 sticky',
  !new RegExp(
    '\\.modal-panel\\.metro-wayfinding-import-dialog > footer \\{[\\s\\S]{0,300}?position: sticky',
  ).test(CSS),
);
check(
  'footer 仍是悬浮胶囊',
  /\.modal-panel\.metro-wayfinding-import-dialog > footer\s*\{[\s\S]*?border-radius: var\(--yct-radius-lg\);[\s\S]*?box-shadow: var\(--yct-shadow-floating\);/.test(
    CSS,
  ),
);
// D4
check('存在 .metro-wayfinding-element-strip', /\.metro-wayfinding-element-strip\s*\{/.test(CSS));
check(
  'space 沿用 space_bar / arrow_range 标识',
  /'space_bar'/.test(EDITOR) && /'arrow_range'/.test(EDITOR),
);
check(
  'strip 内 space 符号 opacity 透明一些',
  /\.metro-wayfinding-element-strip\s+\.metro-wayfinding-example-preview-element\.is-space\s+\.material-symbols-outlined\s*\{[\s\S]*?opacity: 0\.55;/.test(
    CSS,
  ),
);
check(
  'strip 内固定空格用 min-width 撑到 22px（绕开行内 flexBasis）',
  /\.metro-wayfinding-element-strip\s+\.metro-wayfinding-example-preview-element\.is-space\s*\{[\s\S]*?min-width: 22px;/.test(
    CSS,
  ),
);
check(
  'strip 不再用虚线浅底框/中心点渲染空格',
  !/1px dashed/.test(
    CSS.match(
      /\.metro-wayfinding-element-strip\s+\.metro-wayfinding-example-preview-element\.is-space[\s\S]*?\n\}/,
    )?.[0] ?? '',
  ) && !/\.metro-wayfinding-element-strip[\s\S]*?\.is-space\.is-flex::after/.test(CSS),
);
check(
  'strip 不再用死代码 is-line preview-element 规则（frameShape 不含 line）',
  !/\.metro-wayfinding-element-strip\s+\.metro-wayfinding-example-preview-element\.is-line\s*\{/.test(
    CSS,
  ),
);
check(
  '渲染空格符号走 renderSpaceIcons 开关（弹窗/后台开，模板库关）',
  /MetroWayfindingExamplePreviewElement[\s\S]*?renderSpaceIcons[\s\S]*?\{[\s\S]*?element\.mode === 'flex' \? 'arrow_range' : 'space_bar'/.test(
    EDITOR,
  ) &&
    /MetroWayfindingExamplePreviewElementElement[\s\S]*?element\.mode === 'flex' \? 'arrow_range' : 'space_bar'/m.test(
      EDITOR,
    ) === false,
);
check(
  '弹窗调用传 renderSpaceIcons',
  /<MetroWayfindingExamplePreviewElement[\s\S]*?inheritedForegroundColor="inherit"[\s\S]*?renderSpaceIcons/.test(
    EDITOR,
  ),
);
check(
  '后台调用传 renderSpaceIcons',
  /<MetroWayfindingExamplePreviewElement[\s\S]*?inheritedForegroundColor="inherit"[\s\S]*?renderSpaceIcons/.test(
    ADMIN,
  ),
);
check(
  'divider 仍是竖线',
  /\.metro-wayfinding-example-preview-element\.is-divider\s*\{[\s\S]*?flex: 0 0 1px;[\s\S]*?background: currentColor;/.test(
    CSS,
  ),
);
check(
  'divider 渲染不再带行内 backgroundColor（否则会盖掉 currentColor 竖线）',
  /className="metro-wayfinding-example-preview-element is-divider"[\s\S]{0,400}?color:\s*neutralizeColors/.test(
    EDITOR,
  ) && !/is-divider"[\s\S]{0,300}?style=\{style\}/.test(EDITOR),
);
// D6 中性化：文本色 + 透明背景，对齐 element-list
check(
  '组件有 neutralizeColors 开关',
  /neutralizeColors\?: boolean;/.test(EDITOR) && /neutralizeColors = false,/.test(EDITOR),
);
check(
  'neutralize 时元素背景透明、颜色走继承',
  /backgroundColor: neutralizeColors\s*\n?\s*\? 'transparent'/.test(EDITOR) &&
    /color: neutralizeColors\s*\n?\s*\? inheritedForegroundColor/.test(EDITOR),
);
check(
  'neutralize 时线路徽标不再出行内 segment.color',
  /style=\{neutralizeColors \? undefined : \{ backgroundColor: segment\.color \}\}/.test(EDITOR),
);
check(
  'neutralize 递归传给组合框子元素',
  /MetroWayfindingExamplePreviewElement[\s\S]*?renderSpaceIcons=\{renderSpaceIcons\}[\s\S]*?neutralizeColors=\{neutralizeColors\}/.test(
    EDITOR,
  ),
);
check(
  '弹窗与后台调用传 neutralizeColors',
  /inheritedForegroundColor="inherit"[\s\S]*?renderSpaceIcons[\s\S]*?neutralizeColors/.test(
    EDITOR,
  ) &&
    /inheritedForegroundColor="inherit"[\s\S]*?renderSpaceIcons[\s\S]*?neutralizeColors/.test(
      ADMIN,
    ),
);
check(
  'strip 文本色对齐 element-list 的 text-secondary',
  /\.metro-wayfinding-element-strip\s*\{[\s\S]*?color: var\(--yct-color-text-secondary\);/.test(
    CSS,
  ),
);
check(
  '中性线路徽标覆盖 #fff 白字并补边框',
  /\.metro-wayfinding-element-strip\s+\.metro-wayfinding-example-preview-element\.is-text\s+\.is-line\s*\{[\s\S]*?color: inherit;/.test(
    CSS,
  ),
);
// D5
check(
  'admin 导入 METRO_WAYFINDING_TEMPLATE_ID + parse',
  /import \{[^}]*METRO_WAYFINDING_TEMPLATE_ID,[^}]*parseMetroWayfindingLayout/m.test(ADMIN),
);
check(
  'admin 导入 MetroWayfindingExamplePreviewElement',
  /import \{ MetroWayfindingExamplePreviewElement \} from '\.\/metro-wayfinding-editor';/.test(
    ADMIN,
  ),
);
check(
  'formatMaterialDraftInput 返回 ReactNode',
  /function formatMaterialDraftInput\([\s\S]*?\): ReactNode/.test(ADMIN),
);
check(
  '后台识别 metro 模板渲染 strip',
  /draft\.templateId === METRO_WAYFINDING_TEMPLATE_ID[\s\S]*?parseMetroWayfindingLayout\(layoutText\)[\s\S]*?metro-wayfinding-element-strip/.test(
    ADMIN,
  ),
);
check(
  '后台预览用中性色',
  /inheritedBackgroundColor="transparent"[\s\S]*?inheritedForegroundColor="inherit"/.test(ADMIN),
);
check('后台布局改 <div>', /<div className="admin-material-draft-content">/.test(ADMIN));
check(
  '后台 .admin-material-draft-metro-preview 样式',
  /\.admin-material-draft-metro-preview\s*\{/.test(CSS),
);
// D7 —— 工程转换预览弹窗里的「转换后牌面」预览
// 契约：与版式模板示例卡片**共用同一份实现**（不另起一套样式），
// 数据取 activeImportPreview（已按当前转换方式归一化），所以切模式会实时变化。
check(
  '存在共用的 MetroWayfindingSignPreview（layout + canvas 入参）',
  /function MetroWayfindingSignPreview\(\{[\s\S]*?layout: MetroWayfindingLayout;[\s\S]*?canvas: Pick<MetroWayfindingProjectCanvas/.test(
    EDITOR,
  ),
);
check(
  'SignPreview 复用示例卡片的 preview / sign / row 三层结构',
  /function MetroWayfindingSignPreview[\s\S]*?metro-wayfinding-example-preview-sign[\s\S]*?aspectRatio[\s\S]*?metro-wayfinding-example-preview-row/.test(
    EDITOR,
  ),
);
check(
  '示例卡片改为委托 SignPreview（不重复实现牌面渲染）',
  /function MetroWayfindingExamplePreview\([\s\S]*?<MetroWayfindingSignPreview\s+layout=\{example\.project\.layout\}\s+canvas=\{example\.project\.canvas\}/.test(
    EDITOR,
  ),
);
check(
  '弹窗内牌面预览取转换后的 layout / canvas',
  /<MetroWayfindingSignPreview\s+layout=\{activeImportPreview\?\.layout \?\? importPreview\.layout\}\s+canvas=\{activeImportPreview\?\.canvas \?\? importPreview\.canvas\}/.test(
    EDITOR,
  ),
);
check(
  '牌面预览保持牌面配色（不传 neutralizeColors）',
  !/<MetroWayfindingSignPreview[\s\S]{0,400}neutralizeColors/.test(EDITOR),
);
check('牌面预览容器样式存在', /^\.metro-wayfinding-import-sign-preview \{/m.test(CSS));
check(
  '行清单改用转换后的行元素（activeImportRows）',
  /const activeImportRows = activeImportPreview\?\.layout\.rows \?\? importPreview\?\.layout\.rows \?\? \[\];/.test(
    EDITOR,
  ) && /const rowElements = activeImportRows\[index\] \?\? row\.elements;/.test(EDITOR),
);
// D8 —— 大文本内联编辑：下角标可在**任意位置**插入
check(
  '大文本改用内联段编辑器 LargeTextValueEditor',
  /function LargeTextValueEditor\(/.test(EDITOR),
);
check(
  '下角标渲染成 chip（复用主文本 chip 外壳）',
  /className="metro-wayfinding-main-segments-chip is-suffix"/.test(EDITOR),
);
check(
  '可在光标处插入下角标',
  // 文案已迁到 i18n（'在光标处添加下角标'），这里断言插入函数与 i18n 键同时存在。
  /insertSuffixAtCaret/.test(EDITOR) &&
    /t\('metroWayfindingEditor\.largeText\.insertSuffix'\)/.test(EDITOR),
);
check(
  '编辑写回 suffixes，并同步 legacy suffix',
  /patch\(\{ value, suffixes, suffix: tail\?\.value \?\? '' \}\)/.test(EDITOR),
);
check(
  '大文本预览按 runs 渲染（不再只读 element.suffix）',
  /splitMetroLargeTextRuns\(element\)/.test(EDITOR) && !/\{element\.suffix \? <small>/.test(EDITOR),
);
check(
  'CSS 有 is-suffix 角标 chip 样式',
  /^\.metro-wayfinding-main-segments-chip\.is-suffix \{/m.test(CSS),
);
check(
  '「添加下角标」按钮带 material 图标，且装在 caret-actions 里',
  /className="metro-wayfinding-main-segments-caret-actions"[\s\S]{0,400}insert-suffix[\s\S]{0,600}subscript/.test(
    EDITOR,
  ) && /^\.metro-wayfinding-main-segments-insert-suffix \.material-symbols-outlined \{/m.test(CSS),
);
check(
  '大文字字段用独立容器（不被 .material-field input 的特异性覆盖）',
  /className="metro-wayfinding-large-text-field"/.test(EDITOR) &&
    /^\.metro-wayfinding-large-text-field \{/m.test(CSS),
);
console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
