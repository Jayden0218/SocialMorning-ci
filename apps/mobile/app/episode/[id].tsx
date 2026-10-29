// One episode: the cover and its heat curve, the title, play and subscribe low by the thumb, notes, clips and related below.
/**
 * One episode (FR-003), and the tap that starts audio (Story 1 scenario 2).
 *
 * History: laid out after the owner's reference (2026-09-27), the 小宇宙 episode page (2026-10-01: collapsing bar, Related
 * episodes), M17 `Episode-B` (the Editorial page), M21 US4 (cover tint, selectable notes, Related as a sideways row, the ⋯ sheet's
 * Report episode, "Download to Watch").
 *
 * M31 W3-A (T040, constitution v4.0.0; design-pulse2 `listen.html` `episode--screen`, layout Stage): the Pulse page. The cover fills
 * the top 470 under a veil that fades to the void; on it two glass pills (date · length, and "hottest at 14:32" — tap plays from
 * it) and the episode's heat curve (70 bars, the hot run lit) with the counts under it (`EpisodeStage`). The thumb zone sits 112
 * up — Back, the show link, the title (long-press copies), then Play this episode and Subscribe (`EpisodeTitleBlock`) — over a
 * 300 tall fade, with the tray under it: Add to queue · Comments n · Like · Share · More (`EpisodeTray`). Scrolling up moves the
 * cover away (the page glow stays) and shows the sections, each named by an edge label: Notes (with the host's poll and links),
 * Comments, Clips, Related (a deck of cards). The title block and the tray stay (measured from the top of the home strip, which the root pads:
 * `episodeLayout`). Favourite moved to the More sheet (the drawing's
 * action map); the slim bar's show link, Subscribe and Play (iPhone-1007) are always on screen now, so the collapsing bar is gone.
 * The ⋯ sheet is `EpisodeMoreSheet` (a mosaic of tiles, with its two second pages).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Fade } from '@/ui/kit/Fade';
import { PushedPage } from '@/ui/kit/PushedPage';
import { enqueue } from '@socialmorning/player-core';
import { episodePlayView, livePositionMs, sameEpisodePlayView, usePlayer, usePlayerSelector } from '@/playback/store';
import { mmss, noteParts } from '@/ui/kit/format';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { useLayout } from '@/ui/shell/useLayout';
import * as Clipboard from 'expo-clipboard';
import { toPlayable } from '@/storage/playable';
import { useSocial } from '@/social/context';
import { usePoll } from '@/social/usePoll';
import type { ComposerState } from '@/social/composer';
import { CommentPreview } from '@/ui/comments/CommentPreview';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { ShowExtrasBlock, useShowExtras } from '@/ui/show/ShowExtras';
import { ComposerSheet } from '@/ui/comments/Composer';
import { ClipList } from '@/ui/clips/ClipList';
import { useGraph } from '@/graph/context';
import { useNextUp } from '@/ui/player/NextUp';
import { PlayerBackdrop } from '@/ui/player/PlayerBackdrop';
import { alignHeat } from '@/ui/player/hot';
import { EpisodeStage } from '@/ui/episode/EpisodeStage';
import { EpisodeTitleBlock } from '@/ui/episode/EpisodeTitleBlock';
import { EpisodeTray } from '@/ui/episode/EpisodeTray';
import { EpisodeMoreSheet } from '@/ui/episode/EpisodeMoreSheet';
import { EpisodeSection } from '@/ui/episode/EpisodeSection';
import { ShowNotes, hasNotes } from '@/ui/episode/ShowNotes';
import { RelatedEpisodes } from '@/ui/episode/RelatedEpisodes';
import { EPISODE, episodeLayout } from '@/ui/episode/measures';
import { countsLine, datePill, hottestMoment } from '@/ui/episode/stage';
import { useDiscover } from '@/discover/useDiscover';
import { ApiError } from '@/social/api';
import { useM12Api } from '@/social/m12-api';
import { useProfileApi } from '@/social/profile-api';
import { registrationFor } from '@/social/registration';
import { LikeSheet } from '@/ui/social/LikeSheet';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { EpisodeRowSheet, type RowSheetEpisode } from '@/ui/kit/EpisodeRowSheet';
import { resolveCard } from '@/discover/open';
import { refreshShow } from '@/feeds/fetch';
import type { EpisodeCard } from '@/social/api';

/** On a tablet the page is one column, centred (as the player's). */
const WIDE_COLUMN = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const;
/** The glow behind the scrolled page: `glow('#FF6B8B','#5B3DF5',-300,.3)`. */
const GLOW = { top: -300, opacity: 0.3 } as const;
/** Room under the last section so it clears the thumb zone (title block 112 up + about 190 tall, then the tray's fade). */
const FOOT = 340;
/** The page counts as scrolled once the stage's pills have gone (a short way in). */
const SCROLLED_AT = 40;

