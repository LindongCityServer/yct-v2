import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ButtonLink } from '../button.tsx';

const render = (element) => renderToStaticMarkup(element);

test('ButtonLink 渲染 <a> 语义与次按钮类名', () => {
  const html = render(createElement(ButtonLink, { href: '/travel' }, '查看行程'));
  assert.match(html, /^<a/);
  assert.match(html, /class="secondary-action-button"/);
  assert.match(html, /href="\/travel"/);
  assert.match(html, /查看行程/);
});

test('ButtonLink 支持主按钮与图标', () => {
  const html = render(
    createElement(ButtonLink, { href: '/new', variant: 'primary', icon: 'add' }, '新建'),
  );
  assert.match(html, /class="primary-action-button"/);
  assert.match(html, /material-symbols-outlined/);
});

test('ButtonLink 透传 target/rel 等链接属性', () => {
  const html = render(
    createElement(
      ButtonLink,
      { href: 'https://x.test', target: '_blank', rel: 'noreferrer' },
      '外链',
    ),
  );
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer"/);
});
