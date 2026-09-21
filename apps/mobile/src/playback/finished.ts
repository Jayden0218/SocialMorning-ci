/**
 * FR-019 and FR-020, pure. No imports at all, deliberately — these two
 * functions are read back by the store, the reducer and the library screen,
 * and every one of them must agree on what "finished" means.
 */
import { FINISHED_WITHIN_MS } from './types';

/**
 * FR-019. Finished means: playback reached the end, OR the listener stopped
 * within the last 30 seconds. An episode with no declared duration is never
 * finished by position — `<itunes:duration>` is the least trustworthy field
 * in podcast RSS and guessing from it is worse than not knowing.
 */
export function isFinished(
  offsetMs: number,
  durationMs: number | undefined,
  reachedEnd: boolean,
): boolean {
  if (reachedEnd) return true;
  if (durationMs === undefined) return false;
  return durationMs - offsetMs <= FINISHED_WITHIN_MS;
}

/**
 * FR-020. A publisher replaced the file with a shorter one and the stored
 * position now points past the end. Seeking there would fail or snap to zero,
 * so the position is clamped to the new end and judged by the ordinary
 * 30-second rule.
 *
 * WORTH SAYING OUT LOUD: data-model.md words this as "if offsetMs >
 * currentDurationMs, present as finished if offsetMs >= currentDurationMs -
 * 30 000, else clamp". That inner condition is vacuous — anything past the
 * end is also past `end - 30 000` — so an overshoot is ALWAYS finished, and
 * writing the test for the "else" branch would be writing a test that can
 * never run. The rule is therefore expressed once, over the clamped value,
 * where it is live in both directions: a position inside the file is finished
 * only if it is inside the last 30 seconds.
 */
export function reconcileOffset(
  offsetMs: number,
  currentDurationMs: number | undefined,
): { offsetMs: number; finished: boolean } {
  if (currentDurationMs === undefined) {
    // No duration to reconcile against. Do not invent one.
    return { offsetMs, finished: false };
  }
  const finished = isFinished(offsetMs, currentDurationMs, false);
  if (offsetMs > currentDurationMs) {
    return { offsetMs: currentDurationMs, finished };
  }
  return { offsetMs, finished };
}
