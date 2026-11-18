import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateExpression, formatNumber } from '../src/calc.mjs';

test('四则运算、括号和优先级', () => {
  assert.equal(evaluateExpression('1+2*3'), '7');
  assert.equal(evaluateExpression('(1+2)*3'), '9');
  assert.equal(evaluateExpression('10/4'), '2.5');
  assert.equal(evaluateExpression('10%3'), '1');
});

test('乘方右结合，支持负指数', () => {
  assert.equal(evaluateExpression('2^3^2'), '512');
  assert.equal(evaluateExpression('2^-2'), '0.25');
  assert.equal(evaluateExpression('-2^2'), '-4');
});

test('常用函数和常量', () => {
  assert.equal(evaluateExpression('sqrt(9)+abs(-1)'), '4');
  assert.equal(evaluateExpression('round(1.6)'), '2');
  assert.equal(evaluateExpression('floor(1.9)'), '1');
  assert.equal(evaluateExpression('ceil(1.1)'), '2');
  assert.equal(formatNumber(Math.PI), '3.1415926536');
});

test('全角数字和符号也能算', () => {
  assert.equal(evaluateExpression('（１＋２）×３'), '9');
  assert.equal(evaluateExpression('１０÷４'), '2.5');
});

test('除零、括号不闭合和未知字符给出可读错误', () => {
  assert.throws(() => evaluateExpression('1/0'), /除数不能是 0/);
  assert.throws(() => evaluateExpression('(1+2'), /括号没有闭合/);
  assert.throws(() => evaluateExpression('1+a'), /不支持的函数/);
  assert.throws(() => evaluateExpression('1+'), /算式不完整/);
});
