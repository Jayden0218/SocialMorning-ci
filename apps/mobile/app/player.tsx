// The full player: artwork, the heat curve as the seek bar, transcript lines, controls, and a settings panel.
/**
 * Now Playing: position and duration updating live (FR-008), play/pause
 * (FR-005), -15 / +30 (FR-006), a seek bar (FR-007), and honest buffering
 * and error states (FR-015).
 *
 * M7 restyled this screen and **changed none of that**. Large rounded artwork over a
 * gradient, the transport on one line, tokens instead of literals — and `Scrubber`,
 * `Rail` and `HeatCurve` recoloured in place, their props, structure and accessibility
 * output frozen (research R6). Every label a screen reader speaks here was verified on
 * the phone in M6's J5; none of them is touched.
 *
 * Laid out after the owner's reference (2026-09-27), on the white theme: a chevron that
 * closes the player; the artwork; the title centred, the show's name beside a small
 * Subscribe; the current transcript line; elapsed on the left and time LEFT on the
 * right; the heat curve and the seek bar together in one grey box; then speed, −15,
 * play/pause, +30 and React on one line; then About, Playlist and Comments. Everything
 * the old screen had (chapters, transcript, sleep timer, clip, comment-at) is still here,
 * below the fold. "N listening now" came with M12 (FR-042, src/social/live.ts).
 *
 * M17 (constitution v3.0.0): the page uses the light Editorial palette (`Player-B`), washed from
 * the show's Studio theme colour when it has one (`playerWash`), else the blurred cover under
 * the light veil. "N listening now" sits in the
 * top bar, and a star there favourites the episode.
 *
 * M17 T043 (`Player-B`): the artwork moves to the left of a "Now playing" eyebrow, a serif title
 * and the show + Subscribe; the current transcript line becomes a large serif quote; the comment
 * markers, heat curve, seek bar and times sit together in one white card under "What listeners
 * felt"; play/pause is a yellow disc, speed a bordered pill; About · Playlist · Comments become a
 * bottom bar under a hairline. Every action, label, handler and the Playback sheet are unchanged.
 *
 * M17 T102 (`PlaybackSheet-B`): the Playback sheet takes B's look — serif title, Chapters and
 * Transcript as cards, Done as a yellow pill at the bottom. Same actions and handlers.
 *
 * M21 US2 (spec story 2), after 小宇宙's player:
 *   - the page slides up and closes with a swipe down (app/_layout.tsx, guard G-M21-11);
 *   - the speed pill opens `SettingsPanel`, a full-screen panel in place of the Playback sheet:
 *     Loop, Skip silence, Speed (slider + "This show only"), Sleep, then Chapters / Transcript / Done;
 *   - the heat curve IS the seek bar (`HeatScrubber`); the separate Scrubber is gone;
 *   - two transcript lines (now, next): a tap expands the transcript in place, ⤢ opens it full
 *     screen; a long-press on a line can report a mistake;
 *   - turning 👍 on plays a short full-screen burst (`ClapBurst`).
 *
 * M21 US11: an Audio output button in the top bar (hidden when the phone has no route picker), and
 * the panel's Route and Voice boost rows (`AudioRows`); on iPhone an HLS episode greys out Skip
 * silence and Voice boost.
 */
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { BarButton, TAP, TopBar } from '@/ui/kit/TopBar';
import { Image } from '@/ui/lib/image';
import { Artwork } from '@/ui/kit/Artwork';
import { mediaKindOf, plural } from '@socialmorning/social-core';
import { VideoStage } from '@/ui/player/VideoStage';
import { usePlayer, usePlayerState } from '@/playback/store';
import { scrubberValue } from '@/ui/player/Scrubber';
import { mmss } from '@/ui/kit/format';
import { useStores, useSubscriptionSync } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { usePoll } from '@/social/usePoll';
import type { ComposerState } from '@/social/composer';
import { ComposerSheet } from '@/ui/comments/Composer';
import { ShareChooser } from '@/ui/clips/ShareChooser';
import { useQueueSheet, useSwipeUpToOpen } from '@/ui/queue/QueueSheetHost';
import { liveLabel, useListeningNow } from '@/social/live';
import { MomentSheet } from '@/ui/comments/MomentSheet';
import { Rail, railMarkers, type RailMarker } from '@/ui/player/Rail';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { HeatScrubber } from '@/ui/player/HeatScrubber';
import { SettingsPanel } from '@/ui/player/SettingsPanel';
import { RouteButton, RouteRow, VoiceBoostRow, useEffectsBlocked } from '@/ui/settings/AudioRows';
import { ClapBurst } from '@/ui/player/ClapBurst';
import { MoonButton } from '@/ui/player/MoonButton';
import { ChapterList, CurrentChapter } from '@/ui/player/ChapterList';
import { TranscriptPane } from '@/ui/player/TranscriptPane';
import { TranscriptPeek, TranscriptReportSheet } from '@/ui/player/TranscriptExtras';
import type { TranscriptLine } from '@socialmorning/player-core';
import { useQuoteShare, useQuoteVideo } from '@/ui/player/QuoteShare';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
/**
 * iPhone walk 2026-10-06 (B1 failed): iOS would not open the share sheet over the open Playback sheet
 * (a modal). M21: the settings panel is our own view, not a modal, and is gone at once — the share
 * still waits a moment for it to close.
 */
