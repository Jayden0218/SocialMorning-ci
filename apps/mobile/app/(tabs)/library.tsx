// Updates tab: friends' voice posts, newest episodes from your shows.
/**
 * Updates (更新, M10, owner 2026-09-27) — the second tab, at `/library` (the path the
 * Library always answered on, so its links still land, G3). Laid out after the reference:
 * a large title with a "My subscriptions" button, then the newest episodes of every show
 * you follow in one list — show notes, then "length · ago · plays · comments", and Queue ·
 * Comments · Download · More · Play under each (Owner, 2026-10-01: `UpdateEpisodeRow`).
 *
 * Kept from the Library: a background refresh that
 * never blanks the list (Principle IV); with no subscriptions, Discover's sections so the
 * first screen is never empty (M5 FR-002). The show list itself is `/subscriptions`.
 *
 * M17 (`Library-B`, T041): the Editorial order — "Updates" in the 32 pt serif with
 * "My subscriptions · n →" in the accent under it; the voice
 * circles under a "Voices · last 24 h" eyebrow; then "New from your shows" in the serif over the
 * episode cards. The More sheet, the refresh and the counts call are unchanged.
 * Owner, 2026-10-05: no "Continue listening" card — those episodes are already in the list.
 *
 * M21 US4 (FR-035, FR-036): ⋯ or a long-press on a row opens the shared episode sheet
 * (`EpisodeRowSheet`), with two Updates-only actions: Remove from Updates (this phone's list;
 * the show stays subscribed) and Star / Unstar this show (as on /subscriptions).
 *
 * M21 US8 (FR-070): the status row starts with my own avatar "+" (Voice or Text); a row of my
 * starred shows sits above "New from your shows"; video episodes carry a video mark (the row).
 */
import type { FlatList as RNFlatList } from 'react-native';
import { Link, useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useState, useRef } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { enqueue } from '@socialmorning/player-core';
import { useDiscover } from '@/discover/useDiscover';
import { refreshAll } from '@/feeds/refresh-all';
import { hideFromUpdates, latestUpdates, type UpdateRow } from '@/me/updates';
import { usePlayer } from '@/playback/store';
import { useSafety } from '@/safety/context';
import { toPlayable } from '@/storage/playable';
import { hit } from '@/design';
import { DiscoverSections } from '@/ui/discover/DiscoverSections';
import { EmptyState } from '@/ui/kit/EmptyState';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import { useDownloads, useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM12Api } from '@/social/m12-api';
import { VoicePosts } from '@/ui/social/VoicePosts';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Artwork } from '@/ui/kit/Artwork';
import { useMyAvatar } from '@/me/my-avatar';
import { useProfileApi } from '@/social/profile-api';
import { TAB_PAGE_END } from '@/ui/kit/Screen';
import { plural } from '@socialmorning/social-core';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min, minWidth: hit.min };
/** M21 US8: a starred show in the row above the feed — a 72 pt cover with its name under it. */
const STAR_ART = 72;
const STAR_ITEM = { width: STAR_ART, minHeight: hit.min };

