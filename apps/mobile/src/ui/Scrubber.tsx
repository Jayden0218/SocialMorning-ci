/**
 * The seek bar (M1), made operable without sight in M6 (FR-023, research R4):
 * `adjustable` with a value a screen reader speaks ("14:32 of 34:17") and increment /
 * decrement actions that are the same ±15 / +30 a sighted listener taps. Guard G11.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { mmss } from './format';

export const SCRUB_FORWARD_MS = 30_000;
export const SCRUB_BACK_MS = 15_000;

/** What the screen reader says for the bar. */
export function scrubberValue(positionMs: number, durationMs: number | undefined): { min: number; max: number; now: number; text: string } {
  const max = durationMs ?? 0;
  return { min: 0, max, now: Math.min(positionMs, max), text: durationMs === undefined ? `${mmss(positionMs)}, length unknown` : `${mmss(positionMs)} of ${mmss(durationMs)}` };
}

export function Scrubber(props: {
  positionMs: number;
  durationMs: number | undefined;
  onSeek: (toMs: number) => void;
  /** The same ±15 / +30 the buttons use; the player's `skip` takes that exact union. */
  onSkip: (deltaMs: 30_000 | -15_000) => void;
}): React.ReactElement {
  const [barWidth, setBarWidth] = useState(0);
  const fraction = props.durationMs === undefined || props.durationMs === 0 ? 0 : props.positionMs / props.durationMs;
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      // G11 BROKEN ON PURPOSE: no value, no actions
      onAccessibilityAction={(e) => props.onSkip(e.nativeEvent.actionName === 'increment' ? 30_000 : -15_000)}
      style={styles.track}
      onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
      onPress={(event) => {
        if (props.durationMs === undefined || barWidth === 0) return;
        const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / barWidth));
        props.onSeek(Math.round(ratio * props.durationMs));
      }}
    >
      <View style={[styles.fill, { width: `${Math.min(100, fraction * 100)}%` }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, backgroundColor: '#ddd', overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', backgroundColor: '#111' },
});
