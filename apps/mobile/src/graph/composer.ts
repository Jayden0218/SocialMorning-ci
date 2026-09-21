/**
 * The clip composer's state (M4 US1, clarified 2026-09-21: two buttons while listening).
 * Pure: the screen feeds it the player's position; it owns the range and the caption.
 *   open(position, duration)      → proposeClip: the last 30 s
 *   startHere / endHere(position) → the current moment becomes that edge (validated)
 *   nudge(edge, ±5 s)             → moved when it still validates, else unchanged
 *   setCaption                    → ≤ 200 characters
 * SC-002's tap count: Clip → (proposal) → caption → Save → Share = 5.
 */
import { CLIP_NUDGE_MS, nudge, proposeClip, validateClipRange, type ClipRange, type ClipReason } from '@socialmorning/social-core';

export type ComposerState = {
  episodeId: string;
  durationMs?: number;
  range: ClipRange;
  caption: string;
  /** Why the current range cannot be saved, if it cannot. */
  problem?: ClipReason;
};

const check = (s: ComposerState): ComposerState => {
  const c = validateClipRange(s.range, s.durationMs);
  const { problem: _drop, ...rest } = s;
  return c.ok ? rest : { ...rest, problem: c.reason };
};

export function openComposer(episodeId: string, positionMs: number, durationMs?: number): ComposerState {
  return check({ episodeId, ...(durationMs !== undefined ? { durationMs } : {}), range: proposeClip(positionMs, durationMs), caption: '' });
}

export function startHere(s: ComposerState, positionMs: number): ComposerState {
  return check({ ...s, range: { startMs: positionMs, endMs: s.range.endMs } });
}

export function endHere(s: ComposerState, positionMs: number): ComposerState {
  return check({ ...s, range: { startMs: s.range.startMs, endMs: positionMs } });
}

export function nudgeEdge(s: ComposerState, edge: 'start' | 'end', direction: -1 | 1): ComposerState {
  return check({ ...s, range: nudge(s.range, edge, direction * CLIP_NUDGE_MS, s.durationMs) });
}

export function setCaption(s: ComposerState, caption: string): ComposerState {
  return { ...s, caption: caption.slice(0, 200) };
}

export const canSave = (s: ComposerState): boolean => s.problem === undefined;

export const problemText: Record<ClipReason, string> = {
  too_short: 'A clip is at least 1 second.',
  too_long: 'A clip is at most 10 minutes.',
  inverted: 'The end must come after the start.',
  negative: 'The start cannot be before the beginning.',
  past_end: 'The end is past the end of the episode.',
};
