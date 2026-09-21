import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nudge, proposeClip, validateClipRange } from '../src/clip.ts';

test('A1: proposeClip is the last 30 s, clipped to the duration and never shorter than 1 s', () => {
  assert.deepEqual(proposeClip(872_000), { startMs: 842_000, endMs: 872_000 });
  assert.deepEqual(proposeClip(10_000), { startMs: 0, endMs: 10_000 });
  assert.deepEqual(proposeClip(900_000, 880_000), { startMs: 850_000, endMs: 880_000 }); // past the known end
  assert.deepEqual(proposeClip(400), { startMs: 0, endMs: 1_000 });                       // first second
});

test('A1: validateClipRange refuses 0.5 s, 10:01, inverted, negative, past a known end; 30 s ok (G1)', () => {
  assert.deepEqual(validateClipRange({ startMs: 0, endMs: 500 }), { ok: false, reason: 'too_short' });
  assert.deepEqual(validateClipRange({ startMs: 0, endMs: 601_000 }), { ok: false, reason: 'too_long' });
  assert.deepEqual(validateClipRange({ startMs: 10, endMs: 10 }), { ok: false, reason: 'inverted' });
  assert.deepEqual(validateClipRange({ startMs: -1, endMs: 5_000 }), { ok: false, reason: 'negative' });
  assert.deepEqual(validateClipRange({ startMs: 0, endMs: 5_000 }, 4_000), { ok: false, reason: 'past_end' });
  assert.deepEqual(validateClipRange({ startMs: 0, endMs: 5_000 }), { ok: true });          // unknown duration
  assert.deepEqual(validateClipRange({ startMs: 842_000, endMs: 872_000 }, 3_000_000), { ok: true });
  assert.deepEqual(validateClipRange({ startMs: 0, endMs: 600_000 }), { ok: true });       // exactly 10 min
});

test('A1: nudge moves one edge by the delta and refuses moves that would not validate', () => {
  const r = { startMs: 842_000, endMs: 872_000 };
  assert.deepEqual(nudge(r, 'start', -5_000), { startMs: 837_000, endMs: 872_000 });
  assert.deepEqual(nudge(r, 'end', 5_000), { startMs: 842_000, endMs: 877_000 });
  assert.deepEqual(nudge(r, 'end', 5_000, 873_000), r);                       // past the end → unchanged
  assert.deepEqual(nudge({ startMs: 0, endMs: 1_000 }, 'end', -5_000), { startMs: 0, endMs: 1_000 }); // inverted → unchanged
});
