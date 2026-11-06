// A page whose body is a list the page owns: design B's title row, gutter and foot around a FlatList.
/**
 * Spec 039 (D6, revised 2026-11-06): `Page` is a ScrollView, so a page that owns a FlatList (history, queue, likes, ...) cannot sit in it. `PageList` is
 * the same frame around a FlatList: the title row (`PageTitleRow`, the same as Page's: Back leading, the title in the
 * `title` step, actions trailing; 039 D2: PINNED above the list, not in its header), an optional subtitle line and `header` (chips, a search field, a select bar), then the page's own
 * `ListHeaderComponent`; the content has the side gutter (20, 16 on a phone narrower than 375), `gap` (24) between children, a top of
 * `PIN_GAP` (the gap under the pinned row; the pin holds the safe area + `spacing.section`) and a bottom padding of `bottomInset(safe, { tabs, now }) + footExtra`. `tone` draws the page glow behind the list;
 * `below` is drawn over the foot (a composer, a Send button) and the list leaves `belowHeight` + 12 for it.
 * Every other FlatList prop (data, renderItem, keyExtractor, onEndReached, refreshControl, ListEmptyComponent, ListFooterComponent,
 * ItemSeparatorComponent, keyboardShouldPersistTaps, ...) is passed through; `scrollRef` is the list's ref. No page uses a SectionList, so there
 * is no `sections` variant.
 */
import { useContext, useRef } from 'react';
import { type FlatList as RNFlatList, type FlatListProps, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { FlatList } from '@/ui/lib/flat-list';
import { bottomInset, gutter, spacing } from '@/design';
import { PageGlow, type GlowTone } from '../PageGlow';
import { Type } from '../Type';
import { PagePin, PageTitleRow, PIN_GAP, usePinnedScroll } from './Page';

const BELOW_GAP = 12;

export type PageListProps<T> = Omit<FlatListProps<T>, 'contentContainerStyle' | 'ListHeaderComponent'> & {
  title: string;
  titleLabel?: string;
  onTitle?: () => void;
  subtitle?: string;
  /** Before the title (Back). */
  leading?: React.ReactNode;
  /** After the title (actions). */
  trailing?: React.ReactNode;
  /** Under the title and subtitle, before the list's own header: chips, a search field, a select bar. */
  header?: React.ReactNode;
  /** The page's own list header, after `header`. */
  ListHeaderComponent?: React.ReactElement | null;
  /** The list, for pages that scroll it themselves. */
  scrollRef?: React.RefObject<RNFlatList<T> | null>;
  /** The tab bar / the now bar shows under this page (the two flags `toastPlacement` uses). */
  tabs?: boolean;
  now?: boolean;
  /** The home strip this page pads itself (default: the safe area's). A pushed page passes 0 when the root layout already padded it (guard G-T1). */
  safeBottom?: number;
  /** Extra room at the foot for something that floats over the page. */
  footExtra?: number;
  /** Space between the header parts and the items (24 by default; 0 when the page spaces its own items). */
  gap?: number;
  /** Extra content style the page needs (flexGrow for an empty state): merged over the frame's. */
  contentStyle?: object;
  tone?: GlowTone | 'none';
  below?: React.ReactNode;
  belowHeight?: number;
};

export function PageList<T>(props: PageListProps<T>): React.ReactElement {
  const { title, titleLabel, onTitle, subtitle, leading, trailing, header, ListHeaderComponent, scrollRef, tabs, now, safeBottom, footExtra, gap, contentStyle, tone, below, belowHeight, ...rest } = props;
  const safe = useContext(SafeAreaInsetsContext) ?? { top: 0, bottom: 0 };
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const inner = useRef<RNFlatList<T> | null>(null);
  const lift = below ? (belowHeight ?? 0) + BELOW_GAP : 0;
  const bars = bottomInset(safeBottom ?? safe.bottom, { tabs: tabs === true, now: now === true });
  const pin = usePinnedScroll(rest.onScroll as never);
  const content = {
    paddingHorizontal: side,
    paddingTop: PIN_GAP,
    paddingBottom: bars + (footExtra ?? 0) + lift,
    gap: gap ?? spacing.block,
    ...contentStyle,
  };
  const head = !subtitle && !header && !ListHeaderComponent ? undefined : (
    <Box style={{ gap: spacing.row }}>
      {subtitle ? <Type step="caption" className="text-text2" numberOfLines={2}>{subtitle}</Type> : null}
      {header ?? null}
      {ListHeaderComponent ?? null}
    </Box>
  );
  return (
    <Box className="flex-1 bg-void" testID="page-list">
      {tone === undefined || tone === 'none' ? null : <PageGlow tone={tone} />}
      <PagePin top={safe.top} side={side} scrolled={pin.scrolled}>
        <PageTitleRow title={title} {...(titleLabel ? { titleLabel } : {})} {...(onTitle ? { onTitle } : {})} leading={leading} trailing={trailing} />
      </PagePin>
      <FlatList<T> ref={scrollRef ?? inner} testID="page-scroll" contentContainerStyle={content} showsVerticalScrollIndicator={false} scrollEventThrottle={16} ListHeaderComponent={head} {...(rest as FlatListProps<T>)} onScroll={pin.onScroll} />
      {below ? (
        <Box testID="pushed-below" className="absolute left-0 right-0" style={{ bottom: bars, paddingHorizontal: side, gap: BELOW_GAP, zIndex: 20 }}>{below}</Box>
      ) : null}
    </Box>
  );
}
