/**
 * The frame every auth page shares, after the owner's reference screenshots
 * (2026-09-27): a close ✕ at the top right, a large centred title, then the form.
 * The pattern is copied, not the reference's assets. Its own SafeAreaView because the
 * stack header is hidden on these pages.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, type TextInputProps } from 'react-native';
import { Input, InputField } from '../lib/input';
import { Image } from '../lib/image';
import { KeyboardAvoidingView } from '../lib/keyboard-avoiding-view';
import { Pressable } from '../lib/pressable';
import { SafeAreaView } from '../lib/safe-area-view';
import { ScrollView } from '../lib/scroll-view';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, hit, type Colour } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon, type IconName } from '../Icon';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const FIELD = { minHeight: 56 };

function close(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function AuthShell(props: { title: string; subtitle?: ReactNode; children: ReactNode }): React.ReactElement {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Box className="flex-row justify-end px-row pt-row">
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Text className="text-muted text-lg">✕</Text>
          </Pressable>
        </Box>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-section" keyboardShouldPersistTaps="handled">
          <Text className="text-text text-lg font-bold text-center mt-section" accessibilityRole="header">{props.title}</Text>
          {props.subtitle ? <Box className="mt-row items-center">{props.subtitle}</Box> : null}
          <Box className="mt-section pt-section gap-row">{props.children}</Box>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A grey rounded field with no border, as in the reference. */
export function AuthField(props: TextInputProps & { accessibilityLabel: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    // M9: gluestack's Input; the grey field is the Input, the words are its InputField.
    <Input className="bg-surface rounded-row border-0 px-section h-auto" style={FIELD}>
      <InputField
        placeholderTextColor={c.muted}
        {...props}
        accessibilityLabel={props.accessibilityLabel}
        className="text-sm text-text"
      />
    </Input>
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
