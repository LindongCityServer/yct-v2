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
 *   - 分段控件不能只靠「标签收起」——紧凑模式下未选中项仍是 `flex-shrink: 0`，
 *     照样溢出，必须允许压缩 + 换行兜底。
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

console.log('── 2. 颜色行与颜色控件都改纵向 ──────────────────');

check(
  '档内 .metro-wayfinding-color-row 改单列',
  /\.metro-wayfinding-color-row,\s*\.metro-wayfinding-color-control > div \{\s*grid-template-columns: minmax\(0, 1fr\);\s*\}/.test(
    bandBlock,
  ),
);
check(
  '档内两个层级都带 min-width: 0（否则被 select 的 min-content 撑破）',
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
  '基础规则里颜色控件内部仍是「1fr + 40px 色块」',
  /\.metro-wayfinding-color-control > div \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) 40px;/.test(
    CSS,
  ),
);

console.log('── 4. 分段控件：可压缩 + 换行兜底 ───────────────');

check(
  '紧凑模式的选项容器允许换行',
  /\.metro-wayfinding-segmented-control\.is-compact > div \{\s*flex-wrap: wrap;/.test(CSS),
);
check(
  '换行后外壳退回 md 圆角（不再沿用胶囊形，否则椭圆会很难看）',
  /\.metro-wayfinding-segmented-control\.is-compact > div \{[^}]*border-radius: var\(--yct-radius-md\);/s.test(
    CSS,
  ),
);
check(
  '基础规则的外壳仍保留胶囊形（单行时不动）',
  /\.metro-wayfinding-segmented-control > div \{\s*[^}]*border-radius: var\(--yct-radius-pill\)/s.test(
    CSS,
  ),
);
check(
  '未选中项可压缩（flex-shrink 从 0 改成 1）',
  /\.metro-wayfinding-segmented-control\.is-compact button:not\(\.is-active\) \{\s*flex: 0 1 clamp\(48px, 10%, 72px\);/.test(
    CSS,
  ),
);
check(
  '未选中项的压缩下限是 max-content（不是 0，否则图标溢出按钮）',
  /\.metro-wayfinding-segmented-control\.is-compact button:not\(\.is-active\) \{[^}]*min-width: max-content;/s.test(
    CSS,
  ),
);
check(
  '选中项仍保留 min-width: max-content（标签不被截断）',
  /\.metro-wayfinding-segmented-control\.is-compact button\.is-active \{\s*flex: 1 1 auto;\s*min-width: max-content;\s*\}/.test(
    CSS,
  ),
);
check('旧的不可压缩写法已移除', !CSS.includes('flex: 0 0 clamp(48px, 10%, 72px)'));

console.log(`\n${passed}/${passed + failed} 通过`);
if (failed > 0) process.exit(1);
