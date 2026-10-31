// The charts: Talked about, New shows and Rising, swiped one to the next, with when each last updated.
/**
 * The full chart (M12 FR-071), M21 T088 (FR-067): three charts on one page — Talked about (the
 * M12 ranking), New shows and Rising (`GET /v1/discover/chart?kind=`). Swipe, or tap a tab, to
 * move between them. Under the tabs, "Updated 3 min ago"; ⓘ opens /chart-rules, which says in
 * plain words how each is ranked. Shows this listener hid are left out here too.
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
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Loader } from '@/ui/kit/Loader';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { EndOfList } from '@/ui/kit/EndOfList';
import { relativeTime } from '@/ui/kit/format';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { CHART_LABELS, useExploreApi, type ChartKind } from '@/discover/explore-api';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';
import { FullPager } from '@/ui/discover/FullPager';
import { chartTiles } from '@/ui/discover/ChartTiles';
import { MosaicGrid, RetryTile } from '@/ui/discover/Mosaic';
import { PAGE, PAGE_TYPE } from '@/ui/discover/measures';
import { bodyTop } from '@/ui/discover/page-parts';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN, emptyTop, PageEmpty, SegmentSwitch } from '@/ui/me/lists';
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
/** The lede sits 8 under the track; the Mosaic 12 under "Updated". */
const LEDE_GAP = 8;
const MOSAIC_GAP = 12;

/** One chart: the lede, when it updated, and the ranked Mosaic. */
function ChartList(props: { kind: ChartKind; reserve: number; pane?: (episodeId: string) => void }): React.ReactElement {
  const api = useExploreApi();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => api.chart(props.kind).then((page) => ({ page })), [api, props.kind], 'chart.load');
  const items = state.kind === 'ok' ? state.page.items.filter((i) => !hiddenFeeds.has(i.episode.feedUrl)) : [];
  const lane = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
  const tiles = chartTiles(items, { open: (c) => void open(c, props.pane), play: (c) => void play(c), more: onMore });
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: LEDE_GAP, paddingBottom: props.reserve }}>
      <Box style={[lane, { gap: LEDE_GAP }]}>
        <Type step="caption" className="text-text2">{LEDE[props.kind]}</Type>
        <Type step="tag" className="text-text3" style={PAGE_TYPE.mono11}>{state.kind === 'ok' ? `Updated ${relativeTime(state.page.updatedAt, new Date(clockMs()).toISOString())}` : ' '}</Type>
      </Box>
      <Box style={{ marginTop: state.kind === 'error' ? PAGE.pad : MOSAIC_GAP }}>
        {state.kind === 'loading' ? <Loader className="my-section" /> : null}
        {state.kind === 'error' ? <RetryTile line="Couldn't load the chart right now." onRetry={load} /> : null}
        {state.kind === 'ok' && items.length === 0 ? <PageEmpty top={emptyTop(300) - (PAGE.body - DRAWN.listTop)} title={EMPTY[props.kind]} /> : null}
        {items.length > 0 ? <MosaicGrid tiles={tiles} /> : null}
      </Box>
      {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
      {items.length > 0 ? <EndOfList /> : null}
    </ScrollView>
  );
}

export default function ChartScreen(): React.ReactElement {
  const [index, setIndex] = useState(0);
  const kind = KINDS[index] ?? 'talked';
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  return (
    <>
      <PushedPage
        title="Charts"
        subtitle="Swipe for the next chart"
        actions={[{ icon: 'information-circle-outline', label: 'How the charts work', onPress: () => router.push('/chart-rules') }]}
      >
        {(layout) => (
          <ListDetail
            placeholder="Choose an episode to see it here."
            detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
            list={
              <Box className="flex-1" style={{ paddingTop: bodyTop(layout) }}>
                <Box style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}>
                  <SegmentSwitch roomy items={KINDS.map((k) => ({ value: k, label: CHART_LABELS[k], accessibilityLabel: `${CHART_LABELS[k]} chart` }))} value={kind} onChange={(k) => setIndex(KINDS.indexOf(k))} />
                </Box>
                <FullPager count={KINDS.length} index={index} onPage={setIndex}>
                  {(i) => <ChartList kind={KINDS[i] ?? 'talked'} reserve={layout.reserve} {...(pane ? { pane } : {})} />}
                </FullPager>
              </Box>
            }
          />
        )}
      </PushedPage>
      <CardSheetHost />
    </>
  );
}
