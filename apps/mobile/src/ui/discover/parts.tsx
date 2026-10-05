// Small Discover pieces: section title, round play button, episode line, pager, search box.
/**
 * The small pieces the redesigned Discover (M10) is built from: a section title, the
 * round play button, one episode line, a swipeable row of pages, and the search bar.
 * Colours are tokens only: section titles take `accent`, the play button the brand
 * `primary` fill, cards `surface`.
 *
 * M17 (`Home-B`, `Discover-B`): section titles are serif in the text colour with an accent
 * "label →" link (the M12 two-tone title is gone — B draws one colour); a ranked line puts a
 * large serif number before the artwork; lines can be divided by a hairline inside a card;
 * the pager can show whole-width pages and be moved by buttons as well as by a swipe; the
 * search box gains the thin card border. Accessible names and handlers are unchanged.
 */
import { useEffect, useRef, type ComponentRef } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import type { EpisodeCard } from '@/social/api';
import { Artwork } from '@/ui/kit/Artwork';

const TAP = { minHeight: hit.min, minWidth: hit.min };

/**
 * A section's serif title with an optional "label →" link on the right. `size: 'page'` is the
 * larger title a whole block opens with ("The chart" in `Discover-B`).
 */
export function SectionTitle(props: { title: string; action?: { label: string; onPress: () => void }; badge?: number; size?: 'page' }): React.ReactElement {
  return (
    // Owner, 2026-10-05: a title and the link on its right share one middle line.
    <Box className="flex-row items-center justify-between px-screen-x mt-section mb-gap">
      <Box className="flex-row items-center gap-gap flex-1">
        <Text className={props.size === 'page' ? 'text-text text-hero font-display' : 'text-text text-lg font-display'} accessibilityRole="header" numberOfLines={1}>
          {props.title}
        </Text>
        {props.badge !== undefined ? (
          <Box className="bg-primary rounded-pill px-2 py-0.5"><Text className="text-onPrimary text-xs font-bold">{props.badge}</Text></Box>
        ) : null}
      </Box>
      {props.action ? (
        <Pressable onPress={props.action.onPress} accessibilityRole="link" accessibilityLabel={props.action.label} className="justify-center pl-row" style={TAP}>
          <Text className="text-accent text-meta font-semibold">{props.action.label} ›</Text>
        </Pressable>
      ) : null}
    </Box>
  );
}

/**
 * The round play button every row ends with. M12 FR-053: a tinted disc with an accent glyph —
 * six solid yellow circles a screen read heavier than the rows they end (2026-09-29
 * comparison). The player's own Play stays solid. M17: the glyph is the play icon (`Home-B`).
 * Owner, 2026-10-05: every podcast play button is the light-yellow disc with the brown triangle.
 */
export function PlayButton(props: { title: string; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} className="items-center justify-center" style={TAP}>
      <Box className="w-10 h-10 rounded-pill bg-playDisc items-center justify-center pl-0.5">
        <Icon name="play" size={16} color={c.playGlyph} />
      </Box>
    </Pressable>
  );
}

/**
 * Owner, 2026-10-05: "+" — adds the episode to the queue. Same disc as Play, so the two read as one family.
 */
