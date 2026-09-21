import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTick, closeAcc, mergeRanges, unionLength, type ListenAcc } from '../src/intervals.ts';

const ticks = (acc: ListenAcc | undefined, ep: string, positions: number[]) => positions.reduce<ListenAcc | undefined>((a, p) => addTick(a, ep, p), acc) as ListenAcc;

test('A2: ticks 0..10 s then 40, 41 s → two intervals; the 30-s jump is a gap, not listening (G2)', () => {
  const acc = ticks(undefined, 'e1', [0, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000, 40_000, 41_000]);
  assert.deepEqual(closeAcc(acc), [[0, 10_000], [40_000, 41_000]]);
  assert.equal(unionLength([closeAcc(acc)]), 11_000);
});

test('A2: a backwards tick (seek back), a stalled tick and a 5 000 ms tick are handled', () => {
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [10_000, 11_000, 4_000, 5_000])), [[4_000, 5_000], [10_000, 11_000]]);
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [10_000, 10_000, 11_000])), [[10_000, 11_000]]); // stalled: no length lost
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [0, 12_000, 24_001])), [[0, 12_000]]);        // exactly 12 000 extends; 12 001 does not
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [0, 12_000, 24_000])), [[0, 24_000]]);
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [0, 6_000, 12_000])), [[0, 12_000]]);         // 2× with 3-s ticks: 6 s apart, still one interval
  assert.deepEqual(closeAcc(ticks(undefined, 'e', [0, 15_000])), []);                             // a +15 s skip is a gap: two points, no length
});

test('A2: another episode closes the interval and starts a fresh accumulator', () => {
  const acc = ticks(undefined, 'a', [0, 1_000, 2_000]);
  const next = addTick(acc, 'b', 50_000);
  assert.equal(next.episodeId, 'b');
  assert.deepEqual(next.closed, [[0, 2_000]]);
  assert.deepEqual(next.open, [50_000, 50_000]);
});

test('A2: an accumulator with no open interval opens one', () => {
  const acc: ListenAcc = { episodeId: 'e', closed: [[0, 1_000]] };
  assert.deepEqual(addTick(acc, 'e', 7_000).open, [7_000, 7_000]);
  assert.deepEqual(closeAcc(acc), [[0, 1_000]]);
});

test('A2: mergeRanges sorts, joins overlapping and touching ranges, drops empty ones', () => {
  assert.deepEqual(mergeRanges([[10, 20], [0, 5], [5, 8], [19, 25], [30, 30]]), [[0, 8], [10, 25]]);
  assert.deepEqual(mergeRanges([]), []);
});

test('A3: unionLength([[0,60s]], [[30s,90s]]) is 90 s, not 120 s (G3)', () => {
  assert.equal(unionLength([[[0, 60_000]], [[30_000, 90_000]]]), 90_000);
  assert.equal(unionLength([[[0, 60_000]], [[0, 60_000]]]), 60_000); // the same report twice
  assert.equal(unionLength([]), 0);
});
