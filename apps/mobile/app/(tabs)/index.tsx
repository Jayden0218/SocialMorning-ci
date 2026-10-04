// Discover, the first screen: search box, shortcuts, picks, For You, charts, categories.
/**
 * Discover — the first tab and the screen the app opens on (M10, owner 2026-09-27),
 * laid out after the reference the owner chose: a large title, a search box, shortcut
 * chips, then the sections top to bottom.
 *
 * Kept from M5/M8: works signed out (For You simply is not there); the last copy shows at
 * once and offline, marked stale; pull to refresh; opening a card resolves it through its
 * feed without subscribing (research R8). New: every row plays from its round button.
 *
 * M17 (`Home-B`, `Discover-B`): today's date as an eyebrow over a 32 pt serif "Discover";
 * the stale notice is a bordered white card. The sections themselves are restyled in
 * `src/ui/discover/{parts,sections}.tsx`; order, data, pull to refresh and every action stay.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Image } from '@/ui/lib/image';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { GENRES } from '@/discover/genres';
import { buildModel, sectionOrder, type SectionId } from '@/discover/sections';
import { HINT_EVERY_MS, hintAt, trendingHints } from '@/discover/trending';
import { Loader } from '@/ui/kit/Loader';
import { usePullRefresh } from '@/ui/kit/PullRefresh';
import { useDiscover } from '@/discover/useDiscover';
import { useForYou } from '@/recs/useForYou';
import { useFirstPaint } from '@/discover/first-paint';
import { useRecOutbox } from '@/recs/useRecOutbox';
import { useSafety } from '@/safety/context';
import { useSocial } from '@/social/context';
import { inboxIds } from '@/me/inbox';
import { useStores } from '@/ui/shell/providers';
import { TAB_PAGE_END } from '@/ui/kit/Screen';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { SearchBar } from '@/ui/discover/parts';
import { useSearchOverlay } from '@/ui/search/SearchOverlay';
import {
  CategoryStrip, ChartSection, CollectionSection, ForYouSection, MoreCategories, NewShowsSection, PicksSection, SaidSection, ShowTiles, Shortcuts,
  followedShowTiles, popularShowTiles, VideoSection,
} from '@/ui/discover/sections';

const ICON = { width: 36, height: 36 };
/** "Thursday, 2 October" — the eyebrow over the title (`Home-B`), from the phone's clock. */
const today = (): string => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export default function DiscoverScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const search = useSearchOverlay();
  const { view, refreshing, refresh, open, play, settled } = useDiscover();
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
  // The lag audit (2026-10-04): this reads every episode of every subscribed show, so it runs
  // when Discover is opened, not on every re-render (the hint ticker re-rendered every 4 s).
  const [inbox, setInbox] = useState(() => inboxIds(stores).length);
  useFocusEffect(useCallback(() => { setInbox(inboxIds(stores).length); }, [stores]));
  // The search box's middle cycles through what is trending (owner, 2026-09-27).
  const hints = useMemo(() => trendingHints(model.chart), [model]);
  const [tick, setTick] = useState(0);
  // Only while Discover is on screen: a plain effect kept ticking under every other page.
  useFocusEffect(useCallback(() => {
    if (hints.length < 2) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), HINT_EVERY_MS);
    return () => clearInterval(t);
  }, [hints]));
  const hint = hintAt(hints, tick);
  const showPage = (feedUrl: string) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } });
  // Owner, 2026-10-01: "Categories" opens the genre strip with the first genre's list under it,
  // not the page of genre choices.
  const allCategories = () => router.push({ pathname: '/category/[id]', params: { id: String(GENRES[0]!.id) } });
  const pull = usePullRefresh(refreshing, () => void refreshBoth());
  const shown = useFirstPaint(settled && forYou.settled);
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

  // Owner, 2026-10-04: the page appears whole — the loading mark until Discover and For You have
  // both had their first answer (or FIRST_PAINT_CAP_MS), then everything at once.
  if (!shown) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <Loader />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <Box className="flex-1">
      {pull.backdrop}
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_PAGE_END }}
        refreshControl={pull.refreshControl}
        onScroll={pull.onScroll}
        scrollEventThrottle={pull.scrollEventThrottle}
      >
        {view ? pull.inline : null}
        {/* Owner, 2026-09-27: less space above the title. */}
        <Box className="flex-row items-end justify-between px-screen-x pt-1 pb-row">
          <Box className="flex-1 gap-0.5">
            <Eyebrow>{today()}</Eyebrow>
            <Text className="text-text text-display font-display" accessibilityRole="header">Discover</Text>
          </Box>
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
          <Text className="text-accent bg-surface border border-border mx-screen-x mt-row p-row rounded-row text-body">
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
