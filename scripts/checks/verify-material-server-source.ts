/**
 * 校验「数据来源」模式（服务器线网 / 导入项目）下的物料字段必填口径。
 *
 * 背景：公交站牌（横版线路详情）模板的「运营时间」在界面上**没有输入框**——
 * `material-studio-panel` 在 server 模式只渲染 `serverOverride && userEditable !== false`
 * 的字段，其余字段的值全部由数据来源派生。而导入项目几乎不会存储运营时间，
 * 一旦该字段仍按 `required` 校验，预览会永远失败且用户没有任何补救手段
 * （历史上本地模板存档里这条字段就是 `required: true`、且丢了 `serverOverride`）。
 *
 * 因此约定：**数据来源模式下，用户填不了的字段允许为空**；用户能填的字段
 * （如主题颜色）照旧按必填校验；手动输入模式始终保持严格。
 *
 * 本脚本把这条口径固化成断言，避免以后有人把「放宽」误改成「全部放宽」或改回严格。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MaterialTemplateField } from '@yct/contracts';
import {
  formatServiceTimeRange,
  parseServiceTimeRange,
} from '../../apps/web/lib/material-service-time';
import {
  isMaterialFieldEditableInServerMode,
  validateMaterialInput,
} from '../../apps/web/lib/material-renderer';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}

/** 横版公交站牌详情模板的字段子集：运营时间必填但用户填不了，主题颜色用户可填。 */
const fields: MaterialTemplateField[] = [
  { key: 'accentColor', label: '主题颜色', kind: 'color', required: true, serverOverride: true },
  { key: 'routeNumber', label: '线路编号', kind: 'text', required: true },
  { key: 'routeServiceTime', label: '运营时间', kind: 'text', required: true },
  { key: 'routeStations', label: '完整站点列表（用 / 分隔）', kind: 'text', required: true },
  { key: 'routeMapData', label: '线路走向地图数据', kind: 'text', userEditable: false },
];

/** 导入项目解析结果：运营时间没有数据来源，解析为空串。 */
const importedValues = {
  accentColor: '#26CABA',
  routeNumber: '12',
  routeServiceTime: '',
  routeStations: 'A 站\nB 站',
  routeMapData: '{}',
};

