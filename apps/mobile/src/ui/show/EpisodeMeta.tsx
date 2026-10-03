/**
 * One show-page row's meta line: "69 min · 13 h ago  🎧 120  💬 8" (owner, 2026-10-01, after the
 * 小宇宙 show page). A count shows only when it is above 0 — the app never invents a number.
 * The row's own accessibilityLabel speaks the words (metaLabel); the Pressable groups this line.
 * M17 (`Show-B`): where you stopped is in the accent, as the design marks your own progress.
 */
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { Icon } from '@/ui/kit/Icon';
import { ago, minutesLabel } from '@/ui/kit/format';
import { plural } from '@socialmorning/social-core';

export type MetaInput = { durationMs?: number | undefined; publishedAt?: number | undefined; plays: number; comments: number; progress: string; now: number };

/** The words a screen reader hears for the same line. */
export function metaLabel(m: MetaInput): string {
  return [minutesLabel(m.durationMs), ago(m.publishedAt, m.now), m.plays > 0 ? `${m.plays} listened` : '', m.comments > 0 ? plural(m.comments, 'comment') : '', m.progress]
    .filter((p) => p !== '')
    .join(' · ');
}

export function EpisodeMeta(props: MetaInput & { iconColour: string }): React.ReactElement {
  const lead = [minutesLabel(props.durationMs), ago(props.publishedAt, props.now)].filter((p) => p !== '').join(' · ');
  return (
    <Box className="flex-row flex-wrap items-center gap-x-2">
      {lead === '' ? null : <Text className="text-xs text-muted">{lead}</Text>}
      {props.plays > 0 ? (
        <Box className="flex-row items-center gap-0.5">
          <Icon name="headset-outline" size={12} color={props.iconColour} />
          <Text className="text-xs text-muted">{String(props.plays)}</Text>
        </Box>
      ) : null}
      {props.comments > 0 ? (
        <Box className="flex-row items-center gap-0.5">
          <Icon name="chatbubble-outline" size={12} color={props.iconColour} />
          <Text className="text-xs text-muted">{String(props.comments)}</Text>
        </Box>
      ) : null}
      {props.progress === '' ? null : <Text className="text-xs font-semibold text-accent">{props.progress}</Text>}
    </Box>
  );
}
