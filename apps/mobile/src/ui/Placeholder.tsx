/** M6: the four placeholders a comment or clip can become — the same shape, one word each. */
import { StyleSheet, Text } from 'react-native';
import type { Comment } from '../social/api';

export type PlaceholderKind = 'deleted' | 'removed' | 'removed_mine' | 'blocked' | 'reported';

export const PLACEHOLDER_TEXT: Record<PlaceholderKind, string> = {
  deleted: 'Comment deleted',
  removed: 'Removed by moderation',
  removed_mine: 'Removed by moderation — see the community rules',
  blocked: "A blocked listener's reply",
  reported: 'You reported this',
};

/** Which placeholder a comment row is, or undefined when it is a live comment. */
export function placeholderFor(c: Pick<Comment, 'deleted' | 'removed' | 'blocked' | 'mine'>, reported = false): PlaceholderKind | undefined {
  if (reported) return 'reported';
  if (c.blocked) return 'blocked';
  if (c.removed) return c.mine ? 'removed_mine' : 'removed';
  if (c.deleted) return 'deleted';
  return undefined;
}

export function Placeholder(props: { kind: PlaceholderKind }): React.ReactElement {
  return <Text style={styles.muted} accessibilityRole="text">{PLACEHOLDER_TEXT[props.kind]}</Text>;
}

const styles = StyleSheet.create({ muted: { color: '#666', fontSize: 13, fontStyle: 'italic' } });
