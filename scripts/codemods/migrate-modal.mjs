#!/usr/bin/env node
/**
 * 一次性 codemod：把「modal-backdrop > section.modal-panel」结构迁移到 Modal 原语。
 *
 * 只处理结构完全一致的 section 版弹窗（不处理 form/div 面板、额外属性、动态 className），
 * 其余保持原样，避免误改。迁移后由 tsc + ui:controls:check 兜底。
 *
 * 用法：
 *   node scripts/codemods/migrate-modal.mjs apps/web/components/foo.tsx [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const files = process.argv.slice(2).filter((arg) => arg !== '--write');
const write = process.argv.includes('--write');

function attrMap(opening) {
  const map = new Map();
  for (const property of opening.attributes.properties) {
    if (!ts.isJsxAttribute(property)) continue;
    map.set(property.name.getText(), property);
  }
  return map;
}

function literalText(attribute) {
  if (!attribute) return undefined;
  const initializer = attribute.initializer;
  if (!initializer) return undefined;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  return undefined;
}

function expressionOf(attribute) {
  if (!attribute) return undefined;
  const initializer = attribute.initializer;
  if (!initializer || !ts.isJsxExpression(initializer)) return undefined;
  return initializer.expression;
}

function arrowExpression(expression) {
  if (!expression || !ts.isArrowFunction(expression)) return undefined;
  if (expression.parameters.length !== 0) return undefined;
  if (ts.isExpression(expression.body)) return expression.body.getText();
  const statements = expression.body.statements;
  if (statements.length !== 1 || !ts.isExpressionStatement(statements[0])) return undefined;
  return statements[0].expression.getText();
}

function isStopPropagation(expression) {
  return !!expression && expression.getText().includes('.stopPropagation()');
}

/** 提取 `(event) => { if (event.currentTarget === event.target) close(); }` 里的 close()。 */
function targetCheckClose(expression) {
  if (!expression || !ts.isArrowFunction(expression)) return undefined;
  if (expression.parameters.length !== 1) return undefined;
  const body = expression.body;
  if (!ts.isBlock(body) || body.statements.length !== 1) return undefined;
  const statement = body.statements[0];
  if (!ts.isIfStatement(statement)) return undefined;
  const condition = statement.expression.getText();
  if (!condition.includes('.currentTarget') || !condition.includes('.target')) return undefined;
  const thenStatement = statement.thenStatement;
  if (ts.isExpressionStatement(thenStatement)) return thenStatement.expression.getText();
  if (
    ts.isBlock(thenStatement) &&
    thenStatement.statements.length === 1 &&
    ts.isExpressionStatement(thenStatement.statements[0])
  ) {
    return thenStatement.statements[0].expression.getText();
  }
  return undefined;
}

