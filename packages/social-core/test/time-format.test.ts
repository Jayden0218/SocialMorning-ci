import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmss } from '../src/index.ts';

test('mmss: minutes and seconds, hours once past one, never negative', () => {
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(5_999), '0:05');
  assert.equal(mmss(872_000), '14:32');
  assert.equal(mmss(3_600_000), '1:00:00');
  assert.equal(mmss(3_725_000), '1:02:05');
  assert.equal(mmss(-5_000), '0:00');
});
