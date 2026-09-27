/**
 * M8 (quickstart A8) — the offline replay.
 *
 * The case worth arguing about is the missing one. An episode the ranker never produced
 * counts as LAST, not as absent: failing to surface something a listener went on to play
 * is a worse result than ranking it low, and dropping it from the average would flatter
 * the score exactly where the recommender is weakest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayScore, REPLAY_TARGET_PERCENTILE } from '../src/replay.ts';

const field = (n: number) => Array.from({ length: n }, (_, i) => `e${i}`);

test('A8: the median position of the held-out episodes, as a fraction', () => {
  const ranked = field(101); // positions 0..100, so the denominator is 100
  assert.equal(replayScore(ranked, ['e0']), 0, 'first');
  assert.equal(replayScore(ranked, ['e100']), 1, 'last');
  assert.equal(replayScore(ranked, ['e50']), 0.5, 'middle');
  assert.equal(replayScore(ranked, ['e10', 'e20', 'e90']), 0.2, 'the MEDIAN, not the mean');
  assert.equal(replayScore(ranked, ['e10', 'e30']), 0.2, 'an even count averages the middle two');
});

test('A8: an episode the ranker never produced counts as last', () => {
  const ranked = field(11);
  assert.equal(replayScore(ranked, ['never-seen']), 1);
  assert.equal(replayScore(ranked, ['e0', 'never-seen']), 0.5, 'and it drags the median with it');
});

test('A8: the boundaries — nothing held out, and a one-item field', () => {
  assert.equal(replayScore(field(10), []), 1, 'nothing held out is not a pass');
  assert.equal(replayScore([], ['x']), 1, 'nothing ranked is not a pass either');
  assert.equal(replayScore(['only'], ['only']), 0, 'a one-item field cannot divide by zero');
});

test('A8: the target is a number the gate log can be checked against', () => {
  assert.equal(REPLAY_TARGET_PERCENTILE, 0.2);
  const ranked = field(201);
  assert.ok(replayScore(ranked, ['e10', 'e20', 'e30']) <= REPLAY_TARGET_PERCENTILE, 'a good run passes');
  assert.ok(replayScore(ranked, ['e150', 'e160']) > REPLAY_TARGET_PERCENTILE, 'a bad one does not');
});
