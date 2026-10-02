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

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function AuthShell(props: { title: string; subtitle?: ReactNode; footer?: ReactNode; children: ReactNode }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const insets = useSafeAreaInsets();
  return (
    <Box className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Box className="flex-row px-row pt-row">
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Icon name="close" size={24} color={c.text} />
          </Pressable>
        </Box>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-section" keyboardShouldPersistTaps="handled">
          <Text style={display(40, c.text)} className="mt-section" accessibilityRole="header">{props.title}</Text>
          {props.subtitle ? <Box className="mt-row">{props.subtitle}</Box> : null}
          <Box className="mt-section gap-row">{props.children}</Box>
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
 */
export function AuthButton(props: { label: string; text?: string; className?: string; disabled: boolean; busy?: boolean; outline?: boolean; mark?: AuthMark; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled, busy: props.busy === true }}
      className={`${props.outline ? 'border border-separator' : 'bg-primary'} ${props.text ? 'flex-row ' : ''}items-center justify-center ${props.className ?? 'rounded-row mt-row'} ${props.disabled ? 'opacity-40' : ''}`}
      style={FIELD}
    >
      {props.mark ? (
        <Box className={props.text ? 'mr-gap' : 'absolute left-section top-0 bottom-0 justify-center'}>
          {props.mark === 'google'
            ? <Image source={GOOGLE_G} style={MARK} accessibilityIgnoresInvertColors />
            : <Icon name={props.mark.icon} size={20} color={c[props.mark.tint ?? (props.outline ? 'text' : 'onPrimary')]} />}
        </Box>
      ) : null}
      <Text className={props.outline ? 'text-text text-sm font-semibold' : 'text-onPrimary text-sm font-semibold'}>{props.busy ? '…' : props.text ?? props.label}</Text>
    </Pressable>
  );
}
