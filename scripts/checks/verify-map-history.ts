import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MapHistoryVersionDescriptor } from '@yct/contracts';
import {
  buildMapHistoryShareUrl,
  buildMapHistoryTileCacheKey,
  buildMapHistoryTileProxyTemplate,
  clampViewToHistoryVersion,
  createHistoryTileEmptyResponse,
  createHistoryTileHeaders,
  isHistoryTileInCoverage,
  parseMapHistoryVersions,
  pickAdjacentHistoryVersion,
  readMapHistoryParams,
  sortActiveHistoryVersions,
  toMapHistoryVersionDescriptor,
} from '../../apps/web/lib/map-history.ts';

const zoomBounds = { minZoom: -7, maxZoom: 3 };
const defaults = { centerX: -945, centerZ: -876, zoom: 0 };

function version(
  id: string,
  worldDataDate: string | null,
  status: 'active' | 'archived' = 'active',
): MapHistoryVersionDescriptor {
  return {
    id,
    name: `版本 ${id}`,
    worldDataDate,
    coverage: { minX: -1200, minZ: -1100, maxX: -600, maxZ: -500 },
    zoomRange: { minZoom: -4, maxZoom: 2 },
    status,
  };
}

function configEntry(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: `版本 ${id}`,
    worldDataDate: '2025-01-01',
    tileTemplate: 'https://example.test/tiles/zoom.{z}/{xd}/{yd}/tile.{x}.{y}.png',
    coverage: { minX: -1200, minZ: -1100, maxX: -600, maxZ: -500 },
    zoomRange: { minZoom: -4, maxZoom: 2 },
    ...extra,
  };
}

test('版本配置逐项校验：坏 JSON、坏字段与重复 id 被忽略，合法项保留', () => {
  const empty = parseMapHistoryVersions(undefined);
  assert.deepEqual(empty.versions, []);
  assert.deepEqual(empty.issues, []);

  const badJson = parseMapHistoryVersions('{not json');
  assert.equal(badJson.versions.length, 0);
  assert.equal(badJson.issues.length, 1);

  const mixed = parseMapHistoryVersions(
    JSON.stringify([
      configEntry('2024-q1'),
      configEntry('Bad_ID'),
      configEntry('2024-q1'),
      configEntry('2024-q2', { tileTemplate: 'https://example.test/tiles/{z}/{x}.png' }),
    ]),
  );
  assert.deepEqual(
    mixed.versions.map((item) => item.id),
    ['2024-q1'],
  );
  assert.ok(mixed.issues.some((issue) => issue.includes('id')));
  assert.ok(mixed.issues.some((issue) => issue.includes('重复')));

  const descriptor = toMapHistoryVersionDescriptor(mixed.versions[0]);
  assert.equal('tileTemplate' in descriptor, false);
  assert.equal(descriptor.worldDataDate, '2025-01-01');
});

test('已知日期按升序，日期未知排在最后，已下架不参与切换', () => {
  const versions = [
    version('unknown', null),
    version('2023', '2023-06-01'),
    version('2025', '2025-01-01'),
    version('archived', '2024-01-01', 'archived'),
    version('2024', '2024-01-01'),
  ];
  assert.deepEqual(
    sortActiveHistoryVersions(versions).map((item) => item.id),
    ['2023', '2024', '2025', 'unknown'],
  );
});

test('上一期/下一期边界：首尾返回 null，日期未知不参与', () => {
  const versions = [
    version('unknown', null),
    version('2023', '2023-06-01'),
    version('2024', '2024-01-01'),
    version('2025', '2025-01-01'),
    version('archived', '2026-01-01', 'archived'),
  ];

  assert.equal(pickAdjacentHistoryVersion(versions, '2023', -1), null);
  assert.equal(pickAdjacentHistoryVersion(versions, '2023', 1)?.id, '2024');
  assert.equal(pickAdjacentHistoryVersion(versions, '2024', -1)?.id, '2023');
  assert.equal(pickAdjacentHistoryVersion(versions, '2025', 1), null);
  assert.equal(pickAdjacentHistoryVersion(versions, 'unknown', -1), null);
  assert.equal(pickAdjacentHistoryVersion(versions, 'unknown', 1), null);
  assert.equal(pickAdjacentHistoryVersion(versions, 'archived', 1), null);
});

