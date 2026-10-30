// Outer frame of every screen; leaves room for mini player and tab bar.
/**
 * Every screen's outer frame (M7): the dark background, the safe areas, and — the part
 * that is easy to forget — bottom padding equal to the mini player plus the tab bar, so
 * the last row of a list is never hidden underneath them.
 */
import { type ScrollViewProps, type ViewProps } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';

/** Height of the mini player and the tab bar, so lists can reserve room for both. */
export const MINI_PLAYER_HEIGHT = 64;
export const TAB_BAR_HEIGHT = 56;
export const BOTTOM_INSET = MINI_PLAYER_HEIGHT + TAB_BAR_HEIGHT;
/**
 * The end of a TAB page's scroll (Discover, Updates, Me, Chat). The tab layout draws the mini
 * player and the tab bar BELOW the page, not over it, so the page already stops above them;
 * reserving BOTTOM_INSET there left 120 pt of empty space (owner, 2026-10-04). Just breathing room.
 */
export const TAB_PAGE_END = 24;

/** Scroll-only props (owner, 2026-10-05: the category page loads more at the bottom and keeps its row on top). */
type ScrollOnly = Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle' | 'stickyHeaderIndices'>;

export function Screen(props: ViewProps & ScrollOnly & { scroll?: boolean; padded?: boolean }): React.ReactElement {
  const { scroll, padded = true, style, className, children, onScroll, scrollEventThrottle, stickyHeaderIndices, ...rest } = props;
  const pad = padded ? 'px-screen-x' : '';
  // The inset is derived from two JS constants, so it stays a style rather than a class.
  const bottom = { paddingBottom: BOTTOM_INSET };
  if (scroll) {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerClassName={`${pad} ${className ?? ''}`} contentContainerStyle={[bottom, style]} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle} stickyHeaderIndices={stickyHeaderIndices} {...rest}>
        {children}
      </ScrollView>
    );
  }
  return (
    <Box className={`flex-1 bg-background ${pad} ${className ?? ''}`} style={[bottom, style]} {...rest}>
      {children}
    </Box>
  );
}
