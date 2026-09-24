/**
 * The one button (M7 FR-007). Three kinds, one look each.
 *
 * `destructive` uses the same accent as `primary` — the palette has one accent, and
 * M6's FR-016 forbids colour alone carrying state, so a destructive action is told apart
 * by its word ("Delete", "Remove", "Unsubscribe") and, where M6 put one, its confirm.
 */
import { Pressable, StyleSheet, Text } from 'react-native';
import { colour, fontSize, hit, radius, spacing } from '../design';

export type ButtonKind = 'primary' | 'secondary' | 'destructive';

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  accessibilityLabel?: string;
}): React.ReactElement {
  const kind = props.kind ?? 'primary';
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      style={[styles.base, KIND[kind], props.disabled ? styles.off : null]}
    >
      <Text style={[styles.label, kind === 'secondary' ? styles.labelSecondary : styles.labelOnAccent]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: hit.min, paddingHorizontal: spacing.section, justifyContent: 'center', alignItems: 'center', borderRadius: radius.pill },
  primary: { backgroundColor: colour.accent },
  destructive: { backgroundColor: colour.accent },
  secondary: { borderWidth: 1, borderColor: colour.separator },
  off: { opacity: 0.4 },
  label: { fontSize: fontSize.sm, fontWeight: '600' },
  labelOnAccent: { color: colour.text },
  labelSecondary: { color: colour.text },
});

const KIND = { primary: styles.primary, secondary: styles.secondary, destructive: styles.destructive } as const;
