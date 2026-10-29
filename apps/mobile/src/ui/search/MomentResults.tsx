// Search results for Moments: the hot moments whose episode or comments match, as tall tiles.
/**
 * M31 T030 (design-pulse2 `search--results-moments`, NEW). A tile is 230 tall, radius 22: the cover fills it
 * (the made-for-you tile while it loads), a dark foot, the moment as a solid timestamp (top left), and at the
 * foot the matching comment, the curve with the hot span lit (14 tall) and "n reacted" in hot-text mono. A tap
 * plays the episode from the moment (`useMomentActions().playFull`, the Moments feed's own action: the silent
 * switch, other audio and the mobile-data choice are respected there).
 *
 * Where the moments come from: there is no server search over moments, so `useMomentResults` reads the list
 * the Moments feed reads (`GET /v1/discover/moments`, more pages while few match, at most `MAX_PAGES`) and keeps
 * those that match the term (`momentsMatching`) — gate log. F2a: the drawn All tab has no Moments (they are their own
 * tab), so the page reads them only on the Moments tab; `MomentDeck` is kept (tested) but not drawn.
 *
 * Not as drawn: a tap plays from the moment and opens the player; it does not open the Moments stage at that
 * moment (no route takes a moment).
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, gutter, spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Loader } from '@/ui/kit/Loader';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { CoverBand, DECK, Deck, DeckLink, DeckSection, PX } from '@/ui/discover/Deck';
import { MOSAIC } from '@/ui/discover/DiscoverMosaic';
import { hotBars, shortCount } from '@/ui/discover/moments-logic';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { useMoments } from '@/ui/discover/useMoments';
import type { Moment } from '@/discover/moments-api';
import { momentsMatching, type MomentHit } from './moments-search';

export const MOMENT_TILE = { height: 230, bars: 20, curve: 14, deckWidth: 160 } as const;
/** Pages of the Moments list read while few match (20 each). */
const MAX_PAGES = 5;
const ENOUGH = 4;
/** The first tiles read their curve (the ones in view). */
const HEAT_TILES = 6;
const FOOT = [colour.clear, colour.pickFoot] as const;
const FOOT_AT = [0.3, 1] as const;
const NO_HEAT: readonly number[] = [];

export type MomentResultsState = { status: 'loading' | 'ready' | 'error'; hits: MomentHit[]; /** Reads the list again (the error block's Retry). */ retry?: () => void };

/** The Moments list filtered by the term; reads more pages while few match. `active` false reads nothing. */
export function useMomentResults(term: string | undefined, active: boolean): MomentResultsState {
  const list = useMoments();
  const hits = useMemo(() => (term ? momentsMatching(list.items, term) : []), [list.items, term]);
  const pages = Math.ceil(list.items.length / 20);
  useEffect(() => {
    if (active && term && hits.length < ENOUGH && list.more && !list.loadingMore && !list.failed && pages < MAX_PAGES) void list.loadMore();
  }, [active, term, hits.length, list, pages]);
  // Nothing matched yet and pages are still to be read: that is loading, not "No moments match." A failed read with
  // nothing to show is the error block.
  const reading = hits.length === 0 && list.more && pages < MAX_PAGES;
  const status = list.status === 'error' || (list.failed && hits.length === 0) ? 'error' : reading ? 'loading' : list.status;
  return { status, hits, retry: () => { void list.refresh(); } };
}

