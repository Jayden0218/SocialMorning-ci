// Where a tab page's title bar sits (at the top) and how much room the page leaves above and under its content.
/**
 * M31 T033, moved to the top by spec 037 (option B, https://claude.ai/artifact/J7HKbsiAZoDFyypLbY9G9E): a tab page sits inside a
 * `SafeAreaView` that pads the status bar as PADDING. The scroll content is a flow child, so that padding already moves it (`contentTop` is
 * measured from inside it); the title bar is ABSOLUTE, and an absolute `top` is measured from the padding box's edge, so it adds the status
 * bar's height itself (`safeTop`) — without it "New chat" was drawn over the battery icon (run 41789693433, r12-chat). A tab page ends at the tab bar's top (the tab layout draws the bar below the
 * page), and the now bar floats over the page's foot while something is loaded: `reserve` is the room that takes (`barsReserve`).
 */
import { useContext } from 'react';
import { initialWindowMetrics, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { barsReserve, contentTopReserve, titleBarTop } from '@/design';
import { selectIdle, usePlayerSelector } from '@/playback/store';

export type TabTitle = {
  /** The title bar's `top`: the status bar (`safeTop`) plus the gap, from the page's own top edge. */
  top: number;
  /** The `top` for a title bar drawn inside a pane that the page's padding already moved below the status bar (the Updates list pane): no inset. */
  innerTop: number;
  /** Where the scroll content starts (its top padding): under the title block. */
  contentTop: number;
  /** The room the content leaves at its foot: the now bar when it floats there, and a breath. */
  reserve: number;
};

/** Pure: the tab page's measures with or without the now bar. */
export function tabTitle(nowBar: boolean, safeTop = 0): TabTitle {
  return { top: titleBarTop(safeTop), innerTop: titleBarTop(0), contentTop: titleBarTop(0) + contentTopReserve(), reserve: barsReserve({ tabs: true, now: nowBar }) };
}

/** The measures for the page in front: the foot clears the now bar while something is loaded. */
export function useTabTitle(): TabTitle {
  const idle = usePlayerSelector(selectIdle);
  // The same source as the page's SafeAreaView (src/ui/lib/safe-area-view): the context, else the window's own metrics.
  const safeTop = (useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets)?.top ?? 0;
  return tabTitle(!idle, safeTop);
}
