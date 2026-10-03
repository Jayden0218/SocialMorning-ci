// The app's one button: yellow, white with border, or for delete actions.
/**
 * The one button (M7 FR-007). Three kinds, one look each. M17 (`SignIn-B`, `Issues-B`): the
 * Editorial pill — dark words on the yellow (the 1.60 waiver ended), or white with a thin border.
 *
 * M9: built on gluestack's Button and ButtonText (owner: "the special parts are built from
 * gluestack parts"). It came back after the 2026-09-27 merge because upstream's new
 * settings and scan pages use it; the props are unchanged.
 *
 * `destructive` uses the same accent as `primary` — the palette has one accent, and
 * M6's FR-016 forbids colour alone carrying state, so a destructive action is told apart
 * by its word ("Delete", "Remove", "Unsubscribe") and, where M6 put one, its confirm.
 */
import { Button as LibButton, ButtonText } from '@/ui/lib/button';
import { hit } from '@/design';

export type ButtonKind = 'primary' | 'secondary' | 'destructive';

const KIND: Record<ButtonKind, string> = {
  primary: 'bg-primary',
  destructive: 'bg-primary',
  secondary: 'border border-border bg-surface',
};

/** Words on the solid yellow take `onPrimary`; on the outlined secondary they sit on the page, so `text`. */
const LABEL: Record<ButtonKind, string> = {
  primary: 'text-body font-bold text-onPrimary',
  destructive: 'text-body font-bold text-onPrimary',
  secondary: 'text-body font-bold text-text',
};

/** Kept as a style: shared-ui asserts the tap target on the button's own `style`. */
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
    <LibButton
      variant={kind === 'secondary' ? 'outline' : 'default'}
      onPress={props.onPress}
      isDisabled={props.disabled === true}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true }}
      className={`px-section justify-center items-center rounded-pill ${KIND[kind]} ${props.disabled ? 'opacity-40' : ''} ${props.className ?? ''}`}
      style={TAP}
    >
      <ButtonText className={LABEL[kind]}>{props.label}</ButtonText>
    </LibButton>
  );
}
