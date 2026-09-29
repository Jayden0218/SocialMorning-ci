/**
 * The frame every auth page shares, after the owner's reference screenshots
 * (2026-09-27): a close ✕ at the top right, a large centred title, then the form.
 * The pattern is copied, not the reference's assets. Its own SafeAreaView because the
 * stack header is hidden on these pages.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { hit, type Colour } from '../../design';
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
        <View className="flex-row justify-end px-row pt-row">
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center" style={TAP}>
            <Text className="text-muted text-lg">✕</Text>
          </Pressable>
        </View>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pb-section" keyboardShouldPersistTaps="handled">
          <Text className="text-text text-lg font-bold text-center mt-section" accessibilityRole="header">{props.title}</Text>
          {props.subtitle ? <View className="mt-row items-center">{props.subtitle}</View> : null}
          <View className="mt-section pt-section gap-row">{props.children}</View>
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
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      accessibilityLabel={props.accessibilityLabel}
      className="bg-surface rounded-row px-section text-sm text-text"
      style={FIELD}
    />
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
 * button, whatever its length (owner, 2026-09-27).
 */
export function AuthButton(props: { label: string; disabled: boolean; busy?: boolean; outline?: boolean; mark?: AuthMark; onPress: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled, busy: props.busy === true }}
      className={`${props.outline ? 'border border-separator' : 'bg-primary'} rounded-row items-center justify-center mt-row ${props.disabled ? 'opacity-40' : ''}`}
      style={FIELD}
    >
      {props.mark ? (
        <View className="absolute left-section top-0 bottom-0 justify-center">
          {props.mark === 'google'
            ? <Image source={GOOGLE_G} style={MARK} accessibilityIgnoresInvertColors />
            : <Icon name={props.mark.icon} size={20} color={c[props.mark.tint ?? (props.outline ? 'text' : 'onPrimary')]} />}
        </View>
      ) : null}
      <Text className={props.outline ? 'text-text text-sm font-semibold' : 'text-onPrimary text-sm font-semibold'}>{props.busy ? '…' : props.label}</Text>
    </Pressable>
  );
}
