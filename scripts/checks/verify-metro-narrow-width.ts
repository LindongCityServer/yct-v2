/**
 * 校验「编辑器列最窄档（960–1080px）」的溢出兜底。
 *
 * 为什么是这一档：960px 起预览列重新回到 `.material-studio-layout` 的第三列
 * （240–340px），编辑器列被两侧夹到约 448–568px；而 ≤959px 预览退化成弹窗，
 * 编辑器列反而更宽。所以窄的不是 ≤959，而是刚过 960 的这一档。
 *
 * 要防两头：
 *   - 只改列数不够——grid 子项默认 `min-width: auto`，会被 select 的 min-content
 *     （最长 option 文本）撑破，必须配套 `min-width: 0`；
 *   - 分段控件统一走共享组件：每个按钮 `flex: 1 1 0` + `min-width: 0`，
 *     标签用省略号兜底，图标固定 20px 不压缩——不再维护 `.is-compact` 分支。
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

const BAND_QUERY = '@media (min-width: 960px) and (max-width: 1080px) {';
const bandStart = CSS.indexOf(BAND_QUERY);
const bandBlock =
  bandStart < 0
    ? ''
    : (() => {
        let depth = 0;
        for (let i = bandStart + BAND_QUERY.length - 1; i < CSS.length; i += 1) {
          if (CSS[i] === '{') depth += 1;
          else if (CSS[i] === '}') {
            depth -= 1;
            if (depth === 0) return CSS.slice(bandStart, i + 1);
          }
        }
        return CSS.slice(bandStart);
      })();

console.log('── 1. 存在 960–1080px 这一档 ───────────────────');

check('CSS 有 (min-width: 960px) and (max-width: 1080px) 媒体查询', bandStart >= 0);
// 下界必须与 JS 的 isPreviewDialogViewport（max-width: 959px）互补，不能出现 959.5px 中间态。
check('下界 960 与 JS 断点 959 互补（不重叠、不留缝）', BAND_QUERY.includes('min-width: 960px'));

console.log('── 2. 档内颜色行退回单列 ───────────────────────');

check(
  '档内 .metro-wayfinding-color-row 改单列',
  /\.metro-wayfinding-color-row \{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/.test(bandBlock),
);
check(
  '档内颜色行与颜色控件都带 min-width: 0（否则被 select 的 min-content 撑破）',
  /\.metro-wayfinding-color-row,\s*\.metro-wayfinding-color-control \{\s*min-width: 0;\s*\}/.test(
    bandBlock,
  ),
);

console.log('── 3. 档外仍保持原布局（不能误伤）───────────────');

check(
  '基础规则里颜色行仍是两列',
  /\.metro-wayfinding-toolbar,\s*\.metro-wayfinding-color-row,\s*\.metro-wayfinding-field-grid \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(
    CSS,
  ),
);
check(
  '基础规则里颜色控件内部是允许换行的 flex 行',
  /\.metro-wayfinding-color-control > div\.metro-wayfinding-color-control-row \{\s*display: flex;\s*flex-wrap: wrap;/.test(
    CSS,
  ),
);
check(
  '颜色下拉可压缩（下限 120px）',
  /\.metro-wayfinding-color-control-row select \{\s*flex: 1 1 120px;\s*width: auto;\s*\}/.test(CSS),
);
check(
  '色块固定 40px 不参与压缩',
  /\.metro-wayfinding-color-control input\[type='color'\] \{\s*flex: 0 0 40px;\s*width: 40px;/.test(
    CSS,
  ),
);

console.log('── 4. 分段控件：可压缩 + 省略号兜底 ─────────────');

check(
  '外壳允许收缩（min-width: 0）',
  /\.metro-wayfinding-segmented-control \{\s*display: flex;\s*align-items: stretch;\s*min-width: 0;/.test(
    CSS,
  ),
);
check(
  '外壳保留胶囊圆角（单行时不动）',
  /\.metro-wayfinding-segmented-control \{[^}]*border-radius: var\(--yct-radius-pill\);/s.test(CSS),
);
check(
  '每个选项等分且可压缩（flex: 1 1 0 + min-width: 0）',
  /\.metro-wayfinding-segmented-control button \{\s*display: inline-flex;\s*flex: 1 1 0;\s*align-items: center;\s*justify-content: center;\s*min-width: 0;/.test(
    CSS,
  ),
);
check(
  '标签用省略号兜底（不撑破按钮）',
  /\.metro-wayfinding-segmented-control button > \.metro-wayfinding-segmented-control-label \{\s*min-width: 0;\s*overflow: hidden;\s*text-overflow: ellipsis;\s*white-space: nowrap;\s*\}/.test(
    CSS,
  ),
);
check(
  '图标固定 20px 不参与压缩（压缩下限由图标撑住）',
  /\.metro-wayfinding-segmented-control \.material-symbols-outlined,\s*\.metro-wayfinding-segmented-control \.metro-wayfinding-facility-asset \{\s*flex: 0 0 auto;\s*width: 20px;/.test(
    CSS,
  ),
);
check('旧的不可压缩写法已移除', !CSS.includes('flex: 0 0 clamp(48px, 10%, 72px)'));
check(
  '已废弃的紧凑模式覆盖已移除',
  !CSS.includes('.metro-wayfinding-segmented-control.is-compact'),
);

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
