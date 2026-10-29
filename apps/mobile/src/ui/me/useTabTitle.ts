// Where a tab page's bottom title bar sits, and how much room the page leaves under its last row.
/**
 * M31 T033 (design-pulse2 `tabShell`, index.html §Bars): a tab page ends at the tab bar's top (the tab
 * layout draws the bar below the page), and the now bar floats over the page's foot, 8 above it and 58
 * tall. The title bar sits 8 above the highest bar: `8` with no now bar, `8 + 58 + 10 = 76` with one
 * (the drawing's 100 and 168 less the tab bar's own 92). `titleBarBottom` has the rule; this takes the
 * tab bar's height off, because the page does not include it.
 */
import { bars, titleBarBottom, typeScale } from '@/design';
import { selectIdle, usePlayerSelector } from '@/playback/store';

/** Distance from a tab page's bottom edge to its title bar's bottom. */
export function tabTitleBottom(nowBar: boolean): number {
  return titleBarBottom(0, { tabs: true, now: nowBar }) - bars.tab;
}

/** The title bar's tallest ordinary height: the title (two lines at most) is allowed for by `reserve`. */
const TITLE_ROW = typeScale.hero.lineSafe + bars.titleSub + typeScale.caption.lineSafe;

/** How far from the page's foot the last row must stay clear: the bar's bottom plus its one-line height and a breath. */
export function tabTitleReserve(bottom: number): number {
  return bottom + TITLE_ROW + bars.sheetGap;
}

/** The title bar's `bottom` for the page in front: it clears the now bar while something is loaded. */
export function useTabTitleBottom(): number {
  const idle = usePlayerSelector(selectIdle);
  return tabTitleBottom(!idle);
}