const PANEL_CLOSE_MS = 50;
import { getPref, setPref } from '@/settings/prefs';
import { fetchExtras, readExtras, type Extras } from '@/feeds/fetch-extras';
import { router } from 'expo-router';
import { useNextUp } from '@/ui/player/NextUp';
import { EndOffer } from '@/ui/player/EndOffer';
import { endOffer } from '@/discover/end-offer';
import { toPlayable } from '@/storage/playable';
import { useDiscover } from '@/discover/useDiscover';
import { size, tabular } from '@/design';
import { LinearGradient } from '@/design/tailwind';
import { playerWash, usePlayerPalette } from '@/ui/player/palette';
import { useShowExtras } from '@/ui/show/ShowExtras';
import { isFavourite, toggleFavourite } from '@/me/favourites';

export default function PlayerScreen(): React.ReactElement {
  const player = usePlayer();
  const state = usePlayerState();
  // M12 FR-042: "N listening now" — before the early returns, as every hook must be.
  const liveCount = useListeningNow(state.kind === 'idle' ? undefined : state.episodeId, state.kind === 'playing' || state.kind === 'buffering');
  const stores = useStores();
  // M17: the player uses the light Editorial palette (with the listener's accent).
  const c = usePlayerPalette();
  const { composer, reactToggle, refresh, useEpisodeSocial, listener, bump, api } = useSocial();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  const [myBuckets, setMyBuckets] = useState<number[] | undefined>();
  // M2 (US5): chapters + transcript, fetched once per episode, cached (research R5).
  const [extras, setExtras] = useState<Extras | undefined>();
  const [pane, setPane] = useState<'none' | 'chapters' | 'transcript'>('none');
  const [openMarker, setOpenMarker] = useState<RailMarker | undefined>();
  // M4: remember where the last clip ended so "Keep listening" is offered right there.
  const [lastClipEnd, setLastClipEnd] = useState<number | undefined>();
  const clipNow = player.clip();
  useEffect(() => { if (clipNow) setLastClipEnd(clipNow.endMs); }, [clipNow]);
  const currentEpisodeId = state.kind === 'idle' ? undefined : state.episodeId;
  // Owner, 2026-10-01: the show's Studio theme colour (if set) tints the top of the page.
  const [showExtras] = useShowExtras((currentEpisodeId ? stores.feeds.getEpisode(currentEpisodeId)?.feedUrl : undefined) ?? '');
  const wash = playerWash(showExtras?.overrides?.themeColour);
  // M5 (FR-010): the end-of-episode offer — fetched while the episode plays, shown at `ended` with an empty queue, never autoplayed.
  const nextUp = useNextUp(currentEpisodeId);
  const { open: discoverOpen } = useDiscover();
  const offer = endOffer(state, stores.queue.list(), nextUp.items, currentEpisodeId);
  const { cached, stale } = useEpisodeSocial(currentEpisodeId);
  useEffect(() => {
    setExtras(currentEpisodeId ? readExtras(stores.extras, currentEpisodeId) : undefined);
    setPane('none');
    setTranscriptOpen(false);
    const ep = currentEpisodeId ? stores.feeds.getEpisode(currentEpisodeId) : undefined;
    if (!ep || (!ep.chaptersUrl && ep.transcripts.length === 0)) return;
    let live = true;
    void fetchExtras({ fetch, store: stores.extras, now: () => Date.now() }, ep).then((x) => { if (live) setExtras(x); });
    return () => { live = false; };
  }, [currentEpisodeId, stores]);
  const serverBuckets = cached?.social.myReactionBuckets;
  const shownBuckets = myBuckets ?? serverBuckets ?? [];
  // The 10 s poll runs while this screen is focused and the app is foreground (US2, T032/T033).
  usePoll(currentEpisodeId);
  const subscriptionSync = useSubscriptionSync();
  const [, setTick] = useState(0);
  // Speed, sleep timer, chapters and transcript live in one sheet behind the left
  // control, so the screen itself is only what the reference shows (owner, 2026-09-27).
  const [more, setMore] = useState(false);
  // M21 US2: skip silence, kept in prefs (src/settings/prefs.ts) and applied at start-up (providers).
  const [skipSilence, setSkipSilenceOn] = useState(() => getPref(stores.settings, 'skipSilence'));
  // M21 US11: iPhone + an HLS episode → no audio tap, so skip silence and voice boost are greyed out.
  const effectsBlocked = useEffectsBlocked();
  // M21 US2: the transcript expanded in place under its two lines; a line being reported; the clap.
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [reporting, setReporting] = useState<TranscriptLine | undefined>();
  const [claps, setClaps] = useState(0);
  // M19 T070 (US7, research R2): "Loop this episode" — the runtime turns it off on any load.
  const [looping, setLooping] = useState(() => player.loop());
  useEffect(() => { setLooping(player.loop()); }, [player, currentEpisodeId]);
  // M12 FR-033: Share opens a first step (episode link · this moment · picture).
  const [sharing, setSharing] = useState(false);
  // M20 US1: lines picked from the transcript, shared as the server's quote card.
  const shareQuote = useQuoteShare();
  const insets = useSafeAreaInsets();
  const shareQuoteVideo = useQuoteVideo();
  // M12 FR-044: the queue opens as a sheet over the player (was a separate page). M21 US3: it is
  // the one sheet the root holds (src/ui/queue/QueueSheetHost.tsx), also opened by a swipe up
  // on the controls and the bar under them (FR-020).
  const queueSheet = useQueueSheet();
  const swipeUp = useSwipeUpToOpen();
  const screen = useWindowDimensions();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (state.kind === 'idle') {
    return (
      <>
      <SafeAreaView className={FILL}>
        <TopBar back="down" onBack={close} />
        <Box className={BODY}><Text className={SUBTITLE}>Nothing is playing yet.</Text></Box>
      </SafeAreaView>
      </>
    );
  }

  if (state.kind === 'error') {
    return (
      <>
      <SafeAreaView className={FILL}>
        <TopBar back="down" onBack={close} />
        <Box className={BODY}>
          <Text className={`${TITLE} text-center`}>{state.message}</Text>
          <Pressable className={PRIMARY} accessibilityRole="button" onPress={() => player.play()}>
            <Text className={PRIMARY_TEXT}>Try again</Text>
          </Pressable>
        </Box>
      </SafeAreaView>
      </>
    );
  }

  const episode = stores.feeds.getEpisode(state.episodeId);
  const show = episode === undefined ? undefined : stores.feeds.getShow(episode.feedUrl);
  const artworkUrl = episode?.imageUrl ?? show?.imageUrl;

  const positionMs = state.kind === 'ended' ? (state.durationMs ?? 0) : state.positionMs;
  const durationMs = state.kind === 'loading' ? episode?.durationMs : state.durationMs;
  const isPlaying = state.kind === 'playing' || state.kind === 'buffering';
  // The server buckets moments against the duration it was first told (the feed's,
  // e.g. 50:49) which can differ from what the player measures (48:19). Every bucket
  // computation on the phone uses the server's axis, or the toggle state is wrong
  // (seen on the phone 2026-09-21: bucket 92 vs 88).
  const heatAxisMs = cached?.social.episode.durationMs ?? durationMs;

  const feedUrl = episode?.feedUrl;
  const subscribed = feedUrl !== undefined && stores.subscriptions.has(feedUrl);
  const subscribe = () => {
    if (feedUrl === undefined || subscribed) return;
    stores.subscriptions.add(feedUrl, Date.now());
    subscriptionSync.push();
    setTick((n) => n + 1);
  };
  const favourite = isFavourite(stores.settings, state.episodeId);
  const live = liveLabel(liveCount);
  const rate = player.rate();
  // M10b US4 (FR-015): "Show transcript entry" off → no transcript button and no live line.
  const showTranscript = getPref(stores.settings, 'transcriptEntry');
  const timedTranscript = showTranscript && extras?.transcript && 'lines' in extras.transcript ? extras.transcript : undefined;
  const reacted = reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs);
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  const clip = () => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    router.push({ pathname: '/clip/new', params: { episodeId: state.episodeId, positionMs: String(positionMs) } });
  };

  // M17 (`Player-B`): the artwork sits beside the title, 148 pt on a 390 pt phone.
  // Owner, 2026-10-06: the artwork grows with the screen (184 pt on a 6.9" phone), no fixed 148 cap.
  const art = Math.round(Math.min(screen.width * 0.42, screen.height * 0.2));
  const markerCount = railMarkers(cached?.social.comments ?? []).length;
  // M12 FR-020 (found on the iPhone): the comment button opens the conversation, not the
  // keyboard; the page's write box carries this moment.
  const openComments = () =>
    router.push({ pathname: '/comments/[episodeId]', params: { episodeId: state.episodeId, at: String(Math.round(positionMs)) } });

  return (
    <>
    <Box className={FILL}>
    {/* The show's theme colour, laid lightly over the page while the text still reads on it. */}
    {wash ? <LinearGradient colors={wash} className="absolute inset-0" accessible={false} /> : (
      <>
        {/* M12 FR-040: the cover, blurred, tints the whole player; the (dark) veil keeps the text readable. */}
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} blurRadius={40} className="absolute inset-0" style={COVER} accessible={false} importantForAccessibility="no-hide-descendants" />
        ) : null}
        <Box className="absolute inset-0 bg-veil" accessible={false} />
      </>
    )}
    <SafeAreaView className="flex-1">
    <TopBar
      back="down"
      onBack={close}
      middle={live ? (
        // Owner, 2026-10-01: "N listening now" near the top, as a small pill with a dot.
        <Box className="flex-1 items-center">
          <Box className="flex-row items-center gap-1 bg-accentTint rounded-pill px-2 py-0.5" accessible accessibilityLabel={live}>
            <Box className="w-1.5 h-1.5 rounded-pill bg-accent" />
            <Text className="text-accent text-xs font-semibold">{live}</Text>
          </Box>
        </Box>
      ) : undefined}
    >
      {/* M21 US11 (FR-100): the system audio-route picker under our own icon; absent when there is none. */}
      <RouteButton colour={c.text} />
      {/* Owner, 2026-10-01: a star in the bar favourites this episode (src/me/favourites). */}
      <Pressable
        onPress={() => { toggleFavourite(stores.settings, state.episodeId, Date.now()); setTick((n) => n + 1); }}
        accessibilityRole="button"
        accessibilityState={{ selected: favourite }}
        accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
        className="items-center justify-center"
        style={TAP}
      >
        <Icon name={favourite ? 'star' : 'star-outline'} size={24} color={favourite ? c.accent : c.text} />
      </Pressable>
      <BarButton label="Clip the last 30 seconds" onPress={clip}><Icon name="cut-outline" size={24} color={c.text} /></BarButton>
      <BarButton label="Share this episode" onPress={() => setSharing(true)}>
        <Icon name="share-outline" size={24} color={c.text} />
      </BarButton>
    </TopBar>
    {/* M17: the page reads top-down (hero, quote, card, controls); it scrolls only when a large font needs it. */}
    <ScrollView className="flex-1" contentContainerClassName="flex-grow px-screen-x pt-2 pb-section gap-section">
      {/* The hero: artwork on the left; eyebrow, serif title, show and Subscribe on the right. */}
      <Box className="flex-row items-end gap-section">
        {/* M10b US5: a video episode shows its picture (muted, following the sound). */}
        {episode && mediaKindOf(episode.enclosureType, episode.enclosureUrl) === 'video'
          ? <VideoStage url={episode.enclosureUrl} positionMs={positionMs} playing={isPlaying} size={art} />
          : <Artwork url={artworkUrl} size={art} name={show?.title} />}
        <Box className="flex-1 gap-1">
          <Eyebrow accent>Now playing</Eyebrow>
          <Text className={TITLE} numberOfLines={4}>{episode?.title ?? 'Now playing'}</Text>
          <Box className="flex-row items-center gap-2 flex-wrap">
            {feedUrl === undefined ? <Text className={SUBTITLE}>{show?.title ?? ''}</Text> : (
              <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } })} accessibilityRole="link" accessibilityLabel={`Show: ${show?.title ?? ''}`} className="justify-center flex-shrink" style={{ minHeight: TAP.minHeight }}>
                <Text className="text-meta text-muted" numberOfLines={1}>{show?.title ?? ''}</Text>
              </Pressable>
            )}
            {feedUrl === undefined || subscribed ? null : (
              <Pressable onPress={subscribe} accessibilityRole="button" accessibilityLabel="Subscribe to this show" className="justify-center" style={{ minHeight: TAP.minHeight }}>
                <Box className="bg-text rounded-pill px-2.5 py-1.5"><Text className="text-xs font-bold text-background">+ Subscribe</Text></Box>
              </Pressable>
            )}
          </Box>
        </Box>
      </Box>

      {extras?.chapters && extras.chapters.length > 0 ? <CurrentChapter chapters={extras.chapters} positionMs={positionMs} /> : null}
      {/* M21 US2: the line being spoken and the next (M10b US4: absent when the transcript entry is off).
          A tap expands the transcript here; ⤢ opens it full screen. */}
      {timedTranscript ? (
        <TranscriptPeek transcript={timedTranscript} positionMs={positionMs} episodeId={state.episodeId} expanded={transcriptOpen} onToggle={() => setTranscriptOpen((v) => !v)} />
      ) : null}
      {timedTranscript && transcriptOpen ? (
        <TranscriptPane transcript={timedTranscript} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} onReport={setReporting} durationMs={durationMs}
          onShareImage={(q) => { void shareQuote(episode, q); }}
          onShareVideo={shareQuoteVideo ? (q) => shareQuoteVideo(episode ? toPlayable(stores, episode.id) : undefined, q) : undefined} />
      ) : null}

      {/* Owner, 2026-10-06 (iPhone walk): on a tall phone the page left a white gap at the foot. The card
          and the controls now sit at the bottom, just above the bar; the free space goes between the
          quote and the card. Short phones and large fonts still scroll as before. */}
      <Box className="mt-auto gap-section">
      {/* What listeners felt: markers, heat curve, seek bar and times in one card. */}
      <Card className="py-row gap-1">
        <Box className="flex-row justify-between items-baseline">
          <Eyebrow>What listeners felt</Eyebrow>
          {markerCount > 0 ? <Text className="text-xs text-muted">{plural(markerCount, 'commented moment')}</Text> : null}
        </Box>
        <Rail
          comments={cached?.social.comments ?? []}
          durationMs={durationMs}
          onTap={(m) => {
            player.seek(m.offsetMs);
            setOpenMarker(m);
          }}
        />
        {/* M21 US2: the heat curve is the seek bar — drag or tap it; a tap on a commented moment opens it. */}
        <HeatScrubber
          heat={cached?.social.heat}
          positionMs={positionMs}
          durationMs={durationMs}
          heatAxisMs={heatAxisMs}
          myBuckets={shownBuckets}
          onSeek={(ms) => player.seek(ms)}
          onSkip={(d) => player.skip(d)}
          onTap={(bucket, toMs) => {
            player.seek(toMs);
            const at = (cached?.social.comments ?? []).flatMap((c) => [c, ...(c.replies ?? [])])
              .filter((c) => !c.deleted && c.offsetMs !== null && heatAxisMs !== undefined && Math.floor((c.offsetMs * 100) / heatAxisMs) === bucket);
            if (at.length > 0) setOpenMarker({ second: Math.floor(toMs / 1000), offsetMs: toMs, comments: at });
          }}
        />
        <Box className="flex-row justify-between mt-2" accessible accessibilityLabel={scrubberValue(positionMs, durationMs).text}>
          <Text className="text-meta font-bold text-text" style={tabular}>{mmss(positionMs)}</Text>
          <Text className="text-meta font-bold text-text" style={tabular}>{durationMs === undefined ? '--:--' : `-${mmss(durationMs - positionMs)}`}</Text>
        </Box>
      </Card>

      {/* One status line at most, so the controls below never jump far. */}
      {state.kind === 'buffering' ? <Text className={SUBTITLE}>Buffering…</Text>
        : state.kind === 'loading' ? <Text className={SUBTITLE}>Loading…</Text>
        : state.kind === 'paused' && state.by === 'output-lost' ? <Text className={SUBTITLE}>Paused — your headphones disconnected</Text>
        : player.clip() ? <Text className={SUBTITLE}>Playing a clip · {mmss(player.clip()!.startMs)}–{mmss(player.clip()!.endMs)} · pauses at the end</Text>
        : stale ? <Text className={SUBTITLE}>Couldn't refresh comments — showing the last copy</Text>
        : null}
      {!player.clip() && state.kind === 'paused' && lastClipEnd !== undefined && Math.abs(positionMs - lastClipEnd) <= 6_000 ? (
        <Box className={CLIP_BANNER}>
          <Text className={SUBTITLE}>The clip ended.</Text>
          <Pressable className={SECONDARY} accessibilityRole="button" onPress={() => { setLastClipEnd(undefined); player.play(); }}><Text className={SECONDARY_TEXT}>Keep listening</Text></Pressable>
        </Box>
      ) : null}
      {offer ? (
        <EndOffer item={offer} onPlay={() => {
          const local = toPlayable(stores, offer.episode.id);
          if (local) { player.load(local, 'play'); return; }
          void discoverOpen(offer.episode);
        }} />
      ) : null}

      <Box className="flex-row items-center justify-between" {...swipeUp}>
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel={`Speed ${rate.toFixed(1)}×, sleep timer and chapters`} className={SPEED}>
          <Text className="text-meta font-bold text-text" style={tabular}>{rate.toFixed(1)}×</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip back 15 seconds" onPress={() => player.skip(-15_000)} className={ROUND}>
          <Box style={MIRROR}><Icon name="refresh-outline" size={40} color={c.text} /></Box>
          <Text className={SKIP_NUMBER}>15</Text>
        </Pressable>
        <Pressable
          className={PLAY}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={34} color={c.playGlyph} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip forward 30 seconds" onPress={() => player.skip(30_000)} className={ROUND}>
          <Icon name="refresh-outline" size={40} color={c.text} />
          <Text className={SKIP_NUMBER}>30</Text>
        </Pressable>
        <Pressable
          className={ROUND}
          accessibilityRole="button"
          accessibilityLabel={reacted ? 'Remove your reaction here' : 'React at this moment'}
          accessibilityState={{ selected: reacted }}
          onPress={() => {
            if (!listener) { router.push('/auth/sign-in'); return; }
            // M21 US2: turning the reaction ON claps (a ≤ 1 s burst; none with Reduce Motion).
            if (!reacted) setClaps((n) => n + 1);
            const r = reactToggle.toggle(state.episodeId, shownBuckets, positionMs, heatAxisMs);
            setMyBuckets(r.optimistic);
            void r.settled.then((s) => { setMyBuckets(s.myBuckets); bump(state.episodeId); });
          }}
        >
          {/* Filled vs outline, and the name — never hue alone (FR-016). */}
          <Icon name={reacted ? 'thumbs-up' : 'thumbs-up-outline'} size={28} color={reacted ? c.accent : c.muted} />
        </Pressable>
      </Box>
      </Box>
    </ScrollView>

    {/* About · Playlist · Comments: the page's bottom bar, under a hairline. Owner, 2026-10-06: the
        wash reaches the bottom edge, so this page (alone) keeps the bar above the home indicator itself. */}
    <Box className="flex-row mx-screen-x border-t-hairline border-separator" style={{ paddingBottom: insets.bottom }} {...swipeUp}>
      <Box className="flex-1 items-center">
        <BarButton label="About this episode" onPress={() => router.push({ pathname: '/episode/[id]', params: { id: state.episodeId } })}>
          <Icon name="information-circle-outline" size={22} color={c.text} />
          <Text className={BAR_LABEL}>About</Text>
        </BarButton>
      </Box>
      <Pressable onPress={() => queueSheet.open()} accessibilityRole="button" accessibilityLabel="Playlist" className={BAR_ITEM} style={{ minHeight: TAP.minHeight }}>
        <Icon name="list" size={22} color={c.text} />
        <Text className={BAR_LABEL}>Playlist</Text>
      </Pressable>
      <Pressable onPress={openComments} accessibilityRole="button" accessibilityLabel={`Comments, ${commentCount}`} className={BAR_ITEM} style={{ minHeight: TAP.minHeight }}>
        <Icon name="chatbox-ellipses-outline" size={22} color={c.text} />
        <Text className={BAR_LABEL}>Comments {commentCount}</Text>
      </Pressable>
      {/* M21 US1 (FR-001): the sleep timer, one tap away, with its countdown. */}
      <MoonButton className={BAR_ITEM} colour={c.text} activeColour={c.accent} />
    </Box>
    </SafeAreaView>

    {/* M21 US2: the player's settings, a full-screen panel over the page (was the "Playback" sheet).
        Chapters and Transcript stay here as two cards; Done is the yellow pill at the foot. */}
    <SettingsPanel
      open={more}
      onClose={() => setMore(false)}
      looping={looping}
      onLoop={(v) => { player.setLoop(v); setLooping(v); }}
      skipSilence={skipSilence}
      onSkipSilence={(v) => { setPref(stores.settings, 'skipSilence', v); player.setSkipSilence(v); setSkipSilenceOn(v); }}
      skipSilenceDisabled={effectsBlocked}
      routeSlot={<RouteRow />}
      voiceBoostSlot={<VoiceBoostRow />}
    >
      {extras && (extras.chapters?.length || (showTranscript && extras.transcript)) ? (
        <Box className="flex-row gap-row">
          {extras.chapters && extras.chapters.length > 0 ? (
            <Pressable className={pane === 'chapters' ? TILE_ON : TILE} style={{ minHeight: TAP.minHeight }} onPress={() => setPane(pane === 'chapters' ? 'none' : 'chapters')} accessibilityRole="button" accessibilityLabel={`Chapters (${extras.chapters.length})`} accessibilityState={{ expanded: pane === 'chapters' }}>
              <Icon name="library-outline" size={22} color={pane === 'chapters' ? c.onPrimary : c.accent} />
              <Text className={pane === 'chapters' ? TILE_ON_TITLE : TILE_TITLE}>Chapters</Text>
              <Text className={pane === 'chapters' ? TILE_ON_DETAIL : TILE_DETAIL}>{plural(extras.chapters.length, 'chapter')}</Text>
            </Pressable>
          ) : null}
          {showTranscript && extras.transcript ? (
            <Pressable className={pane === 'transcript' ? TILE_ON : TILE} style={{ minHeight: TAP.minHeight }} onPress={() => setPane(pane === 'transcript' ? 'none' : 'transcript')} accessibilityRole="button" accessibilityLabel="Transcript" accessibilityState={{ expanded: pane === 'transcript' }}>
              <Icon name="document-text-outline" size={22} color={pane === 'transcript' ? c.onPrimary : c.accent} />
              <Text className={pane === 'transcript' ? TILE_ON_TITLE : TILE_TITLE}>Transcript</Text>
              <Text className={pane === 'transcript' ? TILE_ON_DETAIL : TILE_DETAIL}>Follows the audio</Text>
            </Pressable>
          ) : null}
        </Box>
      ) : null}
      {extras?.error ? <Text className="text-xs text-muted">Couldn't load {extras.error.includes('chapters') ? 'chapters' : 'the transcript'}</Text> : null}
      {pane === 'chapters' && extras?.chapters ? <ChapterList chapters={extras.chapters} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}
      {showTranscript && pane === 'transcript' && extras?.transcript ? <TranscriptPane transcript={extras.transcript} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} durationMs={durationMs} onReport={(l) => { setMore(false); setReporting(l); }} onShareImage={(q) => { setMore(false); setTimeout(() => { void shareQuote(episode, q); }, PANEL_CLOSE_MS); }} onShareVideo={shareQuoteVideo ? (q) => { setMore(false); setTimeout(() => shareQuoteVideo(episode ? toPlayable(stores, episode.id) : undefined, q), PANEL_CLOSE_MS); } : undefined} /> : null}
      <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center rounded-pill bg-primary mt-1" style={DONE}>
        <Text className="text-sm font-bold text-onPrimary">Done</Text>
      </Pressable>
    </SettingsPanel>
    <TranscriptReportSheet episodeId={state.episodeId} line={reporting} onClose={() => setReporting(undefined)} />
    {/* M21 US2: the clap — over everything, never in the way of a tap. */}
    <ClapBurst trigger={claps} />

    {composing ? (
      <ComposerSheet
        initial={composing}
        onClose={() => setComposing(undefined)}
        onPosted={() => { void refresh(state.episodeId); }}
      />
    ) : null}
    {openMarker ? (
      <MomentSheet
        episodeId={state.episodeId}
        title={`At ${mmss(openMarker.offsetMs)}`}
        comments={(cached?.social.comments ?? []).filter((c) => openMarker.comments.some((m) => m.id === c.id || c.replies?.some((r) => r.id === m.id)))}
        onClose={() => setOpenMarker(undefined)}
        onReply={(parentId) => {
          setOpenMarker(undefined);
          setComposing(composer.open({ episodeId: state.episodeId, offsetMs: positionMs, ...(durationMs !== undefined ? { durationMs } : {}) }, parentId));
        }}
      />
    ) : null}
    {episode ? (
      <ShareChooser
        open={sharing}
        onClose={() => setSharing(false)}
        episode={{ id: episode.id, title: episode.title, showTitle: show?.title ?? '' }}
        atMs={positionMs}
        onClip={clip}
        onShared={() => void api.recordShare({ targetKind: 'episode', targetId: episode.id, feedUrl: episode.feedUrl }).catch(() => undefined)}
      />
    ) : null}
    </Box>
    </>
  );
}

