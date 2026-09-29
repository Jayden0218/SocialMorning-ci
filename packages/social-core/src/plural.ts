/**
 * M12 FR-007 (B7): one rule for counted nouns, so the app never says "1 episodes" or
 * "Share your 1 subscriptions" again. The 2026-09-29 comparison found 4 such strings and
 * 11 hand-written `n === 1 ? '' : 's'` copies.
 */

/** The noun alone: "episode" for 1, "episodes" otherwise. `other` defaults to one + "s". */
export function noun(n: number, one: string, other: string = `${one}s`): string {
  return n === 1 ? one : other;
}

/** The count and the noun: "1 episode", "0 episodes", "2 replies" (with `other`). */
export function plural(n: number, one: string, other?: string): string {
  return `${n} ${noun(n, one, other)}`;
}
