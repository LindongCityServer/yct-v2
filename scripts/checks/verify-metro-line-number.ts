/**
 * 校验全项目统一的线路编号提取：`extractMetroWayfindingLineNumber`。
 *
 * 这个函数是「选择线路」面板与 chip 显示的唯一真源，必须同时满足：
 *   数字/字母组合优先（S1 → S1，ＡＰＭ → APM），中文线路名回退首字（环线 → 环），
 *   全角转半角，且去得掉「号线 / 路 / Line」等后缀。
 */
import { extractMetroWayfindingLineNumber } from '../../apps/web/lib/metro-wayfinding';

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

const CASES: [string, string][] = [
  ['2号线', '2'],
  ['S1线', 'S1'],
  ['环线', '环'],
  ['京港地铁1号线', '1'],
  ['１０号线', '10'],
  ['ＡＰＭ线', 'APM'],
  ['Line 3', '3'],
  ['1号线', '1'],
  ['', ''],
  ['   ', ''],
];

for (const [input, expected] of CASES) {
  check(
    `${JSON.stringify(input)} → ${JSON.stringify(expected)}`,
    extractMetroWayfindingLineNumber(input) === expected,
  );
}

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed) process.exit(1);
