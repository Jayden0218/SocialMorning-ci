import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armTimer, shouldAdvance, timerFired, timerRemainingMs } from '../src/timer.ts';

// quickstart A3 — guard G3
test('A3: endOfEpisode does not advance; a minutes timer does; it fires at its deadline exactly', () => {
  const eoe = armTimer('endOfEpisode', 0);
  assert.equal(shouldAdvance(eoe), false);
  assert.equal(timerRemainingMs(eoe, 0), undefined);
  assert.equal(timerFired(eoe, 1e12), false);

  const five = armTimer(5, 1_000);
  assert.equal(shouldAdvance(five), true);
  assert.equal(timerRemainingMs(five, 1_000), 300_000);
  assert.equal(timerRemainingMs(five, 301_000), 0);
  assert.equal(timerFired(five, 300_999), false);
  assert.equal(timerFired(five, 301_000), true);

  const off = armTimer('off', 0);
  assert.deepEqual(off, { kind: 'off' });
  assert.equal(shouldAdvance(off), true);
  assert.equal(timerFired(off, 1e12), false);
});
