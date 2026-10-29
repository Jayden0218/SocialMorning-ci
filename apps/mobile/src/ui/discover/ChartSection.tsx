// The charts on Discover: one card per chart in a deck, three ranked rows a page, "1 / 2 →" for the next three.
/**
 * M31 T030 (design-pulse2 `home--fold-a`, "Charts"). One 270 x 220 card per chart (Top, Talked about,
 * New shows): the chart's name in Unbounded at the left of its header, "1 / 2 →" in mono at the right,
 * then three rows 54 tall — the rank (Unbounded 18, the first in hot-text), the cover (40), the title and
 * the show, a bare Play glyph. A swipe inside the card (or a tap on "1 / 2 →") moves to ranks 4–6;
 * "Full chart ›" under the deck opens /chart. The old tabs are the cards: pressing a chart's name brings
 * that card to the left of the deck.
 *
 * Not as drawn: the header's name is Unbounded 18 (the scale has no 16); "1 / 2 →" turns to "2 / 2 ←" on
 * the last page and goes back (the old Previous page).
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { pages, type ChartTab } from '@/discover/sections';
import type { EpisodeCard } from '@/social/api';
import { DECK, UNBOUNDED, Deck, DeckCard, DeckLink, DeckSection, PX, PlayGlyph } from './Deck';
import type { Act } from './sections-common';

/** Drawn: cards 270 x 220, a row 54 tall (7 + the 40 cover + 7), the rank 20 wide. */
export const CHART_CARD = { width: 270, height: 220, cover: 40, rank: 20, rowPad: 7 } as const;
/** A page is as wide as the card's inside (the 1 line border off each side). */
const PAGE = CHART_CARD.width - 2;

function ChartRow(props: Act & { card: EpisodeCard; rank: number }): React.ReactElement {
  const { card } = props;
  return (
    <Box className="flex-row items-center" style={{ paddingHorizontal: DECK.pad, paddingVertical: CHART_CARD.rowPad, gap: PX.ten }}>
      <Pressable
        onPress={() => props.onOpen(card)}
        accessibilityRole="button"
        accessibilityLabel={`${card.title}, ${card.showTitle}`}
        className="flex-1 flex-row items-center min-w-0"
        style={{ gap: PX.ten }}
      >
        <Type step="lede" className={props.rank === 1 ? 'text-hotText font-extrabold' : 'text-text2 font-extrabold'} style={{ width: CHART_CARD.rank }} numberOfLines={1} maxFontSizeMultiplier={1.3}>{props.rank}</Type>
        <Artwork url={card.imageUrl} size={CHART_CARD.cover} name={card.showTitle} />
        <Box className="flex-1 min-w-0">
          <Type step="compact" className="text-text font-bold" numberOfLines={1}>{card.title}</Type>
          <Type step="caption" className="text-text2" numberOfLines={1}>{card.showTitle}</Type>
        </Box>
      </Pressable>
      <PlayGlyph title={card.title} onPress={() => props.onPlay(card)} />
    </Box>
  );
}

function ChartCard(props: Act & { tab: ChartTab; onName: () => void }): React.ReactElement {
  const [page, setPage] = useState(0);
  const [scroller, setScroller] = useState<React.ComponentRef<typeof ScrollView> | null>(null);
  const p = pages(props.tab.rows);
  const last = page >= p.length - 1;
  const go = (to: number): void => { setPage(to); scroller?.scrollTo?.({ x: to * PAGE, animated: true }); };
  return (
    <DeckCard>
      <Box className="flex-row items-center justify-between" style={{ paddingHorizontal: DECK.pad, paddingTop: DECK.pad, paddingBottom: PX.six }}>
        <Pressable onPress={props.onName} accessibilityRole="button" accessibilityLabel={`${props.tab.label} chart`} hitSlop={12} className="flex-1 min-w-0">
          <Type step="lede" className="text-text font-bold" style={UNBOUNDED[16]} numberOfLines={1}>{props.tab.label}</Type>
        </Pressable>
        {p.length > 1 ? (
          <Pressable
            onPress={() => go(last ? page - 1 : page + 1)}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Previous page' : 'Next page'}
            hitSlop={16}
          >
            <Type step="tag" className="text-text2">{`${page + 1} / ${p.length} ${last ? '←' : '→'}`}</Type>
          </Pressable>
        ) : null}
      </Box>
      {p.length === 0 ? (
        <Type step="note" className="text-text2" style={{ paddingHorizontal: DECK.pad, paddingVertical: spacing.section }}>Nothing here yet — check back soon.</Type>
      ) : (
        <ScrollView
          ref={setScroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / PAGE))}
        >
          {p.map((rows, i) => (
            <Box key={i} style={{ width: PAGE }}>
              {rows.map((card, j) => <ChartRow key={card.id} card={card} rank={i * 3 + j + 1} onOpen={props.onOpen} onPlay={props.onPlay} />)}
            </Box>
          ))}
        </ScrollView>
      )}
    </DeckCard>
  );
}

/** The charts — a card each, in the order the model gives (Top, Talked about, New shows). */
export function ChartSection(props: Act & { tabs: ChartTab[]; onFull?: () => void }): React.ReactElement | null {
  const [focus, setFocus] = useState(0);
  if (props.tabs.length === 0 || props.tabs.every((t) => t.rows.length === 0)) return null;
  return (
    <DeckSection label="Charts" spoken="The chart">
      <Deck width={CHART_CARD.width} height={CHART_CARD.height} focus={focus}>
        {props.tabs.map((tab, i) => <ChartCard key={tab.key} tab={tab} onOpen={props.onOpen} onPlay={props.onPlay} onName={() => setFocus(i)} />)}
      </Deck>
      {props.onFull ? <DeckLink label="Full chart" onPress={props.onFull} /> : null}
    </DeckSection>
  );
}
