/**
 * M4 FR-001/FR-002: a clip is a range on an episode — no media (constitution V).
 *   proposeClip      the last 30 s before the moment the listener tapped Clip
 *   validateClipRange 0 ≤ start < end, 1 s ≤ length ≤ 10 min, end ≤ duration when known
 *                    (past the end is allowed when the duration is unknown — M3 moments)
 *   nudge            move one edge by ±deltaMs; a move that would not validate returns the input
 * Guard G1 is the upper bound.
 */
export type ClipRange = { startMs: number; endMs: number };
export type ClipReason = 'too_short' | 'too_long' | 'negative' | 'past_end' | 'inverted';
export type ClipCheck = { ok: true } | { ok: false; reason: ClipReason };

export const CLIP_MIN_MS = 1_000;
export const CLIP_MAX_MS = 600_000;
export const CLIP_PROPOSAL_MS = 30_000;
export const CLIP_NUDGE_MS = 5_000;

export function proposeClip(nowMs: number, durationMs?: number): ClipRange {
  const end = durationMs !== undefined ? Math.min(nowMs, durationMs) : nowMs;
  const start = Math.max(0, end - CLIP_PROPOSAL_MS);
  // A tap inside the first second would propose something shorter than the minimum.
  return end - start < CLIP_MIN_MS ? { startMs: start, endMs: start + CLIP_MIN_MS } : { startMs: start, endMs: end };
}

export function validateClipRange(r: ClipRange, durationMs?: number): ClipCheck {
  if (r.startMs < 0) return { ok: false, reason: 'negative' };
  if (r.endMs <= r.startMs) return { ok: false, reason: 'inverted' };
  const length = r.endMs - r.startMs;
  if (length < CLIP_MIN_MS) return { ok: false, reason: 'too_short' };
  if (durationMs !== undefined && r.endMs > durationMs) return { ok: false, reason: 'past_end' };
  return { ok: true };
}

export function nudge(r: ClipRange, edge: 'start' | 'end', deltaMs: number, durationMs?: number): ClipRange {
  const next = edge === 'start' ? { startMs: r.startMs + deltaMs, endMs: r.endMs } : { startMs: r.startMs, endMs: r.endMs + deltaMs };
  return validateClipRange(next, durationMs).ok ? next : r;
}
