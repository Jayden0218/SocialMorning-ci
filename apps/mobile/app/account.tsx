/**
 * Account (US5): who you are, sign out, delete account. Deletion re-asks the
 * password and clears everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useStores } from '../src/ui/providers';
import { appealsMailto, APPEALS_KEY, legalLinks, refreshAppeals } from '../src/social/links';
import { ApiError } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { styles } from './auth/sign-in';
import { colour } from '../src/design';

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
  // M6 (FR-027): the four things a listener must be able to reach from Account.
  const [appeals, setAppeals] = useState<string | undefined>(() => stores.settings.get(APPEALS_KEY) || undefined);
  useEffect(() => { void refreshAppeals(api, stores).then(setAppeals); }, [api, stores]);
  const links = legalLinks();
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
      <Text style={{ color: colour.muted }}>{listener?.email ?? ''}</Text>
      {listener ? <Link href={{ pathname: '/profile/[id]', params: { id: listener.listenerId } }} style={styles.link} accessibilityRole="link">Your profile</Link> : null}
      {listener ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch
            trackColor={{ false: colour.separator, true: colour.accent }}
            thumbColor={colour.text}
            value={privateListening}
            accessibilityLabel="Private listening"
            onValueChange={async (v) => {
              setPrivateListening(v);
              try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); }
              catch { setPrivateListening(!v); }
            }}
          />
          {/* M6 (FR-025, J6 on build 17): without `flex: 1` this ran off the right edge at the largest font. */}
          <Text style={{ flex: 1 }}>Private listening{'\n'}<Text style={{ color: colour.muted, fontSize: 12 }}>Hides what you listen to and your stats from others. Comments and clips stay public.</Text></Text>
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={async () => { await auth.signOut(); router.back(); }} accessibilityRole="button" accessibilityLabel="Sign out">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>

      <View style={{ gap: 4, marginTop: 8 }}>
        <Pressable onPress={() => void Linking.openURL(links.privacy)} accessibilityRole="link" accessibilityLabel="Privacy policy">
          <Text style={styles.link}>Privacy policy</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(links.rules)} accessibilityRole="link" accessibilityLabel="Community rules">
          <Text style={styles.link}>Community rules</Text>
        </Pressable>
        <Pressable
          onPress={() => { const to = appealsMailto(appeals); if (to) void Linking.openURL(to); }}
          disabled={appealsMailto(appeals) === undefined}
          accessibilityRole="link"
          accessibilityLabel="Report a problem"
          accessibilityState={{ disabled: appealsMailto(appeals) === undefined }}
        >
          <Text style={[styles.link, appealsMailto(appeals) === undefined && { color: colour.muted }]}>Report a problem{appeals ? '' : ' (offline)'}</Text>
        </Pressable>
      </View>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button">
          <Text style={[styles.link, { color: colour.accent }]}>Delete my account…</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text>This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense. This cannot be undone.</Text>
          <TextInput
        placeholderTextColor={colour.muted} style={styles.input} placeholder="Your password, to confirm" secureTextEntry value={password} onChangeText={setPassword} accessibilityLabel="Password" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, { backgroundColor: colour.accent }, (busy || !password) && styles.disabled]} disabled={busy || !password} onPress={remove} accessibilityRole="button">
            <Text style={styles.buttonText}>Delete account</Text>
          </Pressable>
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button"><Text style={styles.link}>Keep my account</Text></Pressable>
        </View>
      )}
    </View>
  );
}
