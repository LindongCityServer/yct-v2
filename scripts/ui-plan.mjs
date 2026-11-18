#!/usr/bin/env node
/**
 * YCT UI 计划看板与棘轮门禁。
 *
 * 用法：
 *   node scripts/ui-plan.mjs             # 看板
 *   node scripts/ui-plan.mjs --check     # CI 门禁：债务只降不升、覆盖只升不降
 *   node scripts/ui-plan.mjs --update    # 指标改善后收紧基线（拒绝任何上升）
 *   node scripts/ui-plan.mjs --summary   # GitHub Actions Step Summary（Markdown）
 *
 * 设计原则见 docs/UI_COMPONENTIZATION_PLAN.md：计划写进文档，验收写进数字，数字写进 CI。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const paths = {
  baseline: 'scripts/ui-plan.baseline.json',
  plan: 'docs/UI_COMPONENTIZATION_PLAN.md',
  ci: '.github/workflows/ci.yml',
  inventory: 'apps/web/app/dev/controls/controls-inventory.json',
  registry: 'apps/web/app/dev/controls/controls-registry.json',
  globals: 'apps/web/app/globals.css',
  stylesDir: 'apps/web/app/styles',
  tokens: 'packages/design-tokens/src/tokens.css',
  breakpoints: 'packages/design-tokens/src/breakpoints.json',
  uiDir: 'apps/web/components/ui',
};

const args = process.argv.slice(2);
const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const exists = (path) => existsSync(join(root, path));
const number = (value) => Number(value) || 0;

const DEFAULT_TARGETS = {
  rawStandardClassUsage: 30,
  registryPhantomClasses: 0,
  registryAliasConflicts: 0,
  registrySchemaIssues: 0,
  staleColorFallbacks: 0,
  undefinedColorTokens: 0,
  unregisteredBreakpoints: 0,
  sharedPreviews: 20,
  sectionsWithPreview: 12,
  primitiveFiles: 9,
  fontSizeTokenSharePct: 60,
  controlTokenUses: 40,
};

function walkFiles(dir, suffix) {
  const out = [];
  const full = join(root, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const child = dir + '/' + entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(child, suffix));
    else if (entry.name.endsWith(suffix)) out.push(child);
  }
  return out;
}

function parseRootTokens(css) {
  const tokens = new Map();
  let inRoot = false;
  for (const line of css.split(/\r?\n/)) {
    if (/^:root\s*\{/.test(line)) {
      inRoot = true;
      continue;
    }
    if (inRoot && /^\}/.test(line)) {
      inRoot = false;
      continue;
    }
    if (!inRoot) continue;
    const match = line.match(/^\s*(--yct-[\w-]+)\s*:\s*([^;]+);/);
    if (match) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function collectMetrics() {
  const inventory = readJson(paths.inventory);
  const registry = readJson(paths.registry);
  const registryIssues = [];
  const categoryIds = new Set(registry.categories.map((category) => category.id));
  const sectionIds = new Set();
  for (const category of registry.categories) {
    if (!category.id || !category.label) {
      registryIssues.push('分类缺少 id/label：' + JSON.stringify(category));
    }
  }
  for (const section of registry.sections) {
    for (const field of ['id', 'text', 'name', 'category', 'status', 'summary']) {
      if (typeof section[field] !== 'string' || !section[field]) {
        registryIssues.push('分区 ' + (section.id || '(无 id)') + ' 缺少 ' + field);
      }
    }
    if (sectionIds.has(section.id)) registryIssues.push('分区 id 重复：' + section.id);
    sectionIds.add(section.id);
    if (!categoryIds.has(section.category)) {
      registryIssues.push('分区 ' + section.id + ' 的分类不存在：' + section.category);
    }
    if (!['stable', 'beta', 'deprecated'].includes(section.status)) {
      registryIssues.push('分区 ' + section.id + ' 的 status 非法：' + section.status);
    }
    if (!Array.isArray(section.classes))
      registryIssues.push('分区 ' + section.id + ' 的 classes 不是数组');
    if (!Array.isArray(section.aliases))
      registryIssues.push('分区 ' + section.id + ' 的 aliases 不是数组');
    for (const alias of section.aliases || []) {
      if (!alias || !alias.name) registryIssues.push('分区 ' + section.id + ' 存在无 name 的别名');
    }
  }
  for (const preview of registry.sharedPreviews) {
    for (const field of ['component', 'source', 'section']) {
      if (typeof preview[field] !== 'string' || !preview[field]) {
        registryIssues.push('共享预览缺少 ' + field + '：' + JSON.stringify(preview));
      }
    }
    if (!sectionIds.has(preview.section)) {
      registryIssues.push(
        '共享预览 ' + preview.component + ' 指向不存在的分区：' + preview.section,
      );
    }
    if (!exists(preview.source)) {
      registryIssues.push('共享预览 ' + preview.component + ' 的源码不存在：' + preview.source);
    } else {
      const source = read(preview.source);
      const escapedComponent = String(preview.component).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
      const exported =
        new RegExp(
          'export\\s+(?:async\\s+)?(?:function|const|class)\\s+' + escapedComponent + '\\b',
        ).test(source) ||
        new RegExp('export\\s*\\{[^}]*\\b' + escapedComponent + '\\b').test(source) ||
        new RegExp('export\\s+\\*\\s+from').test(source);
      if (!exported) {
        registryIssues.push('共享预览 ' + preview.component + ' 未从 ' + preview.source + ' 导出');
      }
    }
    if (preview.exclusiveClasses && !Array.isArray(preview.exclusiveClasses)) {
      registryIssues.push('共享预览 ' + preview.component + ' 的 exclusiveClasses 不是数组');
    }
  }
  // Phase 3 起 globals.css 已按领域拆分，指标需扫描全部应用样式。
  const css = [paths.globals, ...walkFiles(paths.stylesDir, '.css')]
    .map((file) => read(file))
    .join('\n');
  const tokenCss = read(paths.tokens);
  const tokenMap = parseRootTokens(tokenCss);
  const cssClassSet = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));

  const classTokens = new Set();
  const aliasTokens = new Set();
  for (const section of registry.sections) {
    for (const raw of section.classes) {
      for (const token of raw.split(/\s+/)) if (token) classTokens.add(token);
    }
    for (const alias of section.aliases) {
      const name = String(alias.name || '').trim();
      // 组合别名（如 "secondary-action-button is-primary"）描述的是变体，不是独立类名，
      // 不参与「标准类名 vs 别名」冲突判断；带点的历史选择器同样跳过。
      if (!name || name.indexOf('.') !== -1 || /\s/.test(name)) continue;
      aliasTokens.add(name);
    }
  }

  const phantomClasses = [...classTokens].filter((token) => !cssClassSet.has(token)).sort();
  const aliasConflicts = [...classTokens].filter((token) => aliasTokens.has(token)).sort();
  const unstyledAliases = [...aliasTokens].filter((token) => !cssClassSet.has(token)).sort();

  const rawPerFile = new Map();
  const inventoryClassUse = new Map();
  for (const file of inventory.files) {
    const inUiLayer =
      file.source.startsWith('apps/web/components/ui/') ||
      file.source.startsWith('apps/web/app/dev/');
    for (const control of file.controls) {
      for (const className of control.classes) {
        inventoryClassUse.set(className, (inventoryClassUse.get(className) || 0) + 1);
        if (!inUiLayer && classTokens.has(className)) {
          rawPerFile.set(file.source, (rawPerFile.get(file.source) || 0) + 1);
        }
      }
    }
  }
  // 原语内部通过字符串映射渲染的类名（如 StatusChip 的变体表）也算「被使用」，
  // 否则迁移到原语后 registry 会误报未使用。
  const uiSource = walkFiles(paths.uiDir, '.tsx')
    .map((file) => read(file))
    .join('\n');
  const uiEncapsulatedClasses = new Set(
    [...uiSource.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['"`]/g)].map((match) => match[1]),
  );
  const rawTotal = [...rawPerFile.values()].reduce((total, value) => total + value, 0);
  // 修饰类（is-/has-/tone-/with-）依附于基础类，不计入「未使用标准类名」债务，避免噪音。
  const modifierPattern = /^(?:is|has|tone|with)-/;
  const unusedClasses = [...classTokens]
    .filter(
      (token) =>
        !modifierPattern.test(token) &&
        !inventoryClassUse.has(token) &&
        !uiEncapsulatedClasses.has(token),
    )
    .sort();

  const previewSections = new Set(registry.sharedPreviews.map((preview) => preview.section));
  const componentRoutes = new Map();
  for (const route of inventory.routes) {
    for (const file of route.files) {
      if (!file.startsWith('apps/web/components/')) continue;
      if (file.startsWith('apps/web/components/ui/')) continue;
      if (!componentRoutes.has(file)) componentRoutes.set(file, new Set());
      componentRoutes.get(file).add(route.path);
    }
  }
  const sharedComponents = [...componentRoutes.values()].filter(
    (routes) => routes.size >= 2,
  ).length;

  const primitiveFiles = walkFiles(paths.uiDir, '.tsx').filter(
    (file) => !file.endsWith('.test.tsx') && !file.endsWith('.spec.tsx'),
  ).length;
  const primitiveTests = ['.test.tsx', '.test.mjs', '.test.ts', '.spec.tsx', '.spec.mjs'].reduce(
    (total, suffix) => total + walkFiles(paths.uiDir, suffix).length,
    0,
  );
  const previewedPrimitives = registry.sharedPreviews.filter((preview) =>
    preview.source.startsWith('apps/web/components/ui/'),
  ).length;

  const fontSizes = [...css.matchAll(/font-size:\s*([^;\n]+);/g)].map((match) => match[1].trim());
  const fontSizeTokenized = fontSizes.filter((value) => value.indexOf('var(--yct-') !== -1).length;

  const controlTokenUses = (css.match(/var\(--yct-control-(?:height|size|radius)-/g) || []).length;

  // Phase 3 收口的可执行判据：拆分文件数、视觉基线、控件尺寸 token 使用。
  const splitCssFiles = walkFiles(paths.stylesDir, '.css').length;
  const visualBaselineDir = '.screenshots/controls-baseline';
  const visualBaselineFiles = exists(visualBaselineDir)
    ? walkFiles(visualBaselineDir, '.png').length
    : 0;

  // 断点登记：CSS @media 与 JS matchMedia 的数值断点必须在 breakpoints.json 的 known 列表。
  const breakpointRegistry = readJson(paths.breakpoints);
  const knownBreakpointPx = new Set(breakpointRegistry.known.map((value) => Number(value)));
  const breakpointValues = new Set();
  for (const match of css.matchAll(/@media[^{]*?\(\s*(?:max|min)-width:\s*(\d+)px/g)) {
    breakpointValues.add(Number(match[1]));
  }
  const breakpointSources = [
    ...walkFiles('apps/web/components', '.tsx'),
    ...walkFiles('apps/web/lib', '.ts'),
    ...walkFiles('apps/web/app', '.tsx'),
  ];
  for (const file of breakpointSources) {
    for (const match of read(file).matchAll(/['"\x60]\(?\s*(?:max|min)-width:\s*(\d+)px/g)) {
      breakpointValues.add(Number(match[1]));
    }
  }
  const unregisteredBreakpoints = [...breakpointValues]
    .filter((value) => !knownBreakpointPx.has(value))
    .sort((a, b) => a - b);

  let staleColorFallbacks = 0;
  for (const match of css.matchAll(/var\((--yct-color-[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\)/g)) {
    const actual = tokenMap.get(match[1]);
    if (actual && actual.charAt(0) === '#' && actual.toLowerCase() !== match[2].toLowerCase()) {
      staleColorFallbacks += 1;
    }
  }

  const definedColorTokens = new Set(tokenMap.keys());
  for (const match of css.matchAll(/(--yct-color-[\w-]+)\s*:/g)) definedColorTokens.add(match[1]);
  const usedColorTokens = new Set(
    [...css.matchAll(/var\((--yct-color-[\w-]+)/g)].map((match) => match[1]),
  );
  const undefinedColorTokens = [...usedColorTokens]
    .filter((token) => !definedColorTokens.has(token))
    .sort();

  const planText = exists(paths.plan) ? read(paths.plan) : '';
  const requiredPhases = ['## Phase 0', '## Phase 1', '## Phase 2', '## Phase 3'];
  const missingPhases = requiredPhases.filter((phase) => planText.indexOf(phase) === -1);

  return {
    raw: { total: rawTotal, files: rawPerFile.size, perFile: rawPerFile },
    registry: {
      phantomClasses: phantomClasses.length,
      phantomList: phantomClasses,
      aliasConflicts: aliasConflicts.length,
      aliasConflictList: aliasConflicts,
      issues: registryIssues.length,
      issueList: registryIssues,
      unstyledAliases: unstyledAliases.length,
      unusedClasses: unusedClasses.length,
      unusedList: unusedClasses,
    },
    coverage: {
      sections: registry.sections.length,
      sectionsWithPreview: previewSections.size,
      sharedPreviews: registry.sharedPreviews.length,
      sharedComponents,
    },
    primitives: {
      files: primitiveFiles,
      tests: primitiveTests,
      previewed: previewedPrimitives,
    },
    typography: {
      declarations: fontSizes.length,
      tokenized: fontSizeTokenized,
      share:
        fontSizes.length === 0 ? 0 : Math.round((fontSizeTokenized / fontSizes.length) * 1000) / 10,
    },
    controlTokenUses,
    phase3Audit: { splitCssFiles, visualBaselineFiles, unregisteredBreakpoints },
    unregisteredBreakpoints: unregisteredBreakpoints.length,
    staleColorFallbacks,
    undefinedColorTokens: undefinedColorTokens.length,
    undefinedColorTokenList: undefinedColorTokens,
    plan: { missingPhases, ciExists: exists(paths.ci) },
  };
}

function phaseStatus(metrics, baseline) {
  const debtZero =
    metrics.registry.phantomClasses === 0 &&
    metrics.registry.aliasConflicts === 0 &&
    metrics.staleColorFallbacks === 0 &&
    metrics.undefinedColorTokens === 0;
  const phase0 =
    debtZero && metrics.plan.missingPhases.length === 0 && metrics.plan.ciExists
      ? 'done'
      : 'active';
  // Phase 1 只验收原语层交付；存量归并归 Phase 2（避免阶段验收重复计算）。
  const phase1 =
    metrics.primitives.files >= 9 &&
    metrics.primitives.tests >= 9 &&
    metrics.primitives.previewed >= 9
      ? 'done'
      : 'todo';
  const phase2 = phase1 !== 'done' ? 'todo' : metrics.raw.total <= 30 ? 'done' : 'active';
  // Phase 3 按计划文档的四项退出标准判定：字号/预览/视觉基线/CSS 拆分 + 控件尺寸 token。
  const phase3Done =
    metrics.typography.share >= 60 &&
    metrics.coverage.sharedPreviews >= 20 &&
    metrics.phase3Audit.visualBaselineFiles > 0 &&
    metrics.phase3Audit.splitCssFiles >= 6 &&
    metrics.controlTokenUses >= 40 &&
    metrics.unregisteredBreakpoints === 0;
  // Phase 3 允许与 Phase 2 长尾并行：已达成任一目标即显示进行中，全部达成才 done。
  const phase3 =
    phase2 === 'done'
      ? phase3Done
        ? 'done'
        : 'active'
      : phase3Done || metrics.typography.share >= 60 || metrics.coverage.sharedPreviews >= 20
        ? 'active'
        : 'todo';
  return [
    ['Phase 0 治理与护栏', phase0],
    ['Phase 1 原语层', phase1],
    ['Phase 2 热点归并', phase2],
    ['Phase 3 收口', phase3],
  ];
}

const symbol = (status) =>
  status === 'done' ? '[done]' : status === 'active' ? '[active]' : '[todo]';

function dashboard(metrics, baseline) {
  console.log('YCT UI 计划状态 · ' + new Date().toISOString().slice(0, 10));
  console.log('计划：' + paths.plan + '  基线：' + paths.baseline);
  console.log('');
  for (const [name, status] of phaseStatus(metrics, baseline)) {
    console.log('  ' + symbol(status).padEnd(9) + name);
  }
  console.log('');
  printMetrics(metrics, baseline);
  console.log('');
  console.log('命令：pnpm ui:plan:status | ui:plan:check | ui:plan:update（仅在指标改善后）');
}

function row(label, current, baselineValue, target) {
  const base = baselineValue === undefined ? '-' : String(baselineValue);
  const goal = target === undefined ? '-' : String(target);
  console.log(
    '  ' +
      label.padEnd(26) +
      ' 基线 ' +
      base.padStart(5) +
      '  当前 ' +
      String(current).padStart(5) +
      '  目标 ' +
      goal.padStart(5),
  );
}

function printMetrics(metrics, baseline) {
  const targets = (baseline && baseline.targets) || DEFAULT_TARGETS;
  const b = baseline || null;
  console.log('债务指标（只降不升）');
  row(
    '标准类名直写（ui 外）',
    metrics.raw.total,
    b && b.ratchet.rawStandardClassUsage,
    targets.rawStandardClassUsage,
  );
  row('  · 涉及文件数', metrics.raw.files, b && b.ratchet.rawStandardClassFiles);
  row(
    'registry 幻影类',
    metrics.registry.phantomClasses,
    b && b.registry.phantomClasses,
    targets.registryPhantomClasses,
  );
  row(
    'registry 别名冲突',
    metrics.registry.aliasConflicts,
    b && b.registry.aliasConflicts,
    targets.registryAliasConflicts,
  );
  row('registry 未使用类名', metrics.registry.unusedClasses, b && b.registry.unusedClasses);
  row(
    'registry schema 问题',
    metrics.registry.issues,
    b && b.registry.issues,
    targets.registrySchemaIssues,
  );
  row(
    '陈旧颜色 fallback',
    metrics.staleColorFallbacks,
    b && b.registry.staleColorFallbacks,
    targets.staleColorFallbacks,
  );
  row(
    '未定义颜色 token',
    metrics.undefinedColorTokens,
    b && b.registry.undefinedColorTokens,
    targets.undefinedColorTokens,
  );
  row(
    '未登记断点值',
    metrics.unregisteredBreakpoints,
    b && b.registry.unregisteredBreakpoints,
    targets.unregisteredBreakpoints,
  );
  console.log('');
  console.log('覆盖指标（只升不降）');
  row(
    '共享组件真实预览',
    metrics.coverage.sharedPreviews,
    b && b.coverage.sharedPreviews,
    targets.sharedPreviews,
  );
  row(
    '有预览的分区',
    metrics.coverage.sectionsWithPreview,
    b && b.coverage.sectionsWithPreview,
    targets.sectionsWithPreview,
  );
  row('  · 共享组件总数', metrics.coverage.sharedComponents, b && b.coverage.sharedComponents);
  row('  · 分区总数', metrics.coverage.sections);
  row(
    'components/ui 原语',
    metrics.primitives.files,
    b && b.primitives.files,
    targets.primitiveFiles,
  );
  row('  · 原语测试文件', metrics.primitives.tests, b && b.primitives.tests);
  row('  · 有预览的原语', metrics.primitives.previewed, b && b.primitives.previewed);
  row('字号 token 使用率 %', metrics.typography.share, undefined, targets.fontSizeTokenSharePct);
  row(
    '控件尺寸 token 使用',
    metrics.controlTokenUses,
    b && b.controlTokenUses,
    targets.controlTokenUses,
  );
  console.log('');
  console.log('门禁');
  console.log(
    '  计划文档阶段章节        ' +
      (metrics.plan.missingPhases.length === 0
        ? 'OK'
        : '缺少 ' + metrics.plan.missingPhases.join(', ')),
  );
  console.log('  CI 工作流              ' + (metrics.plan.ciExists ? 'OK' : '缺少 ' + paths.ci));
  if (metrics.registry.phantomList.length) {
    console.log('  幻影类：' + metrics.registry.phantomList.join(', '));
  }
  if (metrics.registry.aliasConflictList.length) {
    console.log('  别名冲突：' + metrics.registry.aliasConflictList.join(', '));
  }
  if (metrics.registry.issueList.length) {
    console.log('  registry schema 问题：' + metrics.registry.issueList.join('；'));
  }
  if (metrics.undefinedColorTokenList.length) {
    console.log('  未定义颜色 token：' + metrics.undefinedColorTokenList.join(', '));
  }
}

function fail(message) {
  console.error('ui:plan:check 失败：' + message);
  process.exit(1);
}

function check(metrics) {
  if (!exists(paths.baseline))
    fail('缺少基线文件 ' + paths.baseline + '，请先运行 pnpm ui:plan:update');
  const baseline = readJson(paths.baseline);
  const failures = [];

  if (metrics.raw.total > baseline.ratchet.rawStandardClassUsage) {
    failures.push(
      '标准类名直写总量上升：' +
        baseline.ratchet.rawStandardClassUsage +
        ' -> ' +
        metrics.raw.total +
        '（新代码必须使用 components/ui 原语）',
    );
  }
  for (const [file, count] of [...metrics.raw.perFile.entries()].sort()) {
    const allowed = baseline.ratchet.perFile[file] || 0;
    if (count > allowed) {
      failures.push('标准类名直写增加：' + file + '（允许 ' + allowed + '，实际 ' + count + '）');
    }
  }
  const debts = [
    ['registry 幻影类', metrics.registry.phantomClasses, baseline.registry.phantomClasses],
    ['registry 别名冲突', metrics.registry.aliasConflicts, baseline.registry.aliasConflicts],
    ['registry 未使用类名', metrics.registry.unusedClasses, baseline.registry.unusedClasses],
    ['registry schema 问题', metrics.registry.issues, baseline.registry.issues || 0],
    ['陈旧颜色 fallback', metrics.staleColorFallbacks, baseline.registry.staleColorFallbacks || 0],
    ['未定义颜色 token', metrics.undefinedColorTokens, baseline.registry.undefinedColorTokens || 0],
    [
      '未登记断点值',
      metrics.unregisteredBreakpoints,
      baseline.registry.unregisteredBreakpoints || 0,
    ],
  ];
  for (const [label, current, previous] of debts) {
    if (number(current) > number(previous)) {
      failures.push(label + '上升：' + previous + ' -> ' + current);
    }
  }
  const coverage = [
    ['共享组件真实预览', metrics.coverage.sharedPreviews, baseline.coverage.sharedPreviews],
    ['有预览的分区', metrics.coverage.sectionsWithPreview, baseline.coverage.sectionsWithPreview],
    ['components/ui 原语', metrics.primitives.files, baseline.primitives.files],
    ['原语测试', metrics.primitives.tests, baseline.primitives.tests],
    ['字号 token 数', metrics.typography.tokenized, baseline.typography.fontSizeTokenized],
    ['控件尺寸 token 使用', metrics.controlTokenUses, baseline.controlTokenUses || 0],
  ];
  for (const [label, current, previous] of coverage) {
    if (number(current) < number(previous)) {
      failures.push(label + '下降：' + previous + ' -> ' + current);
    }
  }
  if (metrics.plan.missingPhases.length) {
    failures.push('实施计划缺少阶段章节：' + metrics.plan.missingPhases.join(', '));
  }
  if (!metrics.plan.ciExists) failures.push('缺少 CI 工作流：' + paths.ci);

  dashboard(metrics, baseline);
  if (failures.length) {
    console.error('');
    console.error('ui:plan:check 失败 ' + failures.length + ' 项：');
    for (const failure of failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log('');
  console.log('ui:plan:check 通过：债务未上升，覆盖未下降。');
}

function update(metrics) {
  const previous = exists(paths.baseline) ? readJson(paths.baseline) : null;
  const errors = [];
  if (previous) {
    if (metrics.raw.total > previous.ratchet.rawStandardClassUsage) {
      errors.push(
        '标准类名直写上升：' + previous.ratchet.rawStandardClassUsage + ' -> ' + metrics.raw.total,
      );
    }
    for (const [file, count] of [...metrics.raw.perFile.entries()].sort()) {
      const allowed = previous.ratchet.perFile[file] || 0;
      if (count > allowed)
        errors.push('标准类名直写增加：' + file + '（' + allowed + ' -> ' + count + '）');
    }
    const debts = [
      ['registry 幻影类', metrics.registry.phantomClasses, previous.registry.phantomClasses],
      ['registry 别名冲突', metrics.registry.aliasConflicts, previous.registry.aliasConflicts],
      ['registry 未使用类名', metrics.registry.unusedClasses, previous.registry.unusedClasses],
      ['registry schema 问题', metrics.registry.issues, previous.registry.issues || 0],
      [
        '陈旧颜色 fallback',
        metrics.staleColorFallbacks,
        previous.registry.staleColorFallbacks || 0,
      ],
      [
        '未定义颜色 token',
        metrics.undefinedColorTokens,
        previous.registry.undefinedColorTokens || 0,
      ],
    ];
    for (const [label, current, before] of debts) {
      if (number(current) > number(before))
        errors.push(label + '上升：' + before + ' -> ' + current);
    }
  }
  if (errors.length) {
    console.error('ui:plan:update 拒绝写入：以下指标上升，请先修复而不是放宽基线。');
    for (const error of errors) console.error('  - ' + error);
    process.exit(1);
  }

  const lower = (current, before) =>
    previous ? Math.min(number(current), number(before)) : number(current);
  const higher = (current, before) =>
    previous ? Math.max(number(current), number(before)) : number(current);
  const perFile = {};
  for (const [file, count] of [...metrics.raw.perFile.entries()].sort()) perFile[file] = count;
  const next = {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    note: '由 scripts/ui-plan.mjs --update 生成；债务只降不升，覆盖只升不降。不要手改数字。',
    ratchet: {
      rawStandardClassUsage: lower(
        metrics.raw.total,
        previous && previous.ratchet.rawStandardClassUsage,
      ),
      rawStandardClassFiles: metrics.raw.files,
      perFile,
    },
    registry: {
      phantomClasses: lower(
        metrics.registry.phantomClasses,
        previous && previous.registry.phantomClasses,
      ),
      aliasConflicts: lower(
        metrics.registry.aliasConflicts,
        previous && previous.registry.aliasConflicts,
      ),
      unusedClasses: lower(
        metrics.registry.unusedClasses,
        previous && previous.registry.unusedClasses,
      ),
      issues: lower(metrics.registry.issues, previous && previous.registry.issues),
      staleColorFallbacks: lower(
        metrics.staleColorFallbacks,
        previous && previous.registry.staleColorFallbacks,
      ),
      undefinedColorTokens: lower(
        metrics.undefinedColorTokens,
        previous && previous.registry.undefinedColorTokens,
      ),
      unregisteredBreakpoints: lower(
        metrics.unregisteredBreakpoints,
        previous && previous.registry.unregisteredBreakpoints,
      ),
    },
    coverage: {
      sections: metrics.coverage.sections,
      sectionsWithPreview: higher(
        metrics.coverage.sectionsWithPreview,
        previous && previous.coverage.sectionsWithPreview,
      ),
      sharedPreviews: higher(
        metrics.coverage.sharedPreviews,
        previous && previous.coverage.sharedPreviews,
      ),
      sharedComponents: metrics.coverage.sharedComponents,
    },
    primitives: {
      files: higher(metrics.primitives.files, previous && previous.primitives.files),
      tests: higher(metrics.primitives.tests, previous && previous.primitives.tests),
      previewed: higher(metrics.primitives.previewed, previous && previous.primitives.previewed),
    },
    typography: {
      fontSizeDeclarations: metrics.typography.declarations,
      fontSizeTokenized: higher(
        metrics.typography.tokenized,
        previous && previous.typography.fontSizeTokenized,
      ),
    },
    controlTokenUses: higher(metrics.controlTokenUses, previous && previous.controlTokenUses),
    targets: (previous && previous.targets) || DEFAULT_TARGETS,
  };
  writeFileSync(join(root, paths.baseline), JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log('ui:plan:update 已更新 ' + paths.baseline);
  console.log(
    '  标准类名直写：' +
      next.ratchet.rawStandardClassUsage +
      '（文件 ' +
      next.ratchet.rawStandardClassFiles +
      '）',
  );
  console.log(
    '  幻影类：' + next.registry.phantomClasses + '，别名冲突：' + next.registry.aliasConflicts,
  );
  console.log(
    '  共享预览：' +
      next.coverage.sharedPreviews +
      '，有预览分区：' +
      next.coverage.sectionsWithPreview,
  );
  dashboard(metrics, next);
}

function summary(metrics) {
  const baseline = exists(paths.baseline) ? readJson(paths.baseline) : null;
  const targets = (baseline && baseline.targets) || DEFAULT_TARGETS;
  const lines = [];
  lines.push('## UI 计划看板');
  lines.push('');
  lines.push('计划文档：' + paths.plan + ' · 基线：' + paths.baseline);
  lines.push('');
  lines.push('| 阶段 | 状态 |');
  lines.push('| --- | --- |');
  for (const [name, status] of phaseStatus(metrics, baseline)) {
    lines.push('| ' + name + ' | ' + symbol(status) + ' |');
  }
  lines.push('');
  lines.push('| 指标 | 基线 | 当前 | 目标 |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(
    '| 标准类名直写 | ' +
      (baseline ? baseline.ratchet.rawStandardClassUsage : '-') +
      ' | ' +
      metrics.raw.total +
      ' | ' +
      targets.rawStandardClassUsage +
      ' |',
  );
  lines.push(
    '| registry 幻影类 | ' +
      (baseline ? baseline.registry.phantomClasses : '-') +
      ' | ' +
      metrics.registry.phantomClasses +
      ' | ' +
      targets.registryPhantomClasses +
      ' |',
  );
  lines.push(
    '| 共享组件真实预览 | ' +
      (baseline ? baseline.coverage.sharedPreviews : '-') +
      ' | ' +
      metrics.coverage.sharedPreviews +
      ' | ' +
      targets.sharedPreviews +
      ' |',
  );
  lines.push(
    '| 原语文件 | ' +
      (baseline ? baseline.primitives.files : '-') +
      ' | ' +
      metrics.primitives.files +
      ' | ' +
      targets.primitiveFiles +
      ' |',
  );
  lines.push(
    '| 字号 token 使用率 | - | ' +
      metrics.typography.share +
      '% | ' +
      targets.fontSizeTokenSharePct +
      '% |',
  );
  console.log(lines.join('\n'));
}

const metrics = collectMetrics();
if (args.includes('--check')) check(metrics);
else if (args.includes('--update')) update(metrics);
else if (args.includes('--summary')) summary(metrics);
else dashboard(metrics, exists(paths.baseline) ? readJson(paths.baseline) : null);
