// Tests the sleep timer: firing, end of episode, both armed, the fade, and a restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armTimer, fadeVolume, isTimerOff, nativeLoop, restoreTimer, setEndOfEpisode, shouldAdvance,
  SLEEP_OFF, timerFired, timerRemainingMs,
} from '../src/timer.ts';

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
  assert.equal(shouldAdvance(off), true);
  assert.equal(timerFired(off, 1e12), false);
  assert.equal(isTimerOff(off), true);
});

test('M21 FR-002: 90 min exists; minutes and End of episode can both be armed; off clears both', () => {
  const ninety = armTimer(90, 0);
  assert.equal(timerRemainingMs(ninety, 0), 5_400_000);
  const both = armTimer('endOfEpisode', 0, ninety);
  assert.deepEqual(both, { deadline: 5_400_000, minutes: 90, endOfEpisode: true });
  const changed = armTimer(10, 1_000, both);
  assert.deepEqual(changed, { deadline: 601_000, minutes: 10, endOfEpisode: true });
  assert.deepEqual(setEndOfEpisode(changed, false), { deadline: 601_000, minutes: 10, endOfEpisode: false });
  assert.deepEqual(setEndOfEpisode(SLEEP_OFF, true), { endOfEpisode: true });
  assert.equal(isTimerOff(both), false);
  assert.equal(isTimerOff({ deadline: 5, endOfEpisode: false }), false);
  assert.deepEqual(armTimer('off', 0, both), SLEEP_OFF);
});

// Guard G-M21-1. Break: return 1 from fadeVolume — every assertion below the 10 s mark fails.
test('G-M21-1: no fade before the last 10 s, then (remaining/10 s)² down to 0', () => {
  const t = armTimer(5, 0); // deadline 300 000
  assert.equal(fadeVolume(t, 0), undefined);
  assert.equal(fadeVolume(t, 289_999), undefined);
  assert.equal(fadeVolume(t, 290_000), 1);
  assert.equal(fadeVolume(t, 295_000), 0.25);
  assert.equal(fadeVolume(t, 300_000), 0);
  assert.equal(fadeVolume(t, 400_000), 0);
  assert.equal(fadeVolume(armTimer('endOfEpisode', 0), 0), undefined);
  assert.equal(fadeVolume(SLEEP_OFF, 0), undefined);
});

// Guard G-M21-2. Break: keep a past deadline in restoreTimer.
test('G-M21-2: a restart keeps a future deadline and drops a past one; the switch survives', () => {
  assert.deepEqual(restoreTimer({ deadline: 2_000, endOfEpisode: false }, 1_000), { deadline: 2_000, endOfEpisode: false });
  assert.deepEqual(restoreTimer({ deadline: 2_000, minutes: 30 }, 1_000), { deadline: 2_000, minutes: 30, endOfEpisode: false });
  assert.deepEqual(restoreTimer({ deadline: 2_000, minutes: 7 }, 1_000), { deadline: 2_000, endOfEpisode: false });
  assert.deepEqual(restoreTimer({ deadline: 1_000 }, 1_000), { endOfEpisode: false });
  assert.deepEqual(restoreTimer({ deadline: 500, endOfEpisode: true }, 1_000), { endOfEpisode: true });
  assert.deepEqual(restoreTimer({ deadline: Number.NaN }, 1_000), { endOfEpisode: false });
  assert.deepEqual(restoreTimer({}, 1_000), SLEEP_OFF);
});

// Guard G-M21-3. Break: return `loop` from nativeLoop.
test('G-M21-3: End of episode wins over Loop — the native loop is off while the switch is on', () => {
  assert.equal(nativeLoop(armTimer('endOfEpisode', 0), true), false);
  assert.equal(nativeLoop(SLEEP_OFF, true), true);
  assert.equal(nativeLoop(armTimer(5, 0), true), true);
  assert.equal(nativeLoop(SLEEP_OFF, false), false);
});
