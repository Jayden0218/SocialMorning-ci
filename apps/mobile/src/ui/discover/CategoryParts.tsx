// The parts of a category page: the genre strip, the light lead card, the 1 x 2 show tile, the All categories sheet.
/**
 * M31 D-C (design-pulse2 `discover.html` `category--screen`, `category--all-sheet`; layout pattern Mosaic). Read off the drawing:
 *  - Strip: the genre names in Geist 600 15 text2, 18 apart, 28 from the left and 20 from the right; the chosen one in text with a 2 hot
 *    line 8 under the word. It scrolls sideways and the chosen genre is brought into view; a tap, or a swipe that stops on a name, picks it.
 *  - Lead card: the first show as a 2 x 3 light tile (text fill, void words, radius 22, padding 14) — the cover 96 (radius 18), the name
 *    in Unbounded 700 18, "author · kinds" in 12 / 16 #55545C, the subscribe disc 40 (hot, a plus) — and at the foot the newest episode in a
 *    #E6E3DD box (radius 14, padding 10, Geist 500 13 / 18).
 *  - Show tile: a 1 x 2 raise tile (radius 22, padding 14) — the cover 56 (radius 14) with the 34 subscribe circle at the other end (a ring and
 *    a plus; a #24242C disc and a tick when subscribed), the name in Geist 700 14, then "Newest: …" in Geist 500 12 text2.
 *  - All categories sheet: every genre as a tile of a 3-column grid, 64 tall, radius 16, 8 apart; the chosen one light with void words, the others
 *    raise with a line border; the icon 18 over the name in Geist 600 11.
 * Not as drawn: the tile also carries the show's maker and kinds (M21 FR-063 "two lines about the show", kept) and its name may take two
 * lines; the tile is a minimum 178 tall (the drawing's two rows and the gap) and grows with large text; the lead's plus stays a plus when
 * subscribed (owner, 2026-10-05) and says so to a screen reader.
 */
