// What pages tell the now bar: they are on Moments, they scrolled down, or a sheet is open.
/**
 * M31 T024 (design-pulse2 index.html §Bars, "Every state"): the now bar is `hidden` on the Moments
 * feed, with the keyboard up, on the player and under a sheet, and shrinks to a circle while a list
 * scrolls down. The bar lives at the root and in the tab layout, far from the pages that know — so a page
 * says it here and the bar listens:
 *
 *     useNowBarSignal('moments', onMoments)         // Home, while the Moments view shows
 *     useNowBarSignal('sheet', open)                // a page with a sheet that covers the bar
 *     const { shrunk, onScroll } = useNowBarShrink(); useNowBarSignal('shrunk', shrunk)
 *
 * A signal is cleared when the page that set it goes away. Several pages may set the same one: it
 * is on while any of them says so (a count, not a flag).
 */
import { useEffect, useSyncExternalStore } from 'react';

export type NowBarSignal = 'moments' | 'shrunk' | 'sheet';
export type NowBarSignals = { moments: boolean; shrunk: boolean; sheet: boolean };

const counts: Record<NowBarSignal, number> = { moments: 0, shrunk: 0, sheet: 0 };
let snapshot: NowBarSignals = { moments: false, shrunk: false, sheet: false };
const listeners = new Set<() => void>();

function publish(): void {
  const next: NowBarSignals = { moments: counts.moments > 0, shrunk: counts.shrunk > 0, sheet: counts.sheet > 0 };
  if (next.moments === snapshot.moments && next.shrunk === snapshot.shrunk && next.sheet === snapshot.sheet) return;
  snapshot = next;
  for (const l of listeners) l();
}

/** Turn a signal on or off for one page. Returns the function that undoes it. */
export function raiseNowBarSignal(signal: NowBarSignal): () => void {
  counts[signal] += 1;
  publish();
  let done = false;
  return () => { if (done) return; done = true; counts[signal] -= 1; publish(); };
}

/** For a page: `on` true raises the signal for as long as it stays true and the page is mounted. */
export function useNowBarSignal(signal: NowBarSignal, on: boolean): void {
  useEffect(() => (on ? raiseNowBarSignal(signal) : undefined), [signal, on]);
}

/** For the bar. */
export function useNowBarSignals(): NowBarSignals {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => snapshot, () => snapshot);
}

/** Test hook. */
export function resetNowBarSignals(): void {
  counts.moments = 0; counts.shrunk = 0; counts.sheet = 0;
  publish();
}
