/**
 * The small pieces the redesigned Discover (M10) is built from: a section title, the
 * round play button, one episode line, a swipeable row of pages, and the search bar.
 * Colours are tokens only: section titles take `accent`, the play button the brand
 * `primary` fill, cards `surface`.
 */
import { twoTone } from '../two-tone';
import { useRef, type ComponentRef } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { Pressable } from '../lib/pressable';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, hit } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon } from '../Icon';
import type { EpisodeCard } from '../../social/api';
import { Artwork } from '../Artwork';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export function SectionTitle(props: { title: string; action?: { label: string; onPress: () => void }; badge?: number }): React.ReactElement {
  return (
    <Box className="flex-row items-center justify-between px-screen-x mt-section mb-row">
      <Box className="flex-row items-center gap-row flex-1">
        <Text className="text-accent text-base font-bold" accessibilityRole="header" numberOfLines={1}>
          {/* M12 FR-055: two tones — the first word in the text colour, the rest in the accent. */}
          {twoTone(props.title).lead ? <Text className="text-text text-base font-bold">{twoTone(props.title).lead}</Text> : null}
          {twoTone(props.title).rest}
        </Text>
        {props.badge !== undefined ? (
          <Box className="bg-primary rounded-pill px-2 py-0.5"><Text className="text-onPrimary text-xs font-bold">{props.badge}</Text></Box>
        ) : null}
      </Box>
      {props.action ? (
        <Pressable onPress={props.action.onPress} accessibilityRole="link" accessibilityLabel={props.action.label} className="justify-center pl-row" style={TAP}>
          <Text className="text-muted text-xs">{props.action.label} →</Text>
        </Pressable>
      ) : null}
    </Box>
  );
}

/**
 * The round play button every row ends with. M12 FR-053: a tinted disc with an accent glyph —
 * six solid yellow circles a screen read heavier than the rows they end (2026-09-29
 * comparison). The player's own Play stays solid.
 */
export function PlayButton(props: { title: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} className="items-center justify-center" style={TAP}>
      <Box className="w-10 h-10 rounded-pill bg-accentTint items-center justify-center">
        {/* iOS J6: the ▶ is an icon in a fixed circle; at the largest Dynamic Type it grew out
            of the circle and under the next card. It scales a little and no more. */}
        <Text className="text-accent text-sm pl-0.5" maxFontSizeMultiplier={1.3}>▶</Text>
      </Box>
    </Pressable>
  );
}

/** Artwork · show · title (2 lines) · a muted line · play. The row opens the episode. */
export function EpisodeLine(props: { card: EpisodeCard; line?: string; rank?: number; size?: number; onOpen: () => void; onPlay: () => void; label?: string }): React.ReactElement {
  const { card } = props;
  const size = props.size ?? 72;
  return (
    <Box className="flex-row items-center gap-row py-row">
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`} className="flex-row items-center gap-row flex-1">
        <Artwork url={card.imageUrl} size={size} rounded="row" name={card.showTitle} />
        {props.rank !== undefined ? <Text className="text-muted text-sm w-5 text-center">{props.rank}</Text> : null}
        <Box className="flex-1">
          {props.rank === undefined ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>{card.title}</Text>
          {props.rank !== undefined ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
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
 */
export function Pager(props: { count: number; children: (index: number, width: number) => React.ReactNode; onPage?: (index: number) => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const page = Math.round(width * 0.86);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={page}
      decelerationRate="fast"
      contentContainerClassName="px-screen-x"
      onMomentumScrollEnd={(e) => props.onPage?.(Math.round(e.nativeEvent.contentOffset.x / page))}
    >
      {Array.from({ length: props.count }, (_, i) => (
        <Box key={i} style={{ width: page }} className="pr-row">{props.children(i, page)}</Box>
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
    <Box ref={box} collapsable={false} className="mx-screen-x flex-row items-center bg-surface rounded-pill">
      <Pressable
        onPress={press}
        accessibilityRole="search"
        accessibilityLabel={props.hint ? `Search. Trending: ${props.hint}` : 'Search shows and episodes'}
        className="flex-1 flex-row items-center gap-2 pl-section pr-row"
        style={TAP}
      >
        <Icon name="search-outline" size={18} color={c.muted} />
        <Text className="text-muted text-sm flex-1 text-center" numberOfLines={1}>{props.hint ?? 'Search shows and episodes'}</Text>
      </Pressable>
      {props.onScan ? (
        <Pressable onPress={props.onScan} accessibilityRole="button" accessibilityLabel="Scan a QR code" className="items-center justify-center pr-row" style={TAP}>
          <Icon name="scan-outline" size={22} color={c.text} />
        </Pressable>
      ) : null}
    </Box>
  );
}
