/**
 * "Related episodes" at the end of the episode page (owner, 2026-10-01, after the 小宇宙 episode
 * page): M5's next-up answer (FR-008), at most 5 rows, each opening its episode. Too few to be
 * useful still says what fills it (M6 FR-019), as NextUp did here before.
 * M17 (`Episode-B`): the heading is the shared serif section title.
 */
import { Box } from '@/ui/lib/box';
import { SectionTitle } from '@/ui/discover/parts';
import { enoughNextUp } from '@socialmorning/social-core';
import { EmptyState } from '@/ui/EmptyState';
import { EpisodeRow } from '@/ui/EpisodeRow';
import type { EpisodeCard, NextUpItem } from '@/social/api';

export const RELATED_MAX = 5;

export function RelatedEpisodes(props: { items: readonly NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void }): React.ReactElement {
  const items = props.items && enoughNextUp(props.items) ? props.items.slice(0, RELATED_MAX) : undefined;
  return (
    <Box className="mt-section">
      <Box className="-mx-screen-x"><SectionTitle title="Related episodes" /></Box>
      {items === undefined ? <EmptyState surface="nextup" /> : items.map((i) => (
        <EpisodeRow key={i.episode.id} card={i.episode} line={i.label} label={`${i.episode.title}, ${i.episode.showTitle}. ${i.label}`} onPress={() => props.onOpen(i.episode)} />
      ))}
    </Box>
  );
}
