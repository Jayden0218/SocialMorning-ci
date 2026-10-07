// Picks a run of transcript lines (contiguous only) and says whether it can become a clip.
/**
 * M22 US9 (FR-028, FR-029, research R8). Pure. On the full transcript page a long-press starts a
 * selection at that line; each tap then moves the nearer end to the tapped line, so the selection
 * is always one unbroken run: a tap outside grows it, a tap on an end drops that line, a tap
 * inside shrinks it to there. The words, range and limits come from `quoteOf` (./quote).
 */
import { CLIP_MAX_MS, CLIP_MIN_MS } from '@socialmorning/social-core';
import type { Quote } from './quote';

/** `[first, last]` line numbers, inclusive. */
export type LineRange = readonly [number, number];

export function extendRange(range: LineRange | undefined, i: number): LineRange | undefined {
  if (range === undefined) return [i, i];
  const [a, b] = range;
  if (i < a) return [i, b];
  if (i > b) return [a, i];
  if (a === b) return undefined; // the only line, tapped again: nothing is selected
  if (i === a) return [a + 1, b];
  if (i === b) return [a, b - 1];
  return [a, i];
}

/** Every line number in the range, in order. */
export function rangeLines(range: LineRange | undefined): number[] {
  if (range === undefined) return [];
  const out: number[] = [];
  for (let i = range[0]; i <= range[1]; i++) out.push(i);
  return out;
}

/** Can the selection be a clip? When not, the reason shown beside the disabled Clip button. */
export function clipCheck(q: Quote | undefined): { ok: true; startMs: number; endMs: number } | { ok: false; reason: string } {
  if (q === undefined) return { ok: false, reason: 'Pick lines first' };
  if (q.startMs === undefined || q.endMs === undefined) return { ok: false, reason: 'This transcript has no times, so it cannot make a clip' };
  const length = q.endMs - q.startMs;
  if (length > CLIP_MAX_MS) return { ok: false, reason: 'Too long for a clip — a clip is at most 10 minutes' };
  if (length < CLIP_MIN_MS) return { ok: false, reason: 'Too short for a clip — pick another line' };
  return { ok: true, startMs: q.startMs, endMs: q.endMs };
}
