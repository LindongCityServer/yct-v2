import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SegmentedControl, SegmentedTabs } from '../segmented-control.tsx';

const render = (element) => renderToStaticMarkup(element);

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
];

test('SegmentedControl 支持外层轨道 wrapperClassName', () => {
  const html = render(
    createElement(SegmentedControl, {
      ariaLabel: '视图',
      wrapperClassName: 'markdown-view-switch',
      options,
      value: 'a',
      onChange: () => {},
    }),
  );
  assert.match(html, /class="segmented-control markdown-view-switch"/);
});

test('SegmentedTabs 支持 sr-only legend 与 aria-label', () => {
  const html = render(
    createElement(SegmentedTabs, {
      label: '筛选',
      legendClassName: 'sr-only',
      ariaLabel: '交通方式筛选',
      options: [{ value: 'all', label: '全部' }],
      value: 'all',
      onChange: () => {},
    }),
  );
  assert.match(html, /class="sr-only"/);
  assert.match(html, /aria-label="交通方式筛选"/);
});

test('SegmentedTabs 渲染 fieldset + legend + 按钮组', () => {
  const html = render(
    createElement(SegmentedTabs, {
      label: '工作区',
      options: [
        { value: 'a', label: '记录' },
        { value: 'b', label: '提醒' },
      ],
      value: 'a',
      onChange: () => {},
    }),
  );
  assert.match(html, /^<fieldset class="segmented-control"/);
  assert.match(html, /legend/);
  assert.match(html, /工作区/);
  assert.match(html, /aria-pressed="true"/);
});

test('SegmentedControl 渲染 group 语义与选中态', () => {
  const html = render(
    createElement(SegmentedControl, {
      ariaLabel: '视图',
      className: 'segmented-control',
      options,
      value: 'a',
      onChange: () => {},
    }),
  );
  assert.match(html, /class="segmented-control"/);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="视图"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /class="is-active"/);
});

test('SegmentedControl tablist 模式使用 tab 语义', () => {
  const html = render(
    createElement(SegmentedControl, {
      ariaLabel: '页签',
      className: 'segmented-control',
      options,
      value: 'b',
      role: 'tablist',
      onChange: () => {},
    }),
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/);
});

test('SegmentedControl 支持禁用项与整体禁用', () => {
  const disabledOptions = [
    { value: 'a', label: 'A', disabled: true },
    { value: 'b', label: 'B' },
  ];
  const html = render(
    createElement(SegmentedControl, {
      ariaLabel: '视图',
      className: 'segmented-control',
      options: disabledOptions,
      value: 'b',
      disabled: true,
      onChange: () => {},
    }),
  );
  assert.match(html, /disabled=""/);
});

test('SegmentedControl 支持 accentColor 自定义强调色变量', () => {
  const html = render(
    createElement(SegmentedControl, {
      ariaLabel: '颜色',
      className: 'segmented-control',
      options: [{ value: 'a', label: 'A', accentColor: '#168f78' }],
      value: 'a',
      onChange: () => {},
    }),
  );
  assert.match(html, /--yct-segmented-accent/);
  assert.match(html, /has-accent/);
});
