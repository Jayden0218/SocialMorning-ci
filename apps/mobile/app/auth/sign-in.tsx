/** Sign in (US5). The 409/429 messages come from the server verbatim (contracts/api.md). */
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ApiError } from '../../src/social/api';
import { SUSPENDED_KEY, useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { colour } from '../../src/design';

export default function SignInScreen(): React.ReactElement {
  const { auth } = useSocial();
  const stores = useStores();
  const [suspended, setSuspended] = useState<string | undefined>(() => stores.settings.get(SUSPENDED_KEY));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signIn(email.trim(), password);
      stores.settings.set(SUSPENDED_KEY, '');
      setSuspended(undefined);
      router.back();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className={body}>
      <TextInput
        placeholderTextColor={colour.muted} className={input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput
        placeholderTextColor={colour.muted} className={input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {suspended ? <Text className={errorText} accessibilityLiveRegion="polite">{suspended}</Text> : null}
      {error ? <Text className={errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Pressable className={`${button} ${busy ? 'opacity-50' : ''}`} disabled={busy || !email || !password} onPress={submit} accessibilityRole="button">
        <Text className={buttonText}>Sign in</Text>
      </Pressable>
      <Link href="/auth/sign-up" className={link} accessibilityRole="link">Create an account</Link>
    </View>
  );
}

export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'locked' && e.retryAfterSeconds !== undefined) return `Too many attempts — try again in ${e.retryAfterSeconds} s.`;
    return e.message;
  }
  return 'Something went wrong. Try again.';
}

/** Shared with sign-up, so the two forms stay one look. */
export const body = 'p-4 gap-3';
export const input = 'border border-separator rounded-lg p-3 text-sm text-text';
export const errorText = 'text-accent';
export const button = 'bg-primary rounded-3xl py-3 items-center';
export const buttonText = 'text-onPrimary text-sm font-semibold';
export const link = 'text-accent text-[15px] py-2';
