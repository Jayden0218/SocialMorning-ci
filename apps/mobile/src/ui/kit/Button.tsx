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
import { BusyContent } from './BusyContent';

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

/** The busy bars take the words' colour. */
const BARS: Record<ButtonKind, string> = { primary: 'bg-onPrimary', destructive: 'bg-onPrimary', secondary: 'bg-text' };

export function Button(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  /** While the press runs: the sound bars over the hidden words, same size, not pressable, not dimmed. */
  busy?: boolean;
  accessibilityLabel?: string;
  className?: string;
}): React.ReactElement {
  const kind = props.kind ?? 'primary';
  const busy = props.busy === true;
  const dim = props.disabled === true && !busy;
  return (
    <LibButton
      variant={kind === 'secondary' ? 'outline' : 'default'}
      // Busy is not `isDisabled`: the library dims a disabled button. The press is dropped instead.
      onPress={busy ? undefined : props.onPress}
      isDisabled={dim}
      disabled={dim}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true || busy, busy }}
      className={`px-section justify-center items-center rounded-pill ${KIND[kind]} ${dim ? 'opacity-40' : ''} ${props.className ?? ''}`}
      style={TAP}
    >
      <BusyContent busy={busy} barClassName={BARS[kind]}>
        <ButtonText className={LABEL[kind]}>{props.label}</ButtonText>
      </BusyContent>
    </LibButton>
  );
}
