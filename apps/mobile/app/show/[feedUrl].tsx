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
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { refreshShow } from '../../src/feeds/fetch';
import { mmss, shortDate } from '../../src/ui/format';
import { useSafety } from '../../src/safety/context';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { useStores } from '../../src/ui/providers';
import type { CachedEpisode, CachedShow } from '../../src/storage/types';

export default function ShowScreen(): React.ReactElement {
  const stores = useStores();
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
  const toggleSubscription = useCallback(() => {
    if (stores.subscriptions.has(feedUrl)) {
      stores.subscriptions.remove(feedUrl);
      setSubscribed(false);
    } else {
      stores.subscriptions.add(feedUrl, Date.now());
      setSubscribed(true);
    }
  }, [feedUrl, stores]);

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
        <View style={styles.header}>
          {show?.imageUrl === undefined ? null : (
            <Image source={{ uri: show.imageUrl }} style={styles.art} />
          )}
          <Text style={styles.showTitle}>{show?.title ?? 'Loading…'}</Text>
          {show?.author === undefined ? null : (
            <Text style={styles.subtitle}>{show.author}</Text>
          )}
          <View style={styles.headRow}>
            <Pressable
              style={styles.subscribe}
              accessibilityRole="button"
              accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
              accessibilityState={{ selected: subscribed }}
              onPress={toggleSubscription}
            >
              <Text style={styles.subscribeText}>{subscribed ? 'Unsubscribe' : 'Subscribe'}</Text>
            </Pressable>
            <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" style={styles.reportBtn}>
              <Text style={styles.muted}>{reportedShow ? 'Reported' : 'Report'}</Text>
            </Pressable>
          </View>
          {reportedShow ? <Text style={styles.stale}>You reported this show. It stays in your library; it is hidden from discovery for you.</Text> : null}
          {hiddenShow ? <Text style={styles.stale}>Hidden from discovery by moderation. It stays in your library.</Text> : null}
          {stale ? <Text style={styles.stale}>Showing the last copy — refresh failed</Text> : null}
          {failed === undefined ? null : <Text style={styles.stale}>{failed}</Text>}
          {show?.description === undefined ? null : (
            <Text style={styles.description} numberOfLines={12}>
              {show.description}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {failed === undefined ? 'No episodes yet.' : failed}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.id } })}
        >
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.subtitle}>
            {[shortDate(item.publishedAt), item.durationMs === undefined ? '' : mmss(item.durationMs), progressFor(item)]
              .filter((part) => part !== '')
              .join(' · ')}
          </Text>
        </Pressable>
      )}
      ListFooterComponent={<View><Link href="/search" style={styles.footerLink}>Search for another show</Link><ReportSheet target={reporting} onClose={() => setReporting(undefined)} /></View>}
    />
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  reportBtn: { paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
  muted: { color: '#666' },
  header: { padding: 12, gap: 6 },
  art: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#eee' },
  showTitle: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666' },
  description: { fontSize: 14, color: '#333' },
  stale: { fontSize: 13, color: '#a15c00' },
  subscribe: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
  },
  subscribeText: { fontWeight: '600' },
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  empty: { padding: 12, color: '#555' },
  footerLink: { padding: 12, color: '#0645ad' },
});
