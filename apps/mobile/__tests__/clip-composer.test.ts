/** T013: the composer state machine — propose → adjust while listening → validate → caption. */
import { canSave, endHere, nudgeEdge, openComposer, setCaption, startHere } from '../src/graph/composer';

it('opens on the last 30 s, adjusts with Start here / End here and ±5 s nudges, refuses what cannot be a clip', () => {
  let s = openComposer('e', 872_000, 3_000_000);
  expect(s.range).toEqual({ startMs: 842_000, endMs: 872_000 });
  expect(canSave(s)).toBe(true);
  s = startHere(s, 850_000);
  expect(s.range).toEqual({ startMs: 850_000, endMs: 872_000 });
  s = endHere(s, 910_000);
  expect(s.range).toEqual({ startMs: 850_000, endMs: 910_000 });
  s = nudgeEdge(s, 'start', -1);
  expect(s.range.startMs).toBe(845_000);
  s = nudgeEdge(s, 'end', 1);
  expect(s.range.endMs).toBe(915_000);
  s = endHere(s, 840_000); // before the start
  expect(s.problem).toBe('inverted');
  expect(canSave(s)).toBe(false);
  s = endHere(s, 850_500);
  expect(s.problem).toBe('too_short');
  s = endHere(s, 1_500_000); // 10:55
  expect(s.problem).toBe('too_long');
  s = endHere(s, 1_400_000);
  expect(s.problem).toBeUndefined();
  s = nudgeEdge(s, 'end', 1);
  expect(s.range.endMs).toBe(1_405_000);
  s = endHere(s, 2_999_000);
  expect(s.problem).toBe('too_long');
});

it('nudging past the known end leaves the range as it was; the caption is capped at 200', () => {
  let s = openComposer('e', 2_999_000, 3_000_000);
  expect(s.range).toEqual({ startMs: 2_969_000, endMs: 2_999_000 });
  s = nudgeEdge(s, 'end', 1);
  expect(s.range.endMs).toBe(2_999_000);
  s = setCaption(s, 'x'.repeat(250));
  expect(s.caption).toHaveLength(200);
  expect(openComposer('e', 400).range).toEqual({ startMs: 0, endMs: 1_000 });
  expect(openComposer('e', 400).durationMs).toBeUndefined();
});
