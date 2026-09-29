/**
 * Guard G-C1 (M11): completion is the UNION of ranges across days and devices. The break that
 * turns it red: in `src/completion.ts`, replace `unionLength(ranges)` with the longest single
 * range (`Math.max(...ranges.flat().map((r) => r[1] - r[0]))`) — the two-day listener fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionRate, isComplete, COMPLETE_SHARE } from '../src/completion';

const H = 3_600_000;

test('G-C1: halves heard on two days are one complete listen', () => {
  assert.equal(isComplete([[[0, 0.5 * H]], [[0.5 * H, H]]], H, false), true);
});

test('overlapping ranges are not double-counted', () => {
  assert.equal(isComplete([[[0, 0.6 * H]], [[0, 0.6 * H]]], H, false), false);
});

test('the 90 % line is inclusive', () => {
  assert.equal(COMPLETE_SHARE, 0.9);
  assert.equal(isComplete([[[0, 0.9 * H]]], H, false), true);
  assert.equal(isComplete([[[0, 0.9 * H - 1]]], H, false), false);
});

test('finished wins even with no ranges or no length', () => {
  assert.equal(isComplete([], null, true), true);
});

test('unknown or nonsense length is unknown, not incomplete', () => {
  assert.equal(isComplete([[[0, H]]], null, false), null);
  assert.equal(isComplete([[[0, H]]], 0, false), null);
});

test('completionRate ignores unknowns and is null when nothing is known', () => {
  assert.equal(completionRate([true, false, null, true]), 2 / 3);
  assert.equal(completionRate([null, null]), null);
  assert.equal(completionRate([]), null);
});
