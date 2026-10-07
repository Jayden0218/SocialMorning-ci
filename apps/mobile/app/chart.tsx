// The charts: Talked about, New shows and Rising, swiped one to the next, with when each last updated.
/**
 * The full chart (M12 FR-071), M21 T088 (FR-067): three charts on one page — Talked about (the
 * M12 ranking), New shows and Rising (`GET /v1/discover/chart?kind=`). Swipe, or tap a tab, to
 * move between them. Under the tabs, "Updated 3 min ago"; ⓘ opens /chart-rules, which says in
 * plain words how each is ranked. Every row has ⋯ for the episode's choices. Shows this
 * listener hid are left out here too.
 *
 * M17 T056 (`Chart-B`): the podium. Number 1 is a white card with a large artwork, a serif
 * accent rank over its corner, a serif title and the reason in the accent; numbers 2 and 3
 * sit side by side as two smaller cards with their rank top right; from 4 on, the numbered
 * rows (divided by hairlines). Same open and play on every chart.
 *
 * M22 US16: on a tablet (`useOpensInPane`) a row opens its episode in the right pane
 * (src/ui/shell/ListDetail.tsx); a phone pushes the episode page as before.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { CardSheetHost, openCardSheet } from '@/ui/episode/CardSheet';
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Card } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Segmented } from '@/ui/kit/Segmented';
import { BarButton } from '@/ui/kit/TopBar';
import { relativeTime } from '@/ui/kit/format';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { EmptyPicture } from '@/ui/me/parts';
import { EpisodeLine, PlayButton } from '@/ui/discover/parts';
import { FullPager } from '@/ui/discover/FullPager';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { CHART_LABELS, useExploreApi, type ChartKind, type ChartPage, type ExploreChartItem } from '@/discover/explore-api';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';

const TAP = { minHeight: hit.min };
/** How many ranks are drawn as cards above the rows (`Chart-B`: 1 wide, 2 and 3 side by side). */
const PODIUM = 3;
const KINDS: readonly ChartKind[] = ['talked', 'new', 'rising'];
const LEDE: Record<ChartKind, string> = {
  talked: 'The episodes listeners talked about most in the last 7 days.',
  new: 'The newest shows, each with its latest episode.',
  rising: 'Episodes growing fastest this week.',
};
const EMPTY: Record<ChartKind, string> = { talked: 'Nothing talked about this week yet', new: 'No new shows yet', rising: 'Nothing is rising this week yet' };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; page: ChartPage };

/** M21 T060: a row's ⋯ opens the shared episode sheet (CardSheetHost below resolves the card). */
const onMore = openCardSheet;

