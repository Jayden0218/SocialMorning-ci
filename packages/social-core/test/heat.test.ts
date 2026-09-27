import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, normaliseHeat } from '../src/heat.ts';

const D = 2_899_000;

// quickstart A4 — guard G1
test('A4: at the end, past the end, and at the start → 99, 99, 0', () => {
  assert.equal(bucketOf(D, D), 99);
  assert.equal(bucketOf(D + 1, D), 99);
  assert.equal(bucketOf(0, D), 0);
  assert.equal(bucketOf(872_000, D), 30);
  assert.equal(bucketOf(-1, D), 0);
  assert.throws(() => bucketOf(1, 0), RangeError);
});

// quickstart A5 — guard G2
test('A5: all zeros normalise to all zeros, never NaN', () => {
  const out = normaliseHeat(new Array(100).fill(0));
  assert.equal(out.length, 100);
  assert.ok(out.every((v) => v === 0));
  assert.ok(out.every((v) => !Number.isNaN(v)));
});

test('a single peak reads 1 and the rest scale against it', () => {
  const counts = new Array(100).fill(0);
  counts[30] = 4; counts[31] = 2;
  const out = normaliseHeat(counts);
  assert.equal(out[30], 1);
  assert.equal(out[31], 0.5);
  assert.throws(() => normaliseHeat([1, 2, 3]), RangeError);
});

// quickstart A6
test('A6: a 12-minute and a 3-hour episode with one mark at the midpoint draw identically', () => {
  const mark = (durationMs: number) => {
    const counts = new Array(100).fill(0);
    counts[bucketOf(durationMs / 2, durationMs)] = 1;
    return normaliseHeat(counts);
  };
  assert.deepEqual(mark(12 * 60_000), mark(3 * 3_600_000));
  assert.equal(mark(12 * 60_000).indexOf(1), 50);
});