export function AddButton(props: { title: string; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Add ${props.title} to the queue`} className="items-center justify-center" style={TAP}>
      <Box className="w-10 h-10 rounded-pill bg-playDisc items-center justify-center">
        <Icon name="add" size={22} color={c.playGlyph} />
      </Box>
    </Pressable>
  );
}

export type RowStats = { listeners: number; comments: number };

/** Owner, 2026-10-05: "12 listened · 3 comments" with their icons, under every Discover episode. Counts only (G6). */
export function StatsLine(props: { stats: RowStats; className?: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { listeners, comments } = props.stats;
  return (
    <Box className={`flex-row items-center gap-1 ${props.className ?? ''}`} accessible accessibilityLabel={`${listeners} listened, ${comments} ${comments === 1 ? 'comment' : 'comments'}`}>
      <Icon name="headset-outline" size={13} color={c.muted} />
      <Text className="text-muted text-xs">{`${listeners} listened`}</Text>
      <Text className="text-muted text-xs">·</Text>
      <Icon name="chatbubble-outline" size={12} color={c.muted} />
      <Text className="text-muted text-xs">{`${comments} ${comments === 1 ? 'comment' : 'comments'}`}</Text>
    </Box>
  );
}

/**
 * Artwork · show · title (2 lines) · a muted line · play. The row opens the episode.
 *
 * M17: with `rank`, a serif number leads the row — `rankTone: 'chart'` (default) is the
 * chart's large number, the first in the text colour and the rest muted (`Discover-B`);
 * `'accent'` is For You's smaller accent number (`Home-B`). `divided` draws the hairline
 * above a row that is not the first in its card; `hideShow` leaves the show's name to the
 * accessible name when the muted line already says why (For You).
 */
export function EpisodeLine(props: {
  card: EpisodeCard; line?: string; rank?: number; size?: number; onOpen: () => void; onPlay: () => void; label?: string;
  rankTone?: 'chart' | 'accent'; divided?: boolean; hideShow?: boolean; stats?: RowStats;
  /** M19 T021: a "⋯" before Play that opens the row's choices (For You: Not interested). */
  onMore?: () => void;
}): React.ReactElement {
  const { card } = props;
  const stores = useStores();
  const c = useColours(stores.settings);
  const size = props.size ?? 72;
  const ranked = props.rank !== undefined;
  const rankClass = props.rankTone === 'accent'
    ? 'text-accent text-lg font-display w-8 text-center'
    : `${props.rank === 1 ? 'text-text' : 'text-muted'} text-display font-display w-9 text-center`;
  return (
    <Box className={`flex-row items-center gap-row py-row ${props.divided ? 'border-t-hairline border-separator' : ''}`}>
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`} className="flex-row items-center gap-row flex-1">
        {/* Owner, 2026-10-04: one line, so "10" is not stacked as 1 over 0. */}
        {ranked ? <Text className={rankClass} numberOfLines={1} maxFontSizeMultiplier={1.3}>{props.rank}</Text> : null}
        <Artwork url={card.imageUrl} size={size} name={card.showTitle} />
        <Box className="flex-1 gap-0.5">
          {!ranked ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          <Text className="text-text text-body font-bold" numberOfLines={2}>{card.title}</Text>
          {ranked && props.hideShow !== true ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          {props.line ? <Text className="text-muted text-xs" numberOfLines={1}>{props.line}</Text> : null}
          {props.stats ? <StatsLine stats={props.stats} /> : null}
        </Box>
      </Pressable>
      {props.onMore ? (
        <Pressable onPress={props.onMore} accessibilityRole="button" accessibilityLabel={`More for ${card.title}`} className="items-center justify-center" style={TAP}>
          <Icon name="ellipsis-horizontal" size={20} color={c.muted} />
        </Pressable>
      ) : null}
      <PlayButton title={card.title} onPress={props.onPlay} />
    </Box>
  );
}

/**
 * Pages side by side, swiped one at a time; each page is a bit narrower than the screen
 * so the next one peeks in — the cue that there is more. `onPage` reports the page shown.
 *
 * M17: `full` makes each page the screen's width (the B designs draw one page with buttons
 * to move on, not a peek); `index` moves the pager to that page — the swipe still works and
 * still reports through `onPage`.
 */
export function Pager(props: { count: number; children: (index: number, width: number) => React.ReactNode; onPage?: (index: number) => void; full?: boolean; index?: number }): React.ReactElement {
  const { width } = useWindowDimensions();
  const page = props.full ? width : Math.round(width * 0.86);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    if (props.index === undefined) return;
    scroller.current?.scrollTo?.({ x: props.index * page, animated: true });
  }, [props.index, page]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={page}
      decelerationRate="fast"
      contentContainerClassName={props.full ? '' : 'px-screen-x'}
      onMomentumScrollEnd={(e) => props.onPage?.(Math.round(e.nativeEvent.contentOffset.x / page))}
    >
      {Array.from({ length: props.count }, (_, i) => (
        <Box key={i} style={{ width: page }} className={props.full ? 'px-screen-x' : 'pr-row'}>{props.children(i, page)}</Box>
      ))}
    </ScrollView>
  );
}

/**
 * A search box that is a button: tapping it opens Search, where typing happens. Its middle
 * shows what is trending (owner, 2026-09-27; `src/discover/trending.ts`); the icon on the
 * right scans a QR code.
 */
export function SearchBar(props: { hint?: string; onPress: (fromY: number) => void; onScan?: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  // Owner, 2026-10-01: Search opens by moving this box to the top, so it needs to know
  // where the box is on the screen when tapped.
  const box = useRef<ComponentRef<typeof View>>(null);
  const press = () => {
    if (!box.current) { props.onPress(0); return; }
    box.current.measureInWindow((_x, y) => props.onPress(y));
  };
  return (
    <Box ref={box} collapsable={false} className="mx-screen-x flex-row items-center bg-surface border border-border rounded-pill">
      <Pressable
        onPress={press}
        accessibilityRole="search"
        accessibilityLabel={props.hint ? `Search. Trending: ${props.hint}` : 'Search shows and episodes'}
        className="flex-1 flex-row items-center gap-2 pl-section pr-row"
        style={TAP}
      >
        <Icon name="search-outline" size={18} color={c.muted} />
        <Text className="text-muted text-body flex-1 text-center" numberOfLines={1}>{props.hint ?? 'Search shows and episodes'}</Text>
      </Pressable>
      {props.onScan ? (
        <Pressable onPress={props.onScan} accessibilityRole="button" accessibilityLabel="Scan a QR code" className="items-center justify-center pr-row" style={TAP}>
          <Icon name="scan-outline" size={22} color={c.text} />
        </Pressable>
      ) : null}
    </Box>
  );
}
