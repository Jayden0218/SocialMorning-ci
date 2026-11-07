// Full-screen status viewer: plays on open, taps on the right or left third move, swipe down closes.
/**
 * M22 US2 (FR-006, T021) and US6 (FR-020, T026). One status at a time, in the order of the
 * Updates row (people I follow, then "Suggested"):
 *  - a voice status plays as soon as it is shown; a text status shows its words large;
 *  - a tap on the right third goes to the next status (and so the next person), the left third
 *    goes back, the middle third stops or plays again; past the last one the viewer closes;
 *  - a swipe down on the status closes the viewer (and the screen reader has "Close" in the
 *    page's own header — no native sheet, constitution v3);
 *  - under it: its items (episode cards open the episode, ▶ plays it; photos full width), then
 *    the replies and reactions (StatusReplies).
 *  - M24 US1/US17: someone else's status has a "More" button (Report; on a suggested one, "Stop
 *    suggesting"); the page owns the sheet, the viewer only asks for it.
 * M31 W4-B (T051; design-pulse2 `statusBase`, `status--screen`; "Layout: Stage"): the page is the Stage. A violet-to-void wash (170 degrees, `stageTint`
 * to the page at 62 %) with the violet-first glow; the segments 4 under the status bar (3 tall, 4 apart; earlier ones light, the one playing
 * fills as it plays, later ones `barIdle`); the head row (avatar 36, name, "18 h left", the hot "Suggested" tag, More in a glass circle); then the
 * body — a voice status is a 56 light Play/Pause circle beside a 56 tall wave, its clock and "voice status", then its words in Unbounded 21; a
 * text status is its words alone at that size; photos 4:3 (radius 16); episode cards (cover 48, title, show, Play 40). The left and right thirds
 * of the screen are Previous / Next; the middle is the Play circle and the wave. Reactions, replies and the bar are `StatusReplies`.
 * The wave is drawn from the status id (the server keeps no waveform); the playing segment's fill follows the clock this page keeps.
 * The swipe uses React Native's PanResponder, like src/ui/kit/Sheet.tsx: Jest has no
 * gesture-handler mocks and this one gesture needs nothing more.
 */
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { playVoice } from '@/playback/expo-audio-adapter';
import { Avatar } from '@/ui/kit/Avatar';
import { Artwork } from '@/ui/kit/Artwork';
import { Curve } from '@/ui/kit/Curve';
import { Fade } from '@/ui/kit/Fade';
import { Icon } from '@/ui/kit/Icon';
import { IconButton } from '@/ui/kit/PulseButton';
import { PageGlow } from '@/ui/kit/PageGlow';
import { Type } from '@/ui/kit/Type';
import { LinearGradient } from '@/design/tailwind';
import { colour, gutter } from '@/design';
import { mmss } from '@/ui/kit/format';
import { hoursLeft } from '@/social/voice';
import { stepStatus, type Status, type StatusItem } from '@/social/api-m22-social';
import { STAGE, playedShare, statusType, waveFor } from '@/ui/status/measures';
import { StatusReplies } from './StatusReplies';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** A downward drag longer than this closes the viewer. */
const CLOSE_DY = 80;
const WASH = [colour.stageTint, colour.void, colour.void] as const;
const WASH_AT = [0, STAGE.gradientEnd, 1] as const;
const WASH_FROM = { x: 0.4, y: 0 } as const;
const WASH_TO = { x: 0.6, y: 1 } as const;
const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };
const SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;

export type Colours = { accent: string; muted: string; text: string; onPrimary: string };

