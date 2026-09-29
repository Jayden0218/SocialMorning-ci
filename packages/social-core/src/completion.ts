/**
 * M11 — did a listener finish an episode? (specs/011-m11-studio/research.md R3.)
 *
 * Complete = the UNION of everything they listened to, across every day and device, covers
 * at least 90 % of the episode — or the player marked it finished. A union, not the longest
 * single stretch (guard G-C1): a listener who hears the first half on Monday and the second
 * on Tuesday finished it. Unknown length → unknown (null), never "not complete".
 */
import { unionLength, type Range } from './intervals';

export const COMPLETE_SHARE = 0.9;

export function isComplete(ranges: readonly (readonly Range[])[], durationMs: number | null, finished: boolean): boolean | null {
  if (finished) return true;
  if (durationMs === null || durationMs <= 0) return null;
  return unionLength(ranges) >= COMPLETE_SHARE * durationMs;
}

/** Share of listeners whose completion is known that completed; null when none is known. */
export function completionRate(results: readonly (boolean | null)[]): number | null {
  const known = results.filter((r): r is boolean => r !== null);
  if (known.length === 0) return null;
  return known.filter(Boolean).length / known.length;
}
