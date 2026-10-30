// Up to 5 related episodes at the bottom of the episode page, as a sideways row of cards.
/**
 * "Related episodes" at the end of the episode page (owner, 2026-10-01, after the 小宇宙 episode
 * page): M5's next-up answer (FR-008), at most 5, each opening its episode. Too few to be
 * useful still says what fills it (M6 FR-019), as NextUp did here before.
 * M17 (`Episode-B`): the heading is the shared serif section title.
 *
 * M21 US4 (FR-032): a sideways row of cards (cover, serif title, show, the reason) instead of a
 * list; a long-press asks the page for the shared episode sheet (`onMore`).
 */
import { Box } from '@/ui/lib/box';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { SectionTitle } from '@/ui/discover/parts';
import { enoughNextUp } from '@socialmorning/social-core';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Artwork } from '@/ui/kit/Artwork';
import type { EpisodeCard, NextUpItem } from '@/social/api';

export const RELATED_MAX = 5;
/** A card's width: the cover, with its words under it. */
export const RELATED_CARD = 148;

export function RelatedEpisodes(props: { items: readonly NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void; onMore?: (card: EpisodeCard) => void }): React.ReactElement {
  const items = props.items && enoughNextUp(props.items) ? props.items.slice(0, RELATED_MAX) : undefined;
  return (
    <Box className="mt-section">
      <Box className="-mx-screen-x"><SectionTitle title="Related episodes" /></Box>
      {items === undefined ? <EmptyState surface="nextup" /> : (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={items}
          keyExtractor={(i) => i.episode.id}
          className="-mx-screen-x"
          contentContainerClassName="px-screen-x gap-row"
          renderItem={({ item: i }) => (
            <Pressable
              onPress={() => props.onOpen(i.episode)}
              {...(props.onMore ? { onLongPress: () => props.onMore!(i.episode), accessibilityHint: 'Long-press for more actions' } : {})}
              accessibilityRole="button"
              accessibilityLabel={`${i.episode.title}, ${i.episode.showTitle}. ${i.label}`}
              className="bg-surface border border-border rounded-row p-2 gap-1"
              style={{ width: RELATED_CARD }}
            >
              <Artwork url={i.episode.imageUrl} size={RELATED_CARD - 16} name={i.episode.showTitle} />
              <Text className="text-text text-body font-display-semibold" numberOfLines={2}>{i.episode.title}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{i.episode.showTitle}</Text>
              {i.label ? <Text className="text-accent text-xs" numberOfLines={2}>{i.label}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </Box>
  );
}
