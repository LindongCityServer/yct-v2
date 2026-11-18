import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CheckboxRow, RadioRow } from '../checkbox-row.tsx';

const render = (element) => renderToStaticMarkup(element);

test('CheckboxRow 默认渲染 checkbox-row', () => {
  const html = render(createElement(CheckboxRow, { label: '启用', defaultChecked: true }));
  assert.match(html, /class="checkbox-row"/);
  assert.match(html, /type="checkbox"/);
});

test('CheckboxRow material 变体渲染 material-checkbox-row', () => {
  const html = render(
    createElement(CheckboxRow, { label: '行分隔', variant: 'material', className: 'toggle' }),
  );
  assert.match(html, /class="material-checkbox-row toggle"/);
});

test('CheckboxRow 透传 disabled', () => {
  const html = render(createElement(CheckboxRow, { label: '禁用', disabled: true }));
  assert.match(html, /disabled=""/);
});

test('RadioRow 渲染 radio-row / material-radio-row', () => {
  assert.match(render(createElement(RadioRow, { label: 'A' })), /class="radio-row"/);
  assert.match(
    render(createElement(RadioRow, { label: 'A', variant: 'material' })),
    /class="material-radio-row"/,
  );
});
