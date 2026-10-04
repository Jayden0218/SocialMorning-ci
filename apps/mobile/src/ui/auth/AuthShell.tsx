// Shared frame for sign-in pages: close ✕, big title, form, bottom button.
/**
 * The frame every auth page shares. Owner's screenshot (2026-10-03): a ✕ at the top left,
 * a large serif title on the left, the form under it, and the main button in a bar pinned
 * to the bottom (above the keyboard). Was a centred title with the button in the form
 * (2026-09-27). The top inset comes from `useSafeAreaInsets`; the root layout pads the bottom
 * once, so the bar adds none (owner, 2026-10-04: "Send code" sat high in the white bar).
 *
 * M17 (T070/T071, `EmailAuth-B`, `EmailCode-B`, `SignUp-B`): the B Editorial frame — a 48 pt ✕
 * (muted on the left, the text colour on the right), a serif title at B's own size and weight
 * per step (`heading`), an optional `hero` over it (the name step's monogram), fields with a 2 pt
 * underline and the typed words in 22 pt serif SemiBold, and the bottom bar with a hairline
 * top border — white for the email and name steps, the page colour for the code step (`bar`).
 * Buttons: 56 pt pills (60 on the sign-in page), other ways in white with the card border.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, InputField } from '@/ui/lib/input';
import { Image } from '@/ui/lib/image';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, hit, type Colour } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { BottomBar } from '@/ui/kit/BottomBar';
import { display } from './display';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const FIELD = { minHeight: 56 };
/** The sign-in page's taller buttons (owner, 2026-10-03; `SignIn-B`: 60). */
const TALL = { minHeight: 60 };
/** The code step's "Continue →" (`EmailCode-B`: 52, wider padding). */
const SLIM = { minHeight: 52 };

/** A title's size, weight and spacing — B gives each step its own. Default: `EmailAuth-B`. */
export type Heading = { size: number; semibold?: boolean; tracking?: number; leading?: number };
const HEADING: Heading = { size: 44, semibold: true, tracking: -1, leading: 48 };

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * `eyebrow` is the small capital line over the title, and `closeRight` moves the ✕ to the
 * right — both from the code step's screenshot (owner, 2026-10-03). `heading` is the title's
 * B size, `hero` sits over the title, `compact` pulls the form up under the subtitle (the code
 * step's address card), and `bar: 'page'` gives the bottom bar the page colour (`EmailCode-B`).
 */
export function AuthShell(props: { title: string; eyebrow?: string; closeRight?: boolean; heading?: Heading; hero?: ReactNode; compact?: boolean; bar?: 'surface' | 'page'; subtitle?: ReactNode; footer?: ReactNode; children: ReactNode }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const insets = useSafeAreaInsets();
  const h = props.heading ?? HEADING;
  const page = props.bar === 'page';
  const top = props.eyebrow ? 'text-text mt-gap' : props.hero ? 'text-text mt-7' : 'text-text mt-6';
  const form = props.compact ? 'mt-gap gap-row' : props.subtitle ? 'mt-7 gap-row' : 'mt-10 gap-row';
  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Box className={`flex-row px-gap pt-row ${props.closeRight ? 'justify-end' : ''}`}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={24} color={props.closeRight ? c.text : c.muted} />
          </Pressable>
        </Box>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-section" keyboardShouldPersistTaps="handled">
          {props.hero ? <Box className="mt-row">{props.hero}</Box> : null}
          {props.eyebrow ? <Eyebrow accent className="mt-row">{props.eyebrow}</Eyebrow> : null}
          <Text style={display(h.size, c.text, h)} className={top} accessibilityRole="header">{props.title}</Text>
          {props.subtitle ? <Box className="mt-gap">{props.subtitle}</Box> : null}
          <Box className={form}>{props.children}</Box>
        </ScrollView>
        {/* Owner, 2026-10-04: the button in the middle of the bar — the root layout pads the bottom strip. */}
        {props.footer ? (
          <BottomBar tone={page ? 'page' : 'surface'} line="border" pad={page ? 'row' : 'section'}>
            {props.footer}
          </BottomBar>
        ) : null}
      </KeyboardAvoidingView>
    </Box>
  );
}

/**
 * The name step's monogram (`SignUp-B`): a 120 pt tinted circle with the typed name's initials
 * in the serif — a person glyph until there is a name. Decorative; the field says the name.
 */
export function NameMonogram(props: { name: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const letters = props.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <Box className="rounded-pill bg-accentTint items-center justify-center" style={MONOGRAM} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {letters
        ? <Text style={display(48, c.accent)} className="text-accent">{letters}</Text>
        : <Icon name="person-outline" size={48} color={c.accent} />}
    </Box>
  );
}
const MONOGRAM = { width: 120, height: 120 };

/**
 * A small capital label over a line: the typed words in the serif, bold (owner, 2026-10-03).
 * M17 (`EmailAuth-B`): 8 pt under the label, a 2 pt underline, the words 22 pt SemiBold.
 */
