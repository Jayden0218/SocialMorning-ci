/**
 * THE list row (M7 FR-003). Every list in the app uses this one: artwork, a title of at
 * most two lines, a muted second line, an optional trailing element, a hairline
 * separator, and a tap target of at least 48 dp (M6 FR-015, carried forward).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colour, fontSize, hit, spacing } from '../design';
import { Artwork } from './Artwork';

export const ROW_ARTWORK = 56;

export function Row(props: {
  title: string;
  line?: string;
  artworkUrl?: string | null;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The last row in a list has no separator under it. */
  last?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const body = (
    <>
      <Artwork url={props.artworkUrl} size={ROW_ARTWORK} />
      <View style={styles.grow}>
        <Text style={styles.title} numberOfLines={2}>{props.title}</Text>
        {props.line ? <Text style={styles.line} numberOfLines={2}>{props.line}</Text> : null}
      </View>
      {props.trailing}
    </>
  );
  if (!props.onPress) return <View style={[styles.row, props.last ? null : styles.separator]}>{body}</View>;
  return (
    <Pressable
      style={[styles.row, props.last ? null : styles.separator]}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? (props.line ? `${props.title}, ${props.line}` : props.title)}
      accessibilityState={{ disabled: props.disabled === true }}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.row, paddingVertical: spacing.gap, minHeight: hit.min },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colour.separator },
  grow: { flex: 1, gap: 2 },
  title: { color: colour.text, fontSize: fontSize.sm, fontWeight: '600' },
  line: { color: colour.muted, fontSize: fontSize.xs },
});
