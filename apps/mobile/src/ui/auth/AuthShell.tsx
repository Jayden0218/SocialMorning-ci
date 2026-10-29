// The frame every email sign-in step shares, and the fields and buttons the sign-in pages draw.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `emailPage`, entries `auth-email--screen`, `--code-step`, `--name-step`):
 * the Panel frame of the three email steps — the hot-to-violet glow (top −300, 25 %), the form under a spacer (120, 100 or
 * 40 for the step), a fade, and the title low by the thumb with a close (✕) circle for its back, a subtitle or an eyebrow over
 * it, and the step's button in a 52 row at the foot (title at 70, foot at 6). The keyboard lifts the whole bottom zone.
 *
 * The parts (all Pulse): `AuthField` — a mono 11 label over a 56 field (radius 18, raise-2, 17 type); `CodeCells` — six
 * 58-tall cells (radius 16, raise-2, Unbounded 26), the next one ringed in hot, over one real field so typing, pasting and the
 * code from Messages work; `SentTo` — the address in a tile with Change; `NameMonogram` — the 110 disc with the typed initials;
 * `AuthButton` — a 56 pill, light or ring, with an optional mark pinned 20 from the left (the sign-in page's buttons).
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, useWindowDimensions, type TextInputProps } from 'react-native';
import { Input, InputField } from '@/ui/lib/input';
import { Image } from '@/ui/lib/image';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { colour, gutter, hit, radius, type Colour } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { BusyContent } from '@/ui/kit/BusyContent';
import { OverlayPage } from '@/ui/kit/OverlayPage';
import { Type } from '@/ui/kit/Type';
import { AUTH, AUTH_TYPE } from './measures';

const TAP = { minHeight: hit.min };

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * `lead` is the step's spacer under the status bar (`AUTH.lead`); `eyebrow` is the small capital line over the title (the code
 * step's "Check your email"); `subtitle` sits under the title (the name step's line).
 */
export function AuthShell(props: { title: string; eyebrow?: string; subtitle?: string; lead: number; foot: ReactNode; children: ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <KeyboardAvoidingView className="flex-1 bg-void" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <OverlayPage
        title={props.title}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
        size={30}
        onBack={close}
        backIcon="close"
        backLabel="Close"
        glowTop={-300}
        glowStrength={0.25}
        foot={props.foot}
        {...(props.eyebrow ? { extra: <Type step="mono" className="text-hotText" style={AUTH_TYPE.eyebrow} accessibilityRole="header">{props.eyebrow}</Type> } : {})}
      >
        {(l) => (
          <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: l.top + AUTH.bodyTop + props.lead, paddingBottom: l.reserve, paddingHorizontal: gutter(width), gap: AUTH.bodyGap }}>
            {props.children}
          </ScrollView>
        )}
      </OverlayPage>
    </KeyboardAvoidingView>
  );
}

/**
 * The name step's monogram (design-pulse2 `emailPage` name step): a 110 disc in raise-2 with the typed name's initials in
 * Unbounded 800 44 hot-text, a person glyph until there is a name. Decorative; the field says the name.
 */
export function NameMonogram(props: { name: string }): React.ReactElement {
  const c = useColours();
  const letters = props.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <Box testID="name-monogram" className="bg-raise2 items-center justify-center" style={{ width: AUTH.monogram, height: AUTH.monogram, borderRadius: AUTH.monogram / 2 }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {letters
        ? <Type step="hero" className="text-hotText" style={AUTH_TYPE.monogram}>{letters}</Type>
        : <Icon name="person-outline" size={40} color={c.text} />}
    </Box>
  );
}

/** A mono 11 label over a 56 field (radius 18, raise-2, 17 type) — `fieldL` in the drawing. */
export function AuthField(props: TextInputProps & { accessibilityLabel: string; label?: string }): React.ReactElement {
  const { label, ...field } = props;
  return (
    <Box style={{ gap: AUTH.field.gap }}>
      <Type step="mono" className="text-text3" style={AUTH_TYPE.fieldLabel} importantForAccessibility="no" accessibilityElementsHidden>{label ?? props.accessibilityLabel}</Type>
      <Input testID="auth-field" className="bg-raise2 border-0 h-auto w-auto" style={{ height: AUTH.field.height, borderRadius: AUTH.field.radius, paddingHorizontal: AUTH.field.pad }}>
        <InputField
          placeholderTextColor={colour.text3}
          keyboardAppearance="dark"
          {...field}
          accessibilityLabel={props.accessibilityLabel}
          className="text-text font-medium"
          style={AUTH_TYPE.field}
        />
      </Input>
    </Box>
  );
}

