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
import { useEffect, useMemo, useState } from 'react';
import { Image, RefreshControl, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { colour } from '../../src/design';
import { buildModel } from '../../src/discover/sections';
import { HINT_EVERY_MS, hintAt, trendingHints } from '../../src/discover/trending';
import { Loader } from '../../src/ui/Loader';
import { useDiscover } from '../../src/discover/useDiscover';
import { useForYou } from '../../src/recs/useForYou';
import { useRecOutbox } from '../../src/recs/useRecOutbox';
import { useSafety } from '../../src/safety/context';
import { useSocial } from '../../src/social/context';
import { inboxIds } from '../../src/inbox';
import { useStores } from '../../src/ui/providers';
import { BOTTOM_INSET } from '../../src/ui/Screen';
import { SearchBar } from '../../src/ui/discover/parts';
import {
  CategoryStrip, ChartSection, CollectionSection, ForYouSection, MoreCategories, NewShowsSection, PicksSection, SaidSection, ShowTiles, Shortcuts,
  followedShowTiles, popularShowTiles, VideoSection,
} from '../../src/ui/discover/sections';

const ICON = { width: 36, height: 36 };

export default function DiscoverScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const { view, refreshing, refresh, open, play } = useDiscover();
  const { listener } = useSocial();
  const { sets, hiddenFeeds, version } = useSafety();
  const forYou = useForYou(listener !== undefined);
  const outbox = useRecOutbox(listener !== undefined, forYou.view?.body.items);
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
  const act = { onOpen: (c: Parameters<typeof open>[0]) => void open(c), onPlay: (c: Parameters<typeof play>[0]) => void play(c) };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshBoth()} tintColor={colour.accent} colors={[colour.accent]} />}
      >
        {/* Owner, 2026-09-27: less space above the title. */}
        <View className="flex-row items-center justify-between px-screen-x pt-1 pb-2">
          <Text className="text-text text-lg font-bold" accessibilityRole="header">Discover</Text>
          <Image source={require('../../assets/app-icon.png')} style={ICON} className="rounded-row" accessibilityIgnoresInvertColors accessibilityLabel="SocialNet" />
        </View>
        <SearchBar
          {...(hint ? { hint } : {})}
          onPress={() => (hint ? router.push({ pathname: '/search', params: { hint } }) : router.push('/search'))}
          onScan={() => router.push('/scan')}
        />
        <Shortcuts
          items={[
            { label: 'Categories', icon: 'grid-outline', onPress: () => router.push('/categories') },
            { label: inbox > 0 ? `Inbox (${inbox})` : 'Inbox', icon: 'file-tray-outline', onPress: () => router.push('/inbox') },
            { label: 'Queue', icon: 'list-outline', onPress: () => router.push('/queue') },
            { label: 'Downloads', icon: 'download-outline', onPress: () => router.push('/downloads') },
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

        <ForYouSection rows={model.forYou} {...act} onOpenAt={(c, index) => { outbox.opened(index); void open(c); }} />
        <PicksSection items={model.picks} {...(view?.body.date ? { date: view.body.date } : {})} {...act} />
        <ChartSection tabs={model.chart} {...act} />
        {view ? <CategoryStrip onGenre={(id) => router.push({ pathname: '/category/[id]', params: { id: String(id) } })} onAll={() => router.push('/categories')} /> : null}
        <ShowTiles title="Popular shows" shows={popularShowTiles(model.shows)} onShow={showPage} />
        <VideoSection items={model.video} {...act} />
        {model.collections.map((c) => <CollectionSection key={c.id} collection={c} {...act} />)}
        {model.followedHere ? (
          <ShowTiles title="Shows listeners here follow" badge={model.followedHere.total} shows={followedShowTiles(model.followedHere.shows)} onShow={showPage} boxed />
        ) : null}
        <SaidSection items={model.said} now={Date.now()} {...act} />
        <NewShowsSection items={model.newShows} {...act} />
        {view ? <MoreCategories onPress={() => router.push('/categories')} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