function MomentTile(props: { hit: MomentHit; index: number; width?: number; onPlay: (m: Moment) => void }): React.ReactElement {
  const { moment: m, line } = props.hit;
  const heat = useEpisodeHeat(m.episodeId, props.index < HEAT_TILES);
  const hot = hotBars(m, heat.durationMs, MOMENT_TILE.bars);
  return (
    <Pressable
      onPress={() => props.onPlay(m)}
      accessibilityRole="button"
      accessibilityLabel={`Play ${m.episodeTitle} from ${mmss(m.startMs)}. ${shortCount(m.reactions)} reacted`}
      className="overflow-hidden"
      style={{ height: MOMENT_TILE.height, borderRadius: MOSAIC.radius, flex: props.width ? undefined : 1, minWidth: 0, ...(props.width ? { width: props.width } : {}) }}
    >
      <CoverBand url={m.coverUrl} name={m.showTitle} height={MOMENT_TILE.height} />
      <LinearGradient colors={FOOT} locations={FOOT_AT} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Box className="absolute" style={{ left: PX.ten, top: PX.ten }}><TimestampChip text={mmss(m.startMs)} solid /></Box>
      <Box className="absolute" style={{ left: PX.ten, right: PX.ten, bottom: PX.ten, gap: PX.six }}>
        {line ? <Type step="caption" className="text-text font-semibold" numberOfLines={3}>{`“${line}”`}</Type> : <Type step="caption" className="text-text font-semibold" numberOfLines={2}>{m.episodeTitle}</Type>}
        <Curve data={heat.buckets ?? NO_HEAT} count={MOMENT_TILE.bars} height={MOMENT_TILE.curve} min={2} played={0} flat={heat.buckets === undefined} {...(hot ? { hotRange: hot } : {})} />
        <Type step="tag" className="text-hotText">{`${shortCount(m.reactions)} reacted`}</Type>
      </Box>
    </Pressable>
  );
}

/** The Moments tab: tiles two to a row, from the 28 lane. */
export function MomentGrid(props: { results: MomentResultsState; onPlay: (m: Moment) => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const rows: MomentHit[][] = [];
  for (let i = 0; i < props.results.hits.length; i += 2) rows.push(props.results.hits.slice(i, i + 2));
  return (
    <Box style={{ marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair, gap: MOSAIC.gap }}>
      {props.results.status === 'loading' && props.results.hits.length === 0 ? <Loader className="my-section" /> : null}
      {props.results.status === 'error' && props.results.hits.length === 0 ? (
        <EmptyState surface="search" failed {...(props.results.retry ? { onRetry: props.results.retry } : {})} />
      ) : null}
      {props.results.status === 'ready' && props.results.hits.length === 0 ? (
        <Type step="lede" className="text-text font-bold" style={{ marginTop: spacing.block }}>No moments match.</Type>
      ) : null}
      {rows.map((row, r) => (
        <Box key={r} className="flex-row" style={{ gap: MOSAIC.gap }}>
          {row.map((h, i) => <MomentTile key={`${h.moment.episodeId}\u0001${h.moment.startMs}`} hit={h} index={r * 2 + i} onPlay={props.onPlay} />)}
          {row.length < 2 ? <Box style={{ flex: 1, minWidth: 0 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** A deck of moments, only when something matched. Not drawn on All since F2a (design-pulse2 `search--results-episodes` has none). */
export function MomentDeck(props: { results: MomentResultsState; limit: number; onPlay: (m: Moment) => void; onMore: () => void }): React.ReactElement | null {
  const shown = props.results.hits.slice(0, props.limit);
  if (shown.length === 0) return null;
  return (
    <DeckSection label="Moments" bottom={spacing.section}>
      <Deck width={MOMENT_TILE.deckWidth} height={MOMENT_TILE.height}>
        {shown.map((h, i) => <MomentTile key={`${h.moment.episodeId}\u0001${h.moment.startMs}`} hit={h} index={i} width={MOMENT_TILE.deckWidth} onPlay={props.onPlay} />)}
      </Deck>
      {props.results.hits.length > props.limit ? <DeckLink label="More moments" onPress={props.onMore} /> : null}
    </DeckSection>
  );
}

/** Reads the Moments list only while it is mounted (the Moments tab), so a page that never shows them asks for nothing. */
export function WithMoments(props: { term: string; children: (state: MomentResultsState) => React.ReactNode }): React.ReactElement {
  const state = useMomentResults(props.term, true);
  return <>{props.children(state)}</>;
}
