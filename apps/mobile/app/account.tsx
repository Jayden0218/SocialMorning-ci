/**
 * Account (US5): who you are, sign out, delete account. Deletion re-asks the
 * password and clears everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useStores } from '../src/ui/providers';
import { ApiError } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { styles } from './auth/sign-in';

export default function AccountScreen(): React.ReactElement {
  const { auth, listener, api } = useSocial();
  const stores = useStores();
  // M4 (FR-013): one switch. Mirrored in settings so the screen opens with the last known value.
  const [privateListening, setPrivateListening] = useState(() => stores.settings.get('me.privateListening') === '1');
  useEffect(() => {
    if (!listener) return;
    void api.me().then((me) => {
      if (me.privateListening === undefined) return;
      setPrivateListening(me.privateListening);
      stores.settings.set('me.privateListening', me.privateListening ? '1' : '0');
    }).catch(() => undefined); // offline: the mirror stands
  }, [api, listener, stores]);
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
      {listener ? <Link href={{ pathname: '/profile/[id]', params: { id: listener.listenerId } }} style={styles.link}>Your profile</Link> : null}
      {listener ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch
            value={privateListening}
            accessibilityLabel="Private listening"
            onValueChange={async (v) => {
              setPrivateListening(v);
              try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); }
              catch { setPrivateListening(!v); }
            }}
          />
          <Text>Private listening{'\n'}<Text style={{ color: '#666', fontSize: 12 }}>Hides what you listen to and your stats from others. Comments and clips stay public.</Text></Text>
        </View>
      ) : null}
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
