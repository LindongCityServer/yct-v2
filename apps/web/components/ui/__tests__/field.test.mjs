import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field, FieldGroup, Input, SearchField, Select, Textarea } from '../field.tsx';

const render = (element) => renderToStaticMarkup(element);

test('Field 渲染标准字段壳并关联标签', () => {
  const html = render(
    createElement(Field, { label: '标题' }, createElement(Input, { defaultValue: 'a' })),
  );
  assert.match(html, /class="material-field"/);
  assert.match(html, /<span>标题<\/span>/);
  assert.match(html, /<input/);
  assert.match(html, /id="/);
});

test('FieldGroup 渲染复合字段壳', () => {
  const html = render(
    createElement(
      FieldGroup,
      { label: '版式', className: 'extra-class' },
      createElement('div', null, '控件'),
    ),
  );
  assert.match(html, /class="material-field extra-class"/);
  assert.match(html, /<span>版式<\/span>/);
});

test('SearchField 渲染搜索框与清除按钮', () => {
  const html = render(
    createElement(SearchField, {
      value: '地铁',
      onChange: () => {},
      clearLabel: '清除',
      onClear: () => {},
    }),
  );
  assert.match(html, /class="search-box"/);
  assert.match(html, /class="search-clear-button"/);
  assert.match(html, /aria-label="清除"/);
});

test('SearchField 为空时不渲染清除按钮', () => {
  const html = render(createElement(SearchField, { value: '', onChange: () => {} }));
  assert.doesNotMatch(html, /search-clear-button/);
});

test('Field required 会给控件补 required 并显示视觉标记', () => {
  const html = render(
    createElement(Field, { label: '标题', required: true }, createElement(Input, null)),
  );
  assert.match(html, /required=""/);
  assert.match(html, /\*<\/span>/);
});

test('Field error 会补 aria-invalid / aria-describedby 与 role=alert', () => {
  const html = render(
    createElement(Field, { label: '标题', error: '必填' }, createElement(Input, null)),
  );
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="([^"]+)-error"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /form-error-text/);
});

test('Field hint 输出 small 并关联 aria-describedby', () => {
  const html = render(
    createElement(Field, { label: '像素', hint: '输出尺寸说明' }, createElement(Input, null)),
  );
  assert.match(html, /<small[^>]*id="([^"]+)-hint"/);
  assert.match(html, /aria-describedby="([^"]+)-hint"/);
});

test('Field 支持自定义 id 并透传到控件', () => {
  const html = render(
    createElement(Field, { label: '标题', id: 'custom-id' }, createElement(Input, null)),
  );
  assert.match(html, /for="custom-id"/);
  assert.match(html, /id="custom-id"/);
});

test('Select / Textarea 复用同一字段壳', () => {
  const html = render(
    createElement(
      Field,
      { label: '选择', error: '错误' },
      createElement(Select, null, createElement('option', { value: 'a' }, 'A')),
    ),
  );
  assert.match(html, /<select/);
  assert.match(html, /aria-invalid="true"/);

  const textareaHtml = render(
    createElement(Field, { label: '说明' }, createElement(Textarea, null)),
  );
  assert.match(textareaHtml, /<textarea/);
  assert.match(textareaHtml, /class="material-field"/);
});

test('脱离 Field 时控件不产生多余属性', () => {
  const html = render(createElement(Input, { defaultValue: 'x' }));
  assert.doesNotMatch(html, /aria-invalid/);
  assert.doesNotMatch(html, /aria-describedby/);
});