function migrateFile(file) {
  const source = readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const tag = opening.tagName.getText();
      if (tag === 'div') {
        const attrs = attrMap(opening);
        const className = literalText(attrs.get('className'));
        const classNameTokens = (className ?? '').split(/\s+/).filter(Boolean);
        const backdropOk = classNameTokens[0] === 'modal-backdrop';
        const backdropExtraClass = classNameTokens
          .filter((token) => token !== 'modal-backdrop')
          .join(' ');
        const hasOnlyAllowed =
          attrs.has('className') &&
          [...attrs.keys()].every((name) => ['className', 'role', 'onMouseDown'].includes(name));
        const meaningful = node.children.filter(
          (child) => !(ts.isJsxText(child) && child.text.trim() === ''),
        );
        const children = meaningful.filter(
          (child) => !(ts.isJsxExpression(child) && !child.expression),
        );
        const onlyCommentsRemoved = meaningful.length === children.length;
        if (
          hasOnlyAllowed &&
          backdropOk &&
          onlyCommentsRemoved &&
          children.length === 1 &&
          ts.isJsxElement(children[0])
        ) {
          const section = children[0];
          const sectionAttrs = attrMap(section.openingElement);
          const sectionClass = literalText(sectionAttrs.get('className')) ?? '';
          const labelledBy = literalText(sectionAttrs.get('aria-labelledby'));
          const labelledByExpression = expressionOf(sectionAttrs.get('aria-labelledby'));
          const ariaLabel = literalText(sectionAttrs.get('aria-label'));
          const ariaLabelExpression = expressionOf(sectionAttrs.get('aria-label'));
          const role = literalText(sectionAttrs.get('role'));
          const ariaModal = sectionAttrs.get('aria-modal')?.initializer?.getText();
          const ariaModalFalse =
            ariaModal === '"false"' || ariaModal === '{false}' || ariaModal === 'false';
          const ariaModalOk =
            ariaModal === '"true"' ||
            ariaModal === '{true}' ||
            ariaModal === 'true' ||
            ariaModalFalse;
          const onMouseDown = expressionOf(sectionAttrs.get('onMouseDown'));
          const backdropHandler = expressionOf(attrs.get('onMouseDown'));
          const backdropTargetCheck = targetCheckClose(backdropHandler);
          const panelMouseOk =
            isStopPropagation(onMouseDown) || (onMouseDown === undefined && !!backdropTargetCheck);
          const backdropClick = backdropHandler
            ? (arrowExpression(backdropHandler) ??
              targetCheckClose(backdropHandler) ??
              (ts.isIdentifier(backdropHandler) || ts.isPropertyAccessExpression(backdropHandler)
                ? backdropHandler.getText()
                : undefined))
            : undefined;
          const panelTag = section.openingElement.tagName.getText();
          const baseAttrs = [
            'className',
            'role',
            'aria-modal',
            'aria-labelledby',
            'aria-label',
            'aria-describedby',
            'style',
            'onMouseDown',
          ];
          const allowedByTag = {
            section: [...baseAttrs, 'onChangeCapture'],
            div: [...baseAttrs, 'onChangeCapture'],
            form: [...baseAttrs, 'onSubmit', 'onChangeCapture'],
          };
          const allowedPanelAttrs = allowedByTag[panelTag];
          const ariaDescribedBy = literalText(sectionAttrs.get('aria-describedby'));
          const describedByUnsupported =
            sectionAttrs.has('aria-describedby') && ariaDescribedBy === undefined;
          const onSubmit = expressionOf(sectionAttrs.get('onSubmit'));
          const onChangeCapture = expressionOf(sectionAttrs.get('onChangeCapture'));
          const panelStyle = expressionOf(sectionAttrs.get('style'));
          const panelOk =
            !!allowedPanelAttrs &&
            !describedByUnsupported &&
            role === 'dialog' &&
            ariaModalOk &&
            panelMouseOk &&
            [...sectionAttrs.keys()].every((name) => allowedPanelAttrs.includes(name));
          if (panelOk && backdropClick) {
            const extraClass = sectionClass
              .split(/\s+/)
              .filter((token) => token && token !== 'modal-panel')
              .join(' ');
            const label = labelledBy
              ? ' labelledBy="' + labelledBy + '"'
              : labelledByExpression
                ? ' labelledBy={' + labelledByExpression.getText() + '}'
                : '';
            const backdropProp = backdropExtraClass
              ? ' backdropClassName="' + backdropExtraClass + '"'
              : '';
            const ariaLabelProp = ariaLabel
              ? ' ariaLabel="' + ariaLabel + '"'
              : ariaLabelExpression
                ? ' ariaLabel={' + ariaLabelExpression.getText() + '}'
                : '';
            const describedBy = ariaDescribedBy ? ' ariaDescribedBy="' + ariaDescribedBy + '"' : '';
            const cls = extraClass ? ' className="' + extraClass + '"' : '';
            const asProp = panelTag === 'section' ? '' : ' as="' + panelTag + '"';
            const submitProp =
              panelTag === 'form' && onSubmit ? ' onSubmit={' + onSubmit.getText() + '}' : '';
            const changeCaptureProp = onChangeCapture
              ? ' onChangeCapture={' + onChangeCapture.getText() + '}'
              : '';
            const panelStyleProp = panelStyle ? ' panelStyle={' + panelStyle.getText() + '}' : '';
            const childText = source.slice(section.children.pos, section.children.end);
            const replacement =
              '<Modal' +
              label +
              ariaLabelProp +
              (ariaModalFalse ? ' ariaModal={false}' : '') +
              backdropProp +
              describedBy +
              cls +
              asProp +
              submitProp +
              changeCaptureProp +
              panelStyleProp +
              ' onBackdropClick={() => ' +
              backdropClick +
              '}>' +
              childText +
              '</Modal>';
            edits.push({ start: node.getStart(ast), end: node.getEnd(), text: replacement });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!edits.length) return { file, count: 0 };
  let next = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
  }
  // add import after the last import declaration（已存在则跳过，避免重复导入）
  if (ts.isSourceFile(ast) && !/import \{[^}]*\bModal\b[^}]*\} from '\.\.?\//.test(next)) {
    const imports = ast.statements.filter(ts.isImportDeclaration);
    if (imports.length) {
      const last = imports[imports.length - 1];
      const relativePath = relative(
        dirname(file),
        resolve('apps/web/components/ui/modal'),
      ).replaceAll('\\', '/');
      const specifier = relativePath.startsWith('.') ? relativePath : './' + relativePath;
      const importText = "\nimport { Modal } from '" + specifier + "';";
      const insertAt = last.getEnd();
      next = next.slice(0, insertAt) + importText + next.slice(insertAt);
    }
  }
  if (write) writeFileSync(file, next, 'utf8');
  return { file, count: edits.length };
}

let total = 0;
for (const file of files) {
  const result = migrateFile(file);
  total += result.count;
  console.log(result.file + ': ' + result.count);
}
console.log('total: ' + total + (write ? ' (written)' : ' (dry-run)'));
