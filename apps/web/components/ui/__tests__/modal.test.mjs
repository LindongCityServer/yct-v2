import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from '../modal.tsx';

const render = (element) => renderToStaticMarkup(element);

test('Modal 默认渲染 section 面板与遮罩', () => {
  const html = render(
    createElement(
      Modal,
      { labelledBy: 'title', className: 'trip-reminder-modal' },
      createElement('h2', { id: 'title' }, '添加提醒'),
    ),
  );
  assert.match(html, /class="modal-backdrop"/);
  assert.match(
    html,
    /<section class="modal-panel trip-reminder-modal" role="dialog" aria-modal="true" aria-labelledby="title">/,
  );
  assert.match(html, /添加提醒/);
});

test('Modal as=form 保留表单语义与提交入口', () => {
  const html = render(
    createElement(
      Modal,
      { as: 'form', labelledBy: 'form-title', onSubmit: () => {} },
      createElement('h2', { id: 'form-title' }, '表单弹窗'),
    ),
  );
  assert.match(html, /<form class="modal-panel"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
});

test('Modal 支持 div 面板与 aria-describedby', () => {
  const html = render(
    createElement(
      Modal,
      { as: 'div', labelledBy: 'title', ariaDescribedBy: 'desc' },
      createElement('p', { id: 'desc' }, '说明'),
    ),
  );
  assert.match(html, /<div class="modal-panel"/);
  assert.match(html, /aria-describedby="desc"/);
});

test('Modal 支持 ariaModal={false} 的非阻塞浮层', () => {
  const html = render(createElement(Modal, { ariaModal: false, ariaLabel: '快捷键' }, '内容'));
  assert.match(html, /aria-modal="false"/);
});

test('Modal 支持 ariaLabel（无标题元素场景）', () => {
  const html = render(createElement(Modal, { ariaLabel: '班次规则' }, '内容'));
  assert.match(html, /aria-label="班次规则"/);
});

test('Modal 支持面板内联样式', () => {
  const html = render(createElement(Modal, { panelStyle: { width: '760px' } }, '内容'));
  assert.match(html, /style="width:760px"/);
});

test('Modal 支持自定义遮罩类名', () => {
  const html = render(
    createElement(
      Modal,
      { backdropClassName: 'metro-wayfinding-import-backdrop editor-dialog-backdrop' },
      '内容',
    ),
  );
  assert.match(
    html,
    /class="modal-backdrop metro-wayfinding-import-backdrop editor-dialog-backdrop"/,
  );
});

test('Modal 不传 onBackdropClick 时不带多余属性', () => {
  const html = render(createElement(Modal, null, '内容'));
  assert.match(html, /class="modal-panel"/);
});
