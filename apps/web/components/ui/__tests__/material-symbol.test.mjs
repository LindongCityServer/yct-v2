import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MaterialSymbol } from '../material-symbol.tsx';

test('MaterialSymbol 渲染标准图标类名与名称', () => {
  const html = renderToStaticMarkup(createElement(MaterialSymbol, { name: 'close' }));
  assert.match(html, /class="material-symbols-outlined"/);
  assert.match(html, />close</);
});

test('MaterialSymbol 透传 aria-hidden 与 className', () => {
  const html = renderToStaticMarkup(
    createElement(MaterialSymbol, { name: 'check', 'aria-hidden': true, className: 'is-active' }),
  );
  assert.match(html, /class="material-symbols-outlined is-active"/);
  assert.match(html, /aria-hidden="true"/);
});