/** A mark at the button's left: a font icon in a token colour, or Google's "G". */
export type AuthMark = { icon: IconName; tint?: Colour } | 'google';
/** Google's own "G", from its sign-in branding kit — shown only as supplied. */
const GOOGLE_G = require('../../../assets/google-g.png');
const MARK = { width: AUTH.zone.mark, height: AUTH.zone.mark };

/**
 * The 56 pill of the sign-in page: `light` is the email button, `outline` a ring pill (another way in). A `mark` is pinned
 * 20 from the left so the words stay centred whatever their length. Busy swaps the words for the sound bars at the same size.
 */
export function AuthButton(props: { label: string; text?: string; className?: string; disabled: boolean; busy?: boolean; outline?: boolean; mark?: AuthMark; onPress: () => void }): React.ReactElement {
  const c = useColours();
  const busy = props.busy === true;
  const dim = props.disabled && !busy;
  const ink = props.outline ? c.text : c.void;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled || busy, busy }}
      className={`${props.outline ? 'border-[1.5px] border-outline' : 'bg-text'} items-center justify-center ${props.className ?? ''} ${dim ? 'opacity-40' : ''}`}
      style={{ height: AUTH.zone.button, borderRadius: radius.pill }}
    >
      {props.mark ? (
        <Box className={`absolute top-0 bottom-0 justify-center ${busy ? 'opacity-0' : ''}`} style={{ left: AUTH.zone.mark }}>
          {props.mark === 'google'
            ? <Image source={GOOGLE_G} style={MARK} accessibilityIgnoresInvertColors />
            : <Icon name={props.mark.icon} size={AUTH.zone.mark} color={props.mark.tint ? c[props.mark.tint] : ink} />}
        </Box>
      ) : null}
      <BusyContent busy={busy} color={ink} barClassName={props.outline ? 'bg-text' : 'bg-void'} className="flex-row items-center">
        <Type step="row" className={props.outline ? 'text-text' : 'text-void'}>{props.text ?? props.label}</Type>
      </BusyContent>
    </Pressable>
  );
}

/** Nearly invisible, not 0: iOS skips a fully transparent field for the code from Messages. */
const HIDDEN = { opacity: 0.02 };

/**
 * The code as six cells (design-pulse2 `cells(6)`): 58 tall, radius 16, raise-2, 8 apart, each digit Unbounded 700 26; the
 * next cell has a hot 1.5 ring. One real field lies over the row, so typing, pasting and the code from Messages all work.
 */
export function CodeCells(props: { value: string; onChange: (v: string) => void }): React.ReactElement {
  const c = useColours();
  const digits = props.value.replace(/\D/g, '').slice(0, AUTH.cells.count);
  return (
    <Box>
      <Box className="flex-row" style={{ gap: AUTH.cells.gap }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: AUTH.cells.count }, (_, i) => {
          const next = i === digits.length;
          return (
            <Box key={i} testID={next ? 'code-cell-next' : 'code-cell'} className="flex-1 bg-raise2 items-center justify-center" style={{ height: AUTH.cells.height, borderRadius: AUTH.cells.radius, ...(next ? { borderWidth: AUTH.cells.ring, borderColor: c.hot } : null) }}>
              {i < digits.length ? <Type step="title" className="text-text font-bold" style={AUTH_TYPE.cell}>{digits[i]}</Type> : null}
            </Box>
          );
        })}
      </Box>
      <Input className="absolute inset-0 border-0 bg-transparent h-auto" style={HIDDEN}>
        <InputField
          value={digits}
          onChangeText={(t) => props.onChange(t.replace(/\D/g, '').slice(0, AUTH.cells.count))}
          keyboardType="number-pad"
          keyboardAppearance="dark"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={AUTH.cells.count}
          autoFocus
          caretHidden
          accessibilityLabel="Code"
          accessibilityHint="6 digits"
          className="text-text"
        />
      </Input>
    </Box>
  );
}

/** The address the code went to, in a tile with Change at its end (hot-text 600). */
export function SentTo(props: { email: string; onChange: () => void }): React.ReactElement {
  const c = useColours();
  return (
    <Box className="flex-row items-center bg-raise" style={{ ...TAP, borderRadius: AUTH.tile.radius, paddingLeft: AUTH.tile.pad, gap: AUTH.tile.gap }}>
      <Icon name="mail-outline" size={20} color={c.text} />
      <Type step="row" className="flex-1 text-text" numberOfLines={1}>{props.email}</Type>
      <Pressable onPress={props.onChange} accessibilityRole="button" accessibilityLabel="Use a different email" className="items-center justify-center" style={{ ...TAP, paddingHorizontal: AUTH.tile.pad }}>
        <Type step="row" className="text-hotText">Change</Type>
      </Pressable>
    </Box>
  );
}
