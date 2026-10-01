/**
 * "Related episodes" at the end of the episode page (owner, 2026-10-01, after the 小宇宙 episode
 * page): M5's next-up answer (FR-008), at most 5 rows, each opening its episode. Too few to be
 * useful still says what fills it (M6 FR-019), as NextUp did here before.
 */
import { Box } from '../lib/box';
import { Text } from '../lib/text';
import { enoughNextUp } from '@socialmorning/social-core';
import { EmptyState } from '../EmptyState';
import { EpisodeRow } from '../EpisodeRow';
import type { EpisodeCard, NextUpItem } from '../../social/api';

export const RELATED_MAX = 5;

export function RelatedEpisodes(props: { items: readonly NextUpItem[] | undefined; onOpen: (card: EpisodeCard) => void }): React.ReactElement {
  const items = props.items && enoughNextUp(props.items) ? props.items.slice(0, RELATED_MAX) : undefined;
  return (
    <Box className="mt-section">
      <Text className="text-[18px] font-semibold mb-1 text-text" accessibilityRole="header">Related episodes</Text>
      {items === undefined ? <EmptyState surface="nextup" /> : items.map((i) => (
        <EpisodeRow key={i.episode.id} card={i.episode} line={i.label} label={`${i.episode.title}, ${i.episode.showTitle}. ${i.label}`} onPress={() => props.onOpen(i.episode)} />
      ))}
    </Box>
  );
}
