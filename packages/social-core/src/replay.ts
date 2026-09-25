/**
 * M8 — the honest measurement (research R9). Constants only until Phase 8.
 *
 * A/B testing is impossible with one listener, and pretending otherwise would be the
 * worst outcome of this milestone. The substitute: hide a listener's recent listens,
 * drop them into a field of random episodes, and ask the ranker to order it.
 *
 * This is WEAK evidence. It rewards predicting what someone already chose, which is not
 * the same as helping them find something new. Anything written from it must say so.
 */

/** Required median percentile of held-out listens in the field. Lower is better. SC-009. */
export const REPLAY_TARGET_PERCENTILE = 0.2;

/** Size of the random field the held-out episodes are ranked within. */
export const REPLAY_FIELD = 200;
