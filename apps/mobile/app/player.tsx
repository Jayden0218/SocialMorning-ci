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
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../src/design/gradient';
import { Artwork } from '../src/ui/Artwork';
import { BOTTOM_INSET } from '../src/ui/Screen';
import { usePlayer, usePlayerState } from '../src/playback/store';
import { Scrubber, scrubberValue } from '../src/ui/Scrubber';
import { mmss } from '../src/ui/format';
import { useStores } from '../src/ui/providers';
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

  if (state.kind === 'idle') {
    return (
      <View className={`${FILL} ${BODY}`} style={BODY_INSET}>
        <Text className={SUBTITLE}>Nothing is playing yet.</Text>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View className={`${FILL} ${BODY}`} style={BODY_INSET}>
        <Text className={TITLE}>{state.message}</Text>
        <Pressable className={PRIMARY} accessibilityRole="button" onPress={() => player.play()}>
          <Text className={PRIMARY_TEXT}>Try again</Text>
        </Pressable>
      </View>
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

  return (
    <LinearGradient colors={[...gradientFor()]} className={FILL}>
    <ScrollView contentContainerClassName={BODY} contentContainerStyle={BODY_INSET}>
      <Artwork url={artworkUrl} size={ART} rounded="artwork" />
      <Text className={TITLE}>
        {episode?.title ?? 'Now playing'}
      </Text>
      <Text className={SUBTITLE}>{show?.title ?? ''}</Text>
      {extras?.chapters && extras.chapters.length > 0 ? <CurrentChapter chapters={extras.chapters} positionMs={positionMs} /> : null}

      <Rail
        comments={cached?.social.comments ?? []}
        durationMs={durationMs}
        onTap={(m) => {
          player.seek(m.offsetMs);
          setOpenMarker(m);
        }}
      />
      <Scrubber positionMs={positionMs} durationMs={durationMs} onSeek={(ms) => player.seek(ms)} onSkip={(d) => player.skip(d)} />

      <Text className="text-xs text-muted" style={tabular} accessibilityLabel={scrubberValue(positionMs, durationMs).text}>
        {mmss(positionMs)} / {durationMs === undefined ? '--:--' : mmss(durationMs)}
      </Text>
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
      {stale ? <Text className={SUBTITLE}>Couldn't refresh comments — showing the last copy</Text> : null}

      {state.kind === 'buffering' ? <Text className={SUBTITLE}>Buffering…</Text> : null}
      {state.kind === 'loading' ? <Text className={SUBTITLE}>Loading…</Text> : null}
      {state.kind === 'paused' && state.by === 'output-lost' ? (
        <Text className={SUBTITLE}>Paused — your headphones disconnected</Text>
      ) : null}

      <View className="flex-row items-center gap-screen-x mt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip back 15 seconds"
          onPress={() => player.skip(-15_000)}
        >
          <Text className={CONTROL}>−15</Text>
        </Pressable>
        <Pressable
          className={PRIMARY}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <Text className={PRIMARY_TEXT}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip forward 30 seconds"
          onPress={() => player.skip(30_000)}
        >
          <Text className={CONTROL}>+30</Text>
        </Pressable>
      </View>

      <SpeedControl />
      <SleepTimerControl />

      {extras && (extras.chapters?.length || extras.transcript || extras.error) ? (
        <View className={SOCIAL_ROW}>
          {extras.chapters && extras.chapters.length > 0 ? (
            <Pressable className={pane === 'chapters' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'chapters' ? 'none' : 'chapters')} accessibilityRole="button">
              <Text className={SECONDARY_TEXT}>Chapters ({extras.chapters.length})</Text>
            </Pressable>
          ) : null}
          {extras.transcript ? (
            <Pressable className={pane === 'transcript' ? SECONDARY_ON : SECONDARY} onPress={() => setPane(pane === 'transcript' ? 'none' : 'transcript')} accessibilityRole="button">
              <Text className={SECONDARY_TEXT}>Transcript</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {extras?.error ? <Text className={SUBTITLE}>Couldn't load {extras.error.includes('chapters') ? 'chapters' : 'the transcript'}</Text> : null}
      {pane === 'chapters' && extras?.chapters ? <ChapterList chapters={extras.chapters} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}
      {pane === 'transcript' && extras?.transcript ? <TranscriptPane transcript={extras.transcript} positionMs={positionMs} onSeek={(ms) => player.seek(ms)} /> : null}

      <View className={SOCIAL_ROW}>
      <Pressable
        className={reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs) ? SECONDARY_ON : SECONDARY}
        accessibilityRole="button"
        accessibilityLabel={reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs) ? 'Remove your reaction here' : 'React at this moment'}
        onPress={() => {
          if (!listener) { router.push('/auth/sign-in'); return; }
          const r = reactToggle.toggle(state.episodeId, shownBuckets, positionMs, heatAxisMs);
          setMyBuckets(r.optimistic);
          void r.settled.then((s) => { setMyBuckets(s.myBuckets); bump(state.episodeId); });
        }}
      >
        <Text className={SECONDARY_TEXT}>{reactToggle.isReacted(shownBuckets, positionMs, heatAxisMs) ? '♥ Reacted' : '♡ React'}</Text>
      </Pressable>
      <Pressable
        className={SECONDARY}
        accessibilityRole="button"
        accessibilityLabel="Comment at this moment"
        onPress={() =>
          setComposing(composer.open({ episodeId: state.episodeId, offsetMs: positionMs, ...(durationMs !== undefined ? { durationMs } : {}) }))
        }
      >
        <Text className={SECONDARY_TEXT}>Comment at {mmss(positionMs)}</Text>
      </Pressable>
      <Pressable
        className={SECONDARY}
        accessibilityRole="button"
        accessibilityLabel="Clip the last 30 seconds"
        onPress={() => {
          if (!listener) { router.push('/auth/sign-in'); return; }
          router.push({ pathname: '/clip/new', params: { episodeId: state.episodeId, positionMs: String(positionMs) } });
        }}
      >
        <Text className={SECONDARY_TEXT}>Clip</Text>
      </Pressable>
      </View>
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
    </LinearGradient>
  );
}

/** Big, because the artwork is the screen. 300 dp leaves room for the title at 1.75x. */
const ART = 300;

// The screen's classes, named once because several elements share them.
const FILL = 'flex-1 bg-background';
const BODY = 'p-section gap-2 items-center';
// The bottom inset is derived from two exported JS constants, so it stays a style.
const BODY_INSET = { paddingBottom: BOTTOM_INSET };
const TITLE = 'text-base font-bold text-center text-text mt-section';
const SUBTITLE = 'text-xs text-muted text-center';
const CONTROL = 'text-base font-semibold text-text min-w-12 text-center';
const PRIMARY = 'min-h-12 py-row px-screen-x rounded-pill bg-primary justify-center';
const PRIMARY_TEXT = 'text-onPrimary font-bold text-sm';
const SOCIAL_ROW = 'flex-row gap-row mt-row flex-wrap justify-center';
const CLIP_BANNER = 'flex-row gap-row items-center mt-row flex-wrap justify-center';
const SECONDARY = 'min-h-12 py-2 px-section rounded-pill border border-separator justify-center';
// Reacted is told apart by its WORD ("♥ Reacted" vs "♡ React") and its accessible
// name as well as by the fill — never by hue alone (FR-016).
const SECONDARY_ON = 'min-h-12 py-2 px-section rounded-pill border bg-primary border-primary justify-center';
const SECONDARY_TEXT = 'font-semibold text-xs text-text';
