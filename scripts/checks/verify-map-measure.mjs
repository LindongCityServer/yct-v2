import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMeasureValue,
  getMeasureArea,
  getMeasurePerimeter,
  getMeasureSegmentDistances,
  isMeasurePolygonSelfIntersecting,
  validateMeasureArea,
} from '../../apps/web/lib/map-measure.ts';

/**
 * 手工取点即可复算的样本：
 * 三角形 (0,0)-(4,0)-(0,3) 边长 4/3/5，面积 6。
 */
test('closed triangle distance, perimeter and area are exact', () => {
  const triangle = [
    [0, 0],
    [4, 0],
    [0, 3],
  ];
  assert.deepEqual(getMeasureSegmentDistances(triangle), [4, 5]);
  assert.equal(getMeasurePerimeter(triangle), 12);
  assert.equal(getMeasureArea(triangle), 6);
});

test('rectangle area and perimeter ignore vertex order', () => {
  const clockwise = [
    [5, 5],
    [5, 10],
    [15, 10],
    [15, 5],
  ];
  const counterClockwise = [...clockwise].reverse();
  assert.equal(getMeasureArea(clockwise), 50);
  assert.equal(getMeasurePerimeter(clockwise), 30);
  assert.equal(getMeasureArea(counterClockwise), 50);
});

test('bow-tie boundary is reported as self-intersecting and rejected', () => {
  const bowTie = [
    [0, 0],
    [4, 4],
    [0, 4],
    [4, 0],
  ];
  assert.equal(isMeasurePolygonSelfIntersecting(bowTie), true);
  const validation = validateMeasureArea(bowTie);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'selfIntersecting');
});

test('collinear points are rejected before producing an area', () => {
  const validation = validateMeasureArea([
    [0, 0],
    [2, 0],
    [4, 0],
  ]);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'collinear');
});

test('duplicate vertices are rejected', () => {
  const validation = validateMeasureArea([
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 0],
  ]);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, 'duplicatePoint');
});

test('valid polygon exposes area and perimeter for the panel', () => {
  const validation = validateMeasureArea([
    [0, 0],
    [6, 0],
    [6, 4],
  ]);
  assert.equal(validation.valid, true);
  assert.equal(validation.summary.area, 12);
  assert.equal(validation.summary.perimeter, 6 + 4 + Math.hypot(6, 4));
});

test('display values keep one decimal at most', () => {
  assert.equal(formatMeasureValue(5), '5');
  assert.equal(formatMeasureValue(5.24), '5.2');
  assert.equal(formatMeasureValue(5.26), '5.3');
  assert.equal(formatMeasureValue(Number.NaN), '0');
});
