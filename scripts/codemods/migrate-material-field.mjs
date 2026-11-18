#!/usr/bin/env node
/**
 * 把历史「label.material-field + input/textarea/select」结构迁移为 Field 族原语。
 *
 *   node scripts/codemods/migrate-material-field.mjs <files...> [--write]
 *
 * 只处理结构完全可判定的标签：label.material-field > span + 单个 input/textarea/select
 * （+ 可选 small 提示）。带自定义控件、动态类名、额外子节点的标签会跳过并计数。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((arg) => !arg.startsWith('--'));

function walkJsx(node, callback) {
  if (ts.isJsxElement(node)) callback(node);
  ts.forEachChild(node, (child) => walkJsx(child, callback));
}

function attrName(node) {
  return ts.isJsxAttribute(node) ? node.name.getText() : '';
}

let totalConverted = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes('material-field')) continue;
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits = [];
  const used = new Set(['Field']);
  let converted = 0;
  let skipped = 0;
  walkJsx(sourceFile, (element) => {
    const opening = element.openingElement;
    if (opening.tagName.getText() !== 'label') return;
    const classAttr = opening.attributes.properties.find(
      (property) => attrName(property) === 'className',
    );
    if (!classAttr || !ts.isStringLiteral(classAttr.initializer)) return;
    const tokens = classAttr.initializer.text.split(/\s+/).filter(Boolean);
    if (!tokens.includes('material-field')) return;
    const children = element.children.filter(
      (child) => !(ts.isJsxText(child) && child.text.trim() === ''),
    );
    if (children.length < 2 || children.length > 3) {
      skipped += 1;
      return;
    }
    const [span, control, hintNode] = children;
    if (!ts.isJsxElement(span) || span.openingElement.tagName.getText() !== 'span') {
      skipped += 1;
      return;
    }
    const controlNode = ts.isJsxElement(control)
      ? control.openingElement
      : ts.isJsxSelfClosingElement(control)
        ? control
        : null;
    if (!controlNode) {
      skipped += 1;
      return;
    }
    const controlTag = controlNode.tagName.getText();
    const componentByTag = { input: 'Input', textarea: 'Textarea', select: 'Select' };
    const component = componentByTag[controlTag];
    if (!component) {
      skipped += 1;
      return;
    }
    if (controlNode.attributes.properties.some((property) => attrName(property) === 'className')) {
      skipped += 1;
      return;
    }
    const spanText = span
      .getText()
      .replace(/^<span[^>]*>/, '')
      .replace(/<\/span>$/, '')
      .trim();
    if (!spanText) {
      skipped += 1;
      return;
    }
    let hintPart = '';
    if (hintNode) {
      if (!ts.isJsxElement(hintNode) || hintNode.openingElement.tagName.getText() !== 'small') {
        skipped += 1;
        return;
      }
      const hintAttrs = hintNode.openingElement.attributes.properties;
      const hintClass = hintAttrs.find((property) => attrName(property) === 'className');
      const hintText = hintNode
        .getText()
        .replace(/^<small[^>]*>/, '')
        .replace(/<\/small>$/, '')
        .trim();
      if (!hintText) {
        skipped += 1;
        return;
      }
      const extraHintAttrs = hintAttrs.filter((property) => property !== hintClass);
      const classIsMuted =
        hintClass &&
        ts.isStringLiteral(hintClass.initializer) &&
        hintClass.initializer.text === 'muted';
      if (extraHintAttrs.length > 0 || (hintClass && !classIsMuted)) {
        skipped += 1;
        return;
      }
      hintPart = classIsMuted
        ? ' hint={<span className="muted">{' + hintText + '}</span>}'
        : ' hint={' + hintText + '}';
    }
    const extraClasses = tokens.filter((token) => token !== 'material-field');
    const classPart = extraClasses.length ? ' className="' + extraClasses.join(' ') + '"' : '';
    const attrs = controlNode.attributes.getText();
    const attrsPart = attrs ? ' ' + attrs : '';
    const controlChildren =
      ts.isJsxElement(control) && control.children.length > 0
        ? control.children.map((child) => child.getText()).join('')
        : '';
    const controlPart = controlChildren
      ? '<' + component + attrsPart + '>' + controlChildren + '</' + component + '>'
      : '<' + component + attrsPart + ' />';
    const replacement =
      '<Field label={<>' +
      spanText +
      '</>}' +
      classPart +
      hintPart +
      '>' +
      controlPart +
      '</Field>';
    edits.push({ start: element.getStart(sourceFile), end: element.getEnd(), replacement });
    used.add(component);
    converted += 1;
  });
  if (converted === 0) {
    console.log(file + ': 0' + (skipped ? '（跳过 ' + skipped + '）' : ''));
    continue;
  }
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.replacement + next.slice(edit.end);
  }
  if (!/from '\.\/ui\/field'/.test(next)) {
    const importText = '\nimport { ' + [...used].sort().join(', ') + " } from './ui/field';";
    const imports = [...sourceFile.statements].filter((statement) =>
      ts.isImportDeclaration(statement),
    );
    const lastImport = imports[imports.length - 1];
    const insertAt = lastImport ? lastImport.getEnd() : 0;
    next = next.slice(0, insertAt) + importText + next.slice(insertAt);
  }
  if (write) writeFileSync(file, next, 'utf8');
  totalConverted += converted;
  console.log(
    file +
      ': ' +
      converted +
      (skipped ? '（跳过 ' + skipped + '）' : '') +
      (write ? '' : ' (dry-run)'),
  );
}
console.log('total: ' + totalConverted + (write ? ' (written)' : ' (dry-run)'));