/** One chart: the podium, then the numbered rows. */
function ChartList(props: { kind: ChartKind; pane?: (episodeId: string) => void }): React.ReactElement {
  const api = useExploreApi();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(() => api.chart(props.kind).then((page) => ({ page })), [api, props.kind], 'chart.load');

  const items = state.kind === 'ok' ? state.page.items.filter((i) => !hiddenFeeds.has(i.episode.feedUrl)) : [];
  const [top, second, third] = items;
  const pair = [second, third].filter((i): i is ExploreChartItem => i !== undefined);

  /** Number 1: the wide card. */
  const first = (item: ExploreChartItem): React.ReactElement => (
    <Card padded={false} className="flex-row items-center gap-row p-row mb-row">
      <Pressable onPress={() => void open(item.episode, props.pane)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="flex-1 flex-row items-center gap-section" style={TAP}>
        <Box>
          <Artwork url={item.episode.imageUrl} size={110} rounded="row" name={item.episode.showTitle} />
          <Text className="absolute -left-1.5 -top-2 text-accent text-display font-display" maxFontSizeMultiplier={1.3}>1</Text>
        </Box>
        <Box className="flex-1">
          <Text className="text-text text-title font-display" numberOfLines={3}>{item.episode.title}</Text>
          <Text className="text-muted text-xs mt-1.5" numberOfLines={1}>{item.episode.showTitle}</Text>
          {item.reason ? <Text className="text-accent text-xs font-bold mt-1" numberOfLines={2}>{item.reason}</Text> : null}
        </Box>
      </Pressable>
      <PlayButton title={item.episode.title} onPress={() => void play(item.episode)} />
    </Card>
  );

  /** Numbers 2 and 3: half-width cards, the rank top right, Play bottom right. */
  const small = (item: ExploreChartItem, rank: number): React.ReactElement => (
    <Card key={item.key} padded={false} className="flex-1 p-2.5">
      <Pressable onPress={() => void open(item.episode, props.pane)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="gap-2" style={TAP}>
        <Box className="flex-row items-start justify-between">
          <Artwork url={item.episode.imageUrl} size={64} rounded="row" name={item.episode.showTitle} />
          <Text className="text-accent text-hero font-display" maxFontSizeMultiplier={1.3}>{rank}</Text>
        </Box>
        <Text className="text-text text-meta font-bold" numberOfLines={2}>{item.episode.title}</Text>
        <Text className="text-muted text-micro" numberOfLines={2}>{item.reason ? `${item.episode.showTitle} · ${item.reason}` : item.episode.showTitle}</Text>
      </Pressable>
      <Box className="flex-row justify-end">
        <PlayButton title={item.episode.title} onPress={() => void play(item.episode)} />
      </Box>
    </Card>
  );

  return (
    <FlatList
      className="flex-1"
      data={items.slice(PODIUM)}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={items.length > 0 ? <EndOfList /> : undefined}
      keyExtractor={(i) => i.key}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListHeaderComponent={
        <Box>
          <Text className="text-muted text-body">{LEDE[props.kind]}</Text>
          <Text className="text-muted text-xs mt-1 mb-section">{state.kind === 'ok' ? `Updated ${relativeTime(state.page.updatedAt, new Date().toISOString())}` : ' '}</Text>
          {top ? first(top) : null}
          {pair.length > 0 ? <Box className="flex-row gap-row mb-row">{pair.map((it, n) => small(it, n + 2))}{pair.length === 1 ? <Box className="flex-1" /> : null}</Box> : null}
        </Box>
      }
      ListEmptyComponent={
        items.length > 0 ? undefined
        : state.kind === 'loading' ? <Loader className="my-section" />
        : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">Couldn't load the chart right now.</Text>
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}>
              <Text className="text-accent text-sm font-semibold">Retry</Text>
            </Pressable>
          </Box>
        ) : <EmptyPicture icon="chatbubbles-outline" line={EMPTY[props.kind]} />
      }
      renderItem={({ item, index }) => (
        <EpisodeLine card={item.episode} rank={index + PODIUM + 1} size={48} divided {...(item.reason ? { line: item.reason } : {})} onOpen={() => void open(item.episode, props.pane)} onPlay={() => void play(item.episode)} onMore={() => onMore(item.episode)} />
      )}
    />
  );
}

export default function ChartScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [index, setIndex] = useState(0);
  const kind = KINDS[index] ?? 'talked';
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const pane = inPane ? setPaneId : undefined;
  return (
    <>
      <PageHeader
        title="Charts"
        right={<BarButton label="How the charts work" onPress={() => router.push('/chart-rules')}><Icon name="information-circle-outline" size={24} color={c.text} /></BarButton>}
      />
      <ListDetail
        placeholder="Choose an episode to see it here."
        detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => router.push({ pathname: '/episode/[id]', params: { id: paneId } })} /> : undefined}
        list={
      <Box className="flex-1 bg-background">
        <Segmented className="mx-screen-x mb-row" items={KINDS.map((k) => ({ value: k, label: CHART_LABELS[k], accessibilityLabel: `${CHART_LABELS[k]} chart` }))} value={kind} onChange={(k) => setIndex(KINDS.indexOf(k))} />
        <FullPager count={KINDS.length} index={index} onPage={setIndex}>
          {(i) => <ChartList kind={KINDS[i] ?? 'talked'} {...(pane ? { pane } : {})} />}
        </FullPager>
      </Box>
        }
      />
      <CardSheetHost />
    </>
  );
}
