/**
 * M16a guard G-B5 (FR-007). Phone walk 2026-10-02: after an edge-swipe back to Discover the root
 * mini player drew below the tab bar for a frame. iOS finishes the swipe before JS hears the pop,
 * so the root bar — hidden only by pathname — was still up while the tab bar was on screen.
 * The root layout now hides it as the swipe STARTS (native-stack `transitionStart`, closing),
 * when the page below is the tab group, and brings it back if the swipe is cancelled.
 *
 * The break that turns it red: revert the fix — drop `screenListeners` / `rootBarHidden(leaving)`
 * from app/_layout.tsx, or make `leavingToTabs` ignore `closing`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABS_ROUTE, leavingToTabs, rootBarHidden, type LeavingToTabs } from '@/ui/mini-player-swipe';

const start = (key: string, name: string, closing: boolean, below: string | undefined) =>
  ({ type: 'transitionStart', key, name, closing, below }) as const;

it('a swipe back from a page onto the tabs hides the root bar as it starts', () => {
  let s: LeavingToTabs = undefined;
  s = leavingToTabs(s, start('ep-1', 'episode/[id]', true, TABS_ROUTE));
  // iOS also tells the tab group it is appearing; that must not bring the bar back.
  s = leavingToTabs(s, start('tabs', TABS_ROUTE, false, undefined));
  expect(rootBarHidden(s)).toBe(true);
});

it('a cancelled swipe brings it back (gestureCancel, or the page appearing again)', () => {
  const s = leavingToTabs(undefined, start('ep-1', 'episode/[id]', true, TABS_ROUTE));
  expect(rootBarHidden(leavingToTabs(s, { type: 'gestureCancel', key: 'ep-1' }))).toBe(false);
  expect(rootBarHidden(leavingToTabs(s, start('ep-1', 'episode/[id]', false, TABS_ROUTE)))).toBe(false);
});

it('going back from one page to another page keeps the bar; a new page shows it', () => {
  expect(rootBarHidden(leavingToTabs(undefined, start('ep-2', 'episode/[id]', true, 'show/[feedUrl]')))).toBe(false);
  const after = leavingToTabs(undefined, start('ep-1', 'episode/[id]', true, TABS_ROUTE));
  expect(rootBarHidden(leavingToTabs(after, start('ep-3', 'episode/[id]', false, TABS_ROUTE)))).toBe(false);
});

it('the root layout wires the stack\'s transition events to the bar', () => {
  const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
  expect(layout).toMatch(/screenListeners=/);
  expect(layout).toMatch(/transitionStart:/);
  expect(layout).toMatch(/gestureCancel:/);
  expect(layout).toMatch(/rootBarHidden\(leaving\) \? null : <MiniPlayer \/>/);
});
