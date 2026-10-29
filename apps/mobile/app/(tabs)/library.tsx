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
 * M31 D-A (T031; design-pulse2 `index.html#updates--screen`, `library--*`; layout pattern Deck): the page is the Deck — a Voice edge label over the
 * 56-circle status row (signed in), a Starred edge label over 52 covers, then the new episodes as 290 x 350 cards that snap, the next one
 * peeking in (`UpdateEpisodeRow`). "Updates" and "My subscriptions · n ›" sit low in the title bar (rule 1; the link opens /subscriptions). A
 * card swipes up to mark played and down to remove (the old row swipes, turned for a sideways deck). The caption "n shows could not refresh"
 * sits above the deck. With no subscriptions the deck is replaced by Discover's sections under the empty block, as before. The refresh,
 * the counts, the sheet and every handler are unchanged.
 *
 * M21 US8 (FR-070): the status row starts with my own avatar "+" (Voice or Text); a row of my
 * starred shows sits above "New from your shows"; video episodes carry a video mark (the row).
 */
import { useFocusEffect, useRouter, useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/kit/useColours';
import { enqueue } from '@socialmorning/player-core';
import { useDiscover } from '@/discover/useDiscover';
import { refreshFeeds } from '@/feeds/refresh-service';
import { hideFromUpdates, updatesSnapshot, type UpdateRow } from '@/me/updates';
import { usePlayer } from '@/playback/store';
import { useSafety } from '@/safety/context';
import { toPlayable } from '@/storage/playable';
import { gutter } from '@/design';
import { useWindowDimensions } from 'react-native';
import { DiscoverSections } from '@/ui/discover/DiscoverSections';
import { EmptyState } from '@/ui/kit/EmptyState';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import { useEpisodeHotMoments } from '@/ui/episode/useEpisodeHotMoments';
import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import { useDownloads, usePositionSync, useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
// M22 lane 3 (US12): swipe actions on the rows and the one-time hint.
import { markPlayed } from '@/me/history';
import { useSocial } from '@/social/context';
import { useM12Api } from '@/social/m12-api';
import { VoicePosts } from '@/ui/social/VoicePosts';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Deck } from '@/ui/discover/Deck';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Fade } from '@/ui/kit/Fade';
import { PageGlow } from '@/ui/kit/PageGlow';
import { TitleBar } from '@/ui/kit/TitleBar';
import { Type } from '@/ui/kit/Type';
import { Cover } from '@/ui/library/parts';
import { STARRED_PITCH, UPDATES, VOICE_PITCH } from '@/ui/library/measures';
import { DRAWN } from '@/ui/me/lists';
import { tabTitleReserve, useTabTitleBottom } from '@/ui/me/useTabTitle';
import { useMyAvatar } from '@/me/my-avatar';
import { useProfileApi } from '@/social/profile-api';
import { plural } from '@socialmorning/social-core';
import { EpisodePane, ListDetail, useOpensInPane } from '@/ui/shell/ListDetail';

/** The native page push is about 350 ms; start the network work after it. */
const AFTER_TRANSITION_MS = 400;

/** M22 US12 (data-model "New settings keys"): '1' once the swipe hint has been shown. */
const SWIPE_HINT_KEY = 'updates.swipeHintShown';

