import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProgressiveImageOptimizerSrc,
  isProgressiveImageRemoteAllowed,
} from '../../apps/web/lib/progressive-image-source.ts';

const decodeUrl = (src) => new URL(src, 'https://yct.example').searchParams.get('url');
const decodeWidth = (src) => new URL(src, 'https://yct.example').searchParams.get('w');

test('local assets keep a relative optimizer source', () => {
  const src = buildProgressiveImageOptimizerSrc('/legacy-assets/poi/cover.webp', 1024, {
    basePath: '',
  });
  assert.match(src, /^\/_next\/image\?/);
  assert.equal(decodeUrl(src), '/legacy-assets/poi/cover.webp');
  assert.equal(decodeWidth(src), '1024');
  assert.equal(new URL(src, 'https://yct.example').searchParams.get('q'), '75');
});

test('basePath is stripped from the optimizer source but kept in the request path', () => {
  const src = buildProgressiveImageOptimizerSrc('/yct/legacy-assets/poi/cover.webp', 512, {
    basePath: '/yct',
  });
  assert.match(src, /^\/yct\/_next\/image\?/);
  assert.equal(decodeUrl(src), '/legacy-assets/poi/cover.webp');
});

test('basePath-prefixed content-assets still switch to an absolute source', () => {
  const src = buildProgressiveImageOptimizerSrc('/yct/content-assets/poi/cover.png', 1024, {
    basePath: '/yct',
    origin: 'https://yct.shangxiaoguan.top',
  });
  assert.equal(decodeUrl(src), 'https://yct.shangxiaoguan.top/content-assets/poi/cover.png');
});

test('content-assets switch to a same-origin absolute source when allowed', () => {
  const src = buildProgressiveImageOptimizerSrc('/content-assets/poi/cover.png', 1024, {
    basePath: '',
    origin: 'https://yct.shangxiaoguan.top',
  });
  assert.equal(decodeUrl(src), 'https://yct.shangxiaoguan.top/content-assets/poi/cover.png');
});

test('remote whitelist is used for the content-assets origin check', () => {
  const src = buildProgressiveImageOptimizerSrc('/content-assets/poi/cover.png', 1024, {
    basePath: '',
    origin: 'https://cdn.example.com',
    allowedRemoteHosts: ['cdn.example.com'],
  });
  assert.equal(decodeUrl(src), 'https://cdn.example.com/content-assets/poi/cover.png');
});

test('content-assets without an allowed origin are skipped instead of sending a bad request', () => {
  const src = buildProgressiveImageOptimizerSrc('/content-assets/poi/cover.png', 1024, {
    basePath: '',
    origin: 'http://localhost:3000',
  });
  assert.equal(src, undefined);
});

test('whitelisted remote https images are optimized', () => {
  const src = buildProgressiveImageOptimizerSrc('https://yct.shangxiaoguan.top/media/sample.jpg', 256, {
    basePath: '',
  });
  assert.equal(decodeUrl(src), 'https://yct.shangxiaoguan.top/media/sample.jpg');
});

test('remote images outside the whitelist are not sent to the optimizer', () => {
  assert.equal(
    buildProgressiveImageOptimizerSrc('https://example.com/sample.jpg', 256, { basePath: '' }),
    undefined,
  );
});

test('unsupported sources are skipped', () => {
  assert.equal(buildProgressiveImageOptimizerSrc('/assets/icon.svg', 256, { basePath: '' }), undefined);
  assert.equal(buildProgressiveImageOptimizerSrc('data:image/png;base64,AAAA', 256, { basePath: '' }), undefined);
  assert.equal(buildProgressiveImageOptimizerSrc('blob:https://yct.example/abc', 256, { basePath: '' }), undefined);
  assert.equal(
    buildProgressiveImageOptimizerSrc('/_next/image?url=%2Fa&w=256&q=75', 256, { basePath: '' }),
    undefined,
  );
});

test('remote host matching requires https and a whitelisted suffix', () => {
  assert.equal(isProgressiveImageRemoteAllowed('https://yct.shangxiaoguan.top/a.jpg'), true);
  assert.equal(isProgressiveImageRemoteAllowed('http://yct.shangxiaoguan.top/a.jpg'), false);
  assert.equal(isProgressiveImageRemoteAllowed('https://evil-shangxiaoguan.top/a.jpg'), false);
});
