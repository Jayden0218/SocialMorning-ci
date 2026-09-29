/**
 * Updates (更新, M10, owner 2026-09-27) — the second tab, at `/library` (the path the
 * Library always answered on, so its links still land, G3). Laid out after the reference:
 * a large title with a "My subscriptions" button, then the newest episodes of every show
 * you follow in one list — show notes, length, date, and Queue · Comments · Download ·
 * Play under each.
 *
 * Kept from the Library: "Continue listening" first (Story 3 — losing your place in a
 * two-hour episode is what people abandon a podcast app over); a background refresh that
 * never blanks the list (Principle IV); with no subscriptions, Discover's sections so the
 * first screen is never empty (M5 FR-002). The show list itself is `/subscriptions`.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../../src/ui/lib/flat-list';
import { Pressable } from '../../src/ui/lib/pressable';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { enqueue } from '@socialmorning/player-core';
import { useDiscover } from '../../src/discover/useDiscover';
import { refreshAll } from '../../src/feeds/refresh-all';
import { latestUpdates, type UpdateRow } from '../../src/me/updates';
import { usePlayer } from '../../src/playback/store';
import { useSafety } from '../../src/safety/context';
import { toPlayable } from '../../src/storage/playable';
import { hit } from '../../src/design';
import { Artwork } from '../../src/ui/Artwork';
import { ContinueListening } from '../../src/ui/ContinueListening';
import { DiscoverSections } from '../../src/ui/DiscoverSections';
import { EmptyState } from '../../src/ui/EmptyState';
import { PlayButton } from '../../src/ui/discover/parts';
import { mmss, shortDate } from '../../src/ui/format';
import { useDownloads, useStores, useSubscriptionSync, useToast } from '../../src/ui/providers';
import { useSocial } from '../../src/social/context';
import { BOTTOM_INSET } from '../../src/ui/Screen';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export default function UpdatesScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  const player = usePlayer();
  const downloads = useDownloads();
  const toast = useToast();
  const { hiddenFeeds } = useSafety();
  const discover = useDiscover();
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [subscribed, setSubscribed] = useState(0);
  const [stale, setStale] = useState(0);

  const read = useCallback(() => {
    setRows(latestUpdates(stores, hiddenFeeds));
    setSubscribed(stores.subscriptions.list().length);
  }, [stores, hiddenFeeds]);
  useFocusEffect(useCallback(() => {
    let live = true;
    read();
    void refreshAll(stores, Date.now()).then((r) => { if (!live) return; setStale(r.stale.length); read(); });
    return () => { live = false; };
  }, [read, stores]));

  // iOS L1 (and Android's defect 13): after a sign-in on a fresh install the server's
  // subscriptions were merged only at the next app start, so this page stayed empty until a
  // cold restart. A new listener now reconciles here and the list redraws.
  const subscriptionSync = useSubscriptionSync();
  const listenerId = useSocial().listener?.listenerId;
  useEffect(() => {
    if (listenerId === undefined) return;
    let live = true;
    void subscriptionSync.reconcile().catch(() => undefined).then(async () => {
      if (!live) return;
      read();
      const r = await refreshAll(stores, Date.now());
      if (!live) return;
      setStale(r.stale.length);
      read();
    });
    return () => { live = false; };
  }, [listenerId, subscriptionSync, read, stores]);

  const play = (id: string) => { const p = toPlayable(stores, id); if (p) player.load(p, 'play'); };
  const queue = (id: string) => {
    const r = enqueue(stores.queue.list(), id, 'end');
    if (r.refused) { toast('The queue is full (300).'); return; }
    stores.queue.replace(r.queue, Date.now());
    toast('Added to the queue.');
  };
  const download = (id: string) => { void downloads.request(id).then((r) => toast(r.kind === 'budget' ? 'Not enough space for this download.' : 'Downloading.')); };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={rows}
        keyExtractor={(r) => r.episode.id}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
        ListHeaderComponent={
          <Box>
            <Box className="flex-row items-center justify-between px-screen-x pt-section pb-row border-b-hairline border-separator">
              <Text className="text-text text-lg font-bold" accessibilityRole="header">Updates</Text>
              <Link href="/subscriptions" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`My subscriptions, ${subscribed}`} className="flex-row items-center gap-2 bg-surface rounded-row px-row" style={TAP}>
                  <Icon name="library-outline" size={18} color={c.text} />
                  <Text className="text-accent text-sm font-semibold">My subscriptions</Text>
                </Pressable>
              </Link>
            </Box>
            <Box className="px-screen-x pt-row">
              <ContinueListening />
              {stale > 0 ? <Text className="text-muted text-xs mt-row">{stale} show{stale === 1 ? '' : 's'} could not refresh — showing the saved copy.</Text> : null}
              {subscribed === 0 && discover.view ? (
                <DiscoverSections body={discover.view.body} stale={discover.view.stale} fetchedAt={discover.view.fetchedAt} onOpen={(c) => void discover.open(c)} />
              ) : null}
            </Box>
          </Box>
        }
        ListEmptyComponent={subscribed === 0 ? <Box className="px-screen-x"><EmptyState surface="library" /></Box> : <Text className="text-muted text-sm px-screen-x mt-section">No episodes yet.</Text>}
        renderItem={({ item }) => {
          const e = item.episode;
          const meta = [e.durationMs !== undefined ? mmss(e.durationMs) : undefined, shortDate(e.publishedAt)].filter(Boolean).join(' · ');
          return (
            <Box className="flex-row gap-row px-screen-x py-section">
              <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${item.showTitle}`}>
                <Artwork url={item.imageUrl} size={72} rounded="row" />
              </Pressable>
              <Box className="flex-1">
                <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })} accessibilityRole="button" accessibilityLabel={`${e.title}, ${item.showTitle}`}>
                  <Text className="text-text text-sm font-semibold" numberOfLines={2}>{e.title}</Text>
                  {item.summary ? <Text className="text-muted text-xs mt-1" numberOfLines={2}>{item.summary}</Text> : null}
                  <Text className="text-muted text-xs mt-1">{[item.showTitle, meta].filter(Boolean).join(' · ')}</Text>
                </Pressable>
                <Box className="flex-row items-center mt-1">
                  <Pressable onPress={() => queue(e.id)} accessibilityRole="button" accessibilityLabel={`Add ${e.title} to the queue`} className="justify-center pr-section" style={TAP}><Text className="text-accent text-sm">＋ Queue</Text></Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })} accessibilityRole="button" accessibilityLabel={`Comments on ${e.title}`} className="justify-center pr-section" style={TAP}><Icon name="chatbubble-outline" size={20} color={c.accent} /></Pressable>
                  <Pressable onPress={() => download(e.id)} accessibilityRole="button" accessibilityLabel={`Download ${e.title}`} className="justify-center pr-section" style={TAP}><Icon name="download-outline" size={20} color={c.accent} /></Pressable>
                  <Box className="flex-1" />
                  <PlayButton title={e.title} onPress={() => play(e.id)} />
                </Box>
              </Box>
            </Box>
          );
        }}
      />
    </SafeAreaView>
  );
}