export default function UpdatesScreen(): React.ReactElement {
  const top = useRef(null); useScrollToTop(top); // M21 T082: pressing this tab again scrolls to the top.
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  const player = usePlayer();
  const downloads = useDownloads();
  const toast = useToast();
  const { hiddenFeeds } = useSafety();
  const titleBottom = useTabTitleBottom();
  const { width } = useWindowDimensions();
  const [dragging, setDragging] = useState(false);
  // F10: the turned edge labels' lengths, so their blocks are at least that tall (no overlap at 200 % text).
  const [voiceLen, setVoiceLen] = useState(0);
  const [starLen, setStarLen] = useState(0);
  const discover = useDiscover();
  // Defect 5 (2026-10-07): the first render already shows the local shows and episodes.
  const [first] = useState(() => updatesSnapshot(stores, hiddenFeeds));
  const [rows, setRows] = useState<UpdateRow[]>(first.rows);
  // M22 US16 (T071): on a tablet an episode opens in the right pane (src/ui/shell/ListDetail.tsx).
  const inPane = useOpensInPane();
  const [paneId, setPaneId] = useState<string | undefined>(undefined);
  const openEpisodePage = (id: string) => router.push({ pathname: '/episode/[id]', params: { id } });
  const [subscribed, setSubscribed] = useState(first.subscribed);
  const [stale, setStale] = useState(0);
  // M22 US12: "Swipe a row for more", once — the first time Updates shows rows after this release.
  const positionSync = usePositionSync();
  const [swipeHint] = useState(() => stores.settings.get(SWIPE_HINT_KEY) !== '1');
  useEffect(() => { if (swipeHint && rows.length > 0) stores.settings.set(SWIPE_HINT_KEY, '1'); }, [swipeHint, rows.length, stores]);

  // M24 fix F-P: each refresh also asks which episodes the creators hid (`src/feeds/hidden.ts`).
  const social = useSocial();
  const read = useCallback(() => {
    const now = updatesSnapshot(stores, hiddenFeeds);
    setRows(now.rows);
    setSubscribed(now.subscribed);
  }, [stores, hiddenFeeds]);
  useFocusEffect(useCallback(() => {
    let live = true;
    read();
    // The lag audit (2026-10-04, branch perf): every visit fetched every subscribed feed again, one
    // after another, parsing the XML while the page was still sliding in. Now: at most once per
    // REFRESH_THROTTLE_MS (src/feeds/refresh-service.ts), and only after the transition (React Native 0.88 has no InteractionManager,
    // so a timer waits it out).
    const task = setTimeout(() => {
      void refreshFeeds(stores, { hiddenOf: social.api?.hiddenEpisodes }).then((r) => { if (!live) return; setStale(r.stale.length); read(); });
    }, AFTER_TRANSITION_MS);
    return () => { live = false; clearTimeout(task); };
  }, [read, stores, social.api]));

  // iOS L1 (and Android's defect 13): after a sign-in on a fresh install the server's
  // subscriptions were merged only at the next app start, so this page stayed empty until a
  // cold restart. A new listener now reconciles here and the list redraws.
  const subscriptionSync = useSubscriptionSync();
  const me = social.listener;
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
      const r = await refreshFeeds(stores, { force: true, hiddenOf: social.api?.hiddenEpisodes });
      if (!live) return;
      setStale(r.stale.length);
      read();
    });
    return () => { live = false; };
  }, [listenerId, subscriptionSync, read, stores, social.api]);

  // M12 FR-080: each row's comment count — and, Owner 2026-10-01, its plays (`listeners`) —
  // one call for the first 100 rows. A failure leaves the meta line without numbers; the
  // list itself never waits on it.
  const m12 = useM12Api();
  const [counts, setCounts] = useState<{ counts: Record<string, number>; listeners?: Record<string, number> }>({ counts: {} });
  const [menuFor, setMenuFor] = useState<UpdateRow | undefined>(undefined);
  // Wave 5b: the first hot moment of each card, one read per show in the deck.
  const hotMoments = useEpisodeHotMoments(rows.slice(0, 100).map((r) => r.episode.feedUrl));
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
      icon: 'checkmark-done-outline' as const, label: 'Mark as played',
      onPress: () => { setMenuFor(undefined); markPlayed(stores, row.episode.id, Date.now()); void positionSync.flush(); read(); toast('Marked as played.'); },
    },
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

  const row = (item: UpdateRow): React.ReactElement => {
    const e = item.episode;
    return (
      <UpdateEpisodeRow
        key={e.id}
        item={item}
        plays={counts.listeners?.[e.id]}
        comments={counts.counts[e.id]}
        hot={hotMoments.get(e.id)}
        now={Date.now()}
        iconColour={c.muted}
        doneColour={c.accent}
        queued={queuedIds.has(e.id)}
        download={downloadOf(e.id)}
        onOpenShow={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(e.feedUrl) } })}
        onOpenEpisode={() => (inPane ? setPaneId(e.id) : openEpisodePage(e.id))}
        onQueue={() => queue(e.id)}
        onComments={() => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: e.id } })}
        onDownload={() => download(e.id)}
        onMore={() => setMenuFor(item)}
        onLongPress={() => setMenuFor(item)}
        onPlay={() => play(e.id)}
        onDragging={setDragging}
        onRemoveFromUpdates={() => { hideFromUpdates(stores.settings, e.id); read(); toast('Removed from Updates. The show stays subscribed.'); }}
        onMarkPlayed={() => { markPlayed(stores, e.id, Date.now()); void positionSync.flush(); read(); toast('Marked as played.'); }}
      />
    );
  };
  const side = gutter(width);

  return (
    <SafeAreaView className="flex-1 bg-void">
      <ListDetail
        placeholder="Choose an episode to see it here."
        detail={paneId !== undefined ? <EpisodePane episodeId={paneId} onOpenPage={() => openEpisodePage(paneId)} /> : undefined}
        list={
          <Box className="flex-1">
            <PageGlow flip top={-200} strength={0.35} />
            <ScrollView
              ref={top}
              scrollEnabled={!dragging}
              testID="updates-page"
              contentContainerStyle={{ paddingTop: UPDATES.voiceTop - DRAWN.status, paddingBottom: tabTitleReserve(titleBottom) }}
            >
              {/* M12 FR-104: voice statuses from you and the people you follow (signed in only). */}
              {listenerId !== undefined ? (
                <Box testID="voice-block" style={{ minHeight: Math.max(VOICE_PITCH, voiceLen + 2) }}>
                  <EdgeLabel label="Voice" top={4} onLength={setVoiceLen} />
                  <VoicePosts variant="updates" load={loadVoice} remove={m12.deleteVoicePost} pauseEpisode={player.pause} colours={c} me={{ name: me?.displayName ?? '', avatarUrl: myAvatar }} />
                </Box>
              ) : null}
              {starredShows.length > 0 ? (
                <Box testID="starred-block" style={{ minHeight: Math.max(STARRED_PITCH, starLen + 2) }}>
                  <EdgeLabel label="Starred" top={0} onLength={setStarLen} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: UPDATES.lane, paddingRight: side, gap: UPDATES.starred.gap }}>
                    {starredShows.map((s) => (
                      <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={`Open ${s.title}, starred`} hitSlop={UPDATES.starred.gap - 1}>
                        <Cover url={s.imageUrl} name={s.title} size={UPDATES.starred.cover} radius={UPDATES.starred.radius} />
                      </Pressable>
                    ))}
                  </ScrollView>
                </Box>
              ) : null}
              {stale > 0 ? <Type step="caption" className="text-text2" style={{ paddingHorizontal: side, paddingBottom: UPDATES.card.gap }}>{plural(stale, 'show')} could not refresh — showing the saved copy.</Type> : null}
              {rows.length > 0 && swipeHint ? <Type step="caption" className="text-text2" style={{ paddingHorizontal: side, paddingBottom: UPDATES.card.gap }}>Swipe a card up to mark it played, down to remove it</Type> : null}
              {rows.length > 0 ? (
                <Deck width={UPDATES.card.width} height={UPDATES.card.height} lead={UPDATES.card.lead} accessibilityLabel="New from your shows">
                  {rows.map(row)}
                </Deck>
              ) : subscribed === 0 ? (
                <Box>
                  <EmptyState surface="library" page />
                  {discover.view ? (
                    <DiscoverSections body={discover.view.body} stale={discover.view.stale} fetchedAt={discover.view.fetchedAt} onOpen={(card) => void discover.open(card)} />
                  ) : null}
                </Box>
              ) : (
                <Type step="body" className="text-text2" style={{ paddingHorizontal: side }}>No episodes yet.</Type>
              )}
            </ScrollView>
            <Fade bottom={0} height={300} />
            <TitleBar title="Updates" subtitle={`My subscriptions · ${subscribed} ›`} onSubtitle={() => router.push('/subscriptions')} bottom={titleBottom} />
          </Box>
        }
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