// The screen's classes, named once because several elements share them.
const FILL = 'flex-1 bg-background';
/** The blurred cover fills the screen behind the player (a style: it is a size, not a class). */
const COVER = { width: '100%', height: '100%' } as const;
const BODY = 'flex-1 p-section gap-2 items-center justify-center';
/** The idle/error message; on the main page, the episode's serif title beside the artwork. */
const TITLE = 'text-lg font-display text-text';
const SUBTITLE = 'text-xs text-muted text-center';
/** The round controls either side of play/pause. */
const ROUND = 'w-14 h-14 items-center justify-center';
/** M17: speed is a bordered pill showing the rate. */
const SPEED = 'w-14 h-12 rounded-pill border border-border bg-surface items-center justify-center';
/** M17: play/pause is the yellow disc. */
const PLAY = 'w-[76px] h-[76px] rounded-pill bg-playDisc items-center justify-center';
const BAR_ITEM = 'flex-1 items-center justify-center py-1.5 gap-0.5';
const BAR_LABEL = 'text-xs font-semibold text-text';
/** The 15 / 30 inside the circular arrow. */
const SKIP_NUMBER = 'absolute text-xs font-bold text-text';
/** The back arrow is the forward arrow, mirrored. A transform, so a style. */
const MIRROR = { transform: [{ scaleX: -1 }] };
const PRIMARY = 'min-h-12 py-row px-screen-x rounded-pill bg-primary justify-center';
const PRIMARY_TEXT = 'text-onPrimary font-bold text-sm';
const CLIP_BANNER = 'flex-row gap-row items-center flex-wrap justify-center';
const SECONDARY = 'min-h-12 py-2 px-section rounded-pill border border-separator justify-center';
const SECONDARY_TEXT = 'font-semibold text-xs text-text';
/** M17 (`PlaybackSheet-B`): Chapters / Transcript as half-width cards. Chosen is told apart by the yellow fill AND the pane opening — never by hue alone (FR-016). */
const TILE = 'flex-1 p-section gap-1 rounded-row border border-border bg-surface';
const TILE_ON = 'flex-1 p-section gap-1 rounded-row border border-primary bg-primary';
const TILE_TITLE = 'text-sm font-bold text-text mt-1';
const TILE_ON_TITLE = 'text-sm font-bold text-onPrimary mt-1';
const TILE_DETAIL = 'text-meta text-muted';
const TILE_ON_DETAIL = 'text-meta text-onPrimary';
/** The sheet's Done pill: B's 52 pt, as the token row height (50). A size, so a style. */
const DONE = { minHeight: size.row };
