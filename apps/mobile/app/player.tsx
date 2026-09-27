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
 * below the fold. The reference's "200+ listening" is left out: there is no such number.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, Text, useWindowDimensions, View } from 'react-native';
import { currentLine } from '@socialmorning/player-core';
import { Icon } from '../src/ui/Icon';
import { BarButton, TAP, TopBar } from '../src/ui/TopBar';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../src/design/gradient';
import { Artwork } from '../src/ui/Artwork';
import { usePlayer, usePlayerState } from '../src/playback/store';
import { Scrubber, scrubberValue } from '../src/ui/Scrubber';
import { mmss } from '../src/ui/format';
import { useStores, useSubscriptionSync } from '../src/ui/providers';
import { useSocial } from '../src/social/context';
import { usePoll } from '../src/social/usePoll';
import type { ComposerState } from '../src/social/composer';
import { ComposerSheet } from '../src/ui/Composer';
import { MomentSheet } from '../src/ui/MomentSheet';
import { Rail, type RailMarker } from '../src/ui/Rail';
import { HeatCurve } from '../src/ui/HeatCurve';
import { SpeedControl } from '../src/ui/SpeedControl';
import { SleepTimerControl } from '../src/ui/SleepTimerControl';
import { ChapterList, CurrentChapter } from '../src/ui/ChapterList';
import { TranscriptPane } from '../src/ui/TranscriptPane';
import { getPref } from '../src/settings/prefs';
import { fetchExtras, readExtras, type Extras } from '../src/extras/fetch-extras';
import { router } from 'expo-router';
import { useNextUp } from '../src/ui/NextUp';
import { EndOffer } from '../src/ui/EndOffer';
import { endOffer } from '../src/discover/end-offer';
import { toPlayable } from '../src/storage/playable';
import { useDiscover } from '../src/discover/useDiscover';
import { colour, tabular } from '../src/design';

