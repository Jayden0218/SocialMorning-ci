// Make a clip: the episode ring with the range laid round it, start and end, nudges, caption, preview, save.
/**
 * The clip composer (M4 US1, clarified: two buttons while listening). Reads the player's live position
 * for "Start here" / "End here"; Preview plays the range through the runtime's clip mode; Save hands the range to
 * `clips.create`.
 *
 * M17 (`ClipNew-B`): range card, Start / End cards, caption, a Preview + Save bar. M31 W3-B (T041; design-pulse2
 * `clip-new--screen`, `-saved-share-panel`, `toast--clip-new`; "Layout: Ring"): the episode's ring (280, the
 * reaction curve as spokes, the cover in the middle) with the clip range laid round it as a light 6 arc — drag either
 * end to change it (it reads "Clip range 12:02 to 12:32, 30 seconds"). Under it Start and End as solid chips either
 * side of the length in Unbounded 26; the nudge rows `−5 s · Start here · +5 s` and `−5 s · End here · +5 s` (36 chips); a
 * range that cannot be a clip says why. The thumb zone is the title bar: back, "New clip", "From … · now at 12:32", the
 * Caption field (48) and Preview (quiet) with Save (light). The save flow is the page's (app/clip/new.tsx).
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { usePlayer, usePlayerSelector, sameClock, selectClock, type PlayableEpisode } from '@/playback/store';
import { canSave, endHere, nudgeEdge, openComposer, problemText, setCaption, startHere, type ComposerState } from '@/graph/composer';
import { mmss } from '@/ui/kit/format';
import { colour, gutter, radius, spacing } from '@/design';
import { fractionAt } from '@/ui/kit/pulse-math';
import { Artwork } from '@/ui/kit/Artwork';
import { Ring } from '@/ui/kit/RingScrubber';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { PlayerBackdrop } from '@/ui/player/PlayerBackdrop';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { COMPOSER, clipsType } from './measures';

export { COMPOSER };

export type ClipComposerProps = {
  episode: PlayableEpisode;
  initialPositionMs: number;
  /** M22 US9: lines picked in the transcript — the composer opens on this range with this caption. */
  initialRange?: { startMs: number; endMs: number };
  initialCaption?: string;
  onSave: (s: ComposerState) => void;
  saving: boolean;
};

const NO_HEAT: readonly number[] = [];

/** The range as shares of the episode, 0–1, for the arc. Undefined when the episode's length is not known. */
export function rangeShares(range: { startMs: number; endMs: number }, durationMs: number | undefined): { from: number; to: number } | undefined {
  if (!durationMs || !(durationMs > 0)) return undefined;
  const lo = Math.min(range.startMs, range.endMs);
  const hi = Math.max(range.startMs, range.endMs);
  const from = Math.min(1, Math.max(0, lo / durationMs));
  return { from, to: Math.max(from, Math.min(1, hi / durationMs)) };
}

/** Which end a touch at `fraction` of the circle grabs: the nearer one, if it is within `COMPOSER.grab`; else none. */
export function edgeNear(fraction: number, shares: { from: number; to: number }): 'start' | 'end' | undefined {
  const dist = (a: number, b: number): number => { const d = Math.abs(a - b); return Math.min(d, 1 - d); };
  const ds = dist(fraction, shares.from);
  const de = dist(fraction, shares.to);
  const [edge, d] = ds <= de ? (['start', ds] as const) : (['end', de] as const);
  return d <= COMPOSER.grab ? edge : undefined;
}

