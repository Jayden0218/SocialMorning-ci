// Search with nothing sent yet: Recent, Try searching and Genres; and, while typing, the live suggestions.
/**
 * M31 T030 (design-pulse2 `search--screen`, `home--search-overlay`). Under edge labels, as in Discover:
 *   - Recent — the last searches as chips with a clock (14) and a "Clear" chip at the end;
 *   - Try — the admin's / the day's words as numbered tiles, two to a row, 56 tall (radius 18, raise, a line):
 *     the number in hot-text mono 13, the words Geist 600 14;
 *   - Genres — the first genres as a mosaic of 1 x 1 tiles 72 tall (radius 22, padding 14), each with its icon
 *     (22), its name, and a cover corner (64, rounded 18, 70 %) at the foot right; "Browse categories ›" under it.
 * Typing (`Suggestions`) lists, above the field: the term itself ("Search “…”"), up to four matching shows, then
 * names to search for — rows 52 tall with the typed part lit; a pasted feed address offers "Open feed …" first.
 *
 * Every action keeps its name: "Search for <word>", "Clear recent searches", "Browse categories", the genre's
 * name, "Open feed <url>", "Open <show>".
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter, radius, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { coverTone } from '@socialmorning/social-core';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { DECK, DeckLink, DeckSection, PX } from '@/ui/discover/Deck';
import { MOSAIC } from '@/ui/discover/DiscoverMosaic';
import { GENRES } from '@/discover/genres';
import { listSize } from '@/config/store';
import { recentSearches } from '@/search/history';
import type { ShowCard } from '@/social/api';
import { Marked } from './Marked';

/** The corner is the cover's own dark ink (the drawing paints a cover; a pastel square under the name made it hard to read). Drawn: a chip 36 tall; a Try tile 56 tall, 8 apart; a Genre tile 72 tall. */
const CHIP = 36;
const TRY = { height: 56, gap: 8 } as const;
const GENRE_ROW = 72;
const CORNER = { size: 64, overhang: -14, radius: 18, opacity: 0.6 } as const;
/** A suggestion row is 52 tall. */
const ROW = 52;

export function SearchHome(props: {
  history: readonly string[];
  tryThese: readonly string[];
  onSearch: (term: string) => void;
  onClear: () => void;
  onGenre: (id: number) => void;
  onBrowse: () => void;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  const side = { marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair };
  const recent = recentSearches(props.history);
  const genres = GENRES.slice(0, listSize('searchCategories'));
  return (
    <Box>
      {recent.length > 0 ? (
        <DeckSection label="Recent" spoken="Recent" bottom={20}>
          <Box className="flex-row flex-wrap" style={{ ...side, gap: spacing.gap }}>
            {recent.map((h) => (
              <Pressable key={h} onPress={() => props.onSearch(h)} accessibilityRole="button" accessibilityLabel={`Search for ${h}`} hitSlop={6} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: CHIP, paddingHorizontal: PX.fourteen, gap: PX.six }}>
                <Icon name="time-outline" size={14} color={colour.text} />
                <Type step="caption" className="text-text font-semibold" numberOfLines={1}>{h}</Type>
              </Pressable>
            ))}
            <Pressable onPress={props.onClear} accessibilityRole="button" accessibilityLabel="Clear recent searches" hitSlop={6} className="flex-row items-center bg-raise border border-line rounded-pill" style={{ height: CHIP, paddingHorizontal: PX.fourteen, gap: PX.six }}>
              <Icon name="close" size={14} color={colour.hotText} />
              <Type step="caption" className="text-hotText font-semibold">Clear</Type>
            </Pressable>
          </Box>
        </DeckSection>
      ) : null}
      {props.tryThese.length > 0 ? (
        <DeckSection label="Try" spoken="Try searching" bottom={20}>
          <Box className="flex-row flex-wrap" style={{ ...side, gap: TRY.gap }}>
            {props.tryThese.map((t, i) => (
              <Pressable
                key={t}
                onPress={() => props.onSearch(t)}
                accessibilityRole="button"
                accessibilityLabel={`Search for ${t}`}
                className="flex-row items-center bg-raise border border-line"
                style={{ width: '48.5%', height: TRY.height, borderRadius: radius.bar, paddingHorizontal: spacing.row, gap: spacing.gap }}
              >
                <Type step="caption" className="text-hotText font-mono">{String(i + 1)}</Type>
                <Type step="compact" className="flex-1 text-text" numberOfLines={1}>{t}</Type>
              </Pressable>
            ))}
          </Box>
        </DeckSection>
      ) : null}
      <DeckSection label="Genres" spoken="Categories">
        <Box style={{ ...side, gap: MOSAIC.gap }}>
          {rowsOf(genres).map((row, r) => (
            <Box key={r} className="flex-row" style={{ gap: MOSAIC.gap }}>
              {row.map((g, i) => g === undefined ? <Box key={`empty-${i}`} style={{ flex: 1, minWidth: 0 }} /> : (
                <Pressable
                  key={g.id}
                  onPress={() => props.onGenre(g.id)}
                  accessibilityRole="button"
                  accessibilityLabel={g.name}
                  className="bg-raise overflow-hidden"
                  style={{ flex: 1, minWidth: 0, height: GENRE_ROW, borderRadius: MOSAIC.radius }}
                >
                  <Box
                    pointerEvents="none"
                    style={{ position: 'absolute', right: CORNER.overhang, bottom: CORNER.overhang, width: CORNER.size, height: CORNER.size, borderRadius: CORNER.radius, opacity: CORNER.opacity, backgroundColor: coverTone(g.name).ink }}
                  />
                  {/* The icon and the name are 22 + 8 + 18 = 48 in a 44 box (72 less the padding): as drawn they run 4 into the padding, so they sit in a box that does not shrink. */}
                  <Box style={{ gap: spacing.gap, flexShrink: 0, padding: MOSAIC.pad }}>
                    <Icon name={g.icon} size={22} color={colour.text} />
                    <Type step="caption" className="text-text" numberOfLines={1}>{g.name}</Type>
                  </Box>
                </Pressable>
              ))}
            </Box>
          ))}
        </Box>
        <DeckLink label="Browse categories" onPress={props.onBrowse} />
      </DeckSection>
    </Box>
  );
}

