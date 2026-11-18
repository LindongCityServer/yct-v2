import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, IconButton, IconLink } from '../button.tsx';

const render = (element) => renderToStaticMarkup(element);

test('Button 默认渲染主按钮标准类名', () => {
  const html = render(createElement(Button, null, '保存'));
  assert.match(html, /class="primary-action-button"/);
  assert.match(html, /type="button"/);
  assert.match(html, /保存/);
});

test('Button 变体映射到标准类名', () => {
  assert.match(
    render(createElement(Button, { variant: 'secondary' }, '取消')),
    /class="secondary-action-button"/,
  );
  assert.match(
    render(createElement(Button, { variant: 'emphasis' }, '强调')),
    /class="secondary-action-button is-emphasis"/,
  );
});

test('Button loading 时禁用并暴露 aria-busy 与进度图标', () => {
  const html = render(createElement(Button, { loading: true }, '提交中'));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /progress_activity/);
});

test('Button 仅在传入 icon 时渲染图标', () => {
  assert.doesNotMatch(render(createElement(Button, null, '纯文本')), /material-symbols-outlined/);
  assert.match(
    render(createElement(Button, { icon: 'save' }, '保存')),
    /material-symbols-outlined/,
  );
});

test('Button 透传 className 与原生属性', () => {
  const html = render(
    createElement(
      Button,
      { className: 'layout-only', type: 'submit', form: 'f1', name: 'action' },
      '提交',
    ),
  );
  assert.match(html, /class="primary-action-button layout-only"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /form="f1"/);
  assert.match(html, /name="action"/);
});

test('IconButton 默认 action 形态且必须有可访问名称', () => {
  const html = render(createElement(IconButton, { icon: 'close', label: '关闭' }));
  assert.match(html, /class="icon-action-button"/);
  assert.match(html, /aria-label="关闭"/);
  assert.match(html, /title="关闭"/);
  assert.match(html, /close/);
});

test('IconLink 渲染锚点图标链接', () => {
  const html = render(createElement(IconLink, { href: '/edit', label: '编辑', icon: 'edit' }));
  assert.match(html, /^<a /);
  assert.match(html, /class="icon-action-button"/);
  assert.match(html, /aria-label="编辑"/);
  assert.match(html, /href="\/edit"/);
});

test('IconButton 支持自定义 children 图形', () => {
  const html = render(
    createElement(IconButton, { label: '打开智能问答' }, createElement('span', null, 'glyph')),
  );
  assert.match(html, /aria-label="打开智能问答"/);
  assert.match(html, />glyph</);
});

test('IconButton 支持 icon 形态', () => {
  assert.match(
    render(createElement(IconButton, { icon: 'close', label: '关闭', variant: 'icon' })),
    /class="icon-button"/,
  );
});
