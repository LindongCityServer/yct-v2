/**
 * 校验「版式与外观」工具栏的默认收起行为。
 *
 * 关键风险是**判定只发生在挂载首帧**：内容常常是挂载之后才进来的
 * （套用示例 / 导入 RMP 项目），那时首帧已经判定过「空牌 → 展开」，
 * 工具栏就会一直占着高度。
 *
 * 同时要防另一个方向的回归：如果写成「有内容就收起」，用户手动展开后
 * 每敲一个字都会被折叠回去（排版过程中 layout 每次编辑都变）。
 * 所以只允许在「空 → 非空」这一跳收起一次。
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

console.log('── 1. 有内容的判定抽成了模块级函数 ──────────────');

check(
  '存在 hasMetroWayfindingContent',
  /function hasMetroWayfindingContent\(\s*layout: MetroWayfindingLayout\s*\)/.test(SOURCE),
);
check(
  '判定是「任一行有元素」',
  /layout\.rows\.some\(\(elements\) => elements\.length > 0\)/.test(SOURCE),
);
// 模块级：必须在组件声明之前，否则每次渲染都会重建闭包。
check(
  '定义在组件外（不随渲染重建）',
  SOURCE.indexOf('function hasMetroWayfindingContent') <
    SOURCE.indexOf('export function MetroWayfindingEditor'),
);

console.log('── 2. 首帧仍按「空牌才展开」初始化 ──────────────');

check(
  '初始值是 !hasMetroWayfindingContent(parseMetroWayfindingLayout(value))',
  /useState\(\s*\(\) => !hasMetroWayfindingContent\(parseMetroWayfindingLayout\(value\)\)/.test(
    SOURCE,
  ),
);
check('旧的内联首帧判定已移除', !SOURCE.includes('parseMetroWayfindingLayout(value).rows.some('));
check(
  '旧的只读 state（无 setter）已移除',
  !SOURCE.includes('const [isToolbarExpanded] = useState'),
);

console.log('── 3. 挂载后才进来的内容也会收起 ────────────────');

check(
  '用 ref 记住上一次是否有内容',
  /const hadContentRef = useRef\(!isToolbarExpanded\)/.test(SOURCE),
);
check(
  'effect 依赖 layout',
  /useEffect\(\(\) => \{\s*const hasContent = hasMetroWayfindingContent\(layout\);[\s\S]*?\}, \[layout\]\);/.test(
    SOURCE,
  ),
);
check(
  '只在「空 → 非空」这一跳收起',
  /if \(hasContent && !hadContentRef\.current\) setIsToolbarExpanded\(false\);/.test(SOURCE),
);
check('每次都回填 ref', /hadContentRef\.current = hasContent;/.test(SOURCE));

console.log('── 4. 防止反向回归：有内容就无条件收起 ──────────');

check(
  '不存在「有内容就无条件收起」的写法',
  !/if \(hasContent\)\s*setIsToolbarExpanded\(false\)/.test(SOURCE),
);
check(
  '收起判断一定带上 hadContentRef 守卫',
  !/setIsToolbarExpanded\(false\)/.test(
    SOURCE.replace('if (hasContent && !hadContentRef.current) setIsToolbarExpanded(false);', ''),
  ),
);

console.log('── 5. details 受控且能回写用户手动开合 ──────────');

check(
  'open 绑定 isToolbarExpanded',
  /<details\s+className="metro-wayfinding-toolbar"\s+open=\{isToolbarExpanded\}/.test(SOURCE),
);
check(
  'onToggle 回写状态（否则用户点开后 React 状态与 DOM 不同步）',
  /onToggle=\{\(event\) => setIsToolbarExpanded\(event\.currentTarget\.open\)\}/.test(SOURCE),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
