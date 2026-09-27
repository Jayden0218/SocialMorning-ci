import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the package loads', async () => {
  assert.equal(typeof (await import('../src/index.ts')), 'object');
});
