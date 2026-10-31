// Editor's picks on Discover: a deck of cards, each with its note, counts, add-to-queue and Play.
/**
 * M31 T030 (design-pulse2 `home--fold-a`, "Picks"). The mosaic at the top of the page shows the first
 * pick as its tile; this deck lists every pick under the edge label "Picks": cards 270 x 220, a cover
 * (64) with the show and the title (Unbounded) in the first row, the owner's note in italics, and at the
 * foot the counts in mono 11 with "+" and Play (38). "Today's picks, with every note ›" under the deck
 * opens /picks/daily; "Past picks →" is in the pick tile (drawn there, not repeated here).
 *
 * Kept from before: the cover and the title both open the episode, "+" adds it to the queue, Play plays
 * it, the counts, and up to three faces of people you follow who liked it (M21) as one line above the foot.
 * Not as drawn: the title is Unbounded 18 (the scale has no 16) — gate log.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { compactCount } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { spacing } from '@/design';
import type { DiscoverItem, EpisodeCard } from '@/social/api';
import type { Face } from '@/discover/explore-api';
import { DECK, UNBOUNDED, Deck, DeckCard, DeckLink, DeckSection, DiscPlay, RingAdd } from './Deck';
import { shortDate, type Act } from './sections-common';

export { shortDate };

/** Drawn: cards 270 x 220, the cover 64, "+" and Play 38. */
export const PICK_CARD = { width: 270, height: 220, cover: 64, button: 38 } as const;

/** M21: up to 3 faces of people you follow who liked a pick, overlapping, with who in words. */
function Faces(props: { faces: Face[] }): React.ReactElement | null {
  if (props.faces.length === 0) return null;
  const names = props.faces.map((f) => f.displayName);
  const words = names.length === 1 ? `${names[0]} liked this` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} liked this`;
  return (
    <Box className="flex-row items-center gap-gap" style={{ paddingHorizontal: DECK.pad }} accessible accessibilityLabel={words}>
      <Box className="flex-row">
        {props.faces.map((f, n) => <Avatar key={f.id} size={20} url={f.avatarUrl} name={f.displayName} className={n > 0 ? '-ml-gap' : ''} />)}
      </Box>
      <Type step="tag" className="flex-1 text-text3" numberOfLines={1}>{words}</Type>
    </Box>
  );
}

export function PicksSection(props: Act & { items: (DiscoverItem & { likedBy?: Face[] })[]; date?: string; onPast?: () => void; onQueue: (card: EpisodeCard) => void; /** M21: "Today's picks" page. */ onDaily?: () => void }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  return (
    <DeckSection label="Picks" spoken={props.date ? `Editor's pick · ${shortDate(props.date)}` : "Editor's pick"}>
      <Deck width={PICK_CARD.width} height={PICK_CARD.height}>
        {props.items.map((p) => {
          const stats = p.stats ?? props.stats?.[p.episode.id];
          const e = p.episode;
          return (
            <DeckCard key={p.key}>
              <Box className="flex-row items-center" style={{ padding: DECK.pad, gap: spacing.row }}>
                <Pressable onPress={() => props.onOpen(e)} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.showTitle}`}>
                  <Artwork url={e.imageUrl} size={PICK_CARD.cover} name={e.showTitle} />
                </Pressable>
                <Pressable onPress={() => props.onOpen(e)} accessibilityRole="button" accessibilityLabel={`Open ${e.title}`} className="flex-1 min-w-0">
                  <Type step="caption" className="text-text2" numberOfLines={1}>{e.showTitle}</Type>
                  <Type step="lede" className="text-text font-bold" style={UNBOUNDED[16]} numberOfLines={2}>{e.title}</Type>
                </Pressable>
              </Box>
              {p.why ? <Type step="quote" className="text-quote italic" style={{ paddingHorizontal: DECK.pad }} numberOfLines={2}>{`“${p.why}”`}</Type> : null}
              {p.likedBy ? <Faces faces={p.likedBy} /> : null}
              <Box className="flex-row items-center mt-auto" style={{ padding: DECK.pad, gap: spacing.gap }}>
                {stats ? (
                  <Type step="tag" className="flex-1 text-text3" numberOfLines={1}>{`${compactCount(stats.listeners)} listened`}</Type>
                ) : <Box className="flex-1" />}
                <RingAdd size={PICK_CARD.button} title={e.title} onPress={() => props.onQueue(e)} />
                <DiscPlay size={PICK_CARD.button} title={e.title} onPress={() => props.onPlay(e)} />
              </Box>
            </DeckCard>
          );
        })}
      </Deck>
      {props.onDaily ? <DeckLink label="Today's picks, with every note" onPress={props.onDaily} /> : null}
    </DeckSection>
  );
}
