/**
 * 导视牌工作台两条回归契约：
 *
 * A. 组合框子元素必须展开到图层树，作为组合框节点的子节点；点子元素时选中仍落在
 *    组合框本身，并把子元素 id 传给「组合框子元素」弹窗用于定位。
 *
 * B. 文本元素的内联输入框必须输入法安全：
 *    - 组合输入开始时用 DOM 当前值承接草稿，不能用慢一拍的 `value` prop 写回
 *      （写回会取消组合并吞掉已输入的字）；
 *    - 普通输入也先写草稿再提交，父级回传慢一拍时受控值不会把字符冲掉；
 *    - 组合期间的 Backspace / 方向键不交给段编辑逻辑。
 */
import { readFileSync } from 'node:fs';
import { readAppStyles } from './app-styles';

const WORKSPACE = readFileSync(
  new URL('../../apps/web/components/transit-wayfinding-workspace.tsx', import.meta.url),
  'utf8',
);
const EDITOR = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-editor.tsx', import.meta.url),
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

const imeStart = EDITOR.indexOf('function ImeSafeTextField(');
const imeEnd = EDITOR.indexOf('function MainSegmentEditor(', imeStart);
const IME = imeStart >= 0 && imeEnd > imeStart ? EDITOR.slice(imeStart, imeEnd) : '';

console.log('── A. 组合框子元素展开到图层树 ──────────────────');

check(
  '图层树渲染组合框子元素列表',
  /className="poi-visual-layer-points is-combination-children"/.test(WORKSPACE),
);
check(
  '子元素来自组合框 children，保留子元素序号',
  /element\.type === 'combination' && element\.children\.length/.test(WORKSPACE) &&
    /element\.children\.map\(\(child, childIndex\)/.test(WORKSPACE) &&
    /\{childIndex \+ 1\}/.test(WORKSPACE),
);
check(
  '子节点复用元素素材缩略图与内容摘要',
  /<MetroWayfindingElementGlyph element=\{child\} \/>/.test(WORKSPACE) &&
    /describeMetroWayfindingElementContent\(child\)/.test(WORKSPACE),
);
check(
  '点子元素仍选中组合框，并记录子元素定位',
  /selectElement\(rowIndex, element\.id, child\.id\)/.test(WORKSPACE) &&
    /selectedCombinationChildId/.test(WORKSPACE),
);
check(
  '子元素定位随选中变化 / 子元素删除后清理',
  /selectedElement\.children\.some\(\(child\) => child\.id === current\)/.test(WORKSPACE),
);
check(
  '工作台把子元素定位传给元素属性面板',
  /combinationChildId=\{selectedCombinationChildId \?\? undefined\}/.test(WORKSPACE),
);
check(
  '属性面板把定位转给组合框子元素编辑器',
  /focusChildId=\{combinationChildId\}/.test(EDITOR) &&
    /const \[selectedChildId, setSelectedChildId\] = useState\(element\.children\[0\]\?\.id \?\? ''\)/.test(
      EDITOR,
    ) &&
    /setSelectedChildId\(\(current\) => \(current === focusChildId \? current : focusChildId\)\)/.test(
      EDITOR,
    ),
);
check(
  '组合框行用紧凑子元素计数，避免展开后仍显示整串内容',
  /组合框\$\{[\s\S]{0,120}?element\.children\.length[\s\S]{0,80}?项/.test(WORKSPACE),
);
check(
  '子元素层有独立的缩进样式（不继续沿用 16px 大缩进）',
  /\.transit-wayfinding-workspace \.poi-visual-layer-points\.is-combination-children\s*\{/.test(
    CSS,
  ),
);

console.log('\n── B. 内联输入框输入法安全 ──────────────────────');

check('存在 ImeSafeTextField 组件', imeStart >= 0);
check(
  '组合开始用 DOM 当前值承接草稿（不是 value prop）',
  /onCompositionStart=\{\(event\) => \{[\s\S]{0,400}?setDraftValue\(event\.currentTarget\.value\)/.test(
    IME,
  ),
);
check(
  '组合开始不再用 value prop 写回草稿',
  !/onCompositionStart=\{[\s\S]{0,400}?setDraftValue\(value\)/.test(IME),
);
check(
  '普通输入也先写本地草稿再提交',
  /onChange=\{\(event\) => \{[\s\S]{0,200}?setDraftValue\(next\);[\s\S]{0,120}?if \(composingRef\.current\) return;[\s\S]{0,120}?commit\(next, event\.currentTarget\)/.test(
    IME,
  ),
);
check(
  '只响应父级模型值真的变化，旧值重渲染不清草稿',
  /const lastValuePropRef = useRef\(value\)/.test(IME) &&
    /if \(value === lastValuePropRef\.current\) return;/.test(IME),
);
check(
  '模型追上草稿 / 外部追加 / 失焦后才丢弃草稿',
  /value === draftValue \|\|[\s\S]{0,120}?!focusedRef\.current \|\|[\s\S]{0,120}?value\.startsWith\(draftValue\)/.test(
    IME,
  ),
);
check(
  '组合期间不把按键交给段编辑逻辑',
  /onKeyDown=\{\(event\) => \{[\s\S]{0,120}?if \(composingRef\.current\) return;[\s\S]{0,80}?onKeyDown\?\.\(event\)/.test(
    IME,
  ),
);
check(
  '组合期间不因光标同步触发重渲染',
  /onSelect=\{\(event\) => \{[\s\S]{0,80}?if \(composingRef\.current\) return;/.test(IME) &&
    /onKeyUp=\{\(event\) => \{[\s\S]{0,80}?if \(composingRef\.current\) return;/.test(IME),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) {
  process.exitCode = 1;
}
