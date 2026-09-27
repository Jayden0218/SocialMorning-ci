import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureMoment } from '../src/moment.ts';
import type { PlaybackSnapshot } from '../src/types.ts';

/**
 * A tiny model of the composer: opens at a snapshot, then the player keeps
 * ticking. Quickstart A7 / guard G5: the captured moment must not move.
 */
function composer(open: PlaybackSnapshot) {
  const moment = captureMoment(open);
  let latest = open;
  return {
    tick(s: PlaybackSnapshot) { latest = s; },
    // The tempting bug: `return captureMoment(latest)` here. G5 watches for it.
    submit() { void latest; return moment; },
  };
}

test('A7: the moment is taken once on open and does not drift while typing', () => {
  const c = composer({ episodeId: 'e', offsetMs: 872_000, durationMs: 2_899_000 });
  for (let t = 1; t <= 40; t++) c.tick({ episodeId: 'e', offsetMs: 872_000 + t * 1000, durationMs: 2_899_000 });
  assert.deepEqual(c.submit(), { offsetMs: 872_000 });
});

test('a negative or fractional position is clamped to a whole millisecond ≥ 0', () => {
  assert.deepEqual(captureMoment({ episodeId: 'e', offsetMs: -5 }), { offsetMs: 0 });
  assert.deepEqual(captureMoment({ episodeId: 'e', offsetMs: 1234.9 }), { offsetMs: 1234 });
});
