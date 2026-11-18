#!/usr/bin/env node
/**
 * 同步 apps/portal/portal.css 里从设计系统复制的 --yct-* token。
 *
 * portal 是独立静态站，不能直接 import packages/design-tokens/tokens.css，
 * 因此把 radius / space / motion 等基础 token 复制进 portal.css。
 * 本脚本以 tokens.css 为唯一来源生成这段副本，并提供 --check 防止漂移。
 *
 * 用法：
 *   node scripts/portal-tokens.mjs           # 写入
 *   node scripts/portal-tokens.mjs --check   # 校验（CI）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const tokensPath = 'packages/design-tokens/src/tokens.css';
const portalPath = 'apps/portal/portal.css';
const startMarker =
  '/* === GENERATED:yct-tokens START（由 scripts/portal-tokens.mjs 生成，勿手改） === */';
const endMarker = '/* === GENERATED:yct-tokens END === */';

const tokenCss = readFileSync(join(root, tokensPath), 'utf8');
const tokenMap = new Map();
let inRoot = false;
for (const line of tokenCss.split(/\r?\n/)) {
  if (/^:root\s*\{/.test(line)) {
    inRoot = true;
    continue;
  }
  if (inRoot && /^\}/.test(line)) break;
  if (!inRoot) continue;
  const match = line.match(/^\s*(--yct-[\w-]+)\s*:\s*([^;]+);/);
  if (match) tokenMap.set(match[1], match[2].trim());
}

const portal = readFileSync(join(root, portalPath), 'utf8');
const eol = portal.includes('\r\n') ? '\r\n' : '\n';
const start = portal.indexOf(startMarker);
const end = portal.indexOf(endMarker);
if (start === -1 || end === -1 || end < start) {
  throw new Error('portal.css 缺少 GENERATED:yct-tokens 标记');
}
const block = portal.slice(start + startMarker.length, end);
const names = [...block.matchAll(/(--yct-[\w-]+)\s*:/g)].map((match) => match[1]);
const missing = names.filter((name) => !tokenMap.has(name));
if (missing.length) {
  throw new Error('以下 portal token 在 design-tokens 中不存在：' + missing.join(', '));
}
const generated = names.map((name) => '  ' + name + ': ' + tokenMap.get(name) + ';').join(eol);
const nextBlock = startMarker + eol + generated + eol + '  ' + endMarker;
const next = portal.slice(0, start) + nextBlock + portal.slice(end + endMarker.length);

// 标记块之外不允许再手写 --yct-* token，避免出现第二份副本。
const outside = portal.slice(0, start) + portal.slice(end + endMarker.length);
const stray = [...outside.matchAll(/(^|[;{\s])(--yct-[\w-]+)\s*:/gm)].map((match) => match[2]);
if (stray.length) {
  throw new Error(
    'portal.css 在生成块之外存在手写 --yct-* token：' + [...new Set(stray)].join(', '),
  );
}

const normalize = (value) => value.replaceAll('\r\n', '\n');
if (process.argv.includes('--check')) {
  if (normalize(next) !== normalize(portal)) {
    throw new Error('portal token 与 design-tokens 不一致，请运行 node scripts/portal-tokens.mjs');
  }
  console.log('portal token 校验通过：' + names.length + ' 个 token 与 design-tokens 一致');
} else {
  writeFileSync(join(root, portalPath), next, 'utf8');
  console.log('portal token 已同步：' + names.length + ' 个');
}
