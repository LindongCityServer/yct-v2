/**
 * 校验「光标处建议 + 内联按钮」在编辑器源码里的接线是否完整。
 *
 * 这是一组源码级断言（不跑 DOM），因为该交互的关键风险是：
 *   1. 建议是否真的基于「光标之前的文本」算，而不是整行；
 *   2. 建议后缀是否只渲染「待追加」的部分（否则会把用户输入重复一遍）；
 *   3. 两个添加按钮是否挂在光标处（caret-actions），而不是行尾固定位置；
 *   4. 光标位置是否在 onSelect/onClick/onKeyUp/onChange 里同步。
 */
import { readFileSync } from 'node:fs';
import {
  matchTextContinuation,
  expandSuggestionVariants,
} from '../../apps/web/lib/text-continuation';

const SOURCE = readFileSync(
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

const STATIONS = ['人民广场', '人民广场东', '陆家嘴', '南京东路', '静安寺'];

console.log('── 1. 光标前文本 → 针对性建议 ──────────────────');

// 用户在「人民广场」后继续敲「地」：应针对性补出地铁站，而不是随便一个站。
{
  const m = matchTextContinuation('人民广场地', STATIONS);
  check('「人民广场地」建议后缀为「铁站」', m?.suffix === '铁站');
  check('「人民广场地」候选是「人民广场地铁站」', m?.candidate === '人民广场地铁站');
  check('补全后整串正确', m?.next === '人民广场地铁站');
}
// 用户输入到「人民广场站」：已完整命中，不应再建议。
{
  const m = matchTextContinuation('人民广场站', STATIONS);
  check('「人民广场站」已完整命中，不补全', m === undefined);
}
// 候选库里有更长的「人民广场东」：用户打完「人民广场」应补出更短的那条。
{
  const m = matchTextContinuation('人民广场地', STATIONS);
  check('多候选取补全幅度最小的', m?.candidate === '人民广场地铁站');
}
// 变体派生：裸站名要能派生出「地铁站」「站」。
{
  const v = expandSuggestionVariants('人民广场');
  check('裸站名派生 3 个变体', v.length === 3);
  check('变体含「人民广场地铁站」', v.includes('人民广场地铁站'));
  check('变体含「人民广场站」', v.includes('人民广场站'));
}

console.log('\n── 2. 编辑器接线：光标定位 ─────────────────────');

check(
  '按「光标前文本」计算建议（textBeforeCaret）',
  /const textBeforeCaret = useMemo\(/.test(SOURCE) &&
    /segment\.value\.slice\(0, caretOffset/.test(SOURCE),
);
check('建议取 match.suffix 而非整串', /return match\?\.suffix \|\| undefined;/.test(SOURCE));
check(
  'matchTextContinuation 已导入',
  // 不要依赖行号——import 行会随无关改动上下浮动，改成在 import 区里找。
  /import \{[^}]*matchTextContinuation[^}]*\} from '\.\.\/lib\/text-continuation';/.test(SOURCE),
);
check(
  '光标位置在 onSelect / onClick / onKeyUp / onChange 同步',
  (SOURCE.match(/syncCaretOffset\(event\.currentTarget\)/g) ?? []).length >= 3 &&
    /setCaretOffset\(offset\);/.test(SOURCE),
);
check(
  'commit 同步 caretOffset',
  /setCaretOffset\(caret && !caretInChip \? caret\.offset : null\)/.test(SOURCE),
);

console.log('\n── 3. 渲染位置：光标之后（而非行尾）────────────────');

const suggestionIdx = SOURCE.indexOf('metro-wayfinding-main-segments-suggestion');
const textFlowIdx = SOURCE.indexOf('metro-wayfinding-main-segments-text-flow');
const chipIdx = SOURCE.indexOf('key={`chip-${index}`}');
check('幽灵建议元素存在', suggestionIdx > 0);
check('建议渲染在文本段流程内（text-flow 之后）', textFlowIdx > 0 && suggestionIdx > textFlowIdx);
check('建议在第一个 chip 之前（不在行尾）', chipIdx > 0 && suggestionIdx < chipIdx);
check(
  '建议只在当前光标段渲染（caretIndex === index 守卫）',
  /caretIndex === index \? \(\s*<>\s*\{caretSuggestion \? \(/.test(SOURCE),
);
check('建议后缀直接作为按钮文本渲染', /\{caretSuggestion\}\s*<\/button>/.test(SOURCE));

console.log('\n── 4. 添加按钮内联到光标处 ─────────────────────');

check(
  '两个按钮在 caret-actions 容器里',
  /metro-wayfinding-main-segments-caret-actions/.test(SOURCE),
);
check(
  '行尾的旧 insert 容器已移除',
  !/className="metro-wayfinding-main-segments-insert"/.test(SOURCE),
);
const caretActionsIdx = SOURCE.indexOf('metro-wayfinding-main-segments-caret-actions');
check('按钮组在建议之后（贴着光标）', caretActionsIdx > suggestionIdx);
check('按钮组在第一个 chip 之前', chipIdx > 0 && caretActionsIdx < chipIdx);
check(
  '按钮用 mousedown 阻止失焦（否则建议会闪没）',
  (SOURCE.match(/onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/g) ?? []).length >= 3,
);
check(
  '两个按钮仍走 insertChipAtCaret',
  /insertChipAtCaret\('line'\)/.test(SOURCE) && /insertChipAtCaret\('boxed'\)/.test(SOURCE),
);

console.log('\n── 5. 采纳建议的两种入口 ───────────────────────');

check(
  'Tab 优先采纳光标处建议',
  /if \(caretSuggestion\) \{[\s\S]{0,120}acceptCaretSuggestion\(\);/.test(SOURCE),
);
check('点击建议按钮采纳', /onClick=\{acceptCaretSuggestion\}/.test(SOURCE));
check(
  'acceptCaretSuggestion 在光标处插入后缀',
  /const at = caretOffset \?\? segment\.value\.length;/.test(SOURCE) &&
    /at \+ caretSuggestion\.length/.test(SOURCE),
);

console.log('\n── 6. CSS ────────────────────────────────────');

check('建议样式存在', /\.metro-wayfinding-main-segments-suggestion \{/.test(CSS));
check('建议用虚线底边区分未落盘文本', /border-bottom: 1px dashed/.test(CSS));
check('text-flow 行内容器样式存在', /\.metro-wayfinding-main-segments-text-flow \{/.test(CSS));
check('caret-actions 样式存在', /\.metro-wayfinding-main-segments-caret-actions \{/.test(CSS));
check(
  '按钮样式已迁移到 caret-actions',
  /\.metro-wayfinding-main-segments-caret-actions > button \{/.test(CSS),
);
check('旧的 insert 容器样式已删除', !/\.metro-wayfinding-main-segments-insert \{/.test(CSS));

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
