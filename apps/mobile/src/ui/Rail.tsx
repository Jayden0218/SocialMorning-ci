/**
 * The rail (FR-013/014): one marker per distinct second that has a timestamped
 * comment, placed at offset / duration across the bar. Tapping seeks there and
 * lists the comment(s) at that second (spec edge case "two comments at the same
 * second": one marker, both listed).
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colour } from '../design';
import { mmss } from './format';
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

/**
 * M6 (FR-023, found on the phone in J5): a marker announced "1 comment at 1800 seconds".
 * A screen reader user needs the moment the way everyone else reads it, and who wrote it.
 */
export function markerLabel(m: RailMarker): string {
  const names = [...new Set(m.comments.map((c) => c.displayName).filter((n): n is string => typeof n === 'string' && n.length > 0))];
  const who = names.length === 0 ? '' : names.length === 1 ? ` by ${names[0]}` : ` by ${names[0]} and ${names.length - 1} other${names.length === 2 ? '' : 's'}`;
  return m.comments.length === 1 ? `Comment at ${mmss(m.offsetMs)}${who}` : `${m.comments.length} comments at ${mmss(m.offsetMs)}${who}`;
}

export function Rail(props: {
  comments: readonly Comment[];
  durationMs: number | undefined;
  onTap: (marker: RailMarker) => void;
}): React.ReactElement | null {
  const markers = useMemo(() => railMarkers(props.comments), [props.comments]);
  if (props.durationMs === undefined || props.durationMs <= 0 || markers.length === 0) return null;
  return (
    <View style={styles.rail} accessibilityRole="list" accessibilityLabel={`${markers.length} commented moment${markers.length === 1 ? '' : 's'}`}>
      {markers.map((m) => (
        <Pressable
          key={m.second}
          accessibilityRole="button"
          accessibilityLabel={markerLabel(m)}
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
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colour.accent },
  dotMany: { width: 10, height: 10, borderRadius: 5 },
  hidden: { position: 'absolute', opacity: 0, height: 0 },
});
