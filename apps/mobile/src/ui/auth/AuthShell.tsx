/**
 * The frame every auth page shares, after the owner's reference screenshots
 * (2026-09-27): a close ✕ at the top right, a large centred title, then the form.
 * The pattern is copied, not the reference's assets. Its own SafeAreaView because the
 * stack header is hidden on these pages.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colour, hit } from '../../design';

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
  return (
    <TextInput
      placeholderTextColor={colour.muted}
      {...props}
      accessibilityLabel={props.accessibilityLabel}
      className="bg-surface rounded-row px-section text-sm text-text"
      style={FIELD}
    />
  );
}

/** The full-width button: solid yellow (the form's own), or outlined (another way in). Pale until usable. */
export function AuthButton(props: { label: string; disabled: boolean; busy?: boolean; outline?: boolean; onPress: () => void }): React.ReactElement {
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
      <Text className={props.outline ? 'text-text text-sm font-semibold' : 'text-onPrimary text-sm font-semibold'}>{props.busy ? '…' : props.label}</Text>
    </Pressable>
  );
}
