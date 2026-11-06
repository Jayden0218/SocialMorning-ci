// A page of the app: a title row, then sections on one 20 gutter with 24 between them, and a foot that clears the bars.
/**
 * Spec 039 (D3): the one page shape the redrawn screens share (`design/B-Me.dc.html`). A scroll view whose content has the side
 * gutter (20, 16 on a phone narrower than 375), `spacing.block` (24) between its children, and a bottom padding of
 * `bottomInset(safe, { tabs, now })` so the last row never hides behind the tab bar or the now bar. The title row holds the page title in
 * the `title` step with an optional leading slot (Back) and trailing slot (actions). A page in a tab passes `tabs`; a page under the
 * now bar passes `now` (the same two flags `toastPlacement` uses, so a page, its toast and the bars agree).
 */
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { useScrollToTop } from 'expo-router';
import { ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, bottomInset, gutter, spacing } from '@/design';
import { Type } from '../Type';

/** Pressing the tab again scrolls this page to the top. A component of its own so the hook is only called by pages in a tab. */
function ScrollToTop(props: { target: React.RefObject<Scroller | null> }): null {
  useScrollToTop(props.target as never);
  return null;
}

type Scroller = ComponentRef<typeof ScrollView>;

/** The title row of a page (Page and PageList): Back leading, the title on ONE line (shrinks to fit), actions trailing. */
export function PageTitleRow(props: { title: string; titleLabel?: string; nameTitle?: boolean; onTitle?: () => void; leading?: React.ReactNode; trailing?: React.ReactNode }): React.ReactElement {
  const step = props.nameTitle ? 'heading' : 'title';
  const label = props.titleLabel ?? props.title;
  return (
      <Box testID="page-title-row" className="flex-row items-center justify-between" style={{ gap: spacing.row }}>
        {props.leading}
        {props.onTitle ? (
          <Pressable onPress={props.onTitle} accessibilityRole="link" accessibilityLabel={label} className="flex-1" style={{ minHeight: bars.circle, justifyContent: 'center' }}>
            <Type step={step} className="text-text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{props.title}</Type>
          </Pressable>
        ) : (
          <Type step={step} accessibilityRole="header" accessibilityLabel={label} className="text-text flex-1" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{props.title}</Type>
        )}
        {props.trailing}
      </Box>
  );
}

/**
 * 039 D2: the title row is PINNED. It sits above the scrolling content on an opaque void ground (the safe-area top and the 20 gutter are its own
 * padding), so Back, the Me gear and every page's actions stay reachable on a scrolled page, as the old title bar did. A 1 px `line` hairline
 * appears under it once content has scrolled (offset > 0). The content's own top padding is the gap below it (`PIN_GAP`).
 */
export const PIN_GAP = spacing.row;

export function PagePin(props: { top: number; side: number; scrolled: boolean; transparent?: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <Box testID="page-title-pin" className={props.transparent === true ? '' : 'bg-void'} style={{ paddingTop: props.top + spacing.section, paddingBottom: PIN_GAP, paddingHorizontal: props.side, zIndex: 10 }}>
      {props.children}
      {props.scrolled ? <Box testID="page-title-hairline" className="absolute left-0 right-0 bottom-0 bg-line" style={{ height: 1 }} /> : null}
    </Box>
  );
}

/** Whether the content has scrolled under the pinned title row, and an onScroll that tracks it and still calls the page's own. */
export function usePinnedScroll(own?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void): { scrolled: boolean; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void } {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    setScrolled(e.nativeEvent.contentOffset.y > 0);
    own?.(e);
  }, [own]);
  return { scrolled, onScroll };
}

export function Page(props: {
  title: string;
  /** The header's spoken name when it differs from the words drawn (default: the title). */
  titleLabel?: string;
  /** A person's name as the title (Me): the `heading` step on ONE line that shrinks to fit, not the 30 pt `title` that wraps (design/B-Me.dc.html 24/30). */
  nameTitle?: boolean;
  /** The ScrollView, for pages that scroll themselves (a shortcut to a section). */
  scrollRef?: React.RefObject<Scroller | null>;
  /** Pressing this page's tab again scrolls it to the top (a page in a tab). */
  scrollToTopOnTabPress?: boolean;
  /** 039 D6: no page colour behind the scroll view, so a glow drawn under it (a pushed page's tone) shows. */
  transparent?: boolean;
  /** 039 D6: makes the title a link (a playlist's name opens its rename). */
  onTitle?: () => void;
  /** Before the title (Back). */
  leading?: React.ReactNode;
  /** After the title (actions). */
  trailing?: React.ReactNode;
  /** The tab bar is showing under this page. */
  tabs?: boolean;
  /** Extra room at the foot for something that floats over the page (Discover's Moments | Discover switch). */
  footExtra?: number;
  /** The now bar is showing over its foot. */
  now?: boolean;
  /** Scroll behaviour the page keeps from before (pull to refresh, load more on scroll): passed to the ScrollView as is. */
  scroll?: Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'onMomentumScrollEnd' | 'scrollEventThrottle' | 'onScrollEndDrag' | 'keyboardShouldPersistTaps' | 'keyboardDismissMode' | 'scrollEnabled'>;
  children?: React.ReactNode;
}): React.ReactElement {
  const safe = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const inner = useRef<Scroller | null>(null);
  const scroller = props.scrollRef ?? inner;
  const pin = usePinnedScroll(props.scroll?.onScroll as never);
  const content = {
    paddingHorizontal: side,
    paddingTop: PIN_GAP,
    paddingBottom: bottomInset(safe.bottom, { tabs: props.tabs === true, now: props.now === true }) + (props.footExtra ?? 0),
    gap: spacing.block,
  };
  return (
    <Box className={props.transparent === true ? 'flex-1' : 'flex-1 bg-void'}>
      <PagePin top={safe.top} side={side} scrolled={pin.scrolled} {...(props.transparent === true ? { transparent: true } : {})}>
        <PageTitleRow title={props.title} {...(props.titleLabel ? { titleLabel: props.titleLabel } : {})} {...(props.nameTitle ? { nameTitle: true } : {})} {...(props.onTitle ? { onTitle: props.onTitle } : {})} leading={props.leading} trailing={props.trailing} />
      </PagePin>
      <ScrollView ref={scroller} testID="page-scroll" className="flex-1" contentContainerStyle={content} showsVerticalScrollIndicator={false} scrollEventThrottle={16} {...props.scroll} onScroll={pin.onScroll}>
        {props.scrollToTopOnTabPress === true ? <ScrollToTop target={scroller} /> : null}
        {props.children}
      </ScrollView>
    </Box>
  );
}