import { type ComponentRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { GENRES } from '@/discover/genres';
import { ago } from '@/discover/sections';
import type { ShowCard } from '@/social/api';
import { ME_TYPE } from '@/ui/me/measures';
import { PAGE, PAGE_TYPE } from './measures';
import { UNBOUNDED } from './Deck';

/** Drawn numbers of the page. */
export const CATEGORY = {
  stripGap: 18,
  stripLeft: 28,
  stripRight: 20,
  stripLine: 2,
  stripLineGap: 8,
  /** The track and the order row sit 14 under / over their neighbours, 28 / 16 in from the sides. */
  rowGap: 14,
  leadRows: 3,
  tileRows: 2,
  leadCover: 96,
  leadCoverRadius: 18,
  leadDisc: 40,
  leadBox: { radius: 14, pad: 10 },
  tileCover: 56,
  tileCoverRadius: 14,
  tileCircle: 34,
  tileCircleRing: 1.5,
  gridCol: 3,
  gridGap: 8,
  gridTile: 64,
  gridRadius: 16,
} as const;

/** The height of a tile that spans `rows` rows. */
export const spanHeight = (rows: number): number => rows * PAGE.row + (rows - 1) * PAGE.gap;

const SLOP_TILE = 7;
const NO_BREAK = { flexShrink: 0 } as const;

/** The genre strip. Rows of words, the chosen one lit with a 2 hot line under it. */
export function GenreStrip(props: {
  genreId: number;
  /** The name lit while a swipe is in progress (it follows the finger). */
  lit: number;
  onPick: (id: number) => void;
  scrollRef: React.RefObject<ComponentRef<typeof ScrollView> | null>;
  /** Called with a tile's x as it is laid out, and when the chosen one is first laid out. */
  onTileLayout: (id: number, x: number, chosen: boolean) => void;
  scrollProps: ScrollViewProps;
}): React.ReactElement {
  const { scrollRef, scrollProps } = props;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: CATEGORY.stripGap, paddingLeft: CATEGORY.stripLeft, paddingRight: CATEGORY.stripRight }}
      scrollEventThrottle={16}
      testID="genre-strip"
      {...scrollProps}
    >
      {GENRES.map((g) => {
        const on = g.id === props.genreId;
        const lit = g.id === props.lit;
        return (
          <Pressable
            key={g.id}
            onPress={() => props.onPick(g.id)}
            onLayout={(e) => props.onTileLayout(g.id, e.nativeEvent.layout.x, on)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={g.name}
            className="justify-center"
            style={[{ minHeight: 48 }, NO_BREAK]}
          >
            <Box>
              <Type step="row" className={lit ? 'text-text' : 'text-text2'} numberOfLines={1}>{g.name}</Type>
              {/* A bar with round ends, not a border (a border's ends are square). */}
              <Box testID={lit ? 'genre-line-on' : undefined} className={`rounded-pill ${lit ? 'bg-hot' : 'bg-clear'}`} style={{ height: CATEGORY.stripLine, marginTop: CATEGORY.stripLineGap }} />
            </Box>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** "Maker · kinds": Apple's catalogue gives no description (M21 T085). */
export function aboutShow(s: ShowCard): string {
  const kinds = s.genres.filter((g) => g !== 'Podcasts').slice(0, 3).join(', ');
  return kinds ? `${s.author} · ${kinds}` : s.author;
}

/** The first show: the light 2 x 3 tile. The whole card opens the show; the disc is its own tap. */
export function LeadCard(props: { show: ShowCard; subscribed: boolean; now: number; onOpen: () => void; onToggle: () => void }): React.ReactElement {
  const s = props.show;
  const ep = s.latestEpisode;
  return (
    <Box testID="lead-card" className="bg-text" style={{ marginLeft: 28, marginRight: spacing.section, minHeight: spanHeight(CATEGORY.leadRows), borderRadius: PAGE.radius, overflow: 'hidden' }}>
      <Pressable
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${s.title}, ${s.author}${ep ? `. Newest: ${ep.title}` : ''}`}
        className="flex-1"
        style={{ padding: PAGE.pad, gap: spacing.row }}
      >
        <Box className="flex-row" style={{ gap: spacing.row }}>
          <Box style={{ width: CATEGORY.leadCover, height: CATEGORY.leadCover, borderRadius: CATEGORY.leadCoverRadius, overflow: 'hidden' }}>
            <Artwork url={s.imageUrl} size={CATEGORY.leadCover} name={s.title} />
          </Box>
          <Box className="flex-1 min-w-0" style={{ paddingRight: CATEGORY.leadDisc + spacing.row }}>
            <Type step="lede" className="text-void font-bold" style={UNBOUNDED[17]} numberOfLines={3}>{s.title}</Type>
            <Type step="tag" className="text-void font-medium" style={[ME_TYPE.node12, { color: colour.onLight2 }]} numberOfLines={2}>{aboutShow(s)}</Type>
          </Box>
        </Box>
        {ep ? (
          <Box className="mt-auto" style={{ backgroundColor: colour.lightBox, borderRadius: CATEGORY.leadBox.radius, padding: CATEGORY.leadBox.pad }}>
            <Type step="caption" className="text-void" numberOfLines={3}>{`Newest: ${ep.title}${ep.publishedAt ? ` · ${ago(ep.publishedAt, props.now)}` : ''}`}</Type>
          </Box>
        ) : null}
      </Pressable>
      {/* Owner, 2026-10-05: the wide card's button is always a plus on the hot disc, never a tick. */}
      <Box className="absolute" style={{ top: PAGE.pad, right: PAGE.pad }}>
        <Pressable
          onPress={props.onToggle}
          accessibilityRole="button"
          accessibilityLabel={props.subscribed ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`}
          accessibilityState={{ selected: props.subscribed }}
          hitSlop={4}
          className="items-center justify-center rounded-pill bg-hot"
          style={{ width: CATEGORY.leadDisc, height: CATEGORY.leadDisc }}
        >
          <Icon name="add" size={20} color={colour.void} />
        </Pressable>
      </Box>
    </Box>
  );
}

/** One show: a 1 x 2 tile. */
export function ShowTile(props: { show: ShowCard; subscribed: boolean; now: number; onOpen: () => void; onToggle: () => void }): React.ReactElement {
  const s = props.show;
  const ep = s.latestEpisode;
  return (
    <Box testID="show-tile" className="bg-raise flex-1" style={{ minHeight: spanHeight(CATEGORY.tileRows), borderRadius: PAGE.radius, overflow: 'hidden' }}>
      {/* Owner, 2026-10-04 ("I press a podcast and can't go in"): the whole tile is the tap area. */}
      <Pressable
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${s.title}, ${s.author}${ep ? `. Newest: ${ep.title}` : ''}`}
        className="flex-1"
        style={{ padding: PAGE.pad, gap: spacing.row - 2 }}
      >
        <Box style={{ width: CATEGORY.tileCover, height: CATEGORY.tileCover, borderRadius: CATEGORY.tileCoverRadius, overflow: 'hidden' }}>
          <Artwork url={s.imageUrl} size={CATEGORY.tileCover} name={s.title} />
        </Box>
        <Box>
          <Type step="compact" className="text-text font-bold" style={PAGE_TYPE.lede13} numberOfLines={2}>{s.title}</Type>
          <Type step="caption" className="text-text2" style={ME_TYPE.node12} numberOfLines={1}>{aboutShow(s)}</Type>
          {ep ? <Type step="caption" className="text-text2" style={ME_TYPE.node12} numberOfLines={3}>{`Newest: ${ep.title}${ep.publishedAt ? ` · ${ago(ep.publishedAt, props.now)}` : ''}`}</Type> : null}
        </Box>
      </Pressable>
      <Box className="absolute" style={{ top: PAGE.pad, right: PAGE.pad }}>
        <Pressable
          onPress={props.onToggle}
          accessibilityRole="button"
          accessibilityLabel={props.subscribed ? `Unsubscribe from ${s.title}` : `Subscribe to ${s.title}`}
          accessibilityState={{ selected: props.subscribed }}
          hitSlop={SLOP_TILE}
          className={`items-center justify-center ${props.subscribed ? 'bg-line' : 'border-outline'}`}
          style={{ width: CATEGORY.tileCircle, height: CATEGORY.tileCircle, borderRadius: CATEGORY.tileCircle / 2, borderWidth: props.subscribed ? 0 : CATEGORY.tileCircleRing }}
        >
          <Icon name={props.subscribed ? 'checkmark' : 'add'} size={16} color={colour.text} />
        </Pressable>
      </Box>
    </Box>
  );
}

/** Every genre as a 3-column grid in a sheet; the current one light. A tap picks it and closes the sheet. */
export function AllCategoriesSheet(props: { open: boolean; genreId: number; onPick: (id: number) => void; onClose: () => void }): React.ReactElement {
  const rows: number[][] = [];
  for (let i = 0; i < GENRES.length; i += CATEGORY.gridCol) rows.push(GENRES.slice(i, i + CATEGORY.gridCol).map((g) => g.id));
  return (
    <ActionSheet open={props.open} onClose={props.onClose} label="All categories" title="All categories">
      <Box testID="all-categories" style={{ gap: CATEGORY.gridGap }}>
        {rows.map((ids) => (
          <Box key={ids.join('-')} className="flex-row" style={{ gap: CATEGORY.gridGap }}>
            {ids.map((id) => {
              const g = GENRES.find((x) => x.id === id)!;
              const on = id === props.genreId;
              return (
                <Pressable
                  key={id}
                  onPress={() => props.onPick(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={g.name}
                  className={`flex-1 items-center justify-center border ${on ? 'bg-text border-text' : 'bg-raise border-line'}`}
                  style={{ minHeight: CATEGORY.gridTile, borderRadius: CATEGORY.gridRadius, paddingHorizontal: spacing.hair + 2, gap: spacing.hair }}
                >
                  <Icon name={g.icon} size={18} color={on ? colour.void : colour.text} />
                  <Type step="chip" className={on ? 'text-void' : 'text-text'} numberOfLines={2} style={{ textAlign: 'center' }}>{g.name}</Type>
                </Pressable>
              );
            })}
            {ids.length < CATEGORY.gridCol ? Array.from({ length: CATEGORY.gridCol - ids.length }, (_, k) => <Box key={`pad-${k}`} className="flex-1" accessible={false} />) : null}
          </Box>
        ))}
      </Box>
    </ActionSheet>
  );
}
