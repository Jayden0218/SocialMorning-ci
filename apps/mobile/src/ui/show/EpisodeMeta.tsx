// Small line under a show's episode: length, how long ago, plays, comments.
/**
 * One show-page row's meta line: "69 min · 13 h ago  🎧 120  💬 8" (owner, 2026-10-01, after the
 * 小宇宙 show page). A count shows only when it is above 0 — the app never invents a number.
 * The row's own accessibilityLabel speaks the words (metaLabel); the Pressable groups this line.
 * M17 (`Show-B`): where you stopped is in the accent, as the design marks your own progress.
 *
 * M31 W3-A (T040): mono 11 in text3 (the drawing's "length · date" line), where you stopped in hot-text.
 */
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Icon } from '@/ui/kit/Icon';
import { ago, compactCount, minutesLabel, pluralCompact } from '@/ui/kit/format';

export type MetaInput = { durationMs?: number | undefined; publishedAt?: number | undefined; plays: number; comments: number; progress: string; now: number };

/** The words a screen reader hears for the same line. */
export function metaLabel(m: MetaInput): string {
  return [minutesLabel(m.durationMs), ago(m.publishedAt, m.now), m.plays > 0 ? `${compactCount(m.plays)} listened` : '', m.comments > 0 ? pluralCompact(m.comments, 'comment') : '', m.progress]
    .filter((p) => p !== '')
    .join(' · ');
}

export function EpisodeMeta(props: MetaInput & { iconColour: string }): React.ReactElement {
  const lead = [minutesLabel(props.durationMs), ago(props.publishedAt, props.now)].filter((p) => p !== '').join(' · ');
  return (
    <Box className="flex-row flex-wrap items-center gap-x-gap">
      {lead === '' ? null : <Type step="tag" className="text-text3">{lead}</Type>}
      {props.plays > 0 ? (
        <Box className="flex-row items-center gap-hair">
          <Icon name="headset-outline" size={12} color={props.iconColour} />
          <Type step="tag" className="text-text3">{compactCount(props.plays)}</Type>
        </Box>
      ) : null}
      {props.comments > 0 ? (
        <Box className="flex-row items-center gap-hair">
          <Icon name="chatbubble-outline" size={12} color={props.iconColour} />
          <Type step="tag" className="text-text3">{compactCount(props.comments)}</Type>
        </Box>
      ) : null}
      {props.progress === '' ? null : <Type step="tag" className="text-hotText">{props.progress}</Type>}
    </Box>
  );
}
