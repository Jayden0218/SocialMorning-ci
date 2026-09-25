/**
 * M8 — Swing show-to-show similarity (research R3).
 *
 * Constants only until Phase 4. Two things about this file are worth knowing before
 * anyone changes a number in it:
 *
 *  1. It is between SHOWS, never episodes. An episode is born with no interactions, and
 *     ItemCF cannot serve an item with no interactions (07_ColdStart_02). A show stays
 *     warm for years, so a similar show is expanded into its newest unheard episode.
 *
 *  2. It is Swing, not cosine ItemCF, because Swing's entire purpose is to discount a
 *     小圈子 — and this app's user base *is* one small circle. Cosine here would mostly
 *     measure "the owner subscribed to both".
 *
 *      sim(i1,i2) = Σ_{u1∈V} Σ_{u2∈V} 1 / (α + |J_u1 ∩ J_u2|),  V = likers of both
 */

/** Damping in the denominator. Higher ⇒ a small circle counts for less. */
export const SWING_ALPHA = 5;

/** Fewer likers than this and a show is similar to nothing (FR-018, guard G-R2). */
export const MIN_LIKERS = 3;

/** Neighbours kept per show. */
export const MAX_NEIGHBOURS = 50;

/** Below this many candidates the showcf channel contributes NOTHING, not noise (FR-018). */
export const MIN_USEFUL_CANDIDATES = 5;

/** One listener's liked shows. `like` = subscribed, or ≥ LIKE_FINISHED episodes finished. */
export type Liker = { listenerId: string; shows: readonly string[] };

/** Finished episodes of a show that count as a "like" without a subscription. */
export const LIKE_FINISHED = 3;

export type Neighbour = { show: string; sim: number };
