/**
 * The heat curve (US3, FR-020/021): 100 bars under the scrubber. Three states,
 * each drawn on purpose — SC-004 says no new listener ever sees a broken chart:
 *   available:false → a one-line note (the episode's length is not known yet)
 *   all zero        → a flat line and "Nobody has marked a moment yet"
 *   otherwise       → bars, tallest = 1
 * Tap/drag on the bars seeks to that segment and hands back the bucket.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EMPTY_STATES } from '@socialmorning/social-core';
import { mmss } from './format';

export type Heat = { available: true; buckets: number[] } | { available: false };

export function heatMessage(heat: Heat | undefined): string | undefined {
  if (!heat || !heat.available) return "Heat isn't available yet for this episode";
  // M6 (FR-019): the flat line is a sentence with the action in it, not a blank chart.
  if (heat.buckets.every((v) => v === 0)) return EMPTY_STATES.heat.sentence;
  return undefined;
}

/**
 * M6 (FR-024): what a screen reader says for the curve — the loudest moment, or the
 * empty sentence. Never an unlabelled image.
 */
export function heatLabel(heat: Heat | undefined, durationMs: number | undefined): string {
  const message = heatMessage(heat);
  if (message !== undefined) return message;
  const buckets = (heat as { available: true; buckets: number[] }).buckets;
  let best = 0;
  for (let i = 1; i < buckets.length; i++) if (buckets[i]! > buckets[best]!) best = i;
  const at = durationMs === undefined ? `segment ${best + 1} of ${buckets.length}` : mmss(Math.round((best / buckets.length) * durationMs));
  return `Reaction curve. Most reactions at ${at}.`;
}

/**
 * The 100 segments span `durationMs` (the server's axis). The scrubber above spans
 * `playerDurationMs`. When they differ (a feed that declares 50:49 for 48:19 of audio)
 * the bars are drawn across `durationMs / playerDurationMs` of the width so bucket i
 * sits under the time it describes — never stretched to fit.
 */
export function HeatCurve(props: {
  heat: Heat | undefined;
  durationMs: number | undefined;
  playerDurationMs?: number | undefined;
  myBuckets?: number[];
  onSeek: (bucket: number, toMs: number) => void;
}): React.ReactElement {
  const [width, setWidth] = useState(0);
  const label = heatLabel(props.heat, props.durationMs);
  const message = heatMessage(props.heat);
  const buckets = props.heat?.available ? props.heat.buckets : new Array<number>(100).fill(0);
  const mine = new Set(props.myBuckets ?? []);
  // > 1 when the feed declared more than the audio holds (50:49 vs 48:19): the bars run past
  // the scrubber's end and the wrapper clips them — bucket i still sits under its time.
  const axisFraction = props.durationMs && props.playerDurationMs ? props.durationMs / props.playerDurationMs : 1;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={[styles.bars, { width: `${axisFraction * 100}%` }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (props.durationMs === undefined || width === 0) return;
          const bucket = Math.min(99, Math.max(0, Math.floor((e.nativeEvent.locationX / width) * 100)));
          props.onSeek(bucket, Math.round((bucket / 100) * props.durationMs));
        }}
      >
        {buckets.map((v, i) => (
          <View key={i} style={[styles.bar, { height: 2 + v * 26 }, mine.has(i) && styles.mine]} />
        ))}
      </Pressable>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 4, overflow: 'hidden' },
  bars: { height: 28, flexDirection: 'row', alignItems: 'flex-end', gap: 1, alignSelf: 'flex-start' },
  bar: { flex: 1, backgroundColor: '#f28c28', borderTopLeftRadius: 1, borderTopRightRadius: 1 },
  mine: { backgroundColor: '#0645ad' },
  message: { fontSize: 12, color: '#666', textAlign: 'center' },
});
