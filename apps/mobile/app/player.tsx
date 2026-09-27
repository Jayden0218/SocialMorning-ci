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
import { Pressable, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { currentLine } from '@socialmorning/player-core';
import { Glyph, PauseIcon, PlayIcon } from '../src/ui/Icon';
import { BarButton, TAP, TopBar } from '../src/ui/TopBar';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../src/design/gradient';
import { Artwork } from '../src/ui/Artwork';
import { BOTTOM_INSET } from '../src/ui/Screen';
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
import { fetchExtras, readExtras, type Extras } from '../src/extras/fetch-extras';
import { router } from 'expo-router';
import { useNextUp } from '../src/ui/NextUp';
import { EndOffer } from '../src/ui/EndOffer';
import { endOffer } from '../src/discover/end-offer';
import { toPlayable } from '../src/storage/playable';
import { useDiscover } from '../src/discover/useDiscover';
import { tabular } from '../src/design';

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
  const nextRate = () => {
    const i = RATES.findIndex((r) => Math.abs(r - rate) < 0.01);
    player.setRate(RATES[(i + 1) % RATES.length]!);
    setTick((n) => n + 1);
  };
  const cue = extras?.transcript && 'lines' in extras.transcript ? extras.transcript.lines[currentLine(extras.transcript.lines, positionMs) ?? -1]?.text : undefined;
  const reacted = reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs);
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  const clip = () => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    router.push({ pathname: '/clip/new', params: { episodeId: state.episodeId, positionMs: String(positionMs) } });
  };

  return (
    <LinearGradient colors={[...gradientFor()]} className={FILL}>
    <SafeAreaView className="flex-1">
    <TopBar back="down" onBack={close}>
      <BarButton label="Clip the last 30 seconds" onPress={clip}><Glyph>✂</Glyph></BarButton>
      <BarButton label="Share this episode" onPress={() => { void Share.share({ message: `${episode?.title ?? ''} — ${show?.title ?? ''}\n${episode?.enclosureUrl ?? ''}` }).catch(() => undefined); }}>
        <Glyph>↗</Glyph>
      </BarButton>
    </TopBar>
    <ScrollView contentContainerClassName={BODY} contentContainerStyle={BODY_INSET}>
      <Artwork url={artworkUrl} size={ART} rounded="artwork" className="mt-row" />
      <Text className={TITLE}>
        {episode?.title ?? 'Now playing'}
      </Text>
      <View className="flex-row items-center justify-center gap-2 flex-wrap">
        {feedUrl === undefined ? <Text className={SUBTITLE}>{show?.title ?? ''}</Text> : (
          <Pressable onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } })} accessibilityRole="link" accessibilityLabel={`Show: ${show?.title ?? ''}`} className="justify-center" style={{ minHeight: TAP.minHeight }}>
            <Text className="text-sm text-muted">{show?.title ?? ''}</Text>
          </Pressable>
        )}
        {feedUrl === undefined || subscribed ? null : (
          <Pressable onPress={subscribe} accessibilityRole="button" accessibilityLabel="Subscribe to this show" className="justify-center" style={{ minHeight: TAP.minHeight }}>
            <Text className="text-xs font-bold text-background bg-text rounded-row px-2 py-1">+ Subscribe</Text>
          </Pressable>
        )}
      </View>
      {extras?.chapters && extras.chapters.length > 0 ? <CurrentChapter chapters={extras.chapters} positionMs={positionMs} /> : null}
      {cue ? <Text className="text-sm text-muted text-center" numberOfLines={2}>{cue}</Text> : null}

      <View className="w-full flex-row justify-between mt-row" accessible accessibilityLabel={scrubberValue(positionMs, durationMs).text}>
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
      <View className="w-full bg-surface rounded-row px-2 pt-2 pb-1">
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

      {state.kind === 'buffering' ? <Text className={SUBTITLE}>Buffering…</Text> : null}
      {state.kind === 'loading' ? <Text className={SUBTITLE}>Loading…</Text> : null}
      {state.kind === 'paused' && state.by === 'output-lost' ? (
        <Text className={SUBTITLE}>Paused — your headphones disconnected</Text>
      ) : null}

      <View className="w-full flex-row items-center justify-between mt-row">
        <Pressable onPress={nextRate} accessibilityRole="button" accessibilityLabel={`Playback speed ${rate.toFixed(1)}×. Change speed`} className={ROUND}>
          <Text className="text-sm font-bold text-text">{rate.toFixed(1)}×</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip back 15 seconds" onPress={() => player.skip(-15_000)} className={ROUND}>
          <Text className={CONTROL}>↺15</Text>
        </Pressable>
        <Pressable
          className="w-20 h-20 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          {isPlaying ? <PauseIcon size={44} /> : <PlayIcon size={44} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip forward 30 seconds" onPress={() => player.skip(30_000)} className={ROUND}>
          <Text className={CONTROL}>30↻</Text>
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
          {/* Filled vs outline heart, and the name — never hue alone (FR-016). */}
          <Text className={reacted ? 'text-[26px] text-accent' : 'text-[26px] text-text'}>{reacted ? '♥' : '♡'}</Text>
        </Pressable>
      </View>

      <View className="w-full flex-row items-center justify-between mt-row">
        <BarButton label="About this episode" onPress={() => router.push({ pathname: '/episode/[id]', params: { id: state.episodeId } })}><Glyph>ⓘ</Glyph></BarButton>
        <Pressable onPress={() => router.push('/queue')} accessibilityRole="button" accessibilityLabel="Playlist" className="justify-center px-section rounded-row bg-surface" style={{ minHeight: TAP.minHeight }}>
          <Text className="text-sm text-text">☰  Playlist</Text>
        </Pressable>
        <BarButton label={`Comments, ${commentCount}`} onPress={() => router.push({ pathname: '/episode/[id]', params: { id: state.episodeId } })}>
          <Text className="text-sm text-text">💬 {commentCount}</Text>
        </BarButton>
      </View>

      {stale ? <Text className={SUBTITLE}>Couldn't refresh comments — showing the last copy</Text> : null}
      {offer ? (
        <EndOffer item={offer} onPlay={() => {
          const local = toPlayable(stores, offer.episode.id);
          if (local) { player.load(local, 'play'); return; }
          void discoverOpen(offer.episode);
        }} />
      ) : null}
      {player.clip() ? (
        <View className={CLIP_BANNER}>
          <Text className={SUBTITLE}>Playing a clip · {mmss(player.clip()!.startMs)}–{mmss(player.clip()!.endMs)} · pauses at the end</Text>
        </View>
      ) : state.kind === 'paused' && lastClipEnd !== undefined && Math.abs(positionMs - lastClipEnd) <= 6_000 ? (
        <View className={CLIP_BANNER}>
          <Text className={SUBTITLE}>The clip ended.</Text>
          <Pressable className={SECONDARY} accessibilityRole="button" onPress={() => { setLastClipEnd(undefined); player.play(); }}><Text className={SECONDARY_TEXT}>Keep listening</Text></Pressable>
        </View>
      ) : null}


      <Pressable
        className={`${SECONDARY} mt-row`}
        accessibilityRole="button"
        accessibilityLabel="Comment at this moment"
        onPress={() =>
          setComposing(composer.open({ episodeId: state.episodeId, offsetMs: positionMs, ...(durationMs !== undefined ? { durationMs } : {}) }))
        }
      >
        <Text className={SECONDARY_TEXT}>Comment at {mmss(positionMs)}</Text>
      </Pressable>
      {extras && (extras.chapters?.length || extras.transcript || extras.error) ? (
        <View className={SOCIAL_ROW}>
          {extras.chapters && extras.chapters.length > 0 ? (
            <Pressable className={pane === 'chapters' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'chapters' ? 'none' : 'chapters')} accessibilityRole="button">
              <Text className={pane === 'chapters' ? SECONDARY_ON_TEXT : SECONDARY_TEXT}>Chapters ({extras.chapters.length})</Text>
            </Pressable>
          ) : null}
          {extras.transcript ? (
            <Pressable className={pane === 'transcript' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'transcript' ? 'none' : 'transcript')} accessibilityRole="button">
              <Text className={pane === 'transcript' ? SECONDARY_ON_TEXT : SECONDARY_TEXT}>Transcript</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {extras?.error ? <Text className={SUBTITLE}>Couldn't load {extras.error.includes('chapters') ? 'chapters' : 'the transcript'}</Text> : null}
      {pane === 'chapters' && extras?.chapters ? <ChapterList chapters={extras.chapters} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}
      {pane === 'transcript' && extras?.transcript ? <TranscriptPane transcript={extras.transcript} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}

      <SpeedControl />
      <SleepTimerControl />
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
    </ScrollView>
    </SafeAreaView>
    </LinearGradient>
  );
}

/** Big, because the artwork is the screen. 280 dp leaves the transport on the first screen. */
const ART = 280;

// The screen's classes, named once because several elements share them.
const FILL = 'flex-1 bg-background';
const BODY = 'p-section gap-2 items-center';
// The bottom inset is derived from two exported JS constants, so it stays a style.
const BODY_INSET = { paddingBottom: BOTTOM_INSET };
const TITLE = 'text-base font-bold text-center text-text mt-section';
const SUBTITLE = 'text-xs text-muted text-center';
const CONTROL = 'text-sm font-bold text-text text-center';
/** The four small round controls either side of play/pause. */
const ROUND = 'w-14 h-14 rounded-pill items-center justify-center';
/** What the speed button steps through; the full control stays below the fold. */
const RATES = [1, 1.2, 1.5, 2];
const PRIMARY = 'min-h-12 py-row px-screen-x rounded-pill bg-primary justify-center';
const PRIMARY_TEXT = 'text-onPrimary font-bold text-sm';
const SOCIAL_ROW = 'flex-row gap-row mt-row flex-wrap justify-center';
const CLIP_BANNER = 'flex-row gap-row items-center mt-row flex-wrap justify-center';
const SECONDARY = 'min-h-12 py-2 px-section rounded-pill border border-separator justify-center';
// Reacted is told apart by its WORD ("♥ Reacted" vs "♡ React") and its accessible
// name as well as by the fill — never by hue alone (FR-016).
const SECONDARY_ON = 'min-h-12 py-2 px-section rounded-pill border bg-primary border-primary justify-center';
const SECONDARY_TEXT = 'font-semibold text-xs text-text';
const SECONDARY_ON_TEXT = 'font-semibold text-xs text-onPrimary';
