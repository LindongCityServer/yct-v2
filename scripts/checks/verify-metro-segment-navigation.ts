/**
 * 校验内联输入框里「方向键跨段切换焦点」的接线是否完整。
 *
 * 这是一组源码级断言（不跑 DOM），因为该交互的关键风险是：
 *   1. chip 输入框**根本没接**方向键（历史上只处理了 Backspace）；
 *   2. 跨段时只清了 activeTextIndex 而没真的移动 DOM 焦点 → 看起来毫无反应；
 *   3. 落点方向搞反（从右边进来却落到开头）；
 *   4. 行首/行尾越界时仍然 preventDefault，把浏览器的默认行为吞掉。
 */
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(
  new URL('../../apps/web/components/metro-wayfinding-editor.tsx', import.meta.url),
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

/** 从 marker 处起，取出紧随其后的第一个 `{ … }` 块（按括号配平）。 */
function blockFrom(haystack: string, marker: string): string {
  const start = haystack.indexOf(marker);
  if (start < 0) return '';
  const begin = haystack.indexOf('{', start);
  if (begin < 0) return '';
  let depth = 0;
  for (let i = begin; i < haystack.length; i += 1) {
    const ch = haystack[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return haystack.slice(begin, i + 1);
    }
  }
  return haystack.slice(begin);
}

/** 从 marker 处起取一段窗口，用于「某个元素自己的属性区」。 */
function windowFrom(haystack: string, marker: string, length: number): string {
  const start = haystack.indexOf(marker);
  return start < 0 ? '' : haystack.slice(start, start + length);
}

const TEXT_INPUT_MARKER = 'className="metro-wayfinding-main-segments-text"';
const CHIP_INPUT_MARKER = 'className="metro-wayfinding-main-segments-chip-input"';

const arrowHandler = blockFrom(SOURCE, 'const handleSegmentArrow = (');
const focusNeighbor = blockFrom(SOURCE, 'const focusNeighborSegment = (');
const textKeyDown = blockFrom(
  windowFrom(SOURCE, TEXT_INPUT_MARKER, 1800),
  'onKeyDown={(event) => {',
);
const chipKeyDown = blockFrom(
  windowFrom(SOURCE, CHIP_INPUT_MARKER, 1200),
  'onKeyDown={(event) => {',
);

console.log('── 1. 两种输入框都接了方向键 ────────────────────');

check('文本段输入框接了 ArrowLeft', /ArrowLeft/.test(textKeyDown));
check('文本段输入框接了 ArrowRight', /ArrowRight/.test(textKeyDown));
check(
  '文本段方向键走 handleSegmentArrow',
  /handleSegmentArrow\(index, 'left'/.test(textKeyDown) &&
    /handleSegmentArrow\(index, 'right'/.test(textKeyDown),
);
check('chip 输入框接了 ArrowLeft', /ArrowLeft/.test(chipKeyDown));
check('chip 输入框接了 ArrowRight', /ArrowRight/.test(chipKeyDown));
check(
  'chip 方向键走 handleSegmentArrow',
  /handleSegmentArrow\(index, 'left'/.test(chipKeyDown) &&
    /handleSegmentArrow\(index, 'right'/.test(chipKeyDown),
);
check('chip 仍保留退格删除 chip', /handleChipBackspace\(index, event\)/.test(chipKeyDown));

console.log('── 2. 处理器只有一份，旧名已清干净 ──────────────');

check('存在 handleSegmentArrow', arrowHandler.length > 0);
check('旧名 handleTextArrow 已移除', !SOURCE.includes('handleTextArrow'));
check('旧名 handleChipArrow 已移除', !SOURCE.includes('handleChipArrow'));

console.log('── 3. 真的移动了 DOM 焦点（不是只清 activeTextIndex）──');

check(
  '方向键处理器里没有 setActiveTextIndex（旧的无效果写法）',
  arrowHandler.length > 0 && !arrowHandler.includes('setActiveTextIndex'),
);
check('跨段落点走 focusNeighborSegment', arrowHandler.includes('focusNeighborSegment('));
check('落到 chip 用 focusChipInput', focusNeighbor.includes('focusChipInput('));
check('落到文本段用 focusTextSegment', focusNeighbor.includes('focusTextSegment('));
// blockFrom 只取函数体，签名要单独取（块里不含 `(index: number, offset?: number)`）。
const focusChipDecl = windowFrom(SOURCE, 'const focusChipInput = (', 60);
check(
  'chip 落点可指定偏移（focusChipInput 有可选 offset）',
  /offset\?:\s*number/.test(focusChipDecl),
);

console.log('── 4. 落点方向与视线一致 ────────────────────────');

// 左移进入 chip → 末尾（不传 offset 即默认末尾）；右移进入 chip → 开头（0）。
check(
  'chip 落点：left→末尾（undefined）、right→开头（0）',
  /focusChipInput\(targetIndex,\s*direction === 'left' \? undefined : 0\)/.test(focusNeighbor),
);
// 左移进入文本段 → 末字符后；右移进入文本段 → 段首。
check(
  '文本段落点：left→value.length、right→0',
  /focusTextSegment\(targetIndex,\s*direction === 'left' \? target\.value\.length : 0\)/.test(
    focusNeighbor,
  ),
);

console.log('── 5. 边界判定与越界放行 ────────────────────────');

check(
  '左移判定用的是段首（selectionStart === 0）',
  /direction === 'left' \? !atStart : !atEnd/.test(arrowHandler),
);
check(
  'atStart 用 selectionStart/End 双 0 判定',
  /const atStart = input\.selectionStart === 0 && input\.selectionEnd === 0/.test(arrowHandler),
);
check(
  'atEnd 用 selection 等于 value.length 判定',
  /const atEnd =\s*input\.selectionStart === input\.value\.length && input\.selectionEnd === input\.value\.length/.test(
    arrowHandler,
  ),
);
check(
  '无相邻段时返回 false（不吞事件）',
  /if \(!normalizedSegments\[targetIndex\]\) return false;/.test(arrowHandler),
);
check(
  '相邻段索引按方向 ±1',
  /const targetIndex = direction === 'left' \? index - 1 : index \+ 1;/.test(arrowHandler),
);

console.log('── 6. 只认左/右（上下留给跨行导航）──────────────');

check('方向键处理器不出现 ArrowUp / ArrowDown', !/ArrowUp|ArrowDown/.test(arrowHandler));
check(
  '文本段与 chip 的方向键分支都不出现 ArrowUp / ArrowDown',
  !/ArrowUp|ArrowDown/.test(textKeyDown) && !/ArrowUp|ArrowDown/.test(chipKeyDown),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
