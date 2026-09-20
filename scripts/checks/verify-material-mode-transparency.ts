/**
 * 校验「简约材质模式下，完全透明的东西不被填成完全不透明的背景」。
 *
 * 根因：`:root[data-material-mode='performance'] :is(..., .module-panel, ...)` 会把一整批
 * 面板强制刷成 `var(--yct-color-surface-panel)`（实色）；但 `.secondary-content .module-panel`
 * 在设计上**就该是透明的**（二级页面里模块只是容器，卡片由内部的 .settings-row 等承担），
 * 于是均衡/透光模式下正常、唯独简约模式多出一层实色底——正是「看着不协调」的来源。
 *
 * 同类问题不止一处：电报发送台 `.telegraph-send-stage` 也在那份实色清单里，而它的
 * `background: transparent` 没带 `!important`，于是简约模式下发送台背后同样被刷出实色底
 * （同批的 `.telegraph-output-section` 早已用 `!important` 自保，发送台是漏掉的那一半）。
 *
 * 要防两头：
 *   - 修复规则的特异性必须**高于**简约模式那条（同权重则后写的赢，一旦有人把它挪到
 *     简约规则之前就会静默失效），因此必须自带 `:root[data-material-mode='performance']`
 *     前缀而不是只写 `.secondary-content .module-panel`；
 *   - `@media (prefers-reduced-transparency: reduce)` 的退路用的是 `!important`，
 *     但它只覆盖 `.app-toast`/`.modal-panel`/`.bottom-nav` 等浮层，**不含** `.module-panel`
 *     ——本修复因此不会被打回去；反过来，若有人把 `.module-panel` 塞进那条退路，
 *     修复就会静默失效，所以脚本里留了反向哨兵。
 */
import { readFileSync } from 'node:fs';

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

/** 取出某个选择器开头的整条规则（含注释前的花括号块）。 */
function ruleBody(selectorPattern: RegExp): string {
  const match = selectorPattern.exec(CSS);
  return match ? match[0] : '';
}

console.log('── 1. 二级页面里的模块面板：设计上就是透明的 ──────');

check(
  '`.secondary-content .module-panel` 基础规则声明 background: transparent',
  /\.secondary-content \.module-panel \{\s*border: 0;\s*padding: 0;\s*background: transparent;\s*\}/.test(
    CSS,
  ),
);

console.log('── 2. 简约模式下把它压回透明（本次修复）──────────');

const overrideBody = ruleBody(
  /:root\[data-material-mode='performance'\] \.secondary-content \.module-panel \{[^}]*\}/s,
);

check('存在针对简约模式的透明覆盖规则', overrideBody.length > 0);
check('覆盖规则把背景设为 transparent', /background: transparent;/.test(overrideBody));
check(
  '覆盖规则不带 !important（否则会压过系统级减少透明的 !important 退路）',
  overrideBody.length > 0 && !/!important/.test(overrideBody),
);

console.log('── 3. 简约模式的实色化清单本身没被改坏 ───────────');

// 清单必须还在：面板类元素在别处（首页/服务页/弹窗）仍然需要实色底。
const perfListMatch = /:root\[data-material-mode='performance'\]\s*:is\(([^)]*)\)\s*\{/s.exec(CSS);
const perfList = perfListMatch ? perfListMatch[1] : '';

check('简约模式实色化规则仍然存在', perfList.length > 0);
check(
  '清单里仍包含 .module-panel（不能整体删掉）',
  /(^|,)\s*\.module-panel\s*(,|$)/m.test(perfList),
);
check(
  '清单里仍包含 .app-toast / .modal-panel 等浮层',
  perfList.includes('.app-toast') && perfList.includes('.modal-panel'),
);

console.log('── 4. 系统级减少透明的退路仍然生效 ───────────────');

const reduceStart = CSS.indexOf('@media (prefers-reduced-transparency: reduce)');
const reduceBlock =
  reduceStart < 0
    ? ''
    : (() => {
        let depth = 0;
        for (let i = CSS.indexOf('{', reduceStart); i < CSS.length; i += 1) {
          if (CSS[i] === '{') depth += 1;
          else if (CSS[i] === '}') {
            depth -= 1;
            if (depth === 0) return CSS.slice(reduceStart, i + 1);
          }
        }
        return '';
      })();

check('存在 @media (prefers-reduced-transparency: reduce) 退路', reduceStart >= 0);
check(
  '退路用 !important 强制实色（能压过本修复的普通声明）',
  /background: var\(--yct-color-surface-panel\) !important;/.test(reduceBlock),
);
check(
  '退路覆盖浮层（.app-toast / .modal-panel / .bottom-nav）',
  /\.app-toast/.test(reduceBlock) &&
    /\.modal-panel/.test(reduceBlock) &&
    /\.bottom-nav/.test(reduceBlock),
);
// 反向哨兵：退路只管浮层，不该把 .module-panel 拉进来——否则本修复会被 !important 打回去。
// （曾经误以为退路含 .module-panel，实测不含：二级页面容器不是浮层，保持透明是对的。）
check(
  '退路不含 .module-panel（否则本修复会被 !important 打回去）',
  !/\.module-panel/.test(reduceBlock),
);

console.log('── 5. 同类元素靠 !important 自保（不能被顺手去掉）──');

// 电报输出区/发送台同样「设计上透明」，且都在简约实色清单里，必须用 !important 压过去。
// 历史上 .telegraph-output-section 加了、.telegraph-send-stage 漏了，于是简约模式下
// 发送台背后被刷出一块完整面板底——这组断言就是防那一半再漏掉。
check(
  '.telegraph-output-section 与 .telegraph-send-stage 都在简约实色清单里（所以保护是必要的）',
  perfList.includes('.telegraph-output-section') && perfList.includes('.telegraph-send-stage'),
);
check(
  '.telegraph-output-section 仍用 background: transparent !important 自保',
  /\.telegraph-output-section \{[^}]*background: transparent !important;/s.test(CSS),
);
check(
  '.telegraph-send-stage 仍用 background: transparent !important 自保',
  /\.telegraph-send-stage \{[^}]*background: transparent !important;/s.test(CSS),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
