/**
 * M8 — the honest measurement (research R9).
 *
 * A/B testing is impossible with one listener, and pretending otherwise would be the
 * worst outcome of this milestone. The substitute: hide a listener's recent listens, drop
 * them into a field of random episodes, and ask the ranker to order the lot.
 *
 * **This is weak evidence and anything written from it must say so.** It rewards
 * predicting what someone already chose, which is not the same as helping them find
 * something new — the thing the product actually exists to do. It cannot see a
 * recommendation that would have been good and was never taken.
 *
 * What it *can* do is catch a change to the ordering that makes things obviously worse,
 * which is more than opinion offers.
 */

/** Required median percentile of held-out listens in the field. Lower is better. SC-009. */
export const REPLAY_TARGET_PERCENTILE = 0.2;

/** Size of the random field the held-out episodes are ranked within. */
export const REPLAY_FIELD = 200;

/**
 * The MEDIAN position of the held-out episodes within `ranked`, as a fraction 0–1.
 *
 * 0 means every held-out episode was ranked first; 1 means last. A held-out episode the
 * ranker never produced counts as **last**, not as absent — failing to surface something
 * is a worse result than ranking it low, and quietly dropping it would flatter the score.
 */
export function replayScore(ranked: readonly string[], heldOut: readonly string[]): number {
  if (heldOut.length === 0) return 1;
  // Producing no list at all is the WORST result, not a perfect one. Written without this
  // line the empty case scored 0 — the arithmetic divided nothing by one and called it
  // first place. Caught by A8's boundary case, not by reading the code.
  if (ranked.length === 0) return 1;
  const position = new Map(ranked.map((id, i) => [id, i]));
  const last = Math.max(ranked.length - 1, 0);
  const denominator = last === 0 ? 1 : last;
  const fractions = heldOut
    .map((id) => position.get(id) ?? last)
    .map((p) => p / denominator)
    .sort((a, b) => a - b);
  const mid = Math.floor(fractions.length / 2);
  return fractions.length % 2 === 1 ? fractions[mid]! : (fractions[mid - 1]! + fractions[mid]!) / 2;
}
