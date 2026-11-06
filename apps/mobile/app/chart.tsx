// The charts: Talked about, New shows and Rising, swiped one to the next, with when each last updated.
/**
 * The full chart (M12 FR-071), M21 T088 (FR-067): three charts on one page — Talked about (the
 * M12 ranking), New shows and Rising (`GET /v1/discover/chart?kind=`). Swipe, or tap a tab, to
 * move between them. Under the tabs, "Updated 3 min ago"; ⓘ opens /chart-rules, which says in
 * plain words how each is ranked. Shows this listener hid are left out here too.
 *
 * Spec 039 (Detail template): a `DetailPage` (Back + "Charts", the info circle at its end, "Swipe for the next chart" under it); the track, the lede and the ranked tiles
 * are one column on the gutter, and ONE chart is drawn at a time (a swipe across the page, or a tap on the track, changes it). The paging row with a scroll view per
 * chart, and the Mosaic's 28 lane, are gone; a failed load is an `InlineNotice` with Retry.
 *
 * M31 W5-D (T064; design-pulse2 `discover.html` `chart--screen`, `chart--error`, layout pattern Mosaic): a pushed page, the title bar low
 * ("Charts", "Swipe for the next chart", the info circle = How the charts work). Under the status bar the segmented track (46: Talked
 * about · New shows · Rising), then the page of the chart you are on, which swipes: the lede in Geist 500 13/18 and "Updated 3 min ago"
 * in mono, and the ranked Mosaic (`ChartTiles`: #1 2 x 3, #2 and #3 1 x 2, then 2 x 1 rows). A failed load keeps the track and shows the
 * error tile with Retry in place of the Mosaic; an empty chart says so with the shared empty block. Open and Play are as before; a long
 * press on a tile is the old row's ⋯ (the episode sheet).
 *
 * M22 US16: on a tablet (`useOpensInPane`) a tile opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx); a phone pushes the episode page as before.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { CardSheetHost, openCardSheet } from '@/ui/episode/CardSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { runOnJS } from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { Box } from '@/ui/lib/box';
import { Loader } from '@/ui/kit/Loader';
import { DetailPage } from '@/ui/detail/DetailPage';
import { InlineNotice } from '@/ui/kit/layout';
import { IconButton } from '@/ui/kit/PulseButton';
import { spacing } from '@/design';
import { Type } from '@/ui/kit/Type';
import { EndOfList } from '@/ui/kit/EndOfList';
import { relativeTime } from '@/ui/kit/format';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { CHART_LABELS, useExploreApi, type ChartKind, type ChartPage } from '@/discover/explore-api';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { chartTiles, ChartGrid } from '@/ui/discover/ChartTiles';
import { PAGE_TYPE } from '@/ui/discover/measures';
import { PageEmpty, SegmentSwitch } from '@/ui/me/lists';
import { nowMs as clockMs } from '@/ui/kit/clock';

const KINDS: readonly ChartKind[] = ['talked', 'new', 'rising'];
const LEDE: Record<ChartKind, string> = {
  talked: 'The episodes listeners talked about most in the last 7 days.',
  new: 'The newest shows, each with its latest episode.',
  rising: 'Episodes growing fastest this week.',
};
const EMPTY: Record<ChartKind, string> = { talked: 'Nothing talked about this week yet', new: 'No new shows yet', rising: 'Nothing is rising this week yet' };

/** M21 T060: a tile's long press opens the shared episode sheet (CardSheetHost below resolves the card). */
const onMore = openCardSheet;
/** A swipe of at least this far (points) moves to the next or the previous chart. */
const SWIPE = 60;

/**
 * Plan D2 (behaviour stays): the page asks for the chart before and the chart after the one shown, in the background, so a swipe lands on data
 * that is already there (the paging row this page used to be kept its neighbours mounted, and each asked for its own). One request per chart:
 * the answer is kept for the life of the page; a failed one is dropped, so reaching that chart (or Retry) asks again.
 */
