/** Create an account (US5 #1, #2). Display names need not be unique (clarified 2026-09-21). */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSocial } from '../../src/social/context';
import { describe, styles } from './sign-in';

export default function SignUpScreen(): React.ReactElement {
  const { auth } = useSocial();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const valid = email.includes('@') && password.length >= 8 && displayName.trim().length >= 1 && displayName.trim().length <= 40;

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signUp(email.trim(), password, displayName.trim());
      // Pop both auth screens: the listener lands back where they started.
      if (router.canGoBack()) router.back();
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.body}>
      <TextInput style={styles.input} placeholder="Display name (what others see)" value={displayName} onChangeText={setDisplayName} maxLength={40} accessibilityLabel="Display name" />
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <TextInput style={styles.input} placeholder="Password (8+ characters)" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, (busy || !valid) && styles.disabled]} disabled={busy || !valid} onPress={submit} accessibilityRole="button">
        <Text style={styles.buttonText}>Create account</Text>
      </Pressable>
    </View>
  );
}
