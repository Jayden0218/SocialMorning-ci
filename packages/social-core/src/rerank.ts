/**
 * M8 — diversity (research R7).
 *
 *   MR(i) = θ · score_i − (1 − θ) · max_{j ∈ S} sim(i, j)
 *
 * Greedy, one pass. DPP (06_Rerank_04) is the stronger method and is deliberately not
 * used: at k = 20 it costs a determinant per step and buys nothing measurable. Recorded
 * so the choice reads as a choice rather than an omission.
 *
 * MMR does not GUARANTEE the two hard rules — it only makes them likely — so they run as
 * filters during selection. When no remaining candidate can satisfy them the list ends
 * short rather than breaking them: FR-014 says MUST, and a shorter honest list is better
 * than five episodes of one show.
 */
import type { RecCandidate } from './rank.ts';
import type { Neighbour } from './swing.ts';

export const MMR_THETA = 0.7;
export const LIST_SIZE = 20;

/** No two episodes of one show inside the first ten (FR-014). */
export const MAX_PER_SHOW_TOP10 = 1;
export const TOP10 = 10;

/** No more than three of one category inside the first twenty (FR-014). */
export const MAX_PER_GENRE_TOP20 = 3;

/** Rerank-time similarity when two candidates share a show / a category. */
export const SIM_SAME_SHOW = 1.0;
export const SIM_SAME_GENRE = 0.4;

export type Scored = { candidate: RecCandidate; score: number };

/** Similarity for the rerank only. Not the same thing as Swing's similarity. */
export function pairSimilarity(
  a: RecCandidate,
  b: RecCandidate,
  neighbours: ReadonlyMap<string, readonly Neighbour[]>,
): number {
  if (a.feedUrl === b.feedUrl) return SIM_SAME_SHOW;
  if (a.genreId !== null && a.genreId === b.genreId) return SIM_SAME_GENRE;
  for (const n of neighbours.get(a.feedUrl) ?? []) if (n.show === b.feedUrl) return n.sim;
  return 0;
}

/**
 * Would adding `c` break a cap, given how much repetition is currently allowed?
 *
 * `allowance` starts at 0 — the strict rule — and only rises when the list would
 * otherwise end short (FR-014 as amended 2026-09-26). It took L2 failing on the phone to
 * see why that matters: a listener with three subscribed shows and no chart filler got a
 * list of **three**, because every remaining candidate repeated a show already chosen and
 * the rule was honoured to the letter. Diversity is a preference over a full list, not
 * over an empty one.
 */
function breaksRule(c: RecCandidate, chosen: readonly Scored[], allowance: number): boolean {
  const at = chosen.length;
  if (at < TOP10) {
    let sameShow = 0;
    for (const s of chosen) if (s.candidate.feedUrl === c.feedUrl) sameShow++;
    if (sameShow >= MAX_PER_SHOW_TOP10 + allowance) return true;
  }
  // The category cap applies to the whole list, which is LIST_SIZE long by default.
  if (c.genreId !== null) {
    let sameGenre = 0;
    for (const s of chosen) if (s.candidate.genreId === c.genreId) sameGenre++;
    if (sameGenre >= MAX_PER_GENRE_TOP20 + allowance) return true;
  }
  return false;
}

/**
 * Greedy MMR with the hard rules applied, and the hand-picked episode forced to index 0
 * (FR-015 — the slides' 强插). `scored` is not mutated.
 */
export function rerank(
  scored: readonly Scored[],
  neighbours: ReadonlyMap<string, readonly Neighbour[]>,
  opts: { theta?: number; size?: number } = {},
): readonly Scored[] {
  const theta = opts.theta ?? MMR_THETA;
  const size = opts.size ?? LIST_SIZE;

  const rest = [...scored].sort((a, b) => b.score - a.score);
  const chosen: Scored[] = [];

  // The pick goes first, whatever it scored. There is at most one in practice; the
  // highest-scoring one wins if a day ever carries several.
  const pickAt = rest.findIndex((s) => s.candidate.channel === 'pick');
  if (pickAt >= 0) chosen.push(...rest.splice(pickAt, 1));

  // `allowance` rises only when a whole pass found nothing admissible, so the strict rule
  // is always tried first and every unrepresented show is used before any show repeats.
  let allowance = 0;
  while (chosen.length < size && rest.length > 0) {
    let bestIdx = -1;
    let bestMr = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i]!;
      if (breaksRule(c.candidate, chosen, allowance)) continue;
      let worst = 0;
      for (const s of chosen) {
        const sim = pairSimilarity(c.candidate, s.candidate, neighbours);
        if (sim > worst) worst = sim;
      }
      const mr = theta * c.score - (1 - theta) * worst;
      if (mr > bestMr) { bestMr = mr; bestIdx = i; }
    }
    if (bestIdx < 0) {
      // Nothing admissible at this allowance. Relax by one and try the same pool again;
      // when even an unlimited allowance finds nothing, the pool really is exhausted.
      if (allowance >= size) break;
      allowance++;
      continue;
    }
    chosen.push(...rest.splice(bestIdx, 1));
  }
  return chosen;
}
