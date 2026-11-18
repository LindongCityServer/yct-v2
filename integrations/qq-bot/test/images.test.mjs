import assert from 'node:assert/strict';
import test from 'node:test';
import { pickReferenceImage } from '../src/images.mjs';

const base = {
  enabled: true,
  publicBaseUrl: 'https://yct.example.com',
  hosts: new Set(),
};

test('选择公开站点下的 HTTPS 配图', () => {
  const url = pickReferenceImage({
    ...base,
    references: [{ imageUrl: '/content-assets/cover.png' }],
  });
  assert.equal(url, 'https://yct.example.com/content-assets/cover.png');
});

test('跳过 HTTP、外域和未启用配图', () => {
  assert.equal(
    pickReferenceImage({
      ...base,
      references: [{ imageUrl: 'http://yct.example.com/a.png' }],
    }),
    null,
  );
  assert.equal(
    pickReferenceImage({
      ...base,
      references: [{ imageUrl: 'https://other.example.com/a.png' }],
    }),
    null,
  );
  assert.equal(
    pickReferenceImage({
      ...base,
      enabled: false,
      references: [{ imageUrl: '/a.png' }],
    }),
    null,
  );
});

test('允许显式加入的图片域名', () => {
  const url = pickReferenceImage({
    ...base,
    hosts: new Set(['cdn.example.com']),
    references: [{ imageUrl: 'https://cdn.example.com/a.png' }],
  });
  assert.equal(url, 'https://cdn.example.com/a.png');
});
