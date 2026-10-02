/**
 * The frame every auth page shares. Owner's screenshot (2026-10-03): a ✕ at the top left,
 * a large serif title on the left, the form under it, and the main button in a bar pinned
 * to the bottom (above the keyboard). Was a centred title with the button in the form
 * (2026-09-27). The insets come from `useSafeAreaInsets` so the bar's colour reaches the
 * bottom edge of the screen.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input, InputField } from '../lib/input';
import { Image } from '../lib/image';
import { KeyboardAvoidingView } from '../lib/keyboard-avoiding-view';
import { Pressable } from '../lib/pressable';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, hit, type Colour } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon, type IconName } from '../Icon';
import { display } from './display';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const FIELD = { minHeight: 56 };
/** The sign-in page's taller buttons (owner, 2026-10-03). */
const TALL = { minHeight: 64 };

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * `eyebrow` is the small capital line over the title, and `closeRight` moves the ✕ to the
 * right — both from the code step's screenshot (owner, 2026-10-03).
 */
export function AuthShell(props: { title: string; eyebrow?: string; closeRight?: boolean; subtitle?: ReactNode; footer?: ReactNode; children: ReactNode }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const insets = useSafeAreaInsets();
  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Box className={`flex-row px-row pt-row ${props.closeRight ? 'justify-end' : ''}`}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={24} color={c.text} />
          </Pressable>
        </Box>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-section" keyboardShouldPersistTaps="handled">
          {props.eyebrow ? <Text className="text-accent text-xs font-bold tracking-widest mt-section">{props.eyebrow.toUpperCase()}</Text> : null}
          <Text style={display(40, c.text)} className={props.eyebrow ? 'mt-gap' : 'mt-section'} accessibilityRole="header">{props.title}</Text>
          {props.subtitle ? <Box className="mt-row">{props.subtitle}</Box> : null}
          <Box className="mt-10 gap-row">{props.children}</Box>
        </ScrollView>
        {props.footer ? (
          <Box className="bg-surface px-screen-x pt-row" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>{props.footer}</Box>
        ) : null}
      </KeyboardAvoidingView>
    </Box>
  );
}

/** A small capital label over a line: the typed words in the serif, bold (owner, 2026-10-03). */
export function AuthField(props: TextInputProps & { accessibilityLabel: string; label?: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { label, ...field } = props;
  return (
    <Box>
      <Text className="text-muted text-xs font-bold tracking-widest" importantForAccessibility="no" accessibilityElementsHidden>
        {(label ?? props.accessibilityLabel).toUpperCase()}
      </Text>
      {/* M9: gluestack's Input; the underline is the Input, the words are its InputField. */}
      <Input className="bg-transparent rounded-none border-0 border-b border-text px-0 h-auto" style={FIELD}>
        <InputField
          placeholderTextColor={c.muted}
          {...field}
          accessibilityLabel={props.accessibilityLabel}
          className="px-0"
          style={display(20, c.text)}
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
 */
export function AuthButton(props: { label: string; text?: string; className?: string; tall?: boolean; bold?: boolean; disabled: boolean; busy?: boolean; outline?: boolean; mark?: AuthMark; trail?: IconName; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled, busy: props.busy === true }}
      className={`${props.outline ? 'border border-separator' : 'bg-primary'} ${props.text || props.trail ? 'flex-row ' : ''}items-center justify-center ${props.className ?? 'rounded-row mt-row'} ${props.disabled ? 'opacity-40' : ''}`}
      style={props.tall ? TALL : FIELD}
    >
      {props.mark ? (
        <Box className={props.text ? 'mr-gap' : 'absolute left-section top-0 bottom-0 justify-center'}>
          {props.mark === 'google'
            ? <Image source={GOOGLE_G} style={MARK} accessibilityIgnoresInvertColors />
            : <Icon name={props.mark.icon} size={20} color={props.mark.tint ? c[props.mark.tint] : props.outline ? c.text : inkOn(c)} />}
        </Box>
      ) : null}
      <Text className={props.bold ? (props.outline ? 'text-text text-sm font-bold' : 'text-onPrimary text-sm font-bold') : (props.outline ? 'text-text text-sm font-semibold' : 'text-onPrimary text-sm font-semibold')} style={props.outline ? undefined : { color: inkOn(c) }}>{props.busy ? '…' : props.text ?? props.label}</Text>
      {props.trail && !props.busy ? <Box className="ml-gap"><Icon name={props.trail} size={18} color={props.outline ? c.text : inkOn(c)} /></Box> : null}
    </Pressable>
  );
}

const CELLS = 6;
const CELL = { height: 64 };
/** Nearly invisible, not 0: iOS skips a fully transparent field for the code from Messages. */
const HIDDEN = { opacity: 0.02 };

/**
 * The code as 6 cells (owner's screenshot, 2026-10-03): each digit large in the serif over a
 * line; the next cell's line is the accent with a caret, empty ones are the separator. One
 * real field lies over the row, so typing, pasting and the code from Messages all work.
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
            <Box key={i} className={`flex-1 items-center justify-end pb-gap ${filled ? 'border-b-2 border-text' : next ? 'border-b-2 border-accent' : 'border-b border-separator'}`} style={CELL}>
              {filled ? <Text style={display(34, c.text)}>{digits[i]}</Text> : next ? <Box className="bg-accent mb-1" style={{ width: 2, height: 32 }} /> : null}
            </Box>
          );
        })}
      </Box>
      <Input className="absolute inset-0 border-0 bg-transparent h-auto" style={HIDDEN}>
        <InputField
          value={digits}
          onChangeText={(t) => props.onChange(t.replace(/\D/g, '').slice(0, CELLS))}
          keyboardType="number-pad"
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

/** The address the code went to, in a card, with "Change" at its right (owner, 2026-10-03). */
export function SentTo(props: { email: string; onChange: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="flex-row items-center bg-surface rounded-row pl-section" style={FIELD}>
      <Icon name="mail-outline" size={18} color={c.text} />
      <Text className="flex-1 text-text text-sm font-semibold ml-gap" numberOfLines={1}>{props.email}</Text>
      <Pressable onPress={props.onChange} accessibilityRole="button" accessibilityLabel="Use a different email" className="items-center justify-center px-section" style={TAP}>
        <Text className="text-accent text-sm font-semibold">Change</Text>
      </Pressable>
    </Box>
  );
}
