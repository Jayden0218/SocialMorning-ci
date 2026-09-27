import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockoutUntil, LOCKOUT_MAX_MS } from '../src/lockout.ts';

const NOW = 1_700_000_000_000;

// quickstart A8
test('four failures: no lock', () => {
  assert.equal(lockoutUntil(4, NOW), null);
  assert.equal(lockoutUntil(0, NOW), null);
});

test('fifth failure: 1 s; sixth: 2 s', () => {
  assert.equal(lockoutUntil(5, NOW), NOW + 1_000);
  assert.equal(lockoutUntil(6, NOW), NOW + 2_000);
});

test('fifteenth failure: capped at 15 min', () => {
  assert.equal(lockoutUntil(15, NOW), NOW + LOCKOUT_MAX_MS);
  assert.equal(lockoutUntil(40, NOW), NOW + LOCKOUT_MAX_MS);
});
