/**
 * M8 — why an episode is in the list (FR-026). Constants only until Phase 7.
 *
 * A reason is how a listener decides whether to trust the list, how a screen-reader user
 * gets the same information, and the only way the device gate can be checked by a human
 * at all — a plausible-looking list of episodes proves nothing.
 *
 * A reason NEVER names another listener (FR-024). It may state a count.
 */

export const REASON_MAX = 60;
