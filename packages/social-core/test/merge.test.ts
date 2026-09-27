import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePosition } from '../src/merge.ts';
import type { PositionObs } from '../src/types.ts';

const obs = (offsetMs: number, receivedAt: number, extra: Partial<PositionObs> = {}): PositionObs =>
  ({ episodeId: 'e', offsetMs, finished: false, progressSeq: 1, explicitSeek: false, receivedAt, ...extra });

/** Small deterministic PRNG so the property test is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// quickstart A1 — guard G3 (SC-012)
test('A1: merge(a,b) equals merge(b,a) for 1 000 generated non-seek pairs', () => {
  const r = rng(20260921);
  for (let i = 0; i < 1000; i++) {
    const a = obs(Math.floor(r() * 3_000_000), Math.floor(r() * 1e6), { progressSeq: Math.floor(r() * 50), finished: r() < 0.1 });
    const b = obs(Math.floor(r() * 3_000_000), Math.floor(r() * 1e6), { progressSeq: Math.floor(r() * 50), finished: r() < 0.1 });
    const ab = mergePosition(a, b);
    const ba = mergePosition(b, a);
    assert.deepEqual(ab, ba, `pair ${i}: ${JSON.stringify([a, b])}`);
  }
});

// quickstart A2 — guard G4
test('A2: a newer explicit seek back to 05:00 beats a stored 20:00 and clears finished', () => {
  const stored = obs(1_200_000, 100, { finished: true });
  const seek = obs(300_000, 200, { explicitSeek: true, finished: true });
  assert.deepEqual(mergePosition(stored, seek), { ...seek, finished: false });
  // …and the same answer when the seek is the stored side and the stale one arrives later.
  assert.deepEqual(mergePosition({ ...seek, finished: false }, stored), { ...seek, finished: false });
});

// quickstart A3 / US6 #3
test('A3: 16:00 received earlier beats 15:00 received later — progress never goes backwards', () => {
  const later15 = obs(900_000, 500);
  const earlier16 = obs(960_000, 400);
  assert.equal(mergePosition(later15, earlier16), earlier16);
  assert.equal(mergePosition(earlier16, later15), earlier16);
});

test('rule 1, finished is sticky, ties break by progressSeq then receivedAt, and episodes must match', () => {
  const first = obs(1, 1);
  assert.equal(mergePosition(null, first), first);
  const done = obs(2_899_000, 10, { finished: true });
  const replayStart = obs(0, 20);
  assert.deepEqual(mergePosition(done, replayStart), done, 'a non-seek 0 does not un-finish');
  const a = obs(500, 5, { progressSeq: 2 });
  const b = obs(500, 9, { progressSeq: 1 });
  assert.equal(mergePosition(a, b), a);
  assert.equal(mergePosition(b, a), a, 'the higher seq wins from either side');
  const c = obs(500, 9, { progressSeq: 2 });
  assert.equal(mergePosition(a, c), c, 'equal seq → newer receivedAt');
  assert.equal(mergePosition(c, a), c);
  assert.throws(() => mergePosition(obs(1, 1), { ...obs(1, 1), episodeId: 'other' }), RangeError);
});

test('two explicit seeks: the later one wins; a seek that is not newer does not override', () => {
  const s1 = obs(100, 10, { explicitSeek: true });
  const s2 = obs(50, 20, { explicitSeek: true });
  assert.equal(mergePosition(s1, s2), s2);
  assert.equal(mergePosition(s2, s1), s2);
  const stale = obs(50, 5, { explicitSeek: true });
  const progressed = obs(100, 10);
  assert.equal(mergePosition(progressed, stale), progressed);
});

test('branches: a newer seek that is not finished is returned as-is; equal seq and older receivedAt keeps stored', () => {
  const stored = obs(1_000, 100);
  const seek = obs(500, 200, { explicitSeek: true });
  assert.equal(mergePosition(stored, seek), seek, 'no finished flag to clear → the same object');
  const older = obs(500, 50, { progressSeq: 1 });
  const same = obs(500, 60, { progressSeq: 1 });
  assert.equal(mergePosition(same, older), same, 'equal offset and seq, older receivedAt → stored');
});

test('identical observations: the incoming one is returned (idempotent merge)', () => {
  const a = obs(500, 5);
  const b = obs(500, 5);
  assert.equal(mergePosition(a, b), b);
});

test('finished is sticky even when the finished observation is the one with the lower offset', () => {
  const further = obs(2_000_000, 10);
  const finishedEarlier = obs(1_500_000, 20, { finished: true });
  const r = mergePosition(further, finishedEarlier);
  assert.equal(r.offsetMs, 2_000_000);
  assert.equal(r.finished, true);
});