export function AuthField(props: TextInputProps & { accessibilityLabel: string; label?: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { label, ...field } = props;
  return (
    <Box>
      <Text className="text-muted text-xs font-bold tracking-wider mb-gap" importantForAccessibility="no" accessibilityElementsHidden>
        {(label ?? props.accessibilityLabel).toUpperCase()}
      </Text>
      {/* M9: gluestack's Input; the underline is the Input, the words are its InputField. */}
      <Input className="bg-transparent rounded-none border-0 border-b-2 border-text px-0 h-auto" style={FIELD}>
        <InputField
          placeholderTextColor={c.muted}
          keyboardAppearance="light"
          {...field}
          accessibilityLabel={props.accessibilityLabel}
          className="px-0"
          style={display(22, c.text, { semibold: true })}
        />
      </Input>
    </Box>
  );
}

/**
 * Words on the brand-yellow fill are dark, not white (owner, 2026-10-03): 12.0 against the
 * yellow instead of 1.60. Another accent's fill keeps its own `onPrimary`.
 */
export function inkOn(c: { primary: string; onPrimary: string }): string {
  return c.primary === colour.primary ? colour.text : c.onPrimary;
}

/** Google's own "G", from its sign-in branding kit — shown only as supplied, on white. */
const GOOGLE_G = require('../../../assets/google-g.png');
const MARK = { width: 20, height: 20 };

/** A mark at the button's left: a font icon in a token colour, or Google's "G". */
export type AuthMark = { icon: IconName; tint?: Colour } | 'google';

/**
 * The full-width button: solid yellow (the form's own), or outlined (another way in). Pale
 * until usable. A `mark` is pinned to the left edge so every label stays centred on the
 * button, whatever its length (owner, 2026-09-27). `text` shows shorter words than the
 * spoken `label`, and `className` places the button (the sign-in page's pills, 2026-10-03).
 * `trail` is an icon after the words (the code step's "Continue →", 2026-10-03).
 * M17 (`SignIn-B`): an outlined button is a white pill with the card border and 14 pt bold
 * words; `slim` is the code step's 52 pt "Continue →".
 */
export function AuthButton(props: { label: string; text?: string; className?: string; tall?: boolean; slim?: boolean; bold?: boolean; disabled: boolean; busy?: boolean; outline?: boolean; mark?: AuthMark; trail?: IconName; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled, busy: props.busy === true }}
      className={`${props.outline ? 'border border-border bg-surface' : 'bg-primary'} ${props.text || props.trail ? 'flex-row ' : ''}items-center justify-center ${props.className ?? 'rounded-row mt-row'} ${props.disabled ? 'opacity-40' : ''}`}
      style={props.tall ? TALL : props.slim ? SLIM : FIELD}
    >
      {props.mark ? (
        <Box className={props.text ? 'mr-gap' : 'absolute left-section top-0 bottom-0 justify-center'}>
          {props.mark === 'google'
            ? <Image source={GOOGLE_G} style={MARK} accessibilityIgnoresInvertColors />
            : <Icon name={props.mark.icon} size={20} color={props.mark.tint ? c[props.mark.tint] : props.outline ? c.text : inkOn(c)} />}
        </Box>
      ) : null}
      <Text className={props.outline ? 'text-text text-body font-bold' : props.bold ? 'text-onPrimary text-sm font-bold' : 'text-onPrimary text-sm font-semibold'} style={props.outline ? undefined : { color: inkOn(c) }}>{props.busy ? '…' : props.text ?? props.label}</Text>
      {props.trail && !props.busy ? <Box className="ml-gap"><Icon name={props.trail} size={18} color={props.outline ? c.text : inkOn(c)} /></Box> : null}
    </Pressable>
  );
}

const CELLS = 6;
const CELL = { height: 64 };
const CARET = { width: 2, height: 34 };
/** Nearly invisible, not 0: iOS skips a fully transparent field for the code from Messages. */
const HIDDEN = { opacity: 0.02 };

/**
 * The code as 6 cells (owner's screenshot, 2026-10-03): each digit large in the serif over a
 * line; the next cell's line is the accent with a caret, empty ones are the separator. One
 * real field lies over the row, so typing, pasting and the code from Messages all work.
 * M17 (`EmailCode-B`): 36 pt digits, the next cell's line 3 pt accent, empty lines 2 pt.
 */
export function CodeCells(props: { value: string; onChange: (v: string) => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const digits = props.value.replace(/\D/g, '').slice(0, CELLS);
  return (
    <Box>
      <Box className="flex-row gap-gap" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: CELLS }, (_, i) => {
          const next = i === digits.length;
          const filled = i < digits.length;
          return (
            <Box key={i} className={`flex-1 items-center justify-center ${filled ? 'border-b-2 border-text' : next ? 'border-b-[3px] border-accent' : 'border-b-2 border-separator'}`} style={CELL}>
              {filled ? <Text style={display(36, c.text)} className="text-text">{digits[i]}</Text> : next ? <Box className="bg-accent" style={CARET} /> : null}
            </Box>
          );
        })}
      </Box>
      <Input className="absolute inset-0 border-0 bg-transparent h-auto" style={HIDDEN}>
        <InputField
          value={digits}
          onChangeText={(t) => props.onChange(t.replace(/\D/g, '').slice(0, CELLS))}
          keyboardType="number-pad"
          keyboardAppearance="light"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={CELLS}
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

/**
 * The address the code went to, in a card, with "Change" at its right (owner, 2026-10-03).
 * M17 (`EmailCode-B`): a white card with the card border, 14 pt bold words.
 */
export function SentTo(props: { email: string; onChange: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="flex-row items-center bg-surface border border-border rounded-row pl-section" style={TAP}>
      <Icon name="mail-outline" size={18} color={c.text} />
      <Text className="flex-1 text-text text-body font-bold ml-gap" numberOfLines={1}>{props.email}</Text>
      <Pressable onPress={props.onChange} accessibilityRole="button" accessibilityLabel="Use a different email" className="items-center justify-center px-row" style={TAP}>
        <Text className="text-accent text-body font-bold">Change</Text>
      </Pressable>
    </Box>
  );
}
