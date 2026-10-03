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
import { Pressable } from '../lib/pressable';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { hit } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon } from '../Icon';
import type { EpisodeCard } from '../../social/api';
import { Artwork } from '../Artwork';

const TAP = { minHeight: hit.min, minWidth: hit.min };

/**
 * A section's serif title with an optional "label →" link on the right. `size: 'page'` is the
 * larger title a whole block opens with ("The chart" in `Discover-B`).
 */
export function SectionTitle(props: { title: string; action?: { label: string; onPress: () => void }; badge?: number; size?: 'page' }): React.ReactElement {
  return (
    <Box className="flex-row items-end justify-between px-screen-x mt-section mb-gap">
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
          <Text className="text-accent text-meta font-semibold">{props.action.label} →</Text>
        </Pressable>
      ) : null}
    </Box>
  );
}

/**
 * The round play button every row ends with. M12 FR-053: a tinted disc with an accent glyph —
 * six solid yellow circles a screen read heavier than the rows they end (2026-09-29
 * comparison). The player's own Play stays solid. M17: the glyph is the play icon (`Home-B`).
 */
export function PlayButton(props: { title: string; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} className="items-center justify-center" style={TAP}>
      <Box className="w-10 h-10 rounded-pill bg-accentTint items-center justify-center pl-0.5">
        <Icon name="play" size={16} color={c.accent} />
      </Box>
    </Pressable>
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
  rankTone?: 'chart' | 'accent'; divided?: boolean; hideShow?: boolean;
}): React.ReactElement {
  const { card } = props;
  const size = props.size ?? 72;
  const ranked = props.rank !== undefined;
  const rankClass = props.rankTone === 'accent'
    ? 'text-accent text-lg font-display w-6 text-center'
    : `${props.rank === 1 ? 'text-text' : 'text-muted'} text-display font-display w-9 text-center`;
  return (
    <Box className={`flex-row items-center gap-row py-row ${props.divided ? 'border-t-hairline border-separator' : ''}`}>
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`} className="flex-row items-center gap-row flex-1">
        {ranked ? <Text className={rankClass} maxFontSizeMultiplier={1.3}>{props.rank}</Text> : null}
        <Artwork url={card.imageUrl} size={size} name={card.showTitle} />
        <Box className="flex-1 gap-0.5">
          {!ranked ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          <Text className="text-text text-body font-bold" numberOfLines={2}>{card.title}</Text>
          {ranked && props.hideShow !== true ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          {props.line ? <Text className="text-muted text-xs" numberOfLines={1}>{props.line}</Text> : null}
        </Box>
      </Pressable>
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