function errorOf(run: () => unknown): string {
  try {
    run();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// 1. 数据来源口径：用户填不了的必填字段缺失时不报错。
const serverValues = validateMaterialInput(fields, importedValues, {
  allowMissingServerDerivedValues: true,
});
check('数据来源：缺失的运营时间不再阻断预览', serverValues.routeServiceTime === '');

// 2. 同一份数据在手动输入口径下仍然严格（用户自己填的表单不能留空）。
check(
  '手动输入：运营时间缺失仍然报错',
  errorOf(() => validateMaterialInput(fields, importedValues)).includes('运营时间不能为空'),
);

// 3. 用户能填的必填字段（serverOverride）不受放宽影响，两个口径都报错。
const missingColor = { ...importedValues, accentColor: '' };
check(
  '用户可填的必填字段仍按必填校验（数据来源）',
  errorOf(() =>
    validateMaterialInput(fields, missingColor, { allowMissingServerDerivedValues: true }),
  ).includes('主题颜色不能为空'),
);
check(
  '用户可填的必填字段仍按必填校验（手动输入）',
  errorOf(() => validateMaterialInput(fields, missingColor)).includes('主题颜色不能为空'),
);

// 4. 放宽只认「server 模式下有没有输入框」这一个判据。
check(
  'server 模式可编辑字段 = serverOverride 且未被显式禁止编辑',
  isMaterialFieldEditableInServerMode(fields[0]!) === true &&
    isMaterialFieldEditableInServerMode(fields[1]!) === false &&
    isMaterialFieldEditableInServerMode(fields[4]!) === false,
);

// 5. 面板确实只为这批字段渲染输入框，否则「用户填不了」的前提就不成立。
const studioSource = readFileSync(
  resolve(import.meta.dirname, '../../apps/web/components/material-studio-panel.tsx'),
  'utf8',
);
check(
  '面板的 serverOverrideFields 与本脚本口径一致',
  /serverOverrideFields\s*=\s*[\s\S]{0,200}?field\.serverOverride\s*&&\s*field\.userEditable\s*!==\s*false/.test(
    studioSource,
  ),
);

// 6. 渲染前会再复核一次字段，必须沿用同一口径，否则值过了解析仍会在渲染处被拒。
const rendererSource = readFileSync(
  resolve(import.meta.dirname, '../../apps/web/lib/material-renderer.ts'),
  'utf8',
);
check(
  '渲染复核把校验口径透传给 validateMaterialInput',
  /renderMaterialTemplateToSvg[\s\S]{0,400}?validateMaterialInput\(\s*input\.template\.fields,\s*input\.values,\s*input\.validation,?\s*\)/.test(
    rendererSource,
  ),
);

const workflowSource = readFileSync(
  resolve(import.meta.dirname, '../../apps/web/lib/material-workflow.ts'),
  'utf8',
);
// 4 处 = 导出解析 / 预览解析 / 导出渲染 / 预览渲染，缺一处就会在对应环节被重新判为空。
const serverSourceCallCount =
  workflowSource.match(/allowMissingServerDerivedValues: true/g)?.length ?? 0;
check(
  '导出与预览的解析、渲染四处都放宽了派生字段',
  serverSourceCallCount === 4,
  serverSourceCallCount,
);
check(
  '渲染复核只在非手动来源下放宽',
  (workflowSource.match(
    /source\.sourceKind === 'manual' \? undefined : \{ allowMissingServerDerivedValues: true \}/g,
  )?.length ?? 0) === 2,
);

/*
 * 7. 项目线网来源没有首末班车时间（快照只有 nodes / edges / lineNames），
 *    所以面板要额外给一组「首班 / 末班」输入补数据；服务器线网自带该数据，不需要补。
 */
const transitSourceSource = readFileSync(
  resolve(import.meta.dirname, '../../apps/web/lib/material-transit-source.ts'),
  'utf8',
);
check(
  '项目线网解析对首末班车时间写入空串（所以必须给用户补输入）',
  /candidates\.routeServiceTime\s*=\s*'';/.test(transitSourceSource),
);
check(
  '首末班车格式与面板共用同一个真源',
  transitSourceSource.includes("from './material-service-time'") &&
    /import \{ formatServiceTimeRange \} from '\.\/material-service-time';/.test(
      transitSourceSource,
    ),
);
check(
  '双输入只在项目线网（rmp）来源下出现',
  /offerProjectServiceTimeInput\s*=\s*[\s\S]{0,200}?transitNetworkSource === 'rmp'/.test(
    studioSource,
  ),
);
check(
  '双输入接在字段网格里，且不依赖 serverOverride 标记',
  /overridableFields\.map\(\(field\) =>[\s\S]{0,200}?field\.key === SERVICE_TIME_FIELD_KEY && offerProjectServiceTimeInput/.test(
    studioSource,
  ),
);
check(
  'overridable 字段组用同一份列表提交（不会漏提交/重复入口）',
  /buildServerOverrides[\s\S]{0,200}?overridableFields\.flatMap/.test(studioSource) &&
    /overridableFields = offerProjectServiceTimeInput[\s\S]{0,220}?serverOverrideFields\.filter\(\(field\) => field\.key !== SERVICE_TIME_FIELD_KEY\)/.test(
      studioSource,
    ),
);
check(
  '双输入是「首班 / 末班」两个时间输入',
  /material-service-time-fields[\s\S]{0,900}?type="time"[\s\S]{0,400}?type="time"/.test(
    studioSource,
  ),
);
// 换数据来源后补录值必须失效，否则会盖掉服务器线网真实解析出来的首末班时间。
check(
  '切换数据来源时清掉补录的首末班车时间（初始化不清，草稿里可能存着）',
  /reason !== 'initialization'\) \{[\s\S]{0,400}?delete next\[SERVICE_TIME_FIELD_KEY\]/.test(
    studioSource,
  ),
);
// 模板存档里这条字段可能还没带 serverOverride（历史上丢过），
// 那时它不属于「允许覆盖」字段，必须靠「来源为空」这条放行，否则补录值会被拒。
check(
  '来源解析为空的字段允许用户补录（不算覆盖服务器数据）',
  /if \(allowedKeys\.has\(key\)\) \{\s*continue;[\s\S]{0,200}?resolvedValues\[key\] \?\? ''\)\.trim\(\)/.test(
    workflowSource,
  ),
);

// 8. 合成 / 拆解必须可逆，否则用户填的时间回显就对不上。
check(
  '首末班车时间：合成 → 拆解可逆',
  parseServiceTimeRange(formatServiceTimeRange('06:00', '22:30')).first === '06:00' &&
    parseServiceTimeRange(formatServiceTimeRange('06:00', '22:30')).last === '22:30',
);
check(
  '跨夜线路保留「次日」标记且仍能拆回',
  formatServiceTimeRange('06:00', '01:30') === '06:00-次日01:30' &&
    parseServiceTimeRange('06:00-次日01:30').last === '01:30',
);
check(
  '只填一头时标明首/末，且拆回对应的一头',
  formatServiceTimeRange('06:00', undefined) === '首 06:00' &&
    parseServiceTimeRange('首 06:00').first === '06:00' &&
    formatServiceTimeRange(undefined, '22:30') === '末 22:30' &&
    parseServiceTimeRange('末 22:30').last === '22:30',
);

console.log(`\n通过 ${passed} 项，失败 ${failed} 项。`);
if (failed) process.exit(1);
