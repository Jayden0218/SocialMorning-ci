/**
 * One show: its header, its episodes newest first, and whether what we are
 * looking at is fresh (FR-002).
 *
 * The cached copy renders IMMEDIATELY and the refresh happens behind it. A
 * screen that waits for the network before showing episodes it already has
 * is the opposite of Principle IV.
 */
import { Link, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { refreshShow } from '../../src/feeds/fetch';
import { mmss, shortDate } from '../../src/ui/format';
import { useSafety } from '../../src/safety/context';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { useStores, useSubscriptionSync } from '../../src/ui/providers';
import type { CachedEpisode, CachedShow } from '../../src/storage/types';

export default function ShowScreen(): React.ReactElement {
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  const router = useRouter();
  const params = useLocalSearchParams<{ feedUrl: string }>();
  const feedUrl = decodeURIComponent(params.feedUrl ?? '');

  const [show, setShow] = useState<CachedShow | undefined>(() => stores.feeds.getShow(feedUrl));
  const [episodes, setEpisodes] = useState<CachedEpisode[]>(() =>
    stores.feeds.listEpisodes(feedUrl),
  );
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [subscribed, setSubscribed] = useState(() => stores.subscriptions.has(feedUrl));
  const { safety, version, hiddenFeeds } = useSafety();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  void version;
  const reportedShow = safety.isHidden('show', feedUrl);
  const hiddenShow = hiddenFeeds.has(feedUrl);
  // The rows read positions at render time; coming back from the player (or the
  // episode screen) must re-render them, or the list shows where the episode WAS
  // when this screen was pushed (seen on the phone 2026-09-21: Casey "0:57" while
  // its own screen said 15:52).
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(useCallback(() => { setFocusTick((n) => n + 1); }, []));

  useEffect(() => {
    let live = true;
    refreshShow(feedUrl, stores.feeds, Date.now())
      .then((result) => {
        if (!live) return;
        setShow(result.show);
        setEpisodes(result.episodes);
        setStale(result.stale);
        setFailed(undefined);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailed(error instanceof Error ? error.message : 'Could not load this show.');
      });
    return () => {
      live = false;
    };
  }, [feedUrl, stores]);

  // FR-021 / FR-022. Unsubscribing deliberately touches nothing else: the
  // positions for this show's episodes outlive it (FR-023).
  //
  // M8 (US1): the local write still happens first and never waits on the network — the
  // push is fire-and-forget, and an offline one is picked up by the next reconcile
  // (FR-003).
  const toggleSubscription = useCallback(() => {
    if (stores.subscriptions.has(feedUrl)) {
      stores.subscriptions.remove(feedUrl);
      setSubscribed(false);
    } else {
      stores.subscriptions.add(feedUrl, Date.now());
      setSubscribed(true);
    }
    subscriptionSync.push();
  }, [feedUrl, stores, subscriptionSync]);

  const progressFor = (episode: CachedEpisode): string => {
    const row = stores.positions.get(episode.id);
    if (row === undefined) return '';
    if (row.finished) return 'Finished';
    const total = episode.durationMs === undefined ? '' : ` / ${mmss(episode.durationMs)}`;
    return `${mmss(row.offsetMs)}${total}`;
  };

  return (
    <FlatList
      data={episodes}
      extraData={focusTick} // FlatList is pure: without this the rows keep their old text
      keyExtractor={(episode) => episode.id}
      ListHeaderComponent={
        <View className="p-3 gap-1.5">
          {show?.imageUrl === undefined ? null : (
            <Image source={{ uri: show.imageUrl }} className="w-[120px] h-[120px] rounded-lg bg-surface" />
          )}
          <Text className="text-base font-bold text-text">{show?.title ?? 'Loading…'}</Text>
          {show?.author === undefined ? null : (
            <Text className="text-[13px] text-muted">{show.author}</Text>
          )}
          <View className="flex-row gap-4 items-center">
            <Pressable
              className="self-start py-2 px-3.5 rounded-pill border border-separator"
              accessibilityRole="button"
              accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
              accessibilityState={{ selected: subscribed }}
              onPress={toggleSubscription}
            >
              <Text className="font-semibold text-text">{subscribed ? 'Unsubscribe' : 'Subscribe'}</Text>
            </Pressable>
            <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" className="py-2 min-h-11 justify-center">
              <Text className="text-muted">{reportedShow ? 'Reported' : 'Report'}</Text>
            </Pressable>
          </View>
          {reportedShow ? <Text className="text-[13px] text-accent">You reported this show. It stays in your library; it is hidden from discovery for you.</Text> : null}
          {hiddenShow ? <Text className="text-[13px] text-accent">Hidden from discovery by moderation. It stays in your library.</Text> : null}
          {stale ? <Text className="text-[13px] text-accent">Showing the last copy — refresh failed</Text> : null}
          {failed === undefined ? null : <Text className="text-[13px] text-accent">{failed}</Text>}
          {show?.description === undefined ? null : (
            <Text className="text-[14px] text-text" numberOfLines={12}>
              {show.description}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <Text className="p-3 text-muted">
          {failed === undefined ? 'No episodes yet.' : failed}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          className="px-3 py-2.5 gap-1"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.id } })}
        >
          <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>
            {item.title}
          </Text>
          <Text className="text-[13px] text-muted">
            {[shortDate(item.publishedAt), item.durationMs === undefined ? '' : mmss(item.durationMs), progressFor(item)]
              .filter((part) => part !== '')
              .join(' · ')}
          </Text>
        </Pressable>
      )}
      ListFooterComponent={<View><Link href="/search" className="p-3 text-accent" accessibilityRole="link">Search for another show</Link><ReportSheet target={reporting} onClose={() => setReporting(undefined)} /></View>}
    />
  );
}