export default function EpisodeScreen(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const windowHeight = useWindowDimensions().height;
  const { id } = useLocalSearchParams<{ id: string }>();
  const episode = id === undefined ? undefined : stores.feeds.getEpisode(id);
  const { useEpisodeSocial, refresh, api, listener } = useSocial();
  // M5 (FR-008): "Next up" for this episode; absent when the server has no answer.
  const nextUp = useNextUp(episode?.id);
  const { open: discoverOpen } = useDiscover();
  // M23 US7: loaded / playing / paused position only — a TICK while it plays does not re-render the page.
  const view = usePlayerSelector((s) => episodePlayView(s, episode?.id), sameEpisodePlayView);
  const [composing, setComposing] = useState<ComposerState | undefined>();
  usePoll(episode?.id);
  const { cached, stale } = useEpisodeSocial(episode?.id);
  const { useEpisodeClips } = useGraph();
  const clipCount = useEpisodeClips(episode?.id).clips.length;
  const subscriptionSync = useSubscriptionSync();
  // The fade under the thumb zone is 300 tall over the stage and 260 once the page has scrolled (the drawing's two phones).
  const [scrolled, setScrolled] = useState(false);
  const [subscribed, setSubscribed] = useState(() => episode !== undefined && stores.subscriptions.has(episode.feedUrl));
  const toast = useToast();
  // M22 US17 item 7: the title to the clipboard, with a toast.
  const copyTitle = (title: string) => { void Clipboard.setStringAsync(title).then(() => toast('Title copied.')).catch(() => undefined); };
  // Play next, download and save-a-moment live in the ⋯ sheet, so the page itself is only what the drawing shows.
  const [more, setMore] = useState(false);
  // M12 FR-033: Share opens a first step (episode link · this moment · picture).
  const [sharing, setSharing] = useState(false);
  // M11 (FR-023): a poll the host attached to this episode.
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
  // The server's listener count for the counts line (a failure leaves the part out).
  const m12 = useM12Api();
  const [listeners, setListeners] = useState<number | undefined>();
  useEffect(() => {
    if (!episodeId) return undefined;
    let live = true;
    m12.episodeCounts([episodeId]).then((r) => { if (live) setListeners(r.listeners?.[episodeId]); }, () => undefined);
    return () => { live = false; };
  }, [episodeId, m12]);
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
      <PushedPage title="This episode is no longer in the feed." tone="grey">{null}</PushedPage>
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
  const goShow = () => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(episode.feedUrl) } });

  // The stage: the heat on the audio's own axis, its hottest moment, the pills and the counts.
  const heatAxisMs = cached?.social.episode.durationMs ?? episode.durationMs;
  const rawHeat = cached?.social.heat;
  const heat = alignHeat(rawHeat?.available ? rawHeat.buckets : undefined, heatAxisMs ?? undefined, episode.durationMs);
  const hottest = hottestMoment(rawHeat?.available ? rawHeat.buckets : undefined, heatAxisMs ?? undefined, episode.durationMs);
  const layout = episodeLayout(insets);
  const resume = saved === undefined ? undefined : saved.finished ? 'finished' : `resumes at ${mmss(saved.offsetMs)}`;
  const showNotes = hasNotes(notes) || extras !== undefined;

  return (
    <Box className="flex-1 bg-void">
      <PlayerBackdrop feedUrl={episode.feedUrl} top={GLOW.top} opacity={GLOW.opacity} />
      <Box className="flex-1" style={wide ? WIDE_COLUMN : undefined}>
        <ScrollView
          testID="episode-scroll"
          className="flex-1"
          scrollEventThrottle={64}
          onScroll={(e) => { const past = e.nativeEvent.contentOffset.y > SCROLLED_AT; if (past !== scrolled) setScrolled(past); }}
          contentContainerStyle={{ paddingBottom: layout.titleBottom + FOOT }}
        >
          <EpisodeStage
            layout={layout}
            coverUrl={episode.imageUrl ?? show?.imageUrl}
            name={show?.title}
            date={datePill(episode.publishedAt, episode.durationMs)}
            hottest={hottest}
            heat={heat}
            onHottest={() => { if (hottest) playFrom(hottest.atMs); }}
          />
          {/* F3: the sections start at the fold, as in the drawing (its first screen is the stage and the thumb zone, nothing behind the title block). */}
          <Box testID="episode-fold" style={{ height: Math.max(0, windowHeight - layout.stageHeight) }} />
          {showNotes ? (
            <EpisodeSection label="Notes">
              <ShowNotes parts={notes} onPlayFrom={playFrom} />
              {extras ? <Box className={hasNotes(notes) ? 'mt-section' : ''}><ShowExtrasBlock extras={extras} onPoll={replacePoll} episodeId={episode.id} /></Box> : null}
            </EpisodeSection>
          ) : null}
          <ClipList episode={playable} />
          <EpisodeSection label="Related" bleed>
            <RelatedEpisodes items={nextUp.items} onOpen={(card) => void discoverOpen(card)} onMore={(card) => void moreForCard(card)} />
          </EpisodeSection>
          {/* M12 FR-027: a two-comment preview; the conversation has its own page. It keeps its own heading and sits last, a section like the others (the drawing has no preview: the tray's Comments opens the page; F3: it used to sit behind the title block). */}
          <Box testID="episode-section-comments" style={{ marginTop: EPISODE.sectionGap, marginLeft: EPISODE.lane, marginRight: EPISODE.right }}>
            <CommentPreview
              comments={cached?.social.comments ?? []}
              serverTime={cached?.social.serverTime ?? new Date().toISOString()}
              stale={stale}
              onSeek={playFrom}
              onOpen={openComments}
            />
          </Box>
        </ScrollView>

        <Fade bottom={0} height={scrolled ? EPISODE.fadeScrolled : EPISODE.fadeHeight} />
        <Box testID="episode-title-pos" className="absolute" style={{ left: EPISODE.side, right: EPISODE.side, bottom: layout.titleBottom, zIndex: 20 }}>
          <EpisodeTitleBlock
            title={episode.title}
            showTitle={show?.title}
            playing={playing}
            subscribed={subscribed}
            onBack={() => router.back()}
            onShow={show === undefined ? undefined : goShow}
            onPlay={playOrPause}
            onSubscribe={toggleSubscription}
            onCopyTitle={() => copyTitle(episode.title)}
            counts={countsLine({ listeners, comments: commentCount, clips: clipCount })}
            resume={resume}
          />
        </Box>
        <Box testID="episode-tray-pos" className="absolute" style={{ left: 12, right: 12, bottom: layout.trayBottom, zIndex: 25 }}>
          <EpisodeTray
            commentCount={commentCount}
            liked={like?.liked === true}
            onQueue={addToQueue}
            onComments={openComments}
            onLike={() => void toggleLike()}
            onShare={() => setSharing(true)}
            onMore={() => setMore(true)}
          />
        </Box>
      </Box>

      <ShareChooser
        open={sharing}
        onClose={() => setSharing(false)}
        episode={{ id: episode.id, title: episode.title, showTitle: show?.title ?? '' }}
        atMs={snapshotOffset}
        onClip={() => router.push({ pathname: '/clip/new', params: { episodeId: episode.id, positionMs: String(Math.round(offsetNow())) } })}
        onShared={() => void api.recordShare({ targetKind: 'episode', targetId: episode.id, feedUrl: episode.feedUrl }).catch(reportAndDrop('share.record'))}
      />
      <EpisodeMoreSheet
        open={more}
        onClose={() => setMore(false)}
        episodeId={episode.id}
        episode={episode}
        show={show}
        atMs={snapshotOffset}
        heat={heat}
        durationMs={episode.durationMs}
        onQueued={() => stores.inboxState.mark(episode.id, 'queued', Date.now())}
        onReport={() => setReporting({ kind: 'episode', id: episode.id, authorId: null, label: 'episode' })}
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
      <EpisodeRowSheet episode={rowSheet} onClose={() => setRowSheet(undefined)} />
      <LikeSheet open={noting} title={episode.title} {...(like?.note ? { initialNote: like.note } : {})} busy={savingNote} onSave={(n) => void saveNote(n)} onSkip={() => setNoting(false)} />
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(episode.id); }} />
      ) : null}
    </Box>
  );
}
