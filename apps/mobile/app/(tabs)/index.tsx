/**
 * Discover — the first tab and the screen the app opens on (M10, owner 2026-09-27),
 * laid out after the reference the owner chose: a large title, a search box, shortcut
 * chips, then the sections top to bottom.
 *
 * Kept from M5/M8: works signed out (For You simply is not there); the last copy shows at
 * once and offline, marked stale; pull to refresh; opening a card resolves it through its
 * feed without subscribing (research R8). New: every row plays from its round button.
 */
import { useRouter } from 'expo-router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Image } from '../../src/ui/lib/image';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { colour } from '../../src/design';
import { GENRES } from '../../src/discover/genres';
import { buildModel, sectionOrder, type SectionId } from '../../src/discover/sections';
import { HINT_EVERY_MS, hintAt, trendingHints } from '../../src/discover/trending';
import { Loader } from '../../src/ui/Loader';
import { usePullRefresh } from '../../src/ui/PullRefresh';
import { useDiscover } from '../../src/discover/useDiscover';
import { useForYou } from '../../src/recs/useForYou';
import { useRecOutbox } from '../../src/recs/useRecOutbox';
import { useSafety } from '../../src/safety/context';
import { useSocial } from '../../src/social/context';
import { inboxIds } from '../../src/inbox';
import { useStores } from '../../src/ui/providers';
import { BOTTOM_INSET } from '../../src/ui/Screen';
import { SearchBar } from '../../src/ui/discover/parts';
import { useSearchOverlay } from '../../src/ui/search/SearchOverlay';
import {
  CategoryStrip, ChartSection, CollectionSection, ForYouSection, MoreCategories, NewShowsSection, PicksSection, SaidSection, ShowTiles, Shortcuts,
  followedShowTiles, popularShowTiles, VideoSection,
} from '../../src/ui/discover/sections';

const ICON = { width: 36, height: 36 };

