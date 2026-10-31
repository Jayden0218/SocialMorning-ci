// For You on Discover: a deck of recommendation cards, each with a cover, the reason and a Play disc.
/**
 * M31 T030 (design-pulse2 `home--fold-a`, "For you"; `home--hidden-undo`). Cards 250 x 290: the cover
 * cut to a band 120 tall with a "···" (36, glass) on it that opens the Not interested sheet (signed in
 * only), then the show (caption), the title (Unbounded), the reason in hot-text, and at the foot the
 * heat curve (20 tall) and the Play disc (40). The card opens the episode and tells the outbox which
 * slot was opened (`onOpenAt`, the impressions). "Not liking these? ›" is under the deck
 * (`RecFeedbackLink`, the caller draws it).
 *
 * A card the listener just turned down stays in its slot as the dashed Hidden card (`hidden`: where it
 * was, what was hidden, Undo) for the caller's 8 s, then the slot closes. Not as drawn: the deck does
 * not slide left over 240 ms when the slot closes; and a curve is read only for the first two cards (a
 * request each, and only those are in view), the rest show the flat line — gate log.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import type { EpisodeCard } from '@/social/api';
import type { DismissalKind } from '@/social/profile-api';
import { CoverBand, DECK, UNBOUNDED, Deck, DeckCard, DeckSection, DiscPlay, useEdge } from './Deck';
import { HiddenNotice } from './NotInterested';
import { useEpisodeHeat } from './useEpisodeHeat';
import type { Act } from './sections-common';

/** Drawn: cards 250 x 290, the cover band 120, the "···" 36, Play 40, the curve 20 tall. */
export const FOR_YOU_CARD = { width: 250, height: 290, cover: 120, more: 36, play: 40, curve: 20, bars: 26 } as const;
/** The "···" is drawn 36; 6 of slop on each side makes it 48 to touch. The body's lines are 6 apart. */
const MORE_SLOP = 6;
const BODY_GAP = 6;
/** Cards that read their curve (the ones in view). */
const HEAT_CARDS = 2;
const NO_HEAT: readonly number[] = [];

export type HiddenSlot = { /** Where the card was in the deck. */ at: number; kind: DismissalKind; onUndo: () => void };
type Row = { card: EpisodeCard; line: string; index: number };

function ForYouCard(props: Act & { row: Row; position: number; onOpenAt: (card: EpisodeCard, index: number) => void; onMore?: (card: EpisodeCard) => void }): React.ReactElement {
  const { card, line, index } = props.row;
  const heat = useEpisodeHeat(card.id, props.position < HEAT_CARDS);
  return (
    <DeckCard>
      <Pressable
        onPress={() => props.onOpenAt(card, index)}
        accessibilityRole="button"
        accessibilityLabel={`${card.title}, ${card.showTitle}. ${line}`}
        className="flex-1"
      >
        <CoverBand url={card.imageUrl} name={card.showTitle} height={FOR_YOU_CARD.cover} />
        <Box className="flex-1" style={{ paddingHorizontal: DECK.pad, paddingTop: spacing.row, gap: BODY_GAP }}>
          <Type step="caption" className="text-text2" numberOfLines={1}>{card.showTitle}</Type>
          <Type step="lede" className="text-text font-bold" style={UNBOUNDED[17]} numberOfLines={2}>{card.title}</Type>
          <Type step="caption" className="text-hotText" numberOfLines={1}>{line}</Type>
        </Box>
      </Pressable>
      <Box className="flex-row items-center" style={{ paddingHorizontal: DECK.pad, paddingBottom: spacing.row, gap: spacing.gap }}>
        <Box className="flex-1">
          <Curve data={heat.buckets ?? NO_HEAT} count={FOR_YOU_CARD.bars} height={FOR_YOU_CARD.curve} min={2} flat={heat.buckets === undefined} played={0} />
        </Box>
        <DiscPlay size={FOR_YOU_CARD.play} title={card.title} onPress={() => props.onPlay(card)} />
      </Box>
      {props.onMore ? (
        <Pressable
          onPress={() => props.onMore?.(card)}
          accessibilityRole="button"
          accessibilityLabel={`More for ${card.title}`}
          hitSlop={MORE_SLOP}
          className="absolute items-center justify-center bg-glassDark"
          style={{ right: spacing.gap, top: spacing.gap, width: FOR_YOU_CARD.more, height: FOR_YOU_CARD.more, borderRadius: FOR_YOU_CARD.more / 2 }}
        >
          <Icon name="ellipsis-horizontal" size={18} color={colour.text} />
        </Pressable>
      ) : null}
    </DeckCard>
  );
}

/** For You — a deck of cards; the owner's rename of the section is the edge label. */
export function ForYouSection(props: Act & { rows: Row[]; onOpenAt: (card: EpisodeCard, index: number) => void; /** M19 T021: the card's "···" (Not interested). */ onMore?: (card: EpisodeCard) => void; /** A card just hidden: its slot, drawn as the dashed Hidden card with Undo. */ hidden?: HiddenSlot; /** Drawn under the deck (the "Not liking these?" line). */ footer?: React.ReactNode }): React.ReactElement | null {
  const edge = useEdge('For You', 'For you');
  if (props.rows.length === 0 && !props.hidden) return null;
  const cards: React.ReactNode[] = props.rows.map((row, position) => (
    <ForYouCard
      key={row.card.id}
      row={row}
      position={position}
      onOpen={props.onOpen}
      onPlay={props.onPlay}
      onOpenAt={props.onOpenAt}
      {...(props.stats ? { stats: props.stats } : {})}
      {...(props.onMore ? { onMore: props.onMore } : {})}
    />
  ));
  if (props.hidden) cards.splice(Math.min(props.hidden.at, cards.length), 0, <HiddenNotice key="hidden" kind={props.hidden.kind} onUndo={props.hidden.onUndo} />);
  return (
    <DeckSection {...edge}>
      <Deck width={FOR_YOU_CARD.width} height={FOR_YOU_CARD.height}>{cards}</Deck>
      {props.footer ?? null}
    </DeckSection>
  );
}
