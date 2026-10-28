import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTransitDepartureRulesForEditor as format } from '../../apps/web/lib/transit-departure-editor.ts';

const rule = (time) => ({ sourceText: time, startTime: time });

test('new lines start with both directions empty', () => {
  assert.equal(format(undefined, 'down'), '');
  assert.equal(format(undefined, 'up'), '');
});

test('forward-only times do not fill an absent reverse direction', () => {
  const line = { departureTimesByDirection: { down: ['06:00', '07:00'] } };
  assert.equal(format(line, 'down'), '06:00\n07:00');
  assert.equal(format(line, 'up'), '');
});

test('explicitly empty reverse times stay empty', () => {
  const line = { departureTimesByDirection: { down: ['06:00'], up: [] } };
  assert.equal(format(line, 'up'), '');
});

test('reverse-only times do not fill the forward direction', () => {
  const line = { departureTimesByDirection: { up: ['08:00'] } };
  assert.equal(format(line, 'down'), '');
  assert.equal(format(line, 'up'), '08:00');
});

test('cleared forward times do not fall back to stale legacy times or rules', () => {
  const line = {
    departureTimes: ['05:00'],
    departureRules: [rule('05:00')],
    departureTimesByDirection: { down: [], up: ['08:00'] },
    departureRulesByDirection: { down: [], up: [] },
  };
  assert.equal(format(line, 'down'), '');
  assert.equal(format(line, 'up'), '08:00');
});

test('a side omitted by save normalization still does not read stale legacy fields', () => {
  const line = {
    departureTimes: ['05:00'],
    departureTimesByDirection: { up: ['08:00'] },
  };
  assert.equal(format(line, 'down'), '');
});

test('different forward and reverse times remain independent', () => {
  const line = { departureTimesByDirection: { down: ['06:00'], up: ['08:00'] } };
  assert.equal(format(line, 'down'), '06:00');
  assert.equal(format(line, 'up'), '08:00');
});

test('directional rules are preserved and never copied to the opposite side', () => {
  const line = {
    departureRulesByDirection: { down: [{ ...rule('06:00'), sourceText: '06:00+30*2' }] },
    departureTimesByDirection: { down: ['06:00', '06:30', '07:00'] },
  };
  assert.equal(format(line, 'down'), '06:00+30*2');
  assert.equal(format(line, 'up'), '');
});

test('directional times override stale undirected rules', () => {
  const line = {
    departureRules: [rule('05:00')],
    departureTimesByDirection: { down: ['06:00'] },
  };
  assert.equal(format(line, 'down'), '06:00');
});

test('empty directional maps do not resurrect a cleared schedule', () => {
  const line = {
    departureTimes: ['05:00'],
    departureTimesByDirection: {},
    departureRulesByDirection: {},
  };
  assert.equal(format(line, 'down'), '');
  assert.equal(format(line, 'up'), '');
});

test('legacy times without directional data remain available in station order only', () => {
  const line = { departureTimes: ['06:00', '07:00'] };
  assert.equal(format(line, 'down'), '06:00\n07:00');
  assert.equal(format(line, 'up'), '');
});

test('legacy rules without directional data retain their source text', () => {
  const line = { departureRules: [rule('06:00'), rule('07:00')] };
  assert.equal(format(line, 'down'), '06:00\n07:00');
  assert.equal(format(line, 'up'), '');
});
