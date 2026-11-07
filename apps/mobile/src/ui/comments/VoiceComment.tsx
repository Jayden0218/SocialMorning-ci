// A voice comment's row: a play/stop disc, a thin bar and its length; pauses the episode.
/**
 * M19 US6 (FR-044): a voice comment plays inline. Tapping the yellow disc pauses the episode
 * (if it was playing), plays the voice through `playVoice` (the one file that imports
 * expo-audio), and resumes the episode when the voice ends or is stopped — only if it was
 * playing before. One voice at a time: starting another stops the first (and it does not
 * resume the episode in between).
 * `play` is `playVoice` from src/playback/expo-audio-adapter.ts, passed in by the page so that
 * CommentRow (and its tests) never load expo-audio. The recorder is VoiceRecord.tsx.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { playVoice } from '@/playback/expo-audio-adapter';
import { usePlayer } from '@/playback/store';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { colour } from '@/design';
import { VOICE_MAX_MS } from '@/social/voice';
import type { CommentVoice } from '@/social/comment-extras-api';
import { COMMENTS } from './measures';

/** The voice player: `playVoice` from the playback adapter. */
export type PlayVoice = typeof playVoice;

/**
 * M31 W2-B (`social.html` `voiceBlock`): a raise2 block, radius 14, padding 8 / 10 — a 32 light disc with a void glyph, a
 * 26-bar wave (22 tall) that fills hot to violet as the voice plays, and the length in mono (text2). The speech text its
 * author posted sits under it in italics, in quotes (Geist 400 14/20, text2). The wave is not the recording's own: the app
 * keeps no level data, so the bars are a fixed shape drawn from the length (the drawing's are too).
 */
const DISC = { width: COMMENTS.voiceDisc, height: COMMENTS.voiceDisc };
/** A tap area of 48 on a 32 disc. */
const SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const BLOCK = { borderRadius: COMMENTS.voiceRadius, paddingVertical: COMMENTS.voicePad.v, paddingHorizontal: COMMENTS.voicePad.h, gap: COMMENTS.voicePad.h };
const WAVE_BUCKETS = 100;

/** A fixed, repeatable wave for a voice of `ms` (the drawing's `PK.heat(seed)` shape: a floor, a few humps). */
export function voiceWave(ms: number): number[] {
  let seed = Math.max(1, Math.round(ms / 1000)) * 7;
  const next = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return Array.from({ length: WAVE_BUCKETS }, () => 0.15 + next() * 0.85);
}

/** The one voice playing in the app: starting another hands the "resume the episode" duty over. */
let current: { id: number; wasPlaying: boolean; stop: (resume: boolean) => void } | undefined;
let nextId = 1;

/** The old bar length (a share of the row, full at 60 s); kept for its test. */
export const barShare = (ms: number): number => Math.min(1, Math.max(1 / 3, ms / VOICE_MAX_MS));

export function voiceCommentLabel(ms: number, playing: boolean): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return playing ? `Stop voice comment, ${s} seconds` : `Play voice comment, ${s} seconds`;
}

export function VoiceComment(props: { voice: CommentVoice; play: PlayVoice }): React.ReactElement {
  const player = usePlayer();
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(0);
  const mine = useRef<number | undefined>(undefined);
  const wave = useMemo(() => voiceWave(props.voice.ms), [props.voice.ms]);

  const stop = (resume: boolean) => { if (current && current.id === mine.current) current.stop(resume); };
  useEffect(() => () => stop(true), []);
  // The wave fills as the voice plays (a quarter-second tick; the length is the recording's own).
  useEffect(() => {
    if (!playing) { setDone(0); return undefined; }
    const t0 = Date.now();
    const timer = setInterval(() => setDone(Math.min(1, (Date.now() - t0) / Math.max(1, props.voice.ms))), 250);
    return () => clearInterval(timer);
  }, [playing, props.voice.ms]);

  const toggle = () => {
    if (playing) { stop(true); return; }
    // Another voice is playing: stop it without resuming, and take over its "was playing" state.
    let wasPlaying = false;
    if (current) { wasPlaying = current.wasPlaying; current.stop(false); }
    const s = player.getState().kind;
    if (s === 'playing' || s === 'buffering') { wasPlaying = true; player.pause(); }
    const id = nextId++;
    mine.current = id;
    let ended = false;
    const finish = (resume: boolean) => {
      if (ended) return;
      ended = true;
      handle.stop();
      if (current?.id === id) current = undefined;
      setPlaying(false);
      if (resume && wasPlaying) player.play();
    };
    const handle = props.play(props.voice.url, () => finish(true));
    current = { id, wasPlaying, stop: finish };
    setPlaying(true);
  };

  return (
    <Box style={TEXT_GAP}>
      <Box className="flex-row items-center bg-raise2" style={BLOCK}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={voiceCommentLabel(props.voice.ms, playing)}
          accessibilityState={{ selected: playing }}
          hitSlop={SLOP}
          className="rounded-pill bg-text items-center justify-center"
          style={DISC}
        >
          <Icon name={playing ? 'pause' : 'play'} size={14} color={colour.void} />
        </Pressable>
        <Box className="flex-1">
          <Curve data={wave} count={COMMENTS.voiceBars} height={COMMENTS.voiceHeight} min={3} played={done} />
        </Box>
        <Type step="mono" className="text-text2">{mmss(props.voice.ms)}</Type>
      </Box>
      {/* M20 US3: the text its author posted with it, under the player. */}
      {props.voice.text ? <Type step="quote" className="text-text2 italic">{`“${props.voice.text}”`}</Type> : null}
    </Box>
  );
}

const TEXT_GAP = { gap: COMMENTS.cardGap };
