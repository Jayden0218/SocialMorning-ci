/**
 * M8 — diversity (research R7). Constants only until Phase 4.
 *
 *   MR(i) = θ · score_i − (1 − θ) · max_{j ∈ S} sim(i, j)
 *
 * Greedy, one pass. DPP is the stronger method and is deliberately not used: at k = 20 it
 * costs a determinant per step and buys nothing measurable. Recorded so the choice reads
 * as a choice rather than an omission.
 *
 * MMR alone does not guarantee the two hard rules, so they run after it.
 */

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
