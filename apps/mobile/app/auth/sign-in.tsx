/** Sign in (US5). The 409/429 messages come from the server verbatim (contracts/api.md). */
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
    <View style={styles.body}>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {suspended ? <Text style={styles.error} accessibilityLiveRegion="polite">{suspended}</Text> : null}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy || !email || !password} onPress={submit} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>
      <Link href="/auth/sign-up" style={styles.link} accessibilityRole="link">Create an account</Link>
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

export const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: colour.separator, borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: colour.accent },
  button: { backgroundColor: colour.accent, borderRadius: 24, paddingVertical: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: colour.text, fontSize: 16, fontWeight: '600' },
  link: { color: colour.accent, fontSize: 15, paddingVertical: 8 },
});
