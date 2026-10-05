// A voice comment's row: a play/stop disc, a thin bar and its length; pauses the episode.
/**
 * M19 US6 (FR-044): a voice comment plays inline. Tapping the yellow disc pauses the episode
 * (if it was playing), plays the voice through `playVoice` (the one file that imports
 * expo-audio), and resumes the episode when the voice ends or is stopped — only if it was
 * playing before. One voice at a time: starting another stops the first (and it does not
 * resume the episode in between). The bar is as long as the voice is (60 s = full width).
 * `play` is `playVoice` from src/playback/expo-audio-adapter.ts, passed in by the page so that
 * CommentRow (and its tests) never load expo-audio. The recorder is VoiceRecord.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import type { playVoice } from '@/playback/expo-audio-adapter';
import { usePlayer } from '@/playback/store';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { mmss } from '@/ui/kit/format';
import { hit } from '@/design';
import { VOICE_MAX_MS } from '@/social/voice';
import type { CommentVoice } from '@/social/comment-extras-api';

/** The voice player: `playVoice` from the playback adapter. */
export type PlayVoice = typeof playVoice;

const DISC = { width: hit.min, height: hit.min };
const BAR = { height: 4 };

/** The one voice playing in the app: starting another hands the "resume the episode" duty over. */
let current: { id: number; wasPlaying: boolean; stop: (resume: boolean) => void } | undefined;
let nextId = 1;

/** How long the bar is, as a share of the row: at least a third, full at 60 s. */
export const barShare = (ms: number): number => Math.min(1, Math.max(1 / 3, ms / VOICE_MAX_MS));

export function voiceCommentLabel(ms: number, playing: boolean): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return playing ? `Stop voice comment, ${s} seconds` : `Play voice comment, ${s} seconds`;
}

export function VoiceComment(props: { voice: CommentVoice; play: PlayVoice }): React.ReactElement {
  const c = useColours();
  const player = usePlayer();
  const [playing, setPlaying] = useState(false);
  const mine = useRef<number | undefined>(undefined);

  const stop = (resume: boolean) => { if (current && current.id === mine.current) current.stop(resume); };
  useEffect(() => () => stop(true), []);

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
    <Box className="gap-1 self-stretch">
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={voiceCommentLabel(props.voice.ms, playing)}
      accessibilityState={{ selected: playing }}
      className="flex-row items-center gap-row self-stretch"
      style={{ minHeight: hit.min }}
    >
      <Box className="rounded-pill bg-playDisc items-center justify-center" style={DISC}>
        <Icon name={playing ? 'stop' : 'play'} size={18} color={c.playGlyph} />
      </Box>
      <Box className="flex-1 justify-center">
        <Box className="rounded-pill bg-separator overflow-hidden" style={[BAR, { width: `${Math.round(barShare(props.voice.ms) * 100)}%` as const }]}>
          {playing ? <Box className="flex-1 bg-primary" /> : null}
        </Box>
      </Box>
      <Text className={playing ? 'text-accent text-xs font-bold' : 'text-muted text-xs font-bold'}>{mmss(props.voice.ms)}</Text>
    </Pressable>
    {/* M20 US3: the text its author posted with it, under the player. */}
    {props.voice.text ? <Text className="text-text text-sm">{props.voice.text}</Text> : null}
    </Box>
  );
}