function useCharts(): (kind: ChartKind) => Promise<ChartPage> {
  const api = useExploreApi();
  const asked = useRef(new Map<ChartKind, Promise<ChartPage>>());
  return useCallback((kind: ChartKind) => {
    const known = asked.current.get(kind);
    if (known) return known;
    const p = api.chart(kind);
    asked.current.set(kind, p);
    p.catch(() => { if (asked.current.get(kind) === p) asked.current.delete(kind); });
    return p;
  }, [api]);
}

/** One chart: the lede, when it updated, and the ranked tiles, in the page's flow. */
function ChartBody(props: { kind: ChartKind; chart: (kind: ChartKind) => Promise<ChartPage>; pane?: (episodeId: string) => void }): React.ReactElement {
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => props.chart(props.kind).then((page) => ({ page })), [props.chart, props.kind], 'chart.load');
  const items = state.kind === 'ok' ? state.page.items.filter((i) => !hiddenFeeds.has(i.episode.feedUrl)) : [];
  const tiles = chartTiles(items, { open: (c) => void open(c, props.pane), play: (c) => void play(c), more: onMore });
  return (
    <Box style={{ gap: spacing.row }}>
      <Box style={{ gap: spacing.gap }}>
        <Type step="caption" className="text-text2">{LEDE[props.kind]}</Type>
        <Type step="tag" className="text-text3" style={PAGE_TYPE.mono11}>{state.kind === 'ok' ? `Updated ${relativeTime(state.page.updatedAt, new Date(clockMs()).toISOString())}` : ' '}</Type>
      </Box>
      {state.kind === 'loading' ? <Loader className="my-section" /> : null}
      {state.kind === 'error' ? <InlineNotice text="Couldn't load the chart right now." actionLabel="Retry" onAction={load} /> : null}
      {state.kind === 'ok' && items.length === 0 ? <PageEmpty top={0} title={EMPTY[props.kind]} /> : null}
      {items.length > 0 ? <ChartGrid tiles={tiles} /> : null}
      {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
      {items.length > 0 ? <EndOfList /> : null}
    </Box>
  );
}

export default function ChartScreen(): React.ReactElement {
  const [index, setIndex] = useState(0);
  const kind = KINDS[index] ?? 'talked';
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  const chart = useCharts();
  useEffect(() => {
    for (const near of [KINDS[index - 1], KINDS[index + 1]]) if (near) chart(near).catch(() => undefined);
  }, [index, chart]);
  // 039: one chart is drawn at a time, in the page's own scroll; a swipe across it moves to the next chart (it was a paging row with a scroll view per chart).
  const swipe = usePanGesture({
    activeOffsetX: [-24, 24],
    failOffsetY: [-14, 14],
    onDeactivate: (e) => {
      'worklet';
      runOnJS(swipeTo)(e.translationX);
    },
  });
  function swipeTo(dx: number): void {
    if (Math.abs(dx) < SWIPE) return;
    setIndex((i) => Math.max(0, Math.min(KINDS.length - 1, i + (dx < 0 ? 1 : -1))));
  }
  return (
    <>
      <ListDetail
        placeholder="Choose an episode to see it here."
        detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
        list={
          <GestureDetector gesture={swipe}>
            <Box className="flex-1">
              <DetailPage
                title="Charts"
                trailing={<IconButton icon="information-circle-outline" label="How the charts work" onPress={() => router.push('/chart-rules')} fill />}
              >
                <Type step="caption" className="text-text2">Swipe for the next chart</Type>
                <SegmentSwitch roomy items={KINDS.map((k) => ({ value: k, label: CHART_LABELS[k], accessibilityLabel: `${CHART_LABELS[k]} chart` }))} value={kind} onChange={(k) => setIndex(KINDS.indexOf(k))} />
                <ChartBody kind={kind} chart={chart} {...(pane ? { pane } : {})} />
              </DetailPage>
            </Box>
          </GestureDetector>
        }
      />
      <CardSheetHost />
    </>
  );
}