/** Items two to a row; an odd last row keeps its empty cell so every tile has one width. */
function rowsOf<T>(items: readonly T[]): (T | undefined)[][] {
  const out: (T | undefined)[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push([items[i], items[i + 1]]);
  return out;
}

/** While typing: the term, matching shows, then names to search for; a feed address opens as a feed. */
export function Suggestions(props: {
  term: string;
  isFeed: boolean;
  shows: readonly ShowCard[];
  names: readonly string[];
  onSearch: (term: string) => void;
  onShow: (feedUrl: string) => void;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  const lane = { marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair };
  const row = 'flex-row items-center border-b-hairline border-line';
  if (props.isFeed) {
    return (
      <Box style={lane}>
        <Pressable className={row} style={{ minHeight: ROW, gap: spacing.row }} accessibilityRole="button" accessibilityLabel={`Open feed ${props.term}`} onPress={() => props.onShow(props.term)}>
          <Icon name="link-outline" size={20} color={colour.hotText} />
          <Type step="row" className="text-hotText flex-1" numberOfLines={1}>Open feed {props.term}</Type>
        </Pressable>
      </Box>
    );
  }
  return (
    <Box style={lane}>
      <Pressable onPress={() => props.onSearch(props.term)} accessibilityRole="button" accessibilityLabel={`Search for ${props.term}`} className={row} style={{ minHeight: ROW, gap: spacing.row }}>
        <Icon name="search-outline" size={20} color={colour.hotText} />
        <Type step="row" className="text-hotText flex-1" numberOfLines={1}>{`Search “${props.term}”`}</Type>
      </Pressable>
      {props.shows.map((s) => (
        <Pressable key={s.feedUrl} onPress={() => props.onShow(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`Open ${s.title}`} className={row} style={{ minHeight: ROW, gap: spacing.row }}>
          <Artwork url={s.imageUrl} size={36} name={s.title} />
          <Box className="flex-1 min-w-0"><Marked text={s.title} term={props.term} step="row" /></Box>
        </Pressable>
      ))}
      {props.names.map((name, i) => (
        <Pressable key={`${i}\u0001${name}`} onPress={() => props.onSearch(name)} accessibilityRole="button" accessibilityLabel={`Search for ${name}`} className={row} style={{ minHeight: ROW, gap: spacing.row }}>
          <Icon name="search-outline" size={20} color={colour.text3} />
          <Box className="flex-1 min-w-0"><Marked text={name} term={props.term} step="row" /></Box>
        </Pressable>
      ))}
    </Box>
  );
}