export default function PlayerScreen(): React.ReactElement {
  const player = usePlayer();
  const state = usePlayerState();
  const stores = useStores();
  const { composer, reactToggle, refresh, useEpisodeSocial, listener, bump } = useSocial();
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
  // M5 (FR-010): the end-of-episode offer — fetched while the episode plays, shown at `ended` with an empty queue, never autoplayed.
  const nextUp = useNextUp(currentEpisodeId);
  const { open: discoverOpen } = useDiscover();
  const offer = endOffer(state, stores.queue.list(), nextUp.items, currentEpisodeId);
  const { cached, stale } = useEpisodeSocial(currentEpisodeId);
  useEffect(() => {
    setExtras(currentEpisodeId ? readExtras(stores.extras, currentEpisodeId) : undefined);
    setPane('none');
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
  const screen = useWindowDimensions();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (state.kind === 'idle') {
    return (
      <SafeAreaView className={FILL}>
        <TopBar back="down" onBack={close} />
        <View className={BODY}><Text className={SUBTITLE}>Nothing is playing yet.</Text></View>
      </SafeAreaView>
    );
  }

  if (state.kind === 'error') {
    return (
      <SafeAreaView className={FILL}>
        <TopBar back="down" onBack={close} />
        <View className={BODY}>
          <Text className={TITLE}>{state.message}</Text>
          <Pressable className={PRIMARY} accessibilityRole="button" onPress={() => player.play()}>
            <Text className={PRIMARY_TEXT}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
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
  const rate = player.rate();
  // M10b US4 (FR-015): "Show transcript entry" off → no transcript button and no live line.
  const showTranscript = getPref(stores.settings, 'transcriptEntry');
  const cue = showTranscript && extras?.transcript && 'lines' in extras.transcript ? extras.transcript.lines[currentLine(extras.transcript.lines, positionMs) ?? -1]?.text : undefined;
  const reacted = reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs);
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  const clip = () => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    router.push({ pathname: '/clip/new', params: { episodeId: state.episodeId, positionMs: String(positionMs) } });
  };

  // As big as fits: the width less the margins, and never so tall that the controls
  // leave the first screen.
  const art = Math.round(Math.min(screen.width - 96, screen.height * 0.36));
  const commentHere = () =>
    setComposing(composer.open({ episodeId: state.episodeId, offsetMs: positionMs, ...(durationMs !== undefined ? { durationMs } : {}) }));

  return (
    <LinearGradient colors={[...gradientFor()]} className={FILL}>
    <SafeAreaView className="flex-1">
    <TopBar back="down" onBack={close}>
      <BarButton label="Clip the last 30 seconds" onPress={clip}><Icon name="cut-outline" size={24} color={colour.text} /></BarButton>
      <BarButton label="Share this episode" onPress={() => { void Share.share({ message: `${episode?.title ?? ''} — ${show?.title ?? ''}\n${episode?.enclosureUrl ?? ''}` }).catch(() => undefined); }}>
        <Icon name="share-outline" size={24} color={colour.text} />
      </BarButton>
    </TopBar>
    {/* Grows to the screen and spreads out; scrolls only when a large font needs it. */}
    <ScrollView contentContainerClassName="flex-grow justify-between px-screen-x pb-section">
      <View className="items-center gap-2">
        <Artwork url={artworkUrl} size={art} rounded="artwork" className="mt-2" />
        <Text className={TITLE} numberOfLines={3}>{episode?.title ?? 'Now playing'}</Text>
        <View className="flex-row items-center justify-center gap-2">
          {feedUrl === undefined ? <Text className={SUBTITLE}>{show?.title ?? ''}</Text> : (
            <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } })} accessibilityRole="link" accessibilityLabel={`Show: ${show?.title ?? ''}`} className="justify-center flex-shrink" style={{ minHeight: TAP.minHeight }}>
              <Text className="text-sm text-muted" numberOfLines={1}>{show?.title ?? ''}</Text>
            </Pressable>
          )}
          {feedUrl === undefined || subscribed ? null : (
            <Pressable onPress={subscribe} accessibilityRole="button" accessibilityLabel="Subscribe to this show" className="justify-center" style={{ minHeight: TAP.minHeight }}>
              <Text className="text-xs font-bold text-background bg-text rounded-row px-2 py-1">+ Subscribe</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View className="gap-1">
        {extras?.chapters && extras.chapters.length > 0 ? <CurrentChapter chapters={extras.chapters} positionMs={positionMs} /> : null}
        {cue ? <Text className="text-sm text-muted text-center" numberOfLines={2}>{cue}</Text> : null}
        <View className="flex-row justify-between" accessible accessibilityLabel={scrubberValue(positionMs, durationMs).text}>
          <Text className="text-sm font-semibold text-text" style={tabular}>{mmss(positionMs)}</Text>
          <Text className="text-sm font-semibold text-text" style={tabular}>{durationMs === undefined ? '--:--' : `-${mmss(durationMs - positionMs)}`}</Text>
        </View>
        <Rail
          comments={cached?.social.comments ?? []}
          durationMs={durationMs}
          onTap={(m) => {
            player.seek(m.offsetMs);
            setOpenMarker(m);
          }}
        />
        <View className="bg-surface rounded-row px-2 pt-2 pb-1">
          <HeatCurve
            heat={cached?.social.heat}
            durationMs={heatAxisMs}
            playerDurationMs={durationMs}
            myBuckets={shownBuckets}
            onSeek={(bucket, toMs) => {
              player.seek(toMs);
              const at = (cached?.social.comments ?? []).flatMap((c) => [c, ...(c.replies ?? [])])
                .filter((c) => !c.deleted && c.offsetMs !== null && heatAxisMs !== undefined && Math.floor((c.offsetMs * 100) / heatAxisMs) === bucket);
              if (at.length > 0) setOpenMarker({ second: Math.floor(toMs / 1000), offsetMs: toMs, comments: at });
            }}
          />
          <Scrubber positionMs={positionMs} durationMs={durationMs} onSeek={(ms) => player.seek(ms)} onSkip={(d) => player.skip(d)} />
        </View>
        {/* One status line at most, so the controls below never jump far. */}
        {state.kind === 'buffering' ? <Text className={SUBTITLE}>Buffering…</Text>
          : state.kind === 'loading' ? <Text className={SUBTITLE}>Loading…</Text>
          : state.kind === 'paused' && state.by === 'output-lost' ? <Text className={SUBTITLE}>Paused — your headphones disconnected</Text>
          : player.clip() ? <Text className={SUBTITLE}>Playing a clip · {mmss(player.clip()!.startMs)}–{mmss(player.clip()!.endMs)} · pauses at the end</Text>
          : stale ? <Text className={SUBTITLE}>Couldn't refresh comments — showing the last copy</Text>
          : null}
        {!player.clip() && state.kind === 'paused' && lastClipEnd !== undefined && Math.abs(positionMs - lastClipEnd) <= 6_000 ? (
          <View className={CLIP_BANNER}>
            <Text className={SUBTITLE}>The clip ended.</Text>
            <Pressable className={SECONDARY} accessibilityRole="button" onPress={() => { setLastClipEnd(undefined); player.play(); }}><Text className={SECONDARY_TEXT}>Keep listening</Text></Pressable>
          </View>
        ) : null}
        {offer ? (
          <EndOffer item={offer} onPlay={() => {
            const local = toPlayable(stores, offer.episode.id);
            if (local) { player.load(local, 'play'); return; }
            void discoverOpen(offer.episode);
          }} />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel={`Speed ${rate.toFixed(1)}×, sleep timer and chapters`} className={ROUND}>
          {Math.abs(rate - 1) < 0.01 ? <Icon name="speedometer-outline" size={28} color={colour.muted} /> : <Text className="text-sm font-bold text-text">{rate.toFixed(1)}×</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip back 15 seconds" onPress={() => player.skip(-15_000)} className={ROUND}>
          <View style={MIRROR}><Icon name="refresh-outline" size={44} color={colour.text} /></View>
          <Text className={SKIP_NUMBER}>15</Text>
        </Pressable>
        <Pressable
          className="w-20 h-20 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={64} color={colour.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip forward 30 seconds" onPress={() => player.skip(30_000)} className={ROUND}>
          <Icon name="refresh-outline" size={44} color={colour.text} />
          <Text className={SKIP_NUMBER}>30</Text>
        </Pressable>
        <Pressable
          className={ROUND}
          accessibilityRole="button"
          accessibilityLabel={reacted ? 'Remove your reaction here' : 'React at this moment'}
          accessibilityState={{ selected: reacted }}
          onPress={() => {
            if (!listener) { router.push('/auth/sign-in'); return; }
            const r = reactToggle.toggle(state.episodeId, shownBuckets, positionMs, heatAxisMs);
            setMyBuckets(r.optimistic);
            void r.settled.then((s) => { setMyBuckets(s.myBuckets); bump(state.episodeId); });
          }}
        >
          {/* Filled vs outline, and the name — never hue alone (FR-016). */}
          <Icon name={reacted ? 'thumbs-up' : 'thumbs-up-outline'} size={30} color={reacted ? colour.accent : colour.muted} />
        </Pressable>
      </View>

      <View className="flex-row items-center justify-between">
        <BarButton label="About this episode" onPress={() => router.push({ pathname: '/episode/[id]', params: { id: state.episodeId } })}>
          <Icon name="information-circle-outline" size={30} color={colour.muted} />
        </BarButton>
        <Pressable onPress={() => router.push('/queue')} accessibilityRole="button" accessibilityLabel="Playlist" className="flex-row items-center gap-2 px-section rounded-row bg-surface" style={{ minHeight: TAP.minHeight }}>
          <Icon name="list" size={20} color={colour.muted} />
          <Text className="text-sm text-muted">Playlist</Text>
        </Pressable>
        <Pressable onPress={commentHere} accessibilityRole="button" accessibilityLabel="Comment at this moment" className="flex-row items-end justify-center" style={TAP}>
          <Icon name="chatbox-ellipses-outline" size={28} color={colour.muted} />
          <Text className="text-xs text-muted">{commentCount}</Text>
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>

    <Modal visible={more} animationType="slide" transparent onRequestClose={() => setMore(false)}>
      <Pressable className="flex-1 bg-scrim" accessibilityRole="button" accessibilityLabel="Close" onPress={() => setMore(false)} />
      <View className="bg-background rounded-t-2xl px-screen-x pt-section pb-10 gap-section max-h-[75%]">
        <View className="flex-row justify-between items-center">
          <Text className="text-base font-bold text-text">Playback</Text>
          <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Close" className="justify-center" style={TAP}>
            <Text className="text-sm text-accent">Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-section">
          <SpeedControl />
          <SleepTimerControl />
          {extras && (extras.chapters?.length || (showTranscript && extras.transcript)) ? (
            <View className="flex-row gap-row flex-wrap">
              {extras.chapters && extras.chapters.length > 0 ? (
                <Pressable className={pane === 'chapters' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'chapters' ? 'none' : 'chapters')} accessibilityRole="button">
                  <Text className={pane === 'chapters' ? SECONDARY_ON_TEXT : SECONDARY_TEXT}>Chapters ({extras.chapters.length})</Text>
                </Pressable>
              ) : null}
              {showTranscript && extras.transcript ? (
                <Pressable className={pane === 'transcript' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'transcript' ? 'none' : 'transcript')} accessibilityRole="button">
                  <Text className={pane === 'transcript' ? SECONDARY_ON_TEXT : SECONDARY_TEXT}>Transcript</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {extras?.error ? <Text className="text-xs text-muted">Couldn't load {extras.error.includes('chapters') ? 'chapters' : 'the transcript'}</Text> : null}
          {pane === 'chapters' && extras?.chapters ? <ChapterList chapters={extras.chapters} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}
          {showTranscript && pane === 'transcript' && extras?.transcript ? <TranscriptPane transcript={extras.transcript} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}
        </ScrollView>
      </View>
    </Modal>

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
    </LinearGradient>
  );
}

// The screen's classes, named once because several elements share them.
const FILL = 'flex-1 bg-background';
const BODY = 'flex-1 p-section gap-2 items-center justify-center';
const TITLE = 'text-base font-bold text-center text-text mt-row';
const SUBTITLE = 'text-xs text-muted text-center';
/** The four small round controls either side of play/pause. */
const ROUND = 'w-14 h-14 items-center justify-center';
/** The 15 / 30 inside the circular arrow. */
const SKIP_NUMBER = 'absolute text-xs font-bold text-text';
/** The back arrow is the forward arrow, mirrored. A transform, so a style. */
const MIRROR = { transform: [{ scaleX: -1 }] };
const PRIMARY = 'min-h-12 py-row px-screen-x rounded-pill bg-primary justify-center';
const PRIMARY_TEXT = 'text-onPrimary font-bold text-sm';
const CLIP_BANNER = 'flex-row gap-row items-center flex-wrap justify-center';
const SECONDARY = 'min-h-12 py-2 px-section rounded-pill border border-separator justify-center';
// Chosen is told apart by the fill AND by the pane opening — never by hue alone (FR-016).
const SECONDARY_ON = 'min-h-12 py-2 px-section rounded-pill border bg-primary border-primary justify-center';
const SECONDARY_TEXT = 'font-semibold text-xs text-text';
const SECONDARY_ON_TEXT = 'font-semibold text-xs text-onPrimary';
