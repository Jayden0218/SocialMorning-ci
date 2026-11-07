// What listeners said and New arrivals on Discover, as decks.
/**
 * M31 T030 (design-pulse2 `home--fold-b`, "Said", "New"):
 *  - What listeners said: cards 240 x 130 — the comment in Unbounded (2 lines), and at the foot the episode
 *    it was said on, who/when ("A listener · 5 h ago" — Discover never names a listener, M5 guard G6) and a
 *    Play disc (36); a card opens the episode;
 *  - New arrivals: cards 230 x 72 — the cover (48), the episode's show, "New show · 3 episodes", and a bare
 *    Play glyph; a card opens the episode.
 *
 * Not as drawn (gate log): the drawing's moment chip ("06:10") is the time the comment was posted ("5 h ago")
 * — a Discover comment carries no position in the episode; Said's card has a Play disc and New's a Play glyph
 * the drawing leaves off (the old rows had Play; the action stays); the comment is cut at 2 lines (all of it
 * is the card's spoken name).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { plural } from '@socialmorning/social-core';
import { ago } from '@/discover/sections';
import type { EpisodeCard, SaidItem, ShowCard } from '@/social/api';
import { DECK, UNBOUNDED, Deck, DeckCard, DeckSection, DiscPlay, PX, PlayGlyph, useEdge } from './Deck';
import type { Act } from './sections-common';

export const SAID_CARD = { width: 240, height: 130, play: 36 } as const;
export const NEW_CARD = { width: 230, height: 72, cover: 48 } as const;

/**
 * What listeners said — recent comments, each with its episode. No names: Discover never
 * names a listener (M5 guard G6), so a card says "A listener".
 */
export function SaidSection(props: Act & { items: SaidItem[]; now: number }): React.ReactElement | null {
  const edge = useEdge('What listeners said', 'Said');
  if (props.items.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={SAID_CARD.width} height={SAID_CARD.height}>
        {props.items.map((s) => (
          <DeckCard key={s.commentId}>
            <Pressable
              onPress={() => props.onOpen(s.episode)}
              accessibilityRole="button"
              accessibilityLabel={`${s.episode.title}, ${s.episode.showTitle}. A listener said: ${s.body}`}
              className="flex-1"
              style={{ padding: DECK.pad, gap: spacing.gap }}
            >
              <Type step="lede" className="text-text font-semibold" style={UNBOUNDED[15]} numberOfLines={3}>{`“${s.body}”`}</Type>
            </Pressable>
            <Box className="flex-row items-center" style={{ paddingHorizontal: DECK.pad, paddingBottom: DECK.pad, gap: spacing.gap }}>
              <Box className="flex-1 min-w-0">
                <Type step="caption" className="text-text2" numberOfLines={1}>{s.episode.title}</Type>
                <Type step="tag" className="text-text3" numberOfLines={1}>{`A listener · ${ago(s.createdAt, props.now)}`}</Type>
              </Box>
              <DiscPlay size={SAID_CARD.play} title={s.episode.title} onPress={() => props.onPlay(s.episode)} />
            </Box>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}

/** Owner, 2026-10-05 — "New arrivals": the newest shows made here, each with its latest episode. */
export function NewArrivalsSection(props: Act & { items: { show: ShowCard; episode: EpisodeCard }[] }): React.ReactElement | null {
  const edge = useEdge('New arrivals', 'New');
  if (props.items.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={NEW_CARD.width} height={NEW_CARD.height}>
        {props.items.map((n) => (
          <DeckCard key={n.episode.id}>
            <Box className="flex-1 flex-row items-center" style={{ paddingHorizontal: spacing.row, gap: PX.ten }}>
              <Pressable
                onPress={() => props.onOpen(n.episode)}
                accessibilityRole="button"
                accessibilityLabel={`${n.episode.title}, ${n.episode.showTitle}`}
                className="flex-1 flex-row items-center min-w-0"
                style={{ gap: PX.ten }}
              >
                <Artwork url={n.episode.imageUrl} size={NEW_CARD.cover} name={n.episode.showTitle} />
                <Box className="flex-1 min-w-0">
                  <Type step="compact" className="text-text font-bold" numberOfLines={1}>{n.show.title}</Type>
                  <Type step="caption" className="text-text2" numberOfLines={1}>{n.show.episodeCount !== undefined ? `New show · ${plural(n.show.episodeCount, 'episode')}` : 'New show'}</Type>
                </Box>
              </Pressable>
              <PlayGlyph title={n.episode.title} onPress={() => props.onPlay(n.episode)} />
            </Box>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}
