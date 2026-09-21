/**
 * Account (US5): who you are, sign out, delete account. Deletion re-asks the
 * password and clears everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ApiError } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { styles } from './auth/sign-in';

export default function AccountScreen(): React.ReactElement {
  const { auth, listener } = useSocial();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.deleteAccount(password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.body}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>{listener?.displayName ?? 'Not signed in'}</Text>
      <Text style={{ color: '#666' }}>{listener?.email ?? ''}</Text>
      <Pressable style={styles.button} onPress={async () => { await auth.signOut(); router.back(); }} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button">
          <Text style={[styles.link, { color: '#b00020' }]}>Delete my account…</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text>This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense. This cannot be undone.</Text>
          <TextInput style={styles.input} placeholder="Your password, to confirm" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, { backgroundColor: '#b00020' }, (busy || !password) && styles.disabled]} disabled={busy || !password} onPress={remove} accessibilityRole="button">
            <Text style={styles.buttonText}>Delete account</Text>
          </Pressable>
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button"><Text style={styles.link}>Keep my account</Text></Pressable>
        </View>
      )}
    </View>
  );
}
