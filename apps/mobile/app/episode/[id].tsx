// One episode: artwork, title, play, subscribe, queue, show notes with clickable times.
/**
 * One episode (FR-003), and the tap that starts audio (Story 1 scenario 2).
 *
 * Laid out after the owner's reference (2026-09-27): back, Subscribe, share and more in
 * the bar; small artwork, then the title large with a round play button beside it; the
 * show's name as a link; "69 min · 13 h ago" with the comment count; then the shownotes,
 * where every timestamp ("00:39") is a link that plays from there.
 *
 * Owner, 2026-10-01 (after the 小宇宙 episode page): the title is text-lg, at most 4 lines; once
 * the page scrolls past it the bar shows the show's 24 pt art, its name, share and a round play
 * button (above that point: back, share and ⋯; Subscribe sits beside the show's name); the
 * page ends with "Related episodes" (next-up, at most 5).
 *
 * M17 (constitution v3.0.0, `Episode-B`): the Editorial layout. A centred hero — 148 pt artwork
 * with a soft shadow, the show's name as an accent eyebrow link, the title in 28 pt serif, then
 * "90 min · 13 h ago · resumes at 26:37". Under it a yellow "Play from …" pill beside a white
 * Subscribe pill, then one white card of three: Queue, comments, Favourite (they were icons on
 * the meta line). Show notes get an eyebrow, a serif lede and one row per chapter time
 * (src/ui/episode/ShowNotes). Every action, name and handler is the one it was.
 *
 * M17 T103 (`EpisodeMoreSheet-B`): the ⋯ sheet heads with the episode (art, show, serif title),
 * its actions are a grid of white tiles (QueueButtons / DownloadButton / EpisodeExtras), and
 * Cancel is an outlined pill.
 *
 * M21 US4 (FR-030…FR-034): the page fades from paper to a light tint of the episode's cover
 * (the server's colour through `tintFor`, measured against the listener's accent); show notes
 * are selectable; Related episodes are a sideways row of cards, a long-press opening the shared
 * episode sheet; the collapsed bar shows Subscribe beside ▶; the ⋯ sheet adds Report episode.
 * M21 US12: beside it, "Download to Watch" (src/ui/episode/WatchTile), hidden without a Watch.
 */
import { plural } from '@socialmorning/social-core';
import { reportAndDrop } from '@/telemetry/reportError';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper, ActionsheetScrollView } from '@/ui/lib/actionsheet';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { enqueue } from '@socialmorning/player-core';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { episodePlayView, livePositionMs, sameEpisodePlayView, usePlayer, usePlayerSelector } from '@/playback/store';
import { ago, minutesLabel, mmss, noteParts } from '@/ui/kit/format';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import * as Clipboard from 'expo-clipboard';
import { isFavourite, toggleFavourite } from '@/me/favourites';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { HeroArtwork } from '@/ui/episode/HeroArtwork';
import { ShowNotes } from '@/ui/episode/ShowNotes';
import { hit } from '@/design';
import { BarButton, TAP, TopBar } from '@/ui/kit/TopBar';
import { toPlayable } from '@/storage/playable';
import { DownloadButton } from '@/ui/episode/DownloadButton';
import { QueueButtons } from '@/ui/queue/QueueButtons';
import { EpisodeExtras, FavouriteTile } from '@/ui/me/EpisodeExtras';
import { useSocial } from '@/social/context';
import { usePoll } from '@/social/usePoll';
import type { ComposerState } from '@/social/composer';
import { CommentPreview } from '@/ui/comments/CommentPreview';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { ShowExtrasBlock, useShowExtras } from '@/ui/show/ShowExtras';
import { ComposerSheet } from '@/ui/comments/Composer';
import { ClipList } from '@/ui/clips/ClipList';
import { useNextUp } from '@/ui/player/NextUp';
import { RelatedEpisodes } from '@/ui/episode/RelatedEpisodes';
import { useDiscover } from '@/discover/useDiscover';
import { ApiError } from '@/social/api';
import { useProfileApi } from '@/social/profile-api';
import { registrationFor } from '@/social/registration';
import { LikeSheet } from '@/ui/social/LikeSheet';
import { tintFor } from '@/design';
import { TintedPage } from '@/ui/kit/TintedPage';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { EpisodeRowSheet, type RowSheetEpisode } from '@/ui/kit/EpisodeRowSheet';
import { SheetTile, TileRow } from '@/ui/queue/QueueButtons';
import { WatchTile } from '@/ui/episode/WatchTile';
import { resolveCard } from '@/discover/open';
import { refreshShow } from '@/feeds/fetch';
import type { EpisodeCard } from '@/social/api';

