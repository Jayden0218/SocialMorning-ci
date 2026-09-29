/**
 * The rail (FR-013/014): one marker per distinct second that has a timestamped
 * comment, placed at offset / duration across the bar. Tapping seeks there and
 * lists the comment(s) at that second (spec edge case "two comments at the same
 * second": one marker, both listed).
 */
import { useMemo } from 'react';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
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
    <Box className="w-full h-[14px] relative" accessibilityRole="list" accessibilityLabel={`${markers.length} commented moment${markers.length === 1 ? '' : 's'}`}>
      {markers.map((m) => (
        <Pressable
          key={m.second}
          accessibilityRole="button"
          accessibilityLabel={markerLabel(m)}
          hitSlop={8}
          onPress={() => props.onTap(m)}
          className="absolute top-0 -ml-1.5 w-3 h-[14px] items-center justify-end"
          // The position is offset / duration, known only at runtime.
          style={{ left: `${Math.min(100, (m.offsetMs / props.durationMs!) * 100)}%` }}
        >
          <Box className={`bg-accent ${m.comments.length > 1 ? 'w-2.5 h-2.5 rounded-[5px]' : 'w-2 h-2 rounded-sm'}`} />
        </Pressable>
      ))}
      <Text className="absolute opacity-0 h-0 text-text">{markers.length}</Text>
    </Box>
  );
}