test('版本参数解析：非法/不存在/已下架回退当前地图并给出提示', () => {
  const versions = [version('2024', '2024-01-01'), version('old', '2023-01-01', 'archived')];

  const missing = readMapHistoryParams(new URLSearchParams(''), versions, defaults, zoomBounds);
  assert.equal(missing.version, null);
  assert.equal(missing.notice, null);
  assert.deepEqual(missing.view, defaults);

  const malformed = readMapHistoryParams(
    new URLSearchParams('hv=../etc&hx=-900&hz=-800&hzoom=0'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(malformed.version, null);
  assert.equal(malformed.notice, 'unknown-version');
  assert.deepEqual(malformed.view, defaults);

  const unknown = readMapHistoryParams(
    new URLSearchParams('hv=2099&hx=-900&hz=-800&hzoom=0'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(unknown.version, null);
  assert.equal(unknown.notice, 'unknown-version');

  const archived = readMapHistoryParams(
    new URLSearchParams('hv=old&hx=-900&hz=-800&hzoom=0'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(archived.version, null);
  assert.equal(archived.notice, 'archived-version');
});

test('视图参数非法时保留版本但回到默认视图并提示', () => {
  const versions = [version('2024', '2024-01-01')];
  const state = readMapHistoryParams(
    new URLSearchParams('hv=2024&hx=abc&hz=-800&hzoom=0'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(state.version?.id, '2024');
  assert.equal(state.notice, 'invalid-view');
  assert.deepEqual(state.view, defaults);

  const huge = readMapHistoryParams(
    new URLSearchParams('hv=2024&hx=999999999&hz=-800&hzoom=0'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(huge.notice, 'invalid-view');
});

test('缩放/覆盖范围超界会被收拢并提示，不静默处理', () => {
  const versions = [version('2024', '2024-01-01')];
  const clamped = readMapHistoryParams(
    new URLSearchParams('hv=2024&hx=-2000&hz=-2000&hzoom=6'),
    versions,
    defaults,
    zoomBounds,
  );
  assert.equal(clamped.version?.id, '2024');
  assert.equal(clamped.notice, 'view-clamped');
  assert.equal(clamped.view.zoom, 2);
  assert.equal(clamped.view.centerX, -1200);
  assert.equal(clamped.view.centerZ, -1100);

  const direct = clampViewToHistoryVersion(
    { centerX: -2000, centerZ: 100, zoom: 6 },
    versions[0],
    zoomBounds,
  );
  assert.equal(direct.clamped, true);
  assert.deepEqual(direct.view, { centerX: -1200, centerZ: -500, zoom: 2 });
});

test('分享链接与参数回读一致', () => {
  const url = buildMapHistoryShareUrl(
    '2024-q1',
    { centerX: -901.23, centerZ: -802.34, zoom: 0.55 },
    'https://yct.test',
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('hv'), '2024-q1');
  assert.equal(parsed.searchParams.get('hx'), '-901.2');
  assert.equal(parsed.searchParams.get('hz'), '-802.3');
  assert.equal(parsed.searchParams.get('hzoom'), '0.6');

  const versions = [version('2024-q1', '2024-03-01')];
  const state = readMapHistoryParams(parsed.searchParams, versions, defaults, zoomBounds);
  assert.equal(state.version?.id, '2024-q1');
  assert.deepEqual(state.view, { centerX: -901.2, centerZ: -802.3, zoom: 0.6 });
  assert.equal(state.notice, null);
});

test('瓦片 URL 与缓存键都带版本维度', () => {
  const template = buildMapHistoryTileProxyTemplate('2024-q1');
  assert.ok(template.includes('version=2024-q1'));
  assert.ok(template.includes('{z}') && template.includes('{x}') && template.includes('{y}'));

  const first = buildMapHistoryTileCacheKey('2024-q1', 0, 3, 4);
  const second = buildMapHistoryTileCacheKey('2024-q2', 0, 3, 4);
  assert.equal(first, 'history:2024-q1:0:3:4');
  assert.notEqual(first, second);
});

test('历史瓦片只按覆盖范围取图，缺图返回 no-store 404 而不是当前瓦片', async () => {
  const coverage = { minX: 0, minZ: 0, maxX: 256, maxZ: 256 };
  assert.equal(isHistoryTileInCoverage(0, 0, 0, coverage), true);
  assert.equal(isHistoryTileInCoverage(1, 0, 0, coverage), false);
  assert.equal(isHistoryTileInCoverage(0, 1, 0, coverage), false);

  const empty = createHistoryTileEmptyResponse('2024-q1', 'not-found');
  assert.equal(empty.status, 404);
  assert.equal(empty.headers.get('Cache-Control'), 'no-store');
  assert.equal(empty.headers.get('X-YCT-Tile-Empty'), 'not-found');
  assert.equal(empty.headers.get('X-YCT-Tile-Version'), '2024-q1');
  assert.equal(empty.headers.get('Content-Type'), 'text/plain; charset=utf-8');

  const image = createHistoryTileHeaders('2024-q1', {
    contentType: 'image/png',
    upstreamEtag: 'W/"abc123"',
  });
  assert.equal(image.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.match(image.get('ETag') ?? '', /^W\/"yct-history-2024-q1-/);
  assert.equal(image.get('X-YCT-Tile-Version'), '2024-q1');

  const otherVersion = createHistoryTileHeaders('2024-q2', {
    contentType: 'image/png',
    upstreamEtag: 'W/"abc123"',
  });
  assert.notEqual(image.get('ETag'), otherVersion.get('ETag'));
});
