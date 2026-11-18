import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInteger, rollDice } from '../src/random.mjs';

test('随机整数包含边界并使用注入的随机源', () => {
  assert.equal(
    randomInteger(5, 5, () => 5),
    5,
  );
  assert.equal(
    randomInteger(1, 10, () => 5),
    5,
  );
});

test('掷骰子返回每一颗和总和', () => {
  const result = rollDice(2, 6, 2, () => 4);
  assert.deepEqual(result.rolls, [4, 4]);
  assert.equal(result.sum, 10);
});

test('非法范围直接报错', () => {
  assert.throws(() => randomInteger(10, 1), /最小值不能大于最大值/);
  assert.throws(() => rollDice(0, 6), /骰子数量/);
  assert.throws(() => rollDice(1, 1), /骰子面数/);
});