/** One item on a status: an episode card (opens the episode; the Play circle plays it) or a photo. */
export function StatusItemCard(props: { item: StatusItem; colours?: Colours; onPlay?: (episodeId: string) => void }): React.ReactElement {
  const it = props.item;
  if (it.kind === 'photo') return <Image source={{ uri: it.url }} style={{ width: '100%', aspectRatio: STAGE.photoRatio, borderRadius: STAGE.photoRadius }} accessibilityLabel="A photo on this status" />;
  return (
    <Box testID="status-episode-card" className="flex-row items-center bg-raise border border-line" style={{ gap: STAGE.card.gap, padding: STAGE.card.pad, borderRadius: STAGE.card.radius }}>
      <Pressable
        onPress={() => router.push({ pathname: '/episode/[id]', params: { id: it.episodeId } })}
        accessibilityRole="link"
        accessibilityLabel={`Episode: ${it.title ?? 'an episode'}${it.showTitle ? `, ${it.showTitle}` : ''}`}
        className="flex-1 flex-row items-center"
        style={{ gap: STAGE.card.gap }}
      >
        <Artwork url={it.imageUrl ?? null} size={STAGE.card.cover} name={it.showTitle ?? it.title ?? ''} />
        <Box className="flex-1">
          <Type step="compact" className="text-text" numberOfLines={2}>{it.title ?? 'Episode'}</Type>
          {it.showTitle ? <Type step="tag" className="text-text3" numberOfLines={1}>{it.showTitle}</Type> : null}
        </Box>
      </Pressable>
      {props.onPlay ? (
        <Pressable onPress={() => props.onPlay?.(it.episodeId)} hitSlop={SLOP} accessibilityRole="button" accessibilityLabel={`Play ${it.title ?? 'this episode'}`} className="rounded-pill bg-text items-center justify-center" style={{ width: STAGE.card.play, height: STAGE.card.play }}>
          <Icon name="play" size={STAGE.card.playIcon} color={colour.void} />
        </Pressable>
      ) : null}
    </Box>
  );
}

