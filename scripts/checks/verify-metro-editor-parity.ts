/**
 * 校验两件事：
 *   A. 主文本 / 副文本编辑控件的样式规范统一；
 *   B. 地名输入建议按数据来源（服务器线网 / 自定义线网）限定。
 *
 * 这些都是源码级断言——它们约束的是「结构一致性」这种靠肉眼 review 容易漏、
 * 但一旦漂移就会产生两个控件外观/交互不一致的契约。
 */
import { readFileSync } from 'node:fs';

const EDITOR = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-editor.tsx', import.meta.url),
  'utf8',
);
const PANEL = readFileSync(
  new URL('../../apps/web/components/material-studio-panel.tsx', import.meta.url),
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

console.log('── A1. 主副文本共用同一外壳 ────────────────────');

check(
  '存在共用外壳组件 MetroWayfindingSegmentFieldShell',
  /function MetroWayfindingSegmentFieldShell\(/.test(EDITOR),
);
check(
  '外壳产出 .metro-wayfinding-main-segments 结构（标题行 + 输入容器）',
  /className="metro-wayfinding-main-segments"/.test(EDITOR) &&
    /className="metro-wayfinding-main-segments-input"/.test(EDITOR),
);
check(
  // 外壳刻意**不**渲染自己的标签行：行 <header> 已写「第 N 行 · 主/副文本」，
  // 动态字高也统一由上方的 .metro-wayfinding-text-metrics 给出（主/副一次说清）。
  // 文案已迁到 i18n（主文本 {main} · 副文本 {secondary}），这里断言结构而不是中文字面量。
  '外壳不重复渲染标签行，字高由统一指标栏给出',
  !/<strong>\{label\}<\/strong>/.test(EDITOR) &&
    /className="metro-wayfinding-text-metrics"/.test(EDITOR) &&
    /main:\s*formatMetroMetric\(metrics\.mainFontSize\)/.test(EDITOR) &&
    /secondary:\s*formatMetroMetric\(metrics\.secondaryFontSize\)/.test(EDITOR),
);

// 主副两个编辑器都必须经由外壳渲染，否则样式会再次分叉。
const shellUses = EDITOR.match(/<MetroWayfindingSegmentFieldShell/g) ?? [];
check('主文本编辑器使用外壳', shellUses.length >= 2);
check(
  '副文本编辑器 MetroWayfindingSecondaryField 使用外壳',
  /function MetroWayfindingSecondaryField\(/.test(EDITOR) &&
    /MetroWayfindingSegmentFieldShell/.test(
      EDITOR.slice(EDITOR.indexOf('function MetroWayfindingSecondaryField(')),
    ),
);

console.log('\n── A2. 副文本改用与主文本相同的输入框类 ──────────');

const secondaryBlock = EDITOR.slice(
  EDITOR.indexOf('function MetroWayfindingSecondaryField('),
  EDITOR.indexOf('function LargeTextElementFields('),
);
check(
  '副文本输入框用 .metro-wayfinding-main-segments-text（与主文本同款）',
  /className="metro-wayfinding-main-segments-text"/.test(secondaryBlock),
);
check(
  '副文本输入框包在 -text-flow 行内整体里',
  /metro-wayfinding-main-segments-text-flow/.test(secondaryBlock),
);
check('副文本不再使用旧的 material-field 包装', !/className="material-field"/.test(secondaryBlock));
check(
  '旧的 MetroWayfindingTextAutocompleteInput 已删除',
  !/MetroWayfindingTextAutocompleteInput/.test(EDITOR),
);
check(
  '旧的 metro-wayfinding-text-autocomplete CSS 已清理',
  !/\.metro-wayfinding-text-autocomplete/.test(CSS),
);
check(
  'material-field-text-autocomplete 保留（另一处仍在用）',
  /\.material-field-text-autocomplete \{/.test(CSS),
);

console.log('\n── A3. 副文本交互行为与主文本一致 ─────────────');

check(
  '副文本也用光标后的幽灵建议',
  /metro-wayfinding-main-segments-suggestion/.test(secondaryBlock),
);
check(
  '副文本建议按「光标前文本」匹配',
  /const textBeforeCaret =/.test(secondaryBlock) &&
    /matchTextContinuation\(textBeforeCaret, suggestions\)/.test(secondaryBlock),
);
check('副文本 Tab 采纳建议', /event\.key === 'Tab' && suggestion/.test(secondaryBlock));
check(
  '副文本按钮 mousedown 阻止失焦',
  /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/.test(secondaryBlock),
);
check(
  '副文本光标在 onSelect / onClick / onKeyUp / onChange 同步',
  (secondaryBlock.match(/syncCaretOffset\(event\.currentTarget\)/g) ?? []).length >= 3,
);
check(
  '副文本输入框宽度自适应（size + field-sizing）',
  /size=\{Math\.max\(value\.length, 1\)\}/.test(secondaryBlock) &&
    /field-sizing: content/.test(CSS),
);

console.log('\n── A4. 副文本行渲染改用新组件 ──────────────────');

check('副文本行渲染 MetroWayfindingSecondaryField', /<MetroWayfindingSecondaryField/.test(EDITOR));
check(
  '副文本行标签沿用「第 N 行副文本内容」格式',
  /label=\{t\('metroWayfindingEditor\.text\.secondaryRowLabel',\s*\{\s*index:\s*index \+ 1\s*\}\)\}/.test(
    EDITOR,
  ),
);
check(
  // 副文本行一度被 <label className="material-field"> 包着——那会把它拖回
  // 44px 高的通用输入框外观，正是「统一」要消除的差异。
  '副文本行不再被 material-field 包裹',
  !/<label className="material-field">\s*<span>副文本内容/.test(EDITOR),
);

console.log('\n── A5. 点击空白聚焦最后一个可编辑段 ─────────────');

check('外壳提供 onBlankPointerDown 钩子', /onBlankPointerDown\?: \(\) => void;/.test(EDITOR));
check(
  '只有点击空白处才接管（命中子元素时放行）',
  /if \(event\.target !== event\.currentTarget\) return;/.test(EDITOR),
);
check(
  '主文本实现 focusLastEditableSegment（从行尾往前找）',
  /const focusLastEditableSegment = \(\) => \{/.test(EDITOR) &&
    /for \(let index = normalizedSegments\.length - 1; index >= 0; index -= 1\)/.test(EDITOR),
);
check(
  '主文本：文本段落点末尾、chip 落点段内',
  /focusTextSegment\(index, target\.value\.length\)/.test(EDITOR) &&
    /focusChipInput\(index\);/.test(EDITOR),
);
check('主文本把钩子接到外壳', /onBlankPointerDown=\{focusLastEditableSegment\}/.test(EDITOR));
check(
  '副文本也把钩子接到外壳',
  /const focusLastEditableSegment = \(\) => \{/.test(secondaryBlock) &&
    /onBlankPointerDown=\{focusLastEditableSegment\}/.test(secondaryBlock),
);

console.log('\n── A6. 移除多余标签行与左侧竖线 ────────────────');

check('外壳不再渲染自己的标签行', !/<strong>\{label\}<\/strong>/.test(EDITOR));
check(
  '外壳已无 fontSize 入参（字高不再逐行重复）',
  !/fontSize/.test(EDITOR.slice(EDITOR.indexOf('function MetroWayfindingSegmentFieldShell('))),
);
check(
  '左侧竖线已移除（.metro-wayfinding-main-segments 无 border-left / padding-left）',
  (() => {
    const match = CSS.match(/\.metro-wayfinding-main-segments \{[^}]*\}/);
    return Boolean(match) && !/border-left/.test(match![0]) && !/padding-left/.test(match![0]);
  })(),
);
check(
  '指向已删标签行的 CSS 选择器已清理',
  !/\.metro-wayfinding-main-segments > div:first-child/.test(CSS),
);

console.log('\n── B1. 建议列表按数据来源限定 ──────────────────');

check(
  'metroTextSuggestions 依赖 transitNetworkSource（切换即重算）',
  /const metroTextSuggestions = useMemo\(\(\) => \{/.test(PANEL) &&
    /\}, \[importedTransitNetwork, locations, transitLines, transitStations, transitNetworkSource\]\);/.test(
      PANEL,
    ),
);

const suggestionsBlock = PANEL.slice(
  PANEL.indexOf('const metroTextSuggestions = useMemo('),
  PANEL.indexOf('const metroExampleStationOptions = useMemo('),
);
check(
  '按 transitNetworkSource === rmp 分流',
  /transitNetworkSource === 'rmp'/.test(suggestionsBlock),
);
check(
  '自定义线网：取 RMP 站点节点的 names（主站名 / 副站名）',
  /importedTransitNetwork\?\.nodes/.test(suggestionsBlock) &&
    /\.filter\(\(node\) => node\.kind === 'station'\)/.test(suggestionsBlock) &&
    /\.flatMap\(\(node\) => node\.names\)/.test(suggestionsBlock),
);
check(
  '服务器线网：含服务器 POI（locations.label）',
  /locations\.map\(\(location\) => location\.label\)/.test(suggestionsBlock),
);
check(
  '服务器线网：含服务器线路站序主站名',
  /transitLines\.flatMap\(\(line\) => line\.stations\.map\(\(station\) => station\.stationName\)\)/.test(
    suggestionsBlock,
  ),
);
check(
  '服务器线网：含服务器站点主站名',
  /transitStations\.map\(\(station\) => station\.stationName\)/.test(suggestionsBlock),
);
check(
  '两来源互斥（三元分支，不再合并成一个数组）',
  /const values =\s*transitNetworkSource === 'rmp'/.test(suggestionsBlock),
);

console.log('\n── B2. 建议仍去重排序 ─────────────────────────');

check(
  '去重 + 排序保留',
  /Array\.from\(new Set\(values\.map\(\(value\) => value\.trim\(\)\)\.filter\(Boolean\)\)\)\.sort/.test(
    suggestionsBlock,
  ),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