export default function UpdatesScreen(): React.ReactElement {
  const top = useRef<RNFlatList<UpdateRow>>(null); useScrollToTop(top); // M21 T082: pressing this tab again scrolls to the top.
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
  const me = useSocial().listener;
  const listenerId = me?.listenerId;
  // M21 US8: my photo on the "+" circle.
  const profileApi = useProfileApi();
  const myAvatar = useMyAvatar(stores.settings, listenerId !== undefined, profileApi.me);
  // M21 US8: my starred shows, above the feed (read with the rows).
  const starredShows = stores.subscriptions.list().filter((s) => s.starred).map((s) => {
    const show = stores.feeds.getShow(s.feedUrl);
    return { feedUrl: s.feedUrl, title: show?.title ?? s.feedUrl, ...(show?.imageUrl ? { imageUrl: show.imageUrl } : {}) };
  });
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
  // Owner, 2026-10-05: each row shows whether it is queued / downloaded; re-read on every change.
  const [marks, setMarks] = useState(0);
  useEffect(() => downloads.subscribe(() => setMarks((n) => n + 1)), [downloads]);
  useFocusEffect(useCallback(() => setMarks((n) => n + 1), []));
  const queuedIds = new Set(stores.queue.list());
  const downloadOf = (id: string): 'none' | 'active' | 'done' => {
    const d = stores.downloads.get(id);
    return !d || d.state === 'failed' ? 'none' : d.state === 'complete' ? 'done' : 'active';
  };
  const queue = (id: string) => {
    if (queuedIds.has(id)) { toast('Already in the queue.'); return; }
    const r = enqueue(stores.queue.list(), id, 'end');
    if (r.refused) { toast('The queue is full (300).'); return; }
    stores.queue.replace(r.queue, Date.now());
    setMarks((n) => n + 1);
    toast('Added to the queue.');
  };
  // M21 US4 (FR-036): the two Updates-only actions in the shared sheet.
  const starred = (feedUrl: string) => stores.subscriptions.list().some((s) => s.feedUrl === feedUrl && s.starred);
  const updatesActions = (row: UpdateRow) => [
    {
      icon: 'eye-off-outline' as const, label: 'Remove from Updates',
      onPress: () => { setMenuFor(undefined); hideFromUpdates(stores.settings, row.episode.id); read(); toast('Removed from Updates. The show stays subscribed.'); },
    },
    starred(row.episode.feedUrl)
      ? { icon: 'star' as const, label: 'Unstar this show', onPress: () => { setMenuFor(undefined); stores.subscriptions.setStarred(row.episode.feedUrl, false, Date.now()); subscriptionSync.push(); toast('Unstarred.'); } }
      : { icon: 'star-outline' as const, label: 'Star this show', onPress: () => { setMenuFor(undefined); stores.subscriptions.setStarred(row.episode.feedUrl, true, Date.now()); subscriptionSync.push(); toast('Starred. It sits at the top of My subscriptions.'); } },
  ];
  const download = (id: string) => {
    if (downloadOf(id) === 'done') { toast('Already downloaded.'); return; }
    if (downloadOf(id) === 'active') { toast('Downloading.'); return; }
    void downloads.request(id).then((r) => toast(r.kind === 'budget' ? 'Not enough space for this download.' : 'Downloading.'));
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        ref={top}
        data={rows}
        // Owner, 2026-10-05: the bottom of a fetched list says so.
        ListFooterComponent={rows.length > 0 ? <EndOfList /> : undefined}
        keyExtractor={(r) => r.episode.id}
        extraData={[counts, marks]} // the counts and marks arrive after the rows; without this a row keeps its old look
        contentContainerStyle={{ paddingBottom: TAB_PAGE_END }}
        ListHeaderComponent={
          <Box>
            <Box className="px-screen-x pt-section">
              <Text className="font-display text-display text-text" accessibilityRole="header">Updates</Text>
              <Link href="/subscriptions" asChild>
                <Pressable accessibilityRole="link" accessibilityLabel={`My subscriptions, ${subscribed}`} className="self-start flex-row items-center gap-2" style={TAP}>
                  <Icon name="library-outline" size={16} color={c.accent} />
                  <Text className="text-accent text-meta font-semibold">{`My subscriptions · ${subscribed} ›`}</Text>
                </Pressable>
              </Link>
            </Box>
            {/* Owner, 2026-10-05: no Continue listening card — the same episodes are in the list below. */}
            {/* M12 FR-104: voice statuses from you and the people you follow (signed in only). */}
            {listenerId !== undefined ? <VoicePosts load={loadVoice} remove={m12.deleteVoicePost} pauseEpisode={player.pause} colours={c} me={{ name: me?.displayName ?? '', avatarUrl: myAvatar }} /> : null}
            {starredShows.length > 0 ? (
              <Box className="pt-section">
                <Text className="font-display text-base text-text px-screen-x" accessibilityRole="header">Starred shows</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row px-screen-x" className="pt-2">
                  {starredShows.map((s) => (
                    <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, starred`} style={STAR_ITEM}>
                      <Artwork url={s.imageUrl} size={STAR_ART} rounded="row" name={s.title} />
                      <Text className="text-text text-xs font-semibold mt-1" numberOfLines={1}>{s.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Box>
            ) : null}
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
              doneColour={c.accent}
              queued={queuedIds.has(e.id)}
              download={downloadOf(e.id)}
              onOpenShow={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } })}
              onOpenEpisode={() => router.push({ pathname: '/episode/[id]', params: { id: e.id } })}
              onQueue={() => queue(e.id)}
              onComments={() => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: e.id } })}
              onDownload={() => download(e.id)}
              onMore={() => setMenuFor(item)}
              onLongPress={() => setMenuFor(item)}
              onPlay={() => play(e.id)}
            />
          );
        }}
      />
      {/* "⋯" more (Owner, 2026-10-01): the same sheet as a show page's episode row — M21: the shared one. */}
      <EpisodeRowSheet
        episode={menuFor ? { id: menuFor.episode.id, title: menuFor.episode.title, feedUrl: menuFor.episode.feedUrl, showTitle: menuFor.showTitle, imageUrl: menuFor.imageUrl } : undefined}
        comments={menuFor ? counts.counts[menuFor.episode.id] : undefined}
        onClose={() => setMenuFor(undefined)}
        actions={menuFor ? updatesActions(menuFor) : []}
      />
    </SafeAreaView>
  );
}