export function StatusViewer(props: {
  statuses: Status[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Pauses the episode (a status plays over it, never with it). */
  pauseEpisode: () => void;
  /** Plays an episode card's episode. */
  playEpisode: (episodeId: string) => void;
  /** Reload after a reaction (counts). */
  reload: () => void;
  colours?: Colours;
  /** M24: someone else's status → the page's More sheet (Report, Stop suggesting). */
  onMore?: (s: Status) => void;
  /** M31 W4-B: the page's Close (a × circle), drawn at the bar's left. */
  close?: React.ReactNode;
}): React.ReactElement | null {
  const s = props.statuses[props.index];
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audio = useRef<{ stop: () => void } | undefined>(undefined);
  const startedAt = useRef(0);
  const stop = () => { audio.current?.stop(); audio.current = undefined; setPlaying(false); setElapsed(0); };
  const start = (p: Status) => {
    stop();
    if (!p.url || p.body !== undefined) return;
    props.pauseEpisode();
    startedAt.current = Date.now();
    audio.current = playVoice(p.url, () => { audio.current = undefined; setPlaying(false); setElapsed(0); });
    setPlaying(true);
  };
  // FR-006: plays on open, and each time the viewer moves to another status.
  useEffect(() => { if (s) start(s); return stop; }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The playing segment and the wave fill by the clock.
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(t);
  }, [playing]);

  const move = (side: 'left' | 'right') => {
    const next = stepStatus(props.index, props.statuses.length, side);
    if (next === null) { if (side === 'right') props.onClose(); return; }
    props.onIndex(next);
  };
  const live = useRef({ onClose: props.onClose });
  useEffect(() => { live.current.onClose = props.onClose; });
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
    onPanResponderRelease: (_e, g) => { if (g.dy > CLOSE_DY) live.current.onClose(); },
  }), []);
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const top = insets?.top ?? 0;
  const wave = useMemo(() => (s ? waveFor(s.id) : []), [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;
  const now = clockMs();
  const who = s.mine ? 'You' : s.author.name;
  const share = s.body !== undefined ? 1 : playedShare(elapsed, s.durationMs);
  const words = s.body !== undefined ? s.body : s.text ? `“${s.text}”` : undefined;
  return (
    <Box testID="status-stage" className="flex-1 bg-void" {...pan.panHandlers}>
      <LinearGradient colors={WASH} locations={WASH_AT} start={WASH_FROM} end={WASH_TO} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <PageGlow flip top={STAGE.glowTop} strength={STAGE.glowStrength} />

      {/* The left and right thirds of the screen: Previous and Next. The middle is the Play circle and the wave. */}
      <Box className="absolute flex-row" style={{ left: 0, right: 0, top: top + STAGE.bodyTop - STAGE.bodyGap, bottom: STAGE.bodyReserve }} pointerEvents="box-none">
        <Pressable onPress={() => move('left')} accessibilityRole="button" accessibilityLabel="Previous status" className="flex-1" />
        <Box className="flex-1" pointerEvents="none" />
        <Pressable onPress={() => move('right')} accessibilityRole="button" accessibilityLabel="Next status" className="flex-1" />
      </Box>

      {/* Where we are in the row: one segment per status. */}
      <Box className="absolute flex-row" style={{ left: STAGE.segSide, right: STAGE.segSide, top: top + STAGE.segTop, gap: STAGE.segGap, zIndex: 6 }} accessible accessibilityLabel={`Status ${props.index + 1} of ${props.statuses.length}`}>
        {props.statuses.map((x, i) => (
          <Box key={x.id} testID="status-segment" className="flex-1 overflow-hidden" style={{ height: STAGE.segHeight, borderRadius: STAGE.segRadius, backgroundColor: i < props.index ? colour.text : colour.barIdle }}>
            {i === props.index ? <Box testID="status-segment-fill" className="h-full bg-text" style={{ width: `${Math.round(share * 100)}%` }} /> : null}
          </Box>
        ))}
      </Box>

      <Box className="absolute flex-row items-center" style={{ left: STAGE.headSide, right: STAGE.headSide, top: top + STAGE.headTop, gap: STAGE.headGap, zIndex: 6 }}>
        <Avatar url={s.author.avatarUrl ?? null} name={s.author.name} size={STAGE.avatar} />
        <Box className="flex-1">
          <Type step="row" className="text-text" numberOfLines={1}>{who}</Type>
          <Type step="tag" className="text-text2">{`${hoursLeft(s.expiresAt, now)} h left`}</Type>
        </Box>
        {s.suggested ? <Box testID="status-suggested" className="bg-hotSoft items-center justify-center" style={{ height: STAGE.tagHeight, paddingHorizontal: STAGE.tagPad, borderRadius: STAGE.tagRadius }}><Type step="chip" className="text-hotText" style={statusType.suggested}>Suggested</Type></Box> : null}
        {!s.mine && props.onMore ? (
          <IconButton icon="ellipsis-horizontal" label={`More for ${who}'s status`} onPress={() => { stop(); props.onMore?.(s); }} className="bg-glass" />
        ) : null}
      </Box>

      <ScrollView
        testID="status-body"
        className="absolute"
        style={{ left: 0, right: 0, top: top + STAGE.bodyTop, bottom: 0, zIndex: 5 }}
        contentContainerStyle={{ paddingHorizontal: side, paddingBottom: STAGE.bodyReserve, gap: STAGE.bodyGap }}
        pointerEvents="box-none"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {s.body !== undefined ? (
          <Pressable onPress={() => (playing ? stop() : start(s))} accessibilityRole="button" accessibilityLabel={s.body !== undefined ? `${who} wrote: ${s.body}` : playing ? 'Stop' : 'Play again'}>
            <Type step="lede" className="text-text" style={statusType.words}>{words}</Type>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => (playing ? stop() : start(s))} accessibilityRole="button" accessibilityLabel={s.body !== undefined ? `${who} wrote: ${s.body}` : playing ? 'Stop' : 'Play again'} className="flex-row items-center" style={{ gap: STAGE.waveGap }}>
              <Box className="rounded-pill bg-text items-center justify-center" style={{ width: STAGE.play, height: STAGE.play }}>
                <Icon name={playing ? 'pause' : 'play'} size={STAGE.playIcon} color={colour.void} />
              </Box>
              <Box className="flex-1" {...HIDE}><Curve data={wave} count={STAGE.waveBars} height={STAGE.wave} min={STAGE.waveMin} played={share} glow /></Box>
            </Pressable>
            <Box className="flex-row justify-between">
              <Type step="mono" className="text-text">{`${mmss(Math.min(elapsed, s.durationMs))} / ${mmss(s.durationMs)}`}</Type>
              <Type step="tag" className="text-text3">voice status</Type>
            </Box>
            {words ? <Type step="lede" className="text-text" style={statusType.words} numberOfLines={6}>{words}</Type> : null}
          </>
        )}
        {s.items.map((it, i) => (
          <StatusItemCard key={`${s.id}:${i}`} item={it} onPlay={(id) => { stop(); props.playEpisode(id); }} />
        ))}
      </ScrollView>

      <Fade bottom={0} height={STAGE.fade} />
      <StatusReplies status={s} colours={props.colours ?? { accent: colour.accent, muted: colour.muted, text: colour.text, onPrimary: colour.onPrimary }} pauseAll={() => { stop(); props.pauseEpisode(); }} onChanged={props.reload} leading={props.close} />
    </Box>
  );
}
