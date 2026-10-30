import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildExploreCandidates,
  hasExplorableGeometry,
  isExplorablePoi,
  pickExploreCandidate,
  shuffleWithSeed,
} from '../../apps/web/lib/random-explore.ts';

const poi = (id, extra = {}) => ({
  id,
  label: id,
  categoryId: 'commerce',
  geometry: { type: 'Point', coordinates: [100, 200] },
  ...extra,
});
const line = (id, extra = {}) =>
  poi(`transit-line-${id}`, {
    categoryId: 'transit-line',
    geometry: {
      type: 'MultiPoint',
      coordinates: [
        [0, 0],
        [100, 100],
      ],
    },
    ...extra,
  });

test('public POI and operating line candidates are unique, finite and exclude non-public or auxiliary data', () => {
  const markers = [
    poi('a'),
    poi('a'),
    poi('player', { categoryId: 'player' }),
    poi('road', { categoryId: 'road' }),
    poi('draft', { status: 'draft' }),
    poi('private', { visibility: 'private' }),
    poi('archived', { status: 'archived' }),
    poi('label', { spatial: { hideMarkerIcon: true } }),
    poi('network', { spatial: { networkKind: 'road' } }),
    poi('bad', { geometry: { type: 'Point', coordinates: [NaN, 0] } }),
    poi('unknown', { categoryId: undefined }),
    line('open'),
    line('closed'),
    line('planned'),
    line('missing'),
    line('hidden', { visibility: 'private' }),
  ];
  const lines = [
    { id: 'open', operationStatus: 'operating' },
    { id: 'closed', operationStatus: 'closed' },
    { id: 'planned', operationStatus: 'planned' },
    { id: 'hidden', operationStatus: 'operating' },
  ];
  assert.deepEqual(
    buildExploreCandidates(markers, lines).map((x) => x.id),
    ['a', 'transit-line-open'],
  );
});

test('all supported map geometries require usable finite coordinates', () => {
  assert.equal(hasExplorableGeometry({ type: 'MultiPoint', coordinates: [] }), false);
  assert.equal(hasExplorableGeometry({ type: 'Polygon', coordinates: [[]] }), false);
  assert.equal(
    hasExplorableGeometry({ type: 'Rectangle', bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 } }),
    true,
  );
  assert.equal(
    hasExplorableGeometry({ type: 'Rectangle', bounds: { minX: 10, minZ: 0, maxX: 0, maxZ: 10 } }),
    false,
  );
  assert.equal(
    hasExplorableGeometry({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      ],
    }),
    true,
  );
  assert.equal(isExplorablePoi(poi('planned', { transitOperationStatus: 'planned' })), false);
});

test('controlled selection can choose both types and avoids immediate repeats', () => {
  const candidates = [poi('a'), line('b')];
  assert.equal(pickExploreCandidate(candidates, undefined, () => 0).id, 'a');
  assert.equal(pickExploreCandidate(candidates, undefined, () => 0.999).id, 'transit-line-b');
  assert.equal(pickExploreCandidate(candidates, 'a', () => 0).id, 'transit-line-b');
  assert.equal(pickExploreCandidate(candidates, 'transit-line-b', () => 0.999).id, 'a');
  assert.equal(pickExploreCandidate([poi('a')], 'a', () => 0).id, 'a');
  assert.equal(
    pickExploreCandidate([], undefined, () => 0),
    undefined,
  );
});

test('recommendation shuffling is deterministic per seed, non-mutating and never duplicates or invents entries', () => {
  const items = Array.from({ length: 16 }, (_, i) => i);
  const first = shuffleWithSeed(items, 123);
  assert.deepEqual(first, shuffleWithSeed(items, 123));
  assert.notDeepEqual(first, shuffleWithSeed(items, 456));
  assert.deepEqual(
    [...first].sort((a, b) => a - b),
    items,
  );
  assert.deepEqual(
    items,
    Array.from({ length: 16 }, (_, i) => i),
  );
  assert.deepEqual(shuffleWithSeed([], 123), []);
  assert.deepEqual(shuffleWithSeed(['only'], 123), ['only']);
});
