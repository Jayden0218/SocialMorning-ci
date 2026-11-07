// The Show screen's Hot moments tab: a deck of cards, one per episode's hottest moment.
/**
 * M31 W3-A2 (T040; design-pulse2 `show--screen`, right phone, NEW): a Deck of 290 x 340 cards (radius 26, a 1 line border) starting at the
 * 28 lane. Each card: the episode's cover 150 tall with the solid "HOT · 14:32" chip at 12 / 12; under it, 14 of padding and 8 between:
 * the episode's title (Unbounded 700 17), the top comment at that moment in quotes (Geist 13/18, text2, two lines; none when nobody
 * wrote there), "n reacted here" with a flame (mono 11, hot-text), and the curve (30 bars, 20 tall, the hot run lit) beside the light
 * Play disc (40). Play plays the episode from the moment and opens the player (`useMomentActions.playFull`, the Moments feed's own).
 *
 * The curve is the episode's own (the server's `curve`, wave 5b; an older server sends none and the card draws the peaks); the cover is the episode's own art, else the show's, as everywhere.
 * States: loading (two ghost cards), empty (the dashed card, "No hot moments yet"), failed (the error tile with Retry).
 */
import { useMemo } from 'react';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { colour, spacing } from '@/design';
import { drawnType } from '@/design/type-px';
import { Deck, DeckCard, CoverBand, DiscPlay } from '@/ui/discover/Deck';
import { RetryTile } from '@/ui/discover/Mosaic';
import { hotBars } from '@/ui/discover/moments-logic';
import { EmptyDeck } from '@/ui/episode/EmptyDeck';
import type { Moment } from '@/discover/moments-api';
import { cardCurve, cardLabel, hotChip, reactedLine } from './hot-moments';
import { SHOW } from './measures';

const CARD = SHOW.deckCard;

export type HotMomentsProps = {
  status: 'loading' | 'ready' | 'error';
  cards: readonly Moment[];
  /** Every moment the server sent: a card's curve is its episode's peaks. */
  all: readonly Moment[];
  /** The episode's length when the phone has it (the feed's), to place the peaks. */
  durationOf: (episodeId: string) => number | undefined;
  onPlay: (m: Moment) => void;
  onRetry: () => void;
};

function MomentCardRow(props: { m: Moment; all: readonly Moment[]; durationMs: number | undefined; onPlay: (m: Moment) => void }): React.ReactElement {
  const { m } = props;
  const peaks = useMemo(() => cardCurve(m, props.all, props.durationMs), [m, props.all, props.durationMs]);
  const run = hotBars(m, props.durationMs, CARD.bars);
  const quote = m.comments[0];
  return (
    <DeckCard>
      <Box testID="hot-moment-card" accessible accessibilityLabel={cardLabel(m)} className="flex-1">
        <CoverBand url={m.coverUrl} name={m.showTitle || m.episodeTitle} height={CARD.cover}>
          <Box className="absolute" style={{ left: spacing.row, top: spacing.row }}><TimestampChip text={hotChip(m)} solid /></Box>
        </CoverBand>
        <Box className="flex-1" style={{ padding: CARD.pad, gap: spacing.gap }}>
          <Type step="lede" className="text-text" style={drawnType.unbounded[17]} numberOfLines={2}>{m.episodeTitle}</Type>
          {quote ? <Type step="caption" className="text-text2" numberOfLines={2}>{`“${quote.text}”`}</Type> : null}
          <Box className="flex-row items-center gap-hair">
            <Icon name="flame-outline" size={12} color={colour.hotText} />
            <Type step="tag" className="text-hotText">{reactedLine(m)}</Type>
          </Box>
          <Box className="flex-row items-center mt-auto gap-gap">
            <Box className="flex-1">
              <Curve data={peaks} count={CARD.bars} height={CARD.barsHeight} min={2} {...(run ? { hotRange: run } : {})} />
            </Box>
            <DiscPlay size={CARD.play} title={`${m.episodeTitle} from ${hotChip(m).replace('HOT · ', '')}`} onPress={() => props.onPlay(m)} />
          </Box>
        </Box>
      </Box>
    </DeckCard>
  );
}

export function HotMoments(props: HotMomentsProps): React.ReactElement {
  if (props.status === 'error') return <RetryTile line="Couldn't load this show's hot moments." onRetry={props.onRetry} />;
  if (props.status === 'loading') {
    return (
      <Deck width={CARD.width} height={CARD.height} accessibilityLabel="Hot moments, loading">
        <DeckCard tone="plain"><Box testID="hot-moment-ghost" className="flex-1 bg-raise2" accessible={false} importantForAccessibility="no-hide-descendants" /></DeckCard>
        <DeckCard tone="plain"><Box className="flex-1 bg-raise2" accessible={false} importantForAccessibility="no-hide-descendants" /></DeckCard>
      </Deck>
    );
  }
  if (props.cards.length === 0) {
    return (
      <Box style={{ marginLeft: SHOW.lane, marginRight: SHOW.right }}>
        <EmptyDeck title="No hot moments yet" sentence="When listeners react at the same moment of an episode, it lights up here." />
      </Box>
    );
  }
  return (
    <Deck width={CARD.width} height={CARD.height} accessibilityLabel="Hot moments">
      {props.cards.map((m) => <MomentCardRow key={m.episodeId} m={m} all={props.all} durationMs={props.durationOf(m.episodeId)} onPlay={props.onPlay} />)}
    </Deck>
  );
}
