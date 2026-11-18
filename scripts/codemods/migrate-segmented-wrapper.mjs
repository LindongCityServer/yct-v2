#!/usr/bin/env node
/**
 * 把 <div className="segmented-control ..."><SegmentedControl ... /></div>
 * 迁移为 <SegmentedControl wrapperClassName="..." ... />。
 *
 *   node scripts/codemods/migrate-segmented-wrapper.mjs <files...> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((arg) => !arg.startsWith('--'));

function walk(node, callback) {
  if (ts.isJsxElement(node)) callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}

function attrName(node) {
  return ts.isJsxAttribute(node) ? node.name.getText() : '';
}

let total = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('segmented-control')) continue;
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits = [];
  let converted = 0;
  let skipped = 0;
  walk(sourceFile, (element) => {
    const opening = element.openingElement;
    if (opening.tagName.getText() !== 'div') return;
    const attributes = opening.attributes.properties;
    if (attributes.length !== 1) return;
    const classAttr = attributes[0];
    if (attrName(classAttr) !== 'className' || !ts.isStringLiteral(classAttr.initializer)) return;
    const tokens = classAttr.initializer.text.split(/\s+/).filter(Boolean);
    if (!tokens.includes('segmented-control')) return;
    const children = element.children.filter(
      (child) => !(ts.isJsxText(child) && child.text.trim() === ''),
    );
    if (children.length !== 1) {
      skipped += 1;
      return;
    }
    const child = children[0];
    const childOpening = ts.isJsxElement(child)
      ? child.openingElement
      : ts.isJsxSelfClosingElement(child)
        ? child
        : null;
    if (!childOpening || childOpening.tagName.getText() !== 'SegmentedControl') {
      skipped += 1;
      return;
    }
    if (ts.isJsxElement(child) && child.children.length > 0) {
      skipped += 1;
      return;
    }
    const extra = tokens.filter((token) => token !== 'segmented-control');
    const attrs = childOpening.attributes.getText();
    const wrapperAttr = ' wrapperClassName="' + extra.join(' ') + '"';
    edits.push({
      start: element.getStart(sourceFile),
      end: element.getEnd(),
      replacement: '<SegmentedControl' + (attrs ? ' ' + attrs : '') + wrapperAttr + ' />',
    });
    converted += 1;
  });
  if (converted === 0) continue;
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
  }
  if (write) writeFileSync(file, next, 'utf8');
  total += converted;
  console.log(
    file +
      ': ' +
      converted +
      (skipped ? '（跳过 ' + skipped + '）' : '') +
      (write ? '' : ' (dry-run)'),
  );
}
console.log('total: ' + total + (write ? ' (written)' : ' (dry-run)'));
