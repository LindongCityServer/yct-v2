import assert from 'node:assert/strict';
import test from 'node:test';
import { maskOpenId } from '../src/log.mjs';

test('日志里的 openid 只保留前后几位', () => {
  assert.equal(maskOpenId('group-1'), 'grou…-1');
  assert.equal(maskOpenId('abcdefg'), 'abcd…fg');
  assert.equal(maskOpenId('abcdef'), 'a***');
  assert.equal(maskOpenId('abc'), 'a***');
  assert.equal(maskOpenId(''), '（未知）');
  assert.equal(maskOpenId(undefined), '（未知）');
});
