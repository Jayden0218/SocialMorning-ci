/**
 * M16a bug 5 (FR-007): the mini player must never be drawn below the tab bar.
 *
 * Phone walk 2026-10-02: after an edge-swipe back to Discover the root mini player showed
 * under the tab bar for a frame. Cause: the root bar (app/_layout.tsx, under the stack) hides
 * when the pathname is a tab route, and the pathname only changes when JS hears the pop. An
 * edge swipe is finished by iOS first — the tab screen, with its tab bar, is fully on screen
 * while JS still has the old route — so for that moment the root bar sat below the tab bar.
 *
 * Fix: the stack's own transition events. iOS calls `viewWillDisappear` on the page the
 * moment a back-swipe starts (native-stack emits `transitionStart` with `closing: true`); if
 * the page below is the tab group, the root bar stands down right then, before the pop. A
 * cancelled swipe (`gestureCancel`, or the page appearing again) brings it back.
 */

/** The route key of a page being swiped (or popped) back onto the tab group, if any. */
export type LeavingToTabs = string | undefined;

export type StackEvent =
  | { type: 'transitionStart'; key: string; closing: boolean; below: string | undefined; name: string }
  | { type: 'gestureCancel'; key: string };

export const TABS_ROUTE = '(tabs)';

export function leavingToTabs(state: LeavingToTabs, e: StackEvent): LeavingToTabs {
  if (e.type === 'gestureCancel') return state === e.key ? undefined : state;
  if (e.closing) return e.below === TABS_ROUTE ? e.key : state;
  // The tab group itself appears under a swipe — that is not a reason to bring the bar back.
  if (e.name === TABS_ROUTE) return state;
  // Any other page appearing (a cancelled swipe, or a new push) gets the bar back.
  return undefined;
}

/** The root bar draws only when no page is on its way back to the tabs. */
export function rootBarHidden(state: LeavingToTabs): boolean {
  return state !== undefined;
}
