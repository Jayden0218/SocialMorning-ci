/** M6: the four placeholders a comment or clip can become — the same shape, one word each. */
import { Text } from './lib/text';
import type { Comment } from '../social/api';

export type PlaceholderKind = 'deleted' | 'removed' | 'removed_mine' | 'blocked' | 'reported' | 'hidden_by_host';

export const PLACEHOLDER_TEXT: Record<PlaceholderKind, string> = {
  deleted: 'Comment deleted',
  removed: 'Removed by moderation',
  removed_mine: 'Removed by moderation — see the community rules',
  blocked: "A blocked listener's reply",
  reported: 'You reported this',
  hidden_by_host: 'Hidden by the host',
};

/** Which placeholder a comment row is, or undefined when it is a live comment. */
export function placeholderFor(c: Pick<Comment, 'deleted' | 'removed' | 'blocked' | 'mine' | 'hiddenByHost'>, reported = false): PlaceholderKind | undefined {
  if (reported) return 'reported';
  if (c.blocked) return 'blocked';
  if (c.removed) return c.mine ? 'removed_mine' : 'removed';
  // M11: others see the placeholder; the author (mine, not deleted) keeps the text, marked below.
  if (c.hiddenByHost && c.deleted) return 'hidden_by_host';
  if (c.deleted) return 'deleted';
  return undefined;
}

export function Placeholder(props: { kind: PlaceholderKind; className?: string }): React.ReactElement {
  return <Text className={`text-muted text-[13px] italic ${props.className ?? ''}`} accessibilityRole="text">{PLACEHOLDER_TEXT[props.kind]}</Text>;
}
