import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPoiWorkspaceHref,
  buildPoiWorkspaceReturnHref,
  readPoiReturnContext,
  removePoiReturnContext,
  storePoiReturnContext,
} from '../../apps/web/lib/poi-editor-navigation.ts';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
const context = {
  markerId: 'poi-test',
  query: '测试搜索',
  statusFilter: 'published',
  categoryFilter: 'commerce',
  scrollY: 240,
  listScrollTop: 80,
  createdAt: 1000,
};

test('both workspaces retain the same marker and return token', () => {
  for (const workspace of ['geometry', 'intro']) {
    const url = new URL(
      buildPoiWorkspaceHref(workspace, 'poi-test', 'test-token'),
      'https://example.test',
    );
    assert.equal(url.searchParams.get('markerId'), 'poi-test');
    assert.equal(url.searchParams.get('returnContext'), 'test-token');
    assert.equal(
      url.pathname,
      `/admin/map-poi/${workspace === 'intro' ? 'intro-editor' : 'editor'}`,
    );
  }
});
test('return opens a modal explicitly while direct workspace visits return to the list', () => {
  const url = new URL(
    buildPoiWorkspaceReturnHref('poi-test', 'test-token'),
    'https://example.test',
  );
  assert.equal(url.pathname, '/admin/map-poi');
  assert.equal(url.searchParams.get('edit'), '1');
  assert.equal(buildPoiWorkspaceReturnHref('poi-test'), '/admin/map-poi');
  assert.equal(buildPoiWorkspaceReturnHref(undefined, 'test-token'), '/admin/map-poi');
});
test('return URLs cannot inject external paths or additional query parameters', () => {
  const url = new URL(
    buildPoiWorkspaceReturnHref('https://evil.test/?edit=other', 'test-token'),
    'https://example.test',
  );
  assert.equal(url.origin, 'https://example.test');
  assert.equal(url.pathname, '/admin/map-poi');
  assert.equal(url.searchParams.get('markerId'), 'https://evil.test/?edit=other');
  assert.equal(buildPoiWorkspaceReturnHref('poi-test', '//evil.test'), '/admin/map-poi');
});
test('list state roundtrips and can be explicitly removed', () => {
  const store = storage();
  storePoiReturnContext(store, 'test-token', context);
  assert.deepEqual(readPoiReturnContext(store, 'test-token', 'poi-test', 2000), context);
  removePoiReturnContext(store, 'test-token');
  assert.equal(readPoiReturnContext(store, 'test-token', 'poi-test', 2000), undefined);
});
test('contexts from another POI, expired sessions and future clocks do not restore', () => {
  for (const [marker, now] of [
    ['other', 2000],
    ['poi-test', 2000000],
    ['poi-test', 500],
  ]) {
    const store = storage();
    storePoiReturnContext(store, 'test-token', context);
    assert.equal(readPoiReturnContext(store, 'test-token', marker, now), undefined);
  }
});
test('malformed state, invalid filters and nonfinite scroll values degrade safely', () => {
  for (const value of [
    'not-json',
    'null',
    JSON.stringify({ ...context, statusFilter: 'invalid' }),
    JSON.stringify({ ...context, scrollY: -1 }),
  ]) {
    const store = storage();
    store.setItem('yct:poi-editor-return:test-token', value);
    assert.equal(readPoiReturnContext(store, 'test-token', 'poi-test', 2000), undefined);
  }
});
test('blocked browser storage does not break navigation', () => {
  const blocked = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => storePoiReturnContext(blocked, 'test-token', context));
  assert.equal(readPoiReturnContext(blocked, 'test-token', 'poi-test', 2000), undefined);
  assert.doesNotThrow(() => removePoiReturnContext(blocked, 'test-token'));
  assert.match(buildPoiWorkspaceReturnHref('poi-test', 'test-token'), /edit=1/);
});
