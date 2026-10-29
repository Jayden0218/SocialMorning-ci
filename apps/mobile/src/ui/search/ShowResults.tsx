// Search results for shows: a mosaic (Shows tab) and a deck of small cards (All tab).
/**
 * M31 T030 (design-pulse2 `search--results`, `search--results-episodes`).
 *  - `ShowMosaic` (the Shows tab): two columns 10 apart from the 28 lane; the best match is a 2 x 2 tile (178
 *    tall) with the cover (120), "BEST MATCH" in mono, the title in Unbounded 18 and the author, and the
 *    Subscribe button (34, light; "Subscribed" is quiet with a line) at the foot; the others are 1 x 2 tiles
 *    with the cover (52), the title on one line, the author and the same button. Tiles are radius 22, raise,
 *    padding 14. The typed part of every title is lit.
 *  - F2a: a show name is one line with an ellipsis in the deck and the 1 x 2 tiles (drawn `ell(…)`), as the drawing has it.
 *  - `ShowDeck` (the All tab): cards 150 x 150 — the cover (64), the title, the author; "More shows ›" under it
 *    switches to the Shows tab.
 * A tile opens the show; the button toggles the subscription (the show page's own toggle, a local write first).
 * "in your library" follows the author when the phone already has the show.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { DECK, Deck, DeckCard, DeckLink, DeckSection, PX } from '@/ui/discover/Deck';
import { MOSAIC } from '@/ui/discover/DiscoverMosaic';
import type { ShowCard } from '@/social/api';
import { Marked } from './Marked';

/** Drawn: tiles are 2 rows (178) tall; the best match's cover 120, the others' 52; the button 34. */
const TILE = { height: MOSAIC.row * 2 + MOSAIC.gap, best: 120, cover: 52, button: 34 } as const;
export const SHOW_DECK_CARD = { width: 150, height: 150, cover: 64 } as const;

export type ShowActions = {
  isSubscribed: (feedUrl: string) => boolean;
  inLibrary: (feedUrl: string) => boolean;
  onOpen: (feedUrl: string) => void;
  onToggle: (feedUrl: string) => void;
};

function byline(s: ShowCard, a: ShowActions): string {
  return `${s.author}${a.inLibrary(s.feedUrl) ? ' · in your library' : ''}`;
}

function SubscribeButton(props: { show: ShowCard; actions: ShowActions }): React.ReactElement {
  const on = props.actions.isSubscribed(props.show.feedUrl);
  return (
    <Pressable
      onPress={() => props.actions.onToggle(props.show.feedUrl)}
      accessibilityRole="button"
      accessibilityLabel={on ? `Unsubscribe from ${props.show.title}` : `Subscribe to ${props.show.title}`}
      accessibilityState={{ selected: on }}
      hitSlop={(48 - TILE.button) / 2}
      className={`self-start justify-center rounded-pill ${on ? 'bg-raise border border-line' : 'bg-text'}`}
      style={{ height: TILE.button, paddingHorizontal: spacing.row }}
    >
      <Type step="caption" className={on ? 'text-text font-semibold' : 'text-void font-semibold'}>{on ? 'Subscribed' : 'Subscribe'}</Type>
    </Pressable>
  );
}

function ShowTile(props: { show: ShowCard; term: string; best: boolean; actions: ShowActions }): React.ReactElement {
  const { show: s, actions } = props;
  // The padding is on an inner box, not on the tile: a tile's `flex: 1` share is measured from its own padding
  // (border-box), so a last tile alone in its row came out 28 wider than the empty cell beside it (found by the T030 capture).
  return (
    <Box className="bg-raise" style={{ flex: props.best ? undefined : 1, minWidth: 0, height: TILE.height, borderRadius: MOSAIC.radius, overflow: 'hidden' }}>
      {props.best ? (
        <Box className="flex-row flex-1" style={{ padding: MOSAIC.pad, gap: PX.fourteen }}>
          <Pressable onPress={() => actions.onOpen(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}`}>
            <Artwork url={s.imageUrl} size={TILE.best} rounded="artworkLarge" name={s.title} />
          </Pressable>
          <Box className="flex-1 min-w-0" style={{ gap: PX.six }}>
            <Type step="tag" className="text-hotText">BEST MATCH</Type>
            <Marked text={s.title} term={props.term} step="lede" bold lines={3} />
            <Type step="caption" className="text-text2" numberOfLines={1}>{byline(s, actions)}</Type>
            <Box className="mt-auto"><SubscribeButton show={s} actions={actions} /></Box>
          </Box>
        </Box>
      ) : (
        <Box className="flex-1" style={{ padding: MOSAIC.pad, gap: spacing.gap }}>
          <Pressable onPress={() => actions.onOpen(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}`} style={{ gap: spacing.gap }}>
            <Artwork url={s.imageUrl} size={TILE.cover} name={s.title} />
            <Marked text={s.title} term={props.term} step="compact" bold lines={1} />
            <Type step="caption" className="text-text2" numberOfLines={1}>{byline(s, actions)}</Type>
          </Pressable>
          <Box className="mt-auto"><SubscribeButton show={s} actions={actions} /></Box>
        </Box>
      )}
    </Box>
  );
}

/** The Shows tab: the best match first, 2 x 2, then the rest two to a row. */
export function ShowMosaic(props: { shows: readonly ShowCard[]; term: string; actions: ShowActions }): React.ReactElement {
  const { width } = useWindowDimensions();
  const [best, ...rest] = props.shows;
  const rows: ShowCard[][] = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
  return (
    <Box style={{ marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair, gap: MOSAIC.gap }}>
      {best ? <ShowTile show={best} term={props.term} best actions={props.actions} /> : null}
      {rows.map((row, r) => (
        <Box key={r} className="flex-row" style={{ gap: MOSAIC.gap }}>
          {row.map((s) => <ShowTile key={s.feedUrl} show={s} term={props.term} best={false} actions={props.actions} />)}
          {row.length < 2 ? <Box style={{ flex: 1, minWidth: 0 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** The All tab's Shows: a deck of small cards and a "More shows ›" line when the tab has more. */
export function ShowDeck(props: { shows: readonly ShowCard[]; term: string; actions: ShowActions; more: boolean; onMore: () => void }): React.ReactElement | null {
  if (props.shows.length === 0) return null;
  return (
    <DeckSection label="Shows" bottom={spacing.section}>
      <Deck width={SHOW_DECK_CARD.width} height={SHOW_DECK_CARD.height}>
        {props.shows.map((s) => (
          <DeckCard key={s.feedUrl}>
            <Pressable onPress={() => props.actions.onOpen(s.feedUrl)} accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.author}`} className="flex-1" style={{ padding: spacing.row, gap: spacing.gap }}>
              <Artwork url={s.imageUrl} size={SHOW_DECK_CARD.cover} name={s.title} />
              <Marked text={s.title} term={props.term} step="compact" bold lines={1} />
              <Type step="caption" className="text-text2" numberOfLines={1}>{byline(s, props.actions)}</Type>
            </Pressable>
          </DeckCard>
        ))}
      </Deck>
      {props.more ? <DeckLink label="More shows" onPress={props.onMore} /> : null}
    </DeckSection>
  );
}