/** The eyebrow's spaced capitals (as `Eyebrow`, which is a header and cannot be a link). */
const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };
/** One cell of the queue · comments · favourite card (48 pt plus its py-1 padding: 56, as in B). */
const CELL = { minHeight: hit.min };

export default function EpisodeScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const episode = id === undefined ? undefined : stores.feeds.getEpisode(id);
  const { composer, useEpisodeSocial, refresh, api, listener } = useSocial();
  // M5 (FR-008): "Next up" for this episode; absent when the server has no answer.
  const nextUp = useNextUp(episode?.id);
  const { open: discoverOpen } = useDiscover();
  // M23 US7: loaded / playing / paused position only — a TICK while it plays does not re-render the page.
  const view = usePlayerSelector((s) => episodePlayView(s, episode?.id), sameEpisodePlayView);
  const [composing, setComposing] = useState<ComposerState | undefined>();
  usePoll(episode?.id);
  const { cached, stale } = useEpisodeSocial(episode?.id);
  const subscriptionSync = useSubscriptionSync();
  const [subscribed, setSubscribed] = useState(() => episode !== undefined && stores.subscriptions.has(episode.feedUrl));
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const toast = useToast();
  // M22 US17 item 7: the title to the clipboard, with a toast.
  const copyTitle = (title: string) => { void Clipboard.setStringAsync(title).then(() => toast('Title copied.')).catch(() => undefined); };
  // Play next, download and save-a-moment live in the ⋯ sheet, so the page itself is
  // only what the reference shows (owner, 2026-09-27).
  const [more, setMore] = useState(false);
  // M12 FR-033: Share opens a first step (episode link · this moment · picture).
  const [sharing, setSharing] = useState(false);
  const [fav, setFav] = useState(() => episode !== undefined && isFavourite(stores.settings, episode.id));
  // M11 (FR-023): a poll the host attached to this episode.
  // M21 US4: the same call carries the cover tint — the show's cover and this episode's own art.
  const showCover = episode ? stores.feeds.getShow(episode.feedUrl)?.imageUrl : undefined;
  const [extras, replacePoll] = useShowExtras(episode?.feedUrl ?? '', { image: showCover, episodeImage: episode?.imageUrl });
  // M21 US4 (FR-034): Report episode, from the ⋯ sheet; (FR-035) a related card's long-press sheet.
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  const [rowSheet, setRowSheet] = useState<RowSheetEpisode | undefined>();
  const moreForCard = async (card: EpisodeCard) => {
    const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
    if (r.episodeId === undefined) { toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.'); return; }
    setRowSheet({ id: r.episodeId, title: card.title, feedUrl: card.feedUrl, showTitle: card.showTitle, imageUrl: card.imageUrl });
  };
  // Owner, 2026-10-01: the bar collapses once the title has scrolled away. Where the title
  // block ends is measured by its onLayout; until then the bar never collapses.
  const [titleBottom, setTitleBottom] = useState<number | undefined>();
  const [collapsed, setCollapsed] = useState(false);
  // M19 T031 (US3): Like — a public heart with an optional note, seen by people who follow you.
  const profileApi = useProfileApi();
  const [like, setLike] = useState<{ liked: boolean; note?: string } | undefined>();
  const [noting, setNoting] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const episodeId = episode?.id;
  useEffect(() => {
    if (!episodeId || !listener) { setLike(undefined); return; }
    let live = true;
    profileApi.episodeLike(episodeId).then((l) => { if (live) setLike(l); }).catch(() => { if (live) setLike({ liked: false }); });
    return () => { live = false; };
  }, [episodeId, listener, profileApi]);
  /** PUT the like; an episode the server has not met yet is described to it first. */
  const sendLike = async (id: string, note?: string) => {
    try { return await profileApi.like(id, note); } catch (e) {
      const reg = e instanceof ApiError && e.code === 'not_found' ? registrationFor(stores, id) : undefined;
      if (!reg) throw e;
      await api.registerEpisode(id, reg);
      return profileApi.like(id, note);
    }
  };
  const toggleLike = async () => {
    if (!episodeId) return;
    if (!listener) { router.push('/auth/sign-in'); return; }
    const was = like;
    if (was?.liked) {
      setLike({ liked: false });
      try { await profileApi.unlike(episodeId); } catch { setLike(was); toast("Couldn't unlike — try again."); }
      return;
    }
    setLike({ liked: true });
    try { setLike(await sendLike(episodeId)); setNoting(true); } catch { setLike(was ?? { liked: false }); toast("Couldn't like — try again."); }
  };
  const saveNote = async (note: string) => {
    if (!episodeId) return;
    setSavingNote(true);
    try { setLike(await sendLike(episodeId, note)); setNoting(false); toast('Note added'); } catch { toast("Couldn't save the note — try again."); } finally { setSavingNote(false); }
  };

  if (episode === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <TopBar onBack={() => router.back()} />
        <Text className="px-screen-x text-lg font-display text-text">This episode is no longer in the feed.</Text>
      </SafeAreaView>
    );
  }

  const show = stores.feeds.getShow(episode.feedUrl);
  const saved = stores.positions.get(episode.id);
  // M2 (FR-003): a complete download plays from its file; toPlayable decides.
  const playable = toPlayable(stores, episode.id) ?? {
    id: episode.id,
    url: episode.enclosureUrl,
    title: episode.title,
    showTitle: show?.title ?? '',
    ...((episode.imageUrl ?? show?.imageUrl) !== undefined ? { artworkUrl: episode.imageUrl ?? show?.imageUrl } : {}),
    ...(episode.durationMs !== undefined && { durationMs: episode.durationMs }),
  };
  const openComments = () => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: episode.id, at: String(Math.round(offsetNow())) } });
  const playFrom = (offsetMs: number) => {
    // If this episode is already loaded, seek; otherwise load paused-at-start then seek.
    if (view.loaded) {
      player.seek(offsetMs);
      player.play();
    } else {
      player.load(playable, 'play');
      player.seek(offsetMs);
    }
    router.push('/player');
  };
  // The comment box from this screen uses the listener's current position in THIS
  // episode if it is loaded, else the saved position, else the start (US1 #4).
  // M23 US7: read live at the tap (the page no longer re-renders per TICK); a render (a sheet
  // opening) takes the moment then.
  const offsetNow = (): number => livePositionMs(player, episode.id) ?? saved?.offsetMs ?? 0;
  const snapshotOffset: number = offsetNow();

  const { loaded, playing } = view;
  const playOrPause = () => {
    if (playing) { player.pause(); return; }
    if (loaded) player.play(); else player.load(playable, 'play');
    router.push('/player');
  };
  const toggleSubscription = () => {
    if (stores.subscriptions.has(episode.feedUrl)) { stores.subscriptions.remove(episode.feedUrl); setSubscribed(false); }
    else { stores.subscriptions.add(episode.feedUrl, Date.now()); setSubscribed(true); }
    subscriptionSync.push();
  };
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  // M12 FR-003/030/031: text, tappable links and chapter times inside the episode.
  const notes = noteParts(episode.shownotesHtml, episode.durationMs);

  const addToQueue = () => {
    const r = enqueue(stores.queue.list(), episode.id, 'end');
    if (r.refused) { toast('The queue is full (300). Remove something first.'); return; }
    stores.queue.replace(r.queue, Date.now());
    stores.inboxState.mark(episode.id, 'queued', Date.now());
    toast(r.evicted ? 'Added to the queue — the last item was dropped.' : 'Added to the queue');
  };
  const resume = saved === undefined ? '' : saved.finished ? 'finished' : `resumes at ${mmss(saved.offsetMs)}`;
  // M12 FR-035: length and date on one line, where you stopped on its own — it was cut to "resumes…".
  const meta = [minutesLabel(episode.durationMs), ago(episode.publishedAt, Date.now())].filter((p) => p !== '').join(' · ');

  // M17 (`Episode-B`): the yellow pill says where play starts; the accessible name is unchanged.
  const playLabel = playing ? 'Pause' : saved?.finished !== true && snapshotOffset > 0 ? `Play from ${mmss(snapshotOffset)}` : 'Play';
  // M21 US4 (FR-030): the cover the hero draws — the episode's own art, else the show's.
  const pageTint = tintFor(episode.imageUrl ? extras?.episodeTint : extras?.tint, [c.accent]);

  return (
    <TintedPage tint={pageTint}>
    <SafeAreaView className="flex-1">
      <TopBar
        onBack={() => router.back()}
        solid={collapsed}
        {...(collapsed ? {
          middle: (
            <>
              {/* Owner's iPhone, 2026-10-07: the show's name in the slim bar opens the show, as the eyebrow does. */}
              <Pressable
                onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(episode.feedUrl) } })}
                accessibilityRole="link"
                accessibilityLabel={`Show: ${show?.title ?? ''}`}
                className="flex-1 min-w-0 flex-row items-center gap-2"
                style={TAP}
              >
                <Artwork url={show?.imageUrl ?? episode.imageUrl} size={24} rounded="row" name={show?.title} />
                <Text className="text-body font-semibold text-text flex-1 flex-shrink" numberOfLines={1}>{show?.title ?? ''}</Text>
              </Pressable>
              {/* M21 US4 (FR-033): Subscribe stays reachable once the page has scrolled. */}
              <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }}
                className={`justify-center px-row rounded-pill ${subscribed ? 'bg-surface border border-border' : 'bg-primary'}`} style={TAP}>
                <Text className={subscribed ? 'text-xs font-bold text-muted' : 'text-xs font-bold text-onPrimary'}>{subscribed ? 'Subscribed' : 'Subscribe'}</Text>
              </Pressable>
            </>
          ),
        } : {})}
      >
        <BarButton label="Share this episode" onPress={() => setSharing(true)}>
          <Icon name="share-outline" size={24} color={c.text} />
        </BarButton>
        {collapsed ? (
          <Pressable onPress={playOrPause} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play this episode'} className="items-center justify-center" style={TAP}>
            <Box className="w-9 h-9 rounded-pill bg-playDisc items-center justify-center">
              <Icon name={playing ? 'pause' : 'play'} size={18} color={c.playGlyph} />
            </Box>
          </Pressable>
        ) : (
          <BarButton label="More: play next, download, save a moment" onPress={() => setMore(true)}>
            <Icon name="ellipsis-horizontal" size={24} color={c.text} />
          </BarButton>
        )}
      </TopBar>
      <ScrollView
        ref={scroll}
        className="flex-1 overflow-hidden"
        contentContainerClassName="px-screen-x pb-section"
        scrollEventThrottle={32}
        onScroll={(e) => {
          if (titleBottom === undefined) return;
          const past = e.nativeEvent.contentOffset.y > titleBottom;
          if (past !== collapsed) setCollapsed(past);
        }}
      >
        {/* M17: centred hero — artwork, the show as an accent eyebrow link, the serif title, the meta line. */}
        <Box className="items-center pt-1" onLayout={(e) => setTitleBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <HeroArtwork url={episode.imageUrl ?? show?.imageUrl} size={148} name={show?.title} />
          {show === undefined ? <Box className="h-section" /> : (
            <Pressable
              onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(episode.feedUrl) } })}
              accessibilityRole="link"
              accessibilityLabel={`Show: ${show.title}`}
              className="flex-row items-center justify-center gap-0.5 mt-1 px-row"
              style={TAP}
            >
              <Text className="text-accent text-xs font-bold flex-shrink" style={CAPS} numberOfLines={1}>{show.title}</Text>
              <Icon name="chevron-forward" size={14} color={c.accent} />
            </Pressable>
          )}
          {/* M22 US17 item 7: long-press the title to copy it. */}
          <Text
            className="text-text text-hero font-display text-center"
            numberOfLines={4}
            accessibilityRole="header"
            accessibilityHint="Long-press to copy the title"
            accessibilityActions={[{ name: 'longpress', label: 'Copy title' }]}
            onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') copyTitle(episode.title); }}
            onLongPress={() => copyTitle(episode.title)}
          >
            {episode.title}
          </Text>
          {meta !== '' || resume !== '' ? (
            <Text className="text-muted text-meta text-center mt-gap" numberOfLines={2}>
              {meta}
              {meta !== '' && resume !== '' ? ' · ' : ''}
              {resume !== '' ? <Text className="text-accent text-meta font-semibold">{resume}</Text> : null}
            </Text>
          ) : null}
        </Box>
        {/* M17: Play (yellow pill) and Subscribe (white pill) side by side. M24 US19 (owner, 2026-10-08): Play is the strong yellow. */}
        <Box className="flex-row gap-gap mt-section">
          <Pressable
            className="flex-1 flex-row gap-gap rounded-pill bg-primary items-center justify-center px-section"
            style={TAP}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play this episode'}
            onPress={playOrPause}
          >
            <Icon name={playing ? 'pause' : 'play'} size={16} color={c.onPrimary} />
            <Text className="text-onPrimary text-body font-bold" numberOfLines={1}>{playLabel}</Text>
          </Pressable>
          {/* Owner, 2026-10-01: Subscribe sits on the page, not in the bar. */}
          <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }} className="rounded-pill bg-surface border border-border items-center justify-center px-section" style={TAP}>
            <Text className={subscribed ? 'text-muted text-body font-bold' : 'text-text text-body font-bold'}>{subscribed ? 'Subscribed' : '+ Subscribe'}</Text>
          </Pressable>
        </Box>
        {/* M17: queue, comments and favourite as one white card of three. */}
        <Card padded={false} className="flex-row mt-gap">
          <Pressable onPress={addToQueue} accessibilityRole="button" accessibilityLabel="Add to queue" className="flex-1 items-center justify-center gap-0.5 py-1" style={CELL}>
            <Icon name="list-outline" size={20} color={c.text} />
            <Text className="text-text text-xs font-semibold">Queue</Text>
          </Pressable>
          <Pressable onPress={openComments} accessibilityRole="button" accessibilityLabel={`Comments, ${commentCount}`} className="flex-1 items-center justify-center gap-0.5 py-1" style={CELL}>
            <Icon name="chatbox-ellipses-outline" size={20} color={c.text} />
            {/* Owner's iPhone, 2026-10-07: the cell said only "0"; it names itself now. */}
            <Text className="text-text text-xs font-semibold" numberOfLines={1}>{commentCount > 0 ? plural(commentCount, 'comment') : 'Comments'}</Text>
          </Pressable>
          <Pressable onPress={() => setFav(toggleFavourite(stores.settings, episode.id, Date.now()))} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} className="flex-1 items-center justify-center gap-0.5 py-1" style={CELL}>
            {/* Filled vs outline, and the word — never hue alone (FR-016). */}
            <Icon name={fav ? 'heart' : 'heart-outline'} size={20} color={fav ? c.accent : c.text} />
            <Text className="text-text text-xs font-semibold">{fav ? 'Favourited' : 'Favourite'}</Text>
          </Pressable>
          {/* M19 T031: Like — public to your followers, unlike Favourite (yours only). */}
          <Pressable onPress={() => void toggleLike()} accessibilityRole="button" accessibilityState={{ selected: like?.liked === true }} accessibilityLabel={like?.liked ? 'Unlike this episode' : 'Like this episode'} className="flex-1 items-center justify-center gap-0.5 py-1" style={CELL}>
            <Icon name={like?.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={20} color={like?.liked ? c.accent : c.text} />
            <Text className="text-text text-xs font-semibold">{like?.liked ? 'Liked' : 'Like'}</Text>
          </Pressable>
        </Card>
        <ShowNotes parts={notes} onPlayFrom={playFrom} />
        <Box className="mt-section gap-section">
          {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} episodeId={episode.id} /> : null}
          {/* M12 FR-027: a two-comment preview; the conversation has its own page. */}
          <CommentPreview
            comments={cached?.social.comments ?? []}
            serverTime={cached?.social.serverTime ?? new Date().toISOString()}
            stale={stale}
            onSeek={playFrom}
            onOpen={openComments}
          />
        </Box>
        <ClipList episode={playable} />
        <RelatedEpisodes items={nextUp.items} onOpen={(card) => void discoverOpen(card)} onMore={(card) => void moreForCard(card)} />
      </ScrollView>

      <ShareChooser
        open={sharing}
        onClose={() => setSharing(false)}
        episode={{ id: episode.id, title: episode.title, showTitle: show?.title ?? '' }}
        atMs={snapshotOffset}
        onClip={() => router.push({ pathname: '/clip/new', params: { episodeId: episode.id, positionMs: String(Math.round(offsetNow())) } })}
        onShared={() => void api.recordShare({ targetKind: 'episode', targetId: episode.id, feedUrl: episode.feedUrl }).catch(reportAndDrop('share.record'))}
      />
      <Actionsheet isOpen={more} onClose={() => setMore(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="px-screen-x pt-row max-h-[90%] items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <ActionsheetScrollView className="grow-0" testID="episode-more-scroll" keyboardShouldPersistTaps="handled">
          {/* M17 (`EpisodeMoreSheet-B`, T103): the episode on top — 64 pt art, the show as an accent
              line, the serif title — then a 2-column grid of tiles (the three parts) and a Cancel pill. */}
          <Box className="flex-row items-center gap-row mt-gap mb-section">
            <Artwork url={episode.imageUrl ?? show?.imageUrl} size={64} name={show?.title} />
            <Box className="flex-1">
              {show ? <Text className="text-accent text-xs font-bold" numberOfLines={1}>{show.title}</Text> : null}
              <Text className="text-text text-base font-display" numberOfLines={2}>{episode.title}</Text>
            </Box>
          </Box>
          {/* M24 US20 (`EpisodeMoreSheet-B`): the design's four tiles first — Play next · Add to
              queue / Download · Add to favourites — then every extra below; the whole sheet
              scrolls, so Cancel is never cut off when the moment or playlist card opens. */}
          <QueueButtons episodeId={episode.id} onQueued={() => stores.inboxState.mark(episode.id, 'queued', Date.now())} />
          <DownloadButton episodeId={episode.id} beside={<FavouriteTile episodeId={episode.id} />} />
          {/* M10 (owner, 2026-09-27): save this moment with a note; M19: add to playlist. */}
          <EpisodeExtras episodeId={episode.id} atMs={snapshotOffset} noFavourite />
          {/* M21 US4 (FR-034): report the episode — a reason, then moderation, like other reports. */}
          <TileRow>
            <SheetTile icon="flag-outline" label="Report episode" iconColour={c.accent} onPress={() => { setMore(false); setReporting({ kind: 'episode', id: episode.id, authorId: null, label: 'episode' }); }} />
            {/* M21 US12: "Download to Watch" — an empty half-row unless a paired Watch has our app. */}
            <WatchTile episodeId={episode.id} onSent={() => setMore(false)} />
          </TileRow>
          {/* M12 FR-032: a Cancel row closes the list, as a list sheet should. */}
          <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-gap rounded-pill border border-border" style={TAP}>
            <Text className="text-accent text-body font-bold">Cancel</Text>
          </Pressable>
          <Box className="h-row" />
          </ActionsheetScrollView>
        </ActionsheetContent>
      </Actionsheet>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      <EpisodeRowSheet episode={rowSheet} onClose={() => setRowSheet(undefined)} />
      <LikeSheet open={noting} title={episode.title} {...(like?.note ? { initialNote: like.note } : {})} busy={savingNote} onSave={(n) => void saveNote(n)} onSkip={() => setNoting(false)} />
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(episode.id); }} />
      ) : null}
    </SafeAreaView>
    </TintedPage>
  );
}
