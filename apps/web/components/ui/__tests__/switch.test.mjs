import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SwitchControl } from '../switch.tsx';

const render = (element) => renderToStaticMarkup(element);

test('SwitchControl 渲染 switch 语义与视觉层', () => {
  const html = render(
    createElement(SwitchControl, { label: '启用宽屏侧栏', checked: true, onChange: () => {} }),
  );
  assert.match(html, /class="switch-control"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /aria-label="启用宽屏侧栏"/);
  assert.match(html, /<span aria-hidden="true"><\/span>/);
});

test('SwitchControl 支持 aria-labelledby 与 disabled', () => {
  const html = render(
    createElement(SwitchControl, {
      'aria-labelledby': 'toggle-label',
      disabled: true,
    }),
  );
  assert.match(html, /aria-labelledby="toggle-label"/);
  assert.match(html, /disabled=""/);
});
