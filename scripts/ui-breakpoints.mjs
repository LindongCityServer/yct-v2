#!/usr/bin/env node
/**
 * 断点登记校验：CSS @media 与 JS matchMedia 的数值断点必须全部登记在
 * packages/design-tokens/src/breakpoints.json 的 known 列表。
 *
 *   node scripts/ui-breakpoints.mjs            # 校验
 *   node scripts/ui-breakpoints.mjs --update   # 把当前出现的值写回 known（只增不删）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const file = 'packages/design-tokens/src/breakpoints.json';
const cssPattern = /@media[^{]*?\(\s*(?:max|min)-width:\s*(\d+)px/g;
const jsPattern = /[(\x27\"]\(?\s*(?:max|min)-width:\s*(\d+)px/g;

const cssValues = new Map();
for (const path of globSync('apps/web/app/**/*.css')) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(cssPattern)) {
    const value = Number(match[1]);
    cssValues.set(value, (cssValues.get(value) || 0) + 1);
  }
}
const jsValues = new Map();
for (const path of globSync('apps/web/{components,lib,app}/**/*.{ts,tsx}')) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(jsPattern)) {
    const value = Number(match[1]);
    jsValues.set(value, (jsValues.get(value) || 0) + 1);
  }
}

const data = JSON.parse(readFileSync(file, 'utf8'));
const known = new Set(data.known);
const seen = new Set([...cssValues.keys(), ...jsValues.keys()]);
const unregistered = [...seen].filter((value) => !known.has(value)).sort((a, b) => a - b);

if (process.argv.includes('--update')) {
  data.known = [...new Set([...known, ...seen])].sort((a, b) => a - b);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('断点登记已更新：known = ' + data.known.length + ' 个');
} else if (unregistered.length) {
  throw new Error('存在未登记断点值：' + unregistered.join(', '));
} else {
  console.log(
    '断点校验通过：' +
      seen.size +
      ' 个值均在登记表中（CSS ' +
      cssValues.size +
      ' / JS ' +
      jsValues.size +
      '）',
  );
}
