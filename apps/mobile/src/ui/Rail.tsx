/**
 * The rail (FR-013/014): one marker per distinct second that has a timestamped
 * comment, placed at offset / duration across the bar. Tapping seeks there and
 * lists the comment(s) at that second (spec edge case "two comments at the same
 * second": one marker, both listed).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Comment } from '../social/api';

export type RailMarker = { second: number; offsetMs: number; comments: Comment[] };

/** Pure: group timestamped, non-deleted comments (top-level and replies) by whole second. */
export function railMarkers(comments: readonly Comment[]): RailMarker[] {
  const bySecond = new Map<number, RailMarker>();
  const visit = (c: Comment) => {
    if (!c.deleted && c.offsetMs !== null) {
      const second = Math.floor(c.offsetMs / 1000);
      const m = bySecond.get(second) ?? { second, offsetMs: second * 1000, comments: [] };
      m.comments.push(c);
      bySecond.set(second, m);
    }
    c.replies?.forEach(visit);
  };
  comments.forEach(visit);
  return [...bySecond.values()].sort((a, b) => a.second - b.second);
}

export function Rail(props: {
  comments: readonly Comment[];
  durationMs: number | undefined;
  onTap: (marker: RailMarker) => void;
}): React.ReactElement | null {
  const markers = useMemo(() => railMarkers(props.comments), [props.comments]);
  if (props.durationMs === undefined || props.durationMs <= 0 || markers.length === 0) return null;
  return (
    <View style={styles.rail} accessibilityLabel={`${markers.length} commented moments`}>
      {markers.map((m) => (
        <Pressable
          key={m.second}
          accessibilityRole="button"
          accessibilityLabel={`${m.comments.length} comment${m.comments.length === 1 ? '' : 's'} at ${m.second} seconds`}
          hitSlop={8}
          onPress={() => props.onTap(m)}
          style={[styles.marker, { left: `${Math.min(100, (m.offsetMs / props.durationMs!) * 100)}%` }]}
        >
          <View style={[styles.dot, m.comments.length > 1 && styles.dotMany]} />
        </Pressable>
      ))}
      <Text style={styles.hidden}>{markers.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: '100%', height: 14, position: 'relative' },
  marker: { position: 'absolute', top: 0, marginLeft: -6, width: 12, height: 14, alignItems: 'center', justifyContent: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0645ad' },
  dotMany: { width: 10, height: 10, borderRadius: 5 },
  hidden: { position: 'absolute', opacity: 0, height: 0 },
});
