// Search results for episodes: cards in a deck (All tab) or one under another (Episodes tab).
/**
 * M31 T030 (design-pulse2 `search--results-episodes`). A card is 270 x 170: the cover (60), "<show> · In your
 * library" in the caption and the title in Unbounded with the typed part lit, a "···" at the right (the episode
 * sheet); at the foot the counts ("12 listened · 3 comments", mono 11) and the Play disc (38). The card opens
 * the episode. The All tab holds them in a deck with "More episodes ›" under it; the Episodes tab stacks them,
 * one under another, as wide as the page allows (the drawing shows only the All tab's deck).
 *
 * Not as drawn: the foot's curve is the counts line — a search result carries no heat, and a request each
 * would cost one call per card.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { compactCount, pluralCompact } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { DECK, UNBOUNDED, Deck, DeckCard, DeckLink, DeckSection, DiscPlay } from '@/ui/discover/Deck';
import type { EpisodeCard } from '@/social/api';
import type { RichEpisode } from '@/discover/explore-api';
import { Marked } from './Marked';

export const EPISODE_CARD = { width: 270, height: 170, cover: 60, play: 38 } as const;

export type EpisodeActions = {
  inLibrary: (id: string) => boolean;
  onOpen: (e: EpisodeCard) => void;
  onPlay: (e: EpisodeCard) => void;
  onMore: (e: EpisodeCard) => void;
};

function EpisodeResultCard(props: { episode: RichEpisode; term: string; actions: EpisodeActions }): React.ReactElement {
  const e = props.episode;
  const mine = props.actions.inLibrary(e.id);
  const stats = e.stats;
  return (
    <DeckCard>
      <Box className="flex-row items-start flex-1" style={{ padding: DECK.pad, gap: spacing.row }}>
        <Pressable
          onPress={() => props.actions.onOpen(e)}
          accessibilityRole="button"
          accessibilityLabel={`${e.title}, ${e.showTitle}${mine ? '. In your library' : ''}`}
          className="flex-1 flex-row items-start min-w-0"
          style={{ gap: spacing.row }}
        >
          <Artwork url={e.imageUrl} size={EPISODE_CARD.cover} name={e.showTitle} />
          <Box className="flex-1 min-w-0">
            <Marked text={mine ? `${e.showTitle} · In your library` : e.showTitle} term={props.term} step="caption" tone="text2" />
            <Marked text={e.title} term={props.term} step="lede" bold lines={3} style={UNBOUNDED[16]} />
          </Box>
        </Pressable>
        <Pressable onPress={() => props.actions.onMore(e)} accessibilityRole="button" accessibilityLabel={`More for ${e.title}`} hitSlop={spacing.row} className="items-center justify-center">
          <Icon name="ellipsis-horizontal" size={20} color={colour.text2} />
        </Pressable>
      </Box>
      <Box className="flex-row items-center" style={{ paddingHorizontal: DECK.pad, paddingBottom: DECK.pad, gap: spacing.gap }}>
        {stats ? (
          <Type step="tag" className="flex-1 text-text3" numberOfLines={1}>{`${compactCount(stats.listeners)} listened · ${pluralCompact(stats.comments, 'comment')}`}</Type>
        ) : <Box className="flex-1" />}
        <DiscPlay size={EPISODE_CARD.play} title={e.title} onPress={() => props.actions.onPlay(e)} />
      </Box>
    </DeckCard>
  );
}

/** The All tab's Episodes: a deck, and "More episodes ›" when the Episodes tab has more. */
export function EpisodeDeck(props: { episodes: readonly RichEpisode[]; term: string; actions: EpisodeActions; more: boolean; onMore: () => void }): React.ReactElement | null {
  if (props.episodes.length === 0) return null;
  return (
    <DeckSection label="Episodes" bottom={spacing.section}>
      <Deck width={EPISODE_CARD.width} height={EPISODE_CARD.height}>
        {props.episodes.map((e) => <EpisodeResultCard key={`${e.feedUrl}\u0001${e.guid}`} episode={e} term={props.term} actions={props.actions} />)}
      </Deck>
      {props.more ? <DeckLink label="More episodes" onPress={props.onMore} /> : null}
    </DeckSection>
  );
}

/** The Episodes tab: the same cards, one under another. */
export function EpisodeList(props: { episodes: readonly RichEpisode[]; term: string; actions: EpisodeActions }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <Box style={{ marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair, gap: DECK.gap }}>
      {props.episodes.map((e) => (
        <Box key={`${e.feedUrl}\u0001${e.guid}`}>
          <EpisodeResultCard episode={e} term={props.term} actions={props.actions} />
        </Box>
      ))}
    </Box>
  );
}
