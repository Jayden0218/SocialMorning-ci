/**
 * Updates (更新, M10, owner 2026-09-27) — the second tab, at `/library` (the path the
 * Library always answered on, so its links still land, G3). Laid out after the reference:
 * a large title with a "My subscriptions" button, then the newest episodes of every show
 * you follow in one list — show notes, then "length · ago · plays · comments", and Queue ·
 * Comments · Download · More · Play under each (Owner, 2026-10-01: `UpdateEpisodeRow`).
 *
 * Kept from the Library: "Continue listening" first (Story 3 — losing your place in a
 * two-hour episode is what people abandon a podcast app over); a background refresh that
 * never blanks the list (Principle IV); with no subscriptions, Discover's sections so the
 * first screen is never empty (M5 FR-002). The show list itself is `/subscriptions`.
 *
 * M17 (`Library-B`, T041): the Editorial order — "Updates" in the 32 pt serif with
 * "My subscriptions · n →" in the accent under it; the Continue listening card; the voice
 * pills under a "Voices · last 48 h" eyebrow; then "New from your shows" in the serif over the
 * episode cards. The More sheet, the refresh and the counts call are unchanged.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/useColours';
import { Icon } from '@/ui/Icon';
import { enqueue } from '@socialmorning/player-core';
import { useDiscover } from '@/discover/useDiscover';
import { refreshAll } from '@/feeds/refresh-all';
import { latestUpdates, type UpdateRow } from '@/me/updates';
import { usePlayer } from '@/playback/store';
import { useSafety } from '@/safety/context';
import { toPlayable } from '@/storage/playable';
import { hit } from '@/design';
import { ContinueListening } from '@/ui/ContinueListening';
import { DiscoverSections } from '@/ui/DiscoverSections';
import { EmptyState } from '@/ui/EmptyState';
import { UpdateEpisodeRow } from '@/ui/UpdateEpisodeRow';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { QueueButtons } from '@/ui/QueueButtons';
import { DownloadButton } from '@/ui/DownloadButton';
import { EpisodeExtras } from '@/ui/me/EpisodeExtras';
import { useDownloads, useStores, useSubscriptionSync, useToast } from '@/ui/providers';
import { useSocial } from '@/social/context';
import { useM12Api } from '@/social/m12-api';
import { VoicePosts } from '@/ui/VoicePosts';
import { BOTTOM_INSET } from '@/ui/Screen';
import { plural } from '@socialmorning/social-core';

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

  // M12 FR-080: each row's comment count — and, Owner 2026-10-01, its plays (`listeners`) —
  // one call for the first 100 rows. A failure leaves the meta line without numbers; the
  // list itself never waits on it.
  const m12 = useM12Api();
  const [counts, setCounts] = useState<{ counts: Record<string, number>; listeners?: Record<string, number> }>({ counts: {} });
  const [menuFor, setMenuFor] = useState<UpdateRow | undefined>(undefined);
  const loadVoice = useCallback(() => m12.voicePosts(), [m12]);
  const ids = rows.slice(0, 100).map((r) => r.episode.id).join(',');
  useEffect(() => {
    if (ids === '') return;
    let live = true;
    m12.episodeCounts(ids.split(',')).then((next) => { if (live) setCounts(next); }, () => undefined);
    return () => { live = false; };
  }, [m12, ids]);

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
        extraData={counts} // the counts arrive after the rows; without this a row keeps its old meta line
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
        ListHeaderComponent={
          <Box>
            <Box className="px-screen-x pt-section">
              <Text className="font-display text-display text-text" accessibilityRole="header">Updates</Text>
              <Link href="/subscriptions" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`My subscriptions, ${subscribed}`} className="self-start flex-row items-center gap-2" style={TAP}>
                  <Icon name="library-outline" size={16} color={c.accent} />
                  <Text className="text-accent text-meta font-semibold">{`My subscriptions · ${subscribed} →`}</Text>
                </Pressable>
              </Link>
            </Box>
            <Box className="px-screen-x pt-2">
              <ContinueListening />
            </Box>
            {/* M12 FR-104: voice statuses from you and the people you follow (signed in only). */}
            {listenerId !== undefined ? <VoicePosts load={loadVoice} remove={m12.deleteVoicePost} pauseEpisode={player.pause} colours={c} /> : null}
            <Box className="px-screen-x">
              {stale > 0 ? <Text className="text-muted text-xs mt-row">{plural(stale, 'show')} could not refresh — showing the saved copy.</Text> : null}
              {subscribed === 0 && discover.view ? (
                <DiscoverSections body={discover.view.body} stale={discover.view.stale} fetchedAt={discover.view.fetchedAt} onOpen={(c) => void discover.open(c)} />
              ) : null}
              {rows.length > 0 ? <Text className="font-display text-base text-text mt-section" accessibilityRole="header">New from your shows</Text> : null}
            </Box>
          </Box>
        }
        ListEmptyComponent={subscribed === 0 ? <Box className="px-screen-x"><EmptyState surface="library" /></Box> : <Text className="text-muted text-sm px-screen-x mt-section">No episodes yet.</Text>}
        renderItem={({ item }) => {
          const e = item.episode;
          return (
            <UpdateEpisodeRow
              item={item}
              plays={counts.listeners?.[e.id]}
              comments={counts.counts[e.id]}
              now={Date.now()}
              iconColour={c.muted}
              onOpenShow={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } })}
              onOpenEpisode={() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })}
              onQueue={() => queue(e.id)}
              onComments={() => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: e.id } })}
              onDownload={() => download(e.id)}
              onMore={() => setMenuFor(item)}
              onPlay={() => play(e.id)}
            />
          );
        }}
      />
      {/* "⋯" more (Owner, 2026-10-01): the same sheet as a show page's episode row. */}
      <Actionsheet isOpen={menuFor !== undefined} onClose={() => setMenuFor(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {menuFor ? (
            <>
              <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{menuFor.episode.title}</Text>
              <QueueButtons episodeId={menuFor.episode.id} />
              <DownloadButton episodeId={menuFor.episode.id} />
              <EpisodeExtras episodeId={menuFor.episode.id} atMs={stores.positions.get(menuFor.episode.id)?.offsetMs ?? 0} />
            </>
          ) : null}
          <Pressable onPress={() => setMenuFor(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-sm text-muted">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </SafeAreaView>
  );
}
