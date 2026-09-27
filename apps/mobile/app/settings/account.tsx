/**
 * Account and security (M10: moved here from /account, which is now Settings).
 * Account (US5): who you are, sign out, delete account. Deletion is confirmed with a
 * code sent to the account's email (owner, 2026-09-27: no passwords) and clears
 * everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ApiError } from '../../src/social/api';
import { useSocial } from '../../src/social/context';
import { colour } from '../../src/design';
import { Icon } from '../../src/ui/Icon';
import { OTHER_METHODS } from '../../src/ui/auth/methods';

export default function AccountSecurityScreen(): React.ReactElement {
  const { auth, listener } = useSocial();
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!listener) return;
    setBusy(true);
    setError(undefined);
    try {
      await auth.requestCode(listener.email);
      setCodeSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      // Lands on the sign-in page (the context does it).
      await auth.deleteAccountWithCode(code.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const link = 'text-accent text-[15px] py-2';
  const button = 'bg-primary rounded-3xl py-3 items-center';
  const buttonText = 'text-onPrimary text-sm font-semibold';

  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section gap-3">
      <Stack.Screen options={{ title: 'Account and security' }} />
      {/* M10 (owner, 2026-09-27), after the reference: the ways you sign in, then deletion.
          SocialNet signs in by an emailed code; Google and Facebook are not set up yet. */}
      <View className="flex-row items-center gap-section min-h-14">
        <Icon name="mail-outline" size={24} color={colour.accent} />
        <Text className="text-text text-sm flex-1">Email</Text>
        <Text className="text-muted text-xs">{masked || 'Not signed in'}</Text>
      </View>
      {OTHER_METHODS.map((m) => (
        <View key={m.id} className="flex-row items-center gap-section min-h-14" accessible accessibilityLabel={`${m.label.replace('Continue with ', '')}: not set up yet`}>
          <Icon name={m.icon} size={24} color={colour.muted} />
          <Text className="text-text text-sm flex-1">{m.label.replace('Continue with ', '')}</Text>
          <Text className="text-muted text-xs">Not set up yet</Text>
        </View>
      ))}
      <View className="border-b-hairline border-separator my-row" />
      {!listener ? <Text className="text-muted text-sm">Sign in to manage your account.</Text> : null}
      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button">
          <Text className={link}>Delete my account…</Text>
        </Pressable>
      ) : (
        <View className="gap-2 mt-2">
          <Text className="text-text">This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense. This cannot be undone.</Text>
          {codeSent ? (
            <TextInput
              placeholderTextColor={colour.muted} className="border border-separator rounded-lg p-3 text-sm text-text" placeholder="The 6-digit code we emailed you" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} accessibilityLabel="Code" />
          ) : null}
          {error ? <Text className="text-accent">{error}</Text> : null}
          {codeSent ? (
            <Pressable className={`${button} ${busy || code.trim().length !== 6 ? 'opacity-50' : ''}`} disabled={busy || code.trim().length !== 6} onPress={remove} accessibilityRole="button">
              <Text className={buttonText}>Delete account</Text>
            </Pressable>
          ) : (
            <Pressable className={`${button} ${busy ? 'opacity-50' : ''}`} disabled={busy} onPress={sendCode} accessibilityRole="button">
              <Text className={buttonText}>Email me a code to confirm</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button"><Text className={link}>Keep my account</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}