export function ClipComposer(props: ClipComposerProps): React.ReactElement {
  const player = usePlayer();
  const { width } = useWindowDimensions();
  const clock = usePlayerSelector(selectClock, sameClock);
  const position: number = clock.positionMs > 0 ? clock.positionMs : props.initialPositionMs;
  const [s, setS] = useState<ComposerState>(() => openComposer(props.episode.id, props.initialPositionMs, props.episode.durationMs, {
    ...(props.initialRange ? { range: props.initialRange } : {}),
    ...(props.initialCaption ? { caption: props.initialCaption } : {}),
  }));
  const heat = useEpisodeHeat(props.episode.id, true);
  const duration = props.episode.durationMs ?? heat.durationMs;
  const size = Math.min(COMPOSER.ring, width - 2 * gutter(width) - 20);
  const shares = rangeShares(s.range, duration);
  const length = Math.round((s.range.endMs - s.range.startMs) / 1000);
  const blocked = !canSave(s) || props.saving;
  const spoken = `Clip range ${mmss(s.range.startMs)} to ${mmss(s.range.endMs)}, ${length} seconds`;

  // Drag either end of the arc: the nearer end follows the finger (validated like every other change).
  const live = useRef({ s, shares, duration, size });
  live.current = { s, shares, duration, size };
  const grabbed = useRef<'start' | 'end' | undefined>(undefined);
  const pan = useMemo(() => {
    const at = (e: { nativeEvent: { locationX: number; locationY: number } }) => fractionAt(e.nativeEvent.locationX, e.nativeEvent.locationY, live.current.size / 2, live.current.size / 2);
    const move = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
      const { duration: d, shares: sh } = live.current;
      if (!grabbed.current || !d || !sh) return;
      const ms = Math.round(at(e) * d);
      setS((cur) => (grabbed.current === 'start' ? startHere(cur, ms) : endHere(cur, ms)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: (e) => { const sh = live.current.shares; return sh !== undefined && edgeNear(at(e), sh) !== undefined; },
      onPanResponderGrant: (e) => { const sh = live.current.shares; grabbed.current = sh ? edgeNear(at(e), sh) : undefined; },
      onPanResponderMove: move,
      onPanResponderRelease: () => { grabbed.current = undefined; },
      onPanResponderTerminate: () => { grabbed.current = undefined; },
    });
  }, []);

  const r = size / 2 + COMPOSER.arcOutset;
  const circ = 2 * Math.PI * r;
  const arcLen = shares ? Math.max(COMPOSER.arcMin, shares.to - shares.from) * circ : 0;
  const nudgeRow = (edge: 'start' | 'end') => (
    <Box className="flex-row" style={{ gap: COMPOSER.nudgeGap }}>
      <Chip label="−5 s" spoken={`${edge === 'start' ? 'Start' : 'End'} 5 seconds earlier`} onPress={() => setS(nudgeEdge(s, edge, -1))} />
      <Chip label={edge === 'start' ? 'Start here' : 'End here'} spoken={edge === 'start' ? 'Start here' : 'End here'} onPress={() => setS(edge === 'start' ? startHere(s, position) : endHere(s, position))} />
      <Chip label="+5 s" spoken={`${edge === 'start' ? 'Start' : 'End'} 5 seconds later`} onPress={() => setS(nudgeEdge(s, edge, 1))} />
    </Box>
  );

  const extra = (
    <>
      {s.problem ? <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{problemText[s.problem]}</Type> : null}
      <Input className="bg-raise2 border-0 h-auto" style={{ height: COMPOSER.field, borderRadius: radius.input, paddingHorizontal: 0 }}>
        <InputField
          value={s.caption}
          onChangeText={(t: string) => setS(setCaption(s, t))}
          placeholder="Caption (optional)"
          placeholderTextColor={colour.text3}
          maxLength={COMPOSER.caption}
          accessibilityLabel="Caption"
          returnKeyType="done"
          className="text-text text-pulse-row"
          style={{ paddingHorizontal: COMPOSER.fieldPad }}
        />
      </Input>
      <Box className="flex-row" style={{ gap: spacing.row - 2 }}>
        <Box className="flex-1"><PulseButton label="Preview" kind="quiet" icon="play" onPress={() => player.playClip(props.episode, s.range)} full /></Box>
        <Box className="flex-1"><PulseButton label="Save" kind="light" onPress={() => props.onSave(s)} disabled={blocked && !props.saving} busy={props.saving} full /></Box>
      </Box>
    </>
  );

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PushedPage title="New clip" subtitle={`From ${props.episode.title} · now at ${mmss(position)}`} tone="none" extra={extra} extraAbove={COMPOSER.field + COMPOSER.buttons + 2 * spacing.row}>
        {(layout) => (
          <Box className="flex-1" testID="clip-composer">
            <PlayerBackdrop feedUrl={props.episode.feedUrl} top={-60} opacity={0.5} />
            <Box className="items-center" style={{ paddingTop: layout.top + COMPOSER.ringTop }}>
              <Box style={{ width: size, height: size }}>
                <Ring heat={heat.buckets ?? NO_HEAT} progress={duration ? Math.min(1, position / duration) : 0} size={size} knob={false} pins={[]}>
                  <Artwork url={props.episode.artworkUrl} size={Math.round(size * 0.62)} name={props.episode.showTitle} rounded="pill" />
                </Ring>
                {shares ? (
                  <Svg width={2 * r + COMPOSER.arc} height={2 * r + COMPOSER.arc} style={{ position: 'absolute', left: size / 2 - r - COMPOSER.arc / 2, top: size / 2 - r - COMPOSER.arc / 2, transform: [{ rotate: `${shares.from * 360 - 90}deg` }] }} pointerEvents="none">
                    <Circle cx={r + COMPOSER.arc / 2} cy={r + COMPOSER.arc / 2} r={r} fill="none" stroke={colour.text} strokeWidth={COMPOSER.arc} strokeLinecap="round" strokeDasharray={`${arcLen.toFixed(1)} ${(circ * 2).toFixed(1)}`} />
                  </Svg>
                ) : null}
                {/* The grab layer: a bit bigger than the ring so the arc outside it can be reached. */}
                <Box testID="clip-range" {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={spoken} className="absolute" style={{ left: -COMPOSER.arc, top: -COMPOSER.arc, width: size + 2 * COMPOSER.arc, height: size + 2 * COMPOSER.arc }} />
              </Box>
            </Box>
            <Box className="flex-row items-center justify-between" style={{ marginTop: COMPOSER.rowGap, paddingHorizontal: gutter(width) }}>
              <Box style={{ gap: spacing.gap - 2 }}>
                <Type step="edge" className="text-text3">START</Type>
                <TimestampChip text={mmss(s.range.startMs)} solid />
              </Box>
              <Box className="items-center" style={{ gap: spacing.hair }}>
                <Type step="hero" className="text-text" style={clipsType.length} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{`${length} s`}</Type>
                <Type step="edge" className="text-text3">LENGTH</Type>
              </Box>
              <Box className="items-end" style={{ gap: spacing.gap - 2 }}>
                <Type step="edge" className="text-text3">END</Type>
                <TimestampChip text={mmss(s.range.endMs)} solid />
              </Box>
            </Box>
            <Box style={{ marginTop: spacing.block, paddingHorizontal: gutter(width), gap: COMPOSER.nudgeGap }}>
              {nudgeRow('start')}
              {nudgeRow('end')}
            </Box>
          </Box>
        )}
      </PushedPage>
    </KeyboardAvoidingView>
  );
}

/** A 36 chip of a nudge row (raise fill, a 1 line, Geist 600 13), a 48 target. */
function Chip(props: { label: string; spoken: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.spoken} hitSlop={6} className="flex-1 items-center justify-center bg-raise border border-line" style={{ height: COMPOSER.chip, borderRadius: COMPOSER.chip / 2 }}>
      <Type step="caption" className="text-text font-semibold">{props.label}</Type>
    </Pressable>
  );
}
