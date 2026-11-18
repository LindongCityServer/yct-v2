import { randomInt as cryptoRandomInt } from 'node:crypto';

/** 随机整数，范围包含 min 和 max。 */
export function randomInteger(min, max, random = cryptoRandomInt) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new Error('随机数范围需要是整数。');
  }
  if (min > max) {
    throw new Error('随机数的最小值不能大于最大值。');
  }
  if (max - min > 1_000_000_000) {
    throw new Error('随机数范围太大，最多 10 亿。');
  }
  return random(min, max + 1);
}

/** 掷骰子，例如 2d6、d20、3d8+2。 */
export function rollDice(count, sides, bonus = 0, random = cryptoRandomInt) {
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('骰子数量需要在 1 到 20 之间。');
  }
  if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
    throw new Error('骰子面数需要在 2 到 1000 之间。');
  }
  const rolls = Array.from({ length: count }, () => random(1, sides + 1));
  const sum = rolls.reduce((total, value) => total + value, 0) + bonus;
  return { rolls, sum, bonus };
}

/** 从列表里抽一个。 */
export function pickOne(items, random = cryptoRandomInt) {
  if (items.length === 0) {
    throw new Error('没有可抽取的内容。');
  }
  return items[random(0, items.length)];
}
