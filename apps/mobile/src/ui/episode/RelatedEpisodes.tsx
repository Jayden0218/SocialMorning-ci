// Up to 5 related episodes at the bottom of the episode page, as a sideways deck of cards.
/**
 * "Related episodes" at the end of the episode page (owner, 2026-10-01, after the 小宇宙 episode
 * page): M5's next-up answer (FR-008), at most 5, each opening its episode. Too few to be
 * useful still says what fills it (M6 FR-019), as NextUp did here before.
 *
 * M31 W3-A (T040; design-pulse2 `episode--screen` "Related", `episode--related-empty`): a Deck of 200 wide cards (raise,
 * radius 20): the cover 90 tall across the top, the title Geist 600 13 under it, and the reason in mono 11, hot-text, in
 * capitals ("LISTENERS ALSO PLAYED"); a long-press opens the Details sheet (`onMore`), as before. The page names the section
 * with the edge label, so the "Related episodes" heading is gone. With nothing to suggest the deck is the dashed empty card
 * with today's line ("Nothing to suggest yet — play something and come back.").
 */
import { Box } from '@/ui/lib/box';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { enoughNextUp, EMPTY_STATES } from '@socialmorning/social-core';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import type { EpisodeCard, NextUpItem } from '@/social/api';
import { EmptyDeck } from './EmptyDeck';
import { EPISODE } from './measures';

export const RELATED_MAX = 5;
/** A card's width. */
export const RELATED_CARD = EPISODE.relatedCard.width;
const CAPS = { textTransform: 'uppercase' as const };

export function RelatedEpisodes(props: { items: readonly NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void; onMore?: (card: EpisodeCard) => void }): React.ReactElement {
  const items = props.items && enoughNextUp(props.items) ? props.items.slice(0, RELATED_MAX) : undefined;
  // The deck bleeds to the right edge, but the empty card keeps the section's 16 margin (the drawing's card ends there).
  if (items === undefined) return <Box style={{ marginRight: EPISODE.right }}><EmptyDeck title="Nothing to suggest" sentence={EMPTY_STATES.nextup.sentence} /></Box>;
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={items}
      keyExtractor={(i) => i.episode.id}
      contentContainerClassName="pr-screen-x"
      contentContainerStyle={{ gap: EPISODE.deckGap }}
      renderItem={({ item: i }) => (
        <Pressable
          onPress={() => props.onOpen(i.episode)}
          {...(props.onMore ? { onLongPress: () => props.onMore!(i.episode), accessibilityHint: 'Long-press for more actions' } : {})}
          accessibilityRole="button"
          accessibilityLabel={`${i.episode.title}, ${i.episode.showTitle}. ${i.label}`}
          className="bg-raise overflow-hidden"
          style={{ width: EPISODE.relatedCard.width, borderRadius: EPISODE.relatedCard.radius }}
        >
          <Box testID="related-cover" className="overflow-hidden" style={{ height: EPISODE.relatedCard.cover }} accessible={false} importantForAccessibility="no-hide-descendants">
            <Box style={{ marginTop: -(EPISODE.relatedCard.width - EPISODE.relatedCard.cover) / 2 }}>
              <Artwork url={i.episode.imageUrl} size={EPISODE.relatedCard.width} name={i.episode.showTitle} />
            </Box>
          </Box>
          <Box className="p-row gap-hair">
            <Type step="caption" className="text-text font-semibold" numberOfLines={2}>{i.episode.title}</Type>
            {i.label ? <Type step="tag" className="text-hotText" style={CAPS} numberOfLines={2}>{i.label}</Type> : null}
          </Box>
        </Pressable>
      )}
    />
  );
}
