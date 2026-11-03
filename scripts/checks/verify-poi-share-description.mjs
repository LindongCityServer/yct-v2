import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMapShareDescription,
  mapShareDescriptionMaxLength,
} from '../../apps/web/lib/map-share-card.ts';

test('empty descriptions are omitted', () => {
  assert.equal(buildMapShareDescription(undefined), undefined);
  assert.equal(buildMapShareDescription(null), undefined);
  assert.equal(buildMapShareDescription('   \n\t '), undefined);
});

test('whitespace is collapsed into a single line', () => {
  assert.equal(buildMapShareDescription('  第一行\n\n第二行   第三行 '), '第一行 第二行 第三行');
});

test('short descriptions are kept verbatim', () => {
  assert.equal(buildMapShareDescription('临东老城的一家面馆。'), '临东老城的一家面馆。');
});

test('long descriptions are truncated with an ellipsis', () => {
  const text = '临'.repeat(mapShareDescriptionMaxLength + 10);
  const result = buildMapShareDescription(text);
  assert.ok(result);
  assert.equal(Array.from(result).length, mapShareDescriptionMaxLength);
  assert.ok(result.endsWith('…'));
});

test('truncation counts code points instead of UTF-16 units', () => {
  const text = '🧭'.repeat(mapShareDescriptionMaxLength + 5);
  const result = buildMapShareDescription(text);
  assert.ok(result);
  assert.equal(Array.from(result).length, mapShareDescriptionMaxLength);
});
