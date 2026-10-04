// Holds the Discover page back until its data is in, so it appears whole, not piece by piece.
/**
 * Owner, 2026-10-04: after signing in, the main screen built itself up in front of the listener —
 * the shortcuts first, then Discover's sections, then For You near the top pushing them all down.
 * The page now waits until every first load is over (`ready`), or `FIRST_PAINT_CAP_MS` at most, and
 * then shows everything at once. Once shown it stays shown: a later refresh never brings the
 * loading mark back.
 */
import { useEffect, useState } from 'react';

/** A slow network never keeps the page hidden longer than this; what has arrived is shown. */
export const FIRST_PAINT_CAP_MS = 4000;

/** Pure: show the page once the data is in, or once the cap has passed, and never hide it again. */
export function shouldShow(state: { ready: boolean; waitedMs: number; shownBefore: boolean }): boolean {
  return state.shownBefore || state.ready || state.waitedMs >= FIRST_PAINT_CAP_MS;
}

export function useFirstPaint(ready: boolean): boolean {
  const [shown, setShown] = useState(ready);
  const [capped, setCapped] = useState(false);
  useEffect(() => {
    if (shown) return;
    const t = setTimeout(() => setCapped(true), FIRST_PAINT_CAP_MS);
    return () => clearTimeout(t);
  }, [shown]);
  const next = shouldShow({ ready, waitedMs: capped ? FIRST_PAINT_CAP_MS : 0, shownBefore: shown });
  useEffect(() => { if (next && !shown) setShown(true); }, [next, shown]);
  return next;
}