export default function DiscoverScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const search = useSearchOverlay();
  const { view, refreshing, refresh, open, play } = useDiscover();
  const { listener } = useSocial();
  const { sets, hiddenFeeds, version } = useSafety();
  const forYou = useForYou(listener !== undefined);
  // M15 US5: a For You the owner hid is not drawn, so it records no impressions either.
  const forYouOn = sectionOrder(view?.body.layout).includes('forYou');
  const outbox = useRecOutbox(listener !== undefined, forYouOn ? forYou.view?.body.items : undefined);
  const refreshBoth = async (): Promise<void> => { await Promise.all([refresh(), forYou.refresh()]); };
  const model = useMemo(
    () => buildModel(view?.body, forYou.view?.body, { feeds: hiddenFeeds, blocked: sets.blocked }),
    // `version` bumps on every local report/block, so a hidden row leaves at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, forYou.view, hiddenFeeds, sets, version],
  );
  const inbox = inboxIds(stores).length;
  // The search box's middle cycles through what is trending (owner, 2026-09-27).
  const hints = useMemo(() => trendingHints(model.chart), [model]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (hints.length < 2) return;
    const t = setInterval(() => setTick((n) => n + 1), HINT_EVERY_MS);
    return () => clearInterval(t);
  }, [hints]);
  const hint = hintAt(hints, tick);
  const showPage = (feedUrl: string) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });
  // Owner, 2026-10-01: "Categories" opens the genre strip with the first genre's list under it,
  // not the page of genre choices.
  const allCategories = () => router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } });
  const pull = usePullRefresh(refreshing, () => void refreshBoth());
  const act = { onOpen: (c: Parameters<typeof open>[0]) => void open(c), onPlay: (c: Parameters<typeof play>[0]) => void play(c) };
  const categoryStrip = view ? <CategoryStrip onGenre={(id) => router.push({ pathname: '/category/[id]', params: { id: String(id) } })} onAll={allCategories} /> : null;
  const section = (id: SectionId): React.ReactNode => {
    switch (id) {
      case 'forYou': return <ForYouSection rows={model.forYou} {...act} onOpenAt={(c, index) => { outbox.opened(index); void open(c); }} />;
      case 'picks': return <PicksSection items={model.picks} {...(view?.body.date ? { date: view.body.date } : {})} {...act} onPast={() => router.push({ pathname: '/picks/past', params: view?.body.date ? { before: view.body.date } : {} })} />;
      case 'chart': return <ChartSection tabs={model.chart} {...act} onFull={() => router.push('/chart')} />;
      case 'shows': return <ShowTiles title="Popular shows" shows={popularShowTiles(model.shows)} onShow={showPage} />;
      case 'video': return <VideoSection items={model.video} {...act} />;
      case 'collections': return model.collections.map((c) => <CollectionSection key={c.id} collection={c} {...act} />);
      case 'followedHere': return model.followedHere ? (
        <ShowTiles title="Shows listeners here follow" badge={model.followedHere.total} shows={followedShowTiles(model.followedHere.shows)} onShow={showPage} boxed />
      ) : null;
      case 'said': return <SaidSection items={model.said} now={Date.now()} {...act} />;
      case 'newShows': return <NewShowsSection items={model.newShows} {...act} />;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Box className="flex-1">
      {pull.backdrop}
      <ScrollView
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
        refreshControl={pull.refreshControl}
        onScroll={pull.onScroll}
        scrollEventThrottle={pull.scrollEventThrottle}
      >
        {view ? pull.inline : null}
        {/* Owner, 2026-09-27: less space above the title. */}
        <Box className="flex-row items-center justify-between px-screen-x pt-1 pb-2">
          <Text className="text-text text-lg font-bold" accessibilityRole="header">Discover</Text>
          <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row" accessibilityIgnoresInvertColors accessibilityLabel="SocialNet" />
        </Box>
        <SearchBar
          {...(hint ? { hint } : {})}
          // `fromY`: where the bar sits now, so Search can start its box here and move it up.
          // M17: Search opens IN PLACE over the tabs (not the `/search` route), so a page opened
          // from its results is an ordinary push with the edge swipe (src/ui/search/SearchOverlay.tsx).
          onPress={(fromY) => search.open({ fromY: Math.round(fromY), ...(hint ? { hint } : {}) })}
          onScan={() => router.push('/scan')}
        />
        <Shortcuts
          items={[
            { label: 'Categories', icon: 'grid-outline', onPress: allCategories },
            { label: inbox > 0 ? `Inbox (${inbox})` : 'Inbox', icon: 'file-tray-outline', onPress: () => router.push('/inbox') },
            { label: 'Queue', icon: 'list-outline', onPress: () => router.push('/queue') },
            { label: 'Downloads', icon: 'download-outline', onPress: () => router.push('/downloads') },
            // M12 FR-101, FR-102
            { label: 'Issues', icon: 'newspaper-outline', onPress: () => router.push('/issues') },
            { label: 'Friends listening', icon: 'people-outline', onPress: () => router.push('/friends-listening') },
          ]}
        />

        {view?.stale ? (
          <Text className="text-accent bg-surface mx-screen-x mt-row p-row rounded-row text-sm">
            Couldn't refresh — showing what was fetched {view.fetchedAt ? new Date(view.fetchedAt).toLocaleTimeString() : 'earlier'}.
          </Text>
        ) : null}
        {!view ? (
          refreshing
            ? <Loader className="mt-section" />
            : <Text className="text-muted text-sm px-screen-x mt-section">Couldn't reach the server, and nothing is cached yet.</Text>
        ) : null}

        {/* M15 US5: the owner's order, hidden sections left out (`buildModel`). The category
            strip follows the chart, or leads when the chart is hidden. */}
        {model.order.includes('chart') ? null : categoryStrip}
        {model.order.map((id) => <Fragment key={id}>{section(id)}{id === 'chart' ? categoryStrip : null}</Fragment>)}
        {view ? <MoreCategories onPress={allCategories} /> : null}
      </ScrollView>
      </Box>
    </SafeAreaView>
  );
}
