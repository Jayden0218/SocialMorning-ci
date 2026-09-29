/**
 * The one button (M7 FR-007). Three kinds, one look each.
 *
 * `destructive` uses the same accent as `primary` — the palette has one accent, and
 * M6's FR-016 forbids colour alone carrying state, so a destructive action is told apart
 * by its word ("Delete", "Remove", "Unsubscribe") and, where M6 put one, its confirm.
 */
import { Pressable, Text } from 'react-native';
import { hit } from '../design';

export type ButtonKind = 'primary' | 'secondary' | 'destructive';

const KIND: Record<ButtonKind, string> = {
  primary: 'bg-primary',
  destructive: 'bg-primary',
  secondary: 'border border-separator',
};

/** Words on the solid yellow take `onPrimary`; on the outlined secondary they sit on the page, so `text`. */
const LABEL: Record<ButtonKind, string> = {
  primary: 'text-sm font-semibold text-onPrimary',
  destructive: 'text-sm font-semibold text-onPrimary',
  secondary: 'text-sm font-semibold text-text',
};

/** Kept as a style: shared-ui asserts the tap target on the Pressable's own `style`. */
const TAP = { minHeight: hit.min };

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  accessibilityLabel?: string;
  className?: string;
}): React.ReactElement {
  const kind = props.kind ?? 'primary';
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      className={`px-section justify-center items-center rounded-pill ${KIND[kind]} ${props.disabled ? 'opacity-40' : ''} ${props.className ?? ''}`}
      style={TAP}
    >
      <Text className={LABEL[kind]}>{props.label}</Text>
    </Pressable>
  );
}
