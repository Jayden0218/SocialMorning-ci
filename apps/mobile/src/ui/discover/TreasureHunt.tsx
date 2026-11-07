// Treasure hunt on Discover: three lesser-heard episodes from shows you don't follow, with Shuffle.
/**
 * M21 US7 (T083). OUR OWN DESIGN (owner, 2026-10-06) — 小宇宙's behaviour here was never
 * observed in detail, so this is not a copy. The server picks 3 lesser-heard episodes a day from
 * shows the listener does not follow and did not turn down (`GET /v1/discover/hunt`); the same
 * three show all day. Shuffle asks for the next set. Each card opens the episode; Play plays it.
 * No data (offline, or nothing to offer) → no section, like every Discover section.
 *
 * M31 T030 (design-pulse2 `home--fold-b`, "Hunt"): the line "Three lesser-heard episodes…" (Geist 500 13,
 * text2) above a deck of cards 250 x 76 — the cover (52), the title, the show, a Play disc (36) — and a
 * "Shuffle" chip below the deck (36 tall, the loop mark, 28 from the left).
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useExploreApi, type Hunt } from '@/discover/explore-api';
import type { EpisodeCard } from '@/social/api';
import { DECK, Deck, DeckCard, DeckSection, DiscPlay, PX, useEdge } from './Deck';

/** Drawn: cards 250 x 76, the cover 52, Play 36; the Shuffle chip 36 tall. */
export const HUNT_CARD = { width: 250, height: 76, cover: 52, play: 36, chip: 36 } as const;

export function TreasureHunt(props: { onOpen: (card: EpisodeCard) => void; onPlay: (card: EpisodeCard) => void }): React.ReactElement | null {
  const api = useExploreApi();
  const edge = useEdge('Treasure hunt', 'Hunt');
  const [shuffle, setShuffle] = useState(0);
  const [hunt, setHunt] = useState<Hunt | undefined>();
  const [busy, setBusy] = useState(true);
  const load = useCallback((n: number) => {
    setBusy(true);
    api.hunt(n).then((h) => setHunt(h), () => { /* keep the last set; offline shows what was there */ }).finally(() => setBusy(false));
  }, [api]);
  useEffect(() => {
    api.hunt(0).then((h) => setHunt(h), () => { /* keep the last set; offline shows what was there */ }).finally(() => setBusy(false));
  }, [api]);
  if (!hunt || hunt.items.length === 0) return null;
  const again = (): void => { const n = shuffle + 1; setShuffle(n); load(n); };
  return (
    <DeckSection {...edge}>
      <Type step="caption" className="text-text2" style={{ marginLeft: DECK.lane, marginRight: spacing.section, marginBottom: spacing.gap }}>
        Three lesser-heard episodes from shows you don't follow. New ones every day.
      </Type>
      <Deck width={HUNT_CARD.width} height={HUNT_CARD.height}>
        {hunt.items.map((e) => (
          <DeckCard key={e.id}>
            <Box className="flex-1 flex-row items-center" style={{ paddingHorizontal: spacing.row, gap: PX.ten }}>
              <Pressable onPress={() => props.onOpen(e)} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.showTitle}`} className="flex-1 flex-row items-center min-w-0" style={{ gap: PX.ten }}>
                <Artwork url={e.imageUrl} size={HUNT_CARD.cover} name={e.showTitle} />
                <Box className="flex-1 min-w-0">
                  <Type step="compact" className="text-text font-bold" numberOfLines={1}>{e.title}</Type>
                  <Type step="caption" className="text-text2" numberOfLines={1}>{e.showTitle}</Type>
                </Box>
              </Pressable>
              <DiscPlay size={HUNT_CARD.play} title={e.title} onPress={() => props.onPlay(e)} />
            </Box>
          </DeckCard>
        ))}
      </Deck>
      <Pressable
        onPress={again}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Shuffle the treasure hunt"
        accessibilityState={{ disabled: busy }}
        hitSlop={6}
        className={`flex-row items-center self-start bg-raise border border-line rounded-pill ${busy ? 'opacity-40' : ''}`}
        style={{ marginLeft: DECK.lane, marginTop: PX.ten, height: HUNT_CARD.chip, paddingHorizontal: PX.fourteen, gap: PX.six }}
      >
        <Icon name="shuffle" size={16} color={colour.text} />
        <Type step="caption" className="text-text font-semibold">Shuffle</Type>
      </Pressable>
    </DeckSection>
  );
}
