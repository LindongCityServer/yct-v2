#!/usr/bin/env node
/**
 * 把控件规则里的等值尺寸字面量替换为设计 token（等值替换，无视觉变化）。
 *
 *   node scripts/codemods/tokenize-control-sizes.mjs [--write]
 */
import { readFileSync, writeFileSync, globSync } from 'node:fs';

const write = process.argv.includes('--write');
const files = globSync('apps/web/app/**/*.css');
const controlMarkers = [
  'action-button',
  'icon-button',
  'material-field',
  'segmented-control',
  'category-chip',
  'search-box',
  'filter-strip',
  'chip',
  'field',
  'controls-',
  'control',
  'status-note',
  'empty-state',
  'switch-control',
];
const replacements = [
  [/min-height:\s*30px;/g, 'min-height: var(--yct-control-height-xs);'],
  [/min-height:\s*32px;/g, 'min-height: var(--yct-control-height-dense);'],
  [/min-height:\s*36px;/g, 'min-height: var(--yct-control-height-toolbar);'],
  [/min-height:\s*38px;/g, 'min-height: var(--yct-control-height-compact);'],
  [/min-height:\s*42px;/g, 'min-height: var(--yct-control-height-tall);'],
  [/min-height:\s*34px;/g, 'min-height: var(--yct-control-height-sm);'],
  [/min-height:\s*40px;/g, 'min-height: var(--yct-control-height-md);'],
  [/min-height:\s*44px;/g, 'min-height: var(--yct-control-height-lg);'],
  [/min-height:\s*46px;/g, 'min-height: var(--yct-field-height-search);'],
  [/min-height:\s*28px;/g, 'min-height: var(--yct-chip-height);'],
  [/(?<!-)height:\s*30px;/g, 'height: var(--yct-control-height-xs);'],
  [/(?<!-)height:\s*32px;/g, 'height: var(--yct-control-size-sm);'],
  [/(?<!-)height:\s*36px;/g, 'height: var(--yct-control-height-toolbar);'],
  [/(?<!-)height:\s*38px;/g, 'height: var(--yct-control-height-compact);'],
  [/(?<!-)height:\s*42px;/g, 'height: var(--yct-control-height-tall);'],
  [/(?<!-)height:\s*48px;/g, 'height: var(--yct-control-size-lg);'],
  [/(?<!-)height:\s*34px;/g, 'height: var(--yct-control-height-sm);'],
  [/(?<!-)height:\s*40px;/g, 'height: var(--yct-control-size-md);'],
  [/(?<!-)height:\s*44px;/g, 'height: var(--yct-control-height-lg);'],
  [/(?<!-)height:\s*28px;/g, 'height: var(--yct-chip-height);'],
  [/(?<!-)width:\s*40px;/g, 'width: var(--yct-control-size-md);'],
  [/(?<!-)width:\s*44px;/g, 'width: var(--yct-control-height-lg);'],
  [/(?<!-)width:\s*30px;/g, 'width: var(--yct-control-height-xs);'],
  [/(?<!-)width:\s*32px;/g, 'width: var(--yct-control-size-sm);'],
  [/(?<!-)width:\s*36px;/g, 'width: var(--yct-control-height-toolbar);'],
  [/(?<!-)width:\s*38px;/g, 'width: var(--yct-control-height-compact);'],
  [/(?<!-)width:\s*42px;/g, 'width: var(--yct-control-height-tall);'],
  [/(?<!-)width:\s*48px;/g, 'width: var(--yct-control-size-lg);'],
  [/(?<!-)width:\s*34px;/g, 'width: var(--yct-control-height-sm);'],
];
let total = 0;
for (const file of files) {
  let css = readFileSync(file, 'utf8');
  let changed = 0;
  // 逐规则块替换：只处理选择器命中控件标记的规则。
  css = css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector, body) => {
    if (!controlMarkers.some((marker) => selector.includes(marker))) return rule;
    let nextBody = body;
    for (const [pattern, replacement] of replacements) {
      const matches = nextBody.match(pattern);
      if (!matches) continue;
      changed += matches.length;
      nextBody = nextBody.replace(pattern, replacement);
    }
    return changed ? selector + '{' + nextBody + '}' : rule;
  });
  if (changed) {
    total += changed;
    console.log(file + ': ' + changed + (write ? '' : ' (dry-run)'));
    if (write) writeFileSync(file, css, 'utf8');
  }
}
console.log('total: ' + total + (write ? ' (written)' : ' (dry-run)'));
