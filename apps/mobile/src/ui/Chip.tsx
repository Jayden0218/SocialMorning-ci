/** A small selectable pill — speeds, sleep lengths, filters (M7 FR-007). */
import { Pressable, StyleSheet, Text } from 'react-native';
import { colour, fontSize, hit, radius, spacing } from '../design';

export function Chip(props: { label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ selected: props.selected === true }}
      style={[styles.chip, props.selected ? styles.on : null]}
    >
      <Text style={[styles.label, props.selected ? styles.labelOn : null]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: hit.min, paddingHorizontal: spacing.section, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colour.separator },
  on: { backgroundColor: colour.accent, borderColor: colour.accent },
  label: { color: colour.muted, fontSize: fontSize.xs, fontWeight: '600' },
  labelOn: { color: colour.text },
});
