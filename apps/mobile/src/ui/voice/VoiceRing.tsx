// The voice status ring: 270 round, it is the 60-second limit; the record button and the clock sit inside it.
/**
 * M31 W3-B (T041; design-pulse2 `social.html` `recRing`, `voice-new--screen`, `-recording`; "Layout: Ring"): a 270 ring, stroke 10, the
 * track white at 10 % (`trackSoft`), the arc hot to violet with round caps filling as you record. Inside: the clock in
 * Unbounded 800 40 with "/ 1:00" (Unbounded 600 16, text3), the 84 record button, and a line under it (Geist 500 13, text2).
 *   idle      — a light disc, a void microphone       "Tap to record"
 *   recording — a hot disc, a void stop square, the glow round the button brightens    "Recording — tap to stop"
 *   done      — an outlined disc (raise2, a 1.5 text line) with a loop glyph             "Tap to record again"
 * The button is the page's "Start recording" / "Stop recording" / "Record again" (named for what it will do).
 */
import { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { VOICE_RING, voiceType } from './measures';

export type VoiceRingState = 'idle' | 'recording' | 'done';

export function VoiceRing(props: {
  state: VoiceRingState;
  /** How much of the 60 s is used, 0–1. */
  fraction: number;
  /** Whole seconds recorded, for a screen reader ("13 seconds of 60"). */
  seconds: number;
  /** "0:13" */
  clock: string;
  /** "1:00" */
  cap: string;
  line: string;
  label: string;
  busy?: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { size, stroke, button } = VOICE_RING;
  const id = `vr${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = (size - stroke) / 2 - VOICE_RING.inset;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, props.fraction));
  const recording = props.state === 'recording';
  const done = props.state === 'done';
  return (
    <Box testID="voice-ring" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} pointerEvents="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colour.hot} />
            <Stop offset="1" stopColor={colour.violet} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour.trackSoft} strokeWidth={stroke} />
        {frac > 0 ? <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * frac).toFixed(1)} ${c.toFixed(1)}`} /> : null}
      </Svg>
      {recording ? <Box testID="voice-glow" pointerEvents="none" className="absolute rounded-pill" style={{ left: VOICE_RING.glowInset, top: VOICE_RING.glowInset, right: VOICE_RING.glowInset, bottom: VOICE_RING.glowInset, shadowColor: colour.hot, shadowOpacity: 0.5, shadowRadius: VOICE_RING.glowRadius, shadowOffset: { width: 0, height: 0 } }} /> : null}
      <Box className="absolute inset-0 items-center justify-center" style={{ gap: VOICE_RING.lineGap }}>
        <Type step="figure" className="text-text" style={voiceType.clock} accessibilityLiveRegion="polite" accessibilityLabel={`${props.seconds} seconds of 60`}>
          {props.clock}
          <Type step="heading" className="text-text3" style={voiceType.cap}>{` / ${props.cap}`}</Type>
        </Type>
        <Pressable
          onPress={props.busy ? undefined : props.onPress}
          disabled={props.busy === true}
          accessibilityRole="button"
          accessibilityLabel={props.label}
          className={`items-center justify-center rounded-pill ${recording ? 'bg-hot' : done ? 'bg-raise2 border-[1.5px] border-text' : 'bg-text'} ${props.busy ? 'opacity-40' : ''}`}
          style={{ width: button, height: button }}
        >
          {recording ? <Box className="bg-void" style={{ width: VOICE_RING.stop, height: VOICE_RING.stop, borderRadius: VOICE_RING.stopRadius }} /> : <Icon name={done ? 'reload-outline' : 'mic-outline'} size={done ? 30 : 32} color={done ? colour.text : colour.void} />}
        </Pressable>
        <Type step="caption" className="text-text2">{props.line}</Type>
      </Box>
    </Box>
  );
}
