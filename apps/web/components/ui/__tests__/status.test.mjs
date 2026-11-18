import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, Eyebrow, FormErrorText, StatusText } from '../status.tsx';

const render = (element) => renderToStaticMarkup(element);

test('StatusText 渲染状态说明行', () => {
  const html = render(createElement(StatusText, { role: 'status' }, '正在读取数据…'));
  assert.match(html, /<p[^>]*class="status-note"/);
  assert.match(html, /role="status"/);
  assert.match(html, /正在读取数据/);
});

test('EmptyState 支持自定义标签与图标', () => {
  const html = render(createElement(EmptyState, { as: 'section', icon: 'receipt_long' }, '空'));
  assert.match(html, /^<section class="empty-state"/);
  assert.match(html, /receipt_long/);
});

test('Eyebrow 默认 span，可切换为 p', () => {
  assert.match(render(createElement(Eyebrow, null, '物料后台')), /^<span class="eyebrow"/);
  assert.match(render(createElement(Eyebrow, { as: 'p' }, '运营')), /^<p class="eyebrow"/);
});

test('FormErrorText 渲染错误文本与 role=alert', () => {
  const html = render(createElement(FormErrorText, null, '必填'));
  assert.match(html, /class="form-error-text"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /必填/);
});

test('EmptyState 渲染图标与子内容', () => {
  const html = render(
    createElement(
      EmptyState,
      { icon: 'event_upcoming', compact: true },
      createElement('p', null, '暂无提醒'),
    ),
  );
  assert.match(html, /class="empty-state is-compact"/);
  assert.match(html, /material-symbols-outlined/);
  assert.match(html, /暂无提醒/);
});

test('EmptyState 支持 as=p 以兼容旧标记', () => {
  const html = render(
    createElement(EmptyState, { as: 'p', className: 'changelog-empty' }, '暂无更新'),
  );
  assert.match(html, /<p[^>]*class="empty-state changelog-empty"/);
});
