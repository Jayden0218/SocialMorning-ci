// Where a tab page's title bar sits (at the top) and how much room the page leaves above and under its content.
/**
 * M31 T033, moved to the top by spec 037 (option B, https://claude.ai/artifact/J7HKbsiAZoDFyypLbY9G9E): a tab page sits inside a
 * `SafeAreaView` that already pads the status bar, so its title bar hangs `titleBarTop(0)` (6) from the page's own top. The scroll
 * content starts under the title block (`contentTop`). A tab page ends at the tab bar's top (the tab layout draws the bar below the
 * page), and the now bar floats over the page's foot while something is loaded: `reserve` is the room that takes (`barsReserve`).
 */
import { barsReserve, contentTopReserve, titleBarTop } from '@/design';
import { selectIdle, usePlayerSelector } from '@/playback/store';

export type TabTitle = {
  /** The title bar's `top`, from the page's own top edge. */
  top: number;
  /** Where the scroll content starts (its top padding): under the title block. */
  contentTop: number;
  /** The room the content leaves at its foot: the now bar when it floats there, and a breath. */
  reserve: number;
};

/** Pure: the tab page's measures with or without the now bar. */
export function tabTitle(nowBar: boolean): TabTitle {
  const top = titleBarTop(0);
  return { top, contentTop: top + contentTopReserve(), reserve: barsReserve({ tabs: true, now: nowBar }) };
}

/** The measures for the page in front: the foot clears the now bar while something is loaded. */
export function useTabTitle(): TabTitle {
  const idle = usePlayerSelector(selectIdle);
  return tabTitle(!idle);
}
