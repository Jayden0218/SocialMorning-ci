/**
 * Account (US5): who you are, sign out, delete account. Deletion is confirmed with a
 * code sent to the account's email (owner, 2026-09-27: no passwords) and clears
 * everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useStores } from '../src/ui/providers';
import { appealsMailto, APPEALS_KEY, legalLinks, refreshAppeals } from '../src/social/links';
import { ApiError } from '../src/social/api';
import { useSocial } from '../src/social/context';
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
  const noAppeals = appealsMailto(appeals) === undefined;

  return (
    <View className="p-4 gap-3">
      <Text className="text-text text-[18px] font-semibold">{listener?.displayName ?? 'Not signed in'}</Text>
      <Text className="text-muted">{listener?.email ?? ''}</Text>
      {listener ? <Link href={{ pathname: '/profile/[id]', params: { id: listener.listenerId } }} className={link} accessibilityRole="link">Your profile</Link> : null}
      {listener ? (
        <View className="flex-row items-center gap-3">
          <Switch
            trackColor={{ false: colour.separator, true: colour.primary }}
            thumbColor={colour.background}
            value={privateListening}
            accessibilityLabel="Private listening"
            onValueChange={async (v) => {
              setPrivateListening(v);
              try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); }
              catch { setPrivateListening(!v); }
            }}
          />
          {/* M6 (FR-025, J6 on build 17): without `flex-1` this ran off the right edge at the largest font. */}
          <Text className="flex-1 text-text">Private listening{'\n'}<Text className="text-muted text-xs">Hides what you listen to and your stats from others. Comments and clips stay public.</Text></Text>
        </View>
      ) : null}
      <Pressable className={button} onPress={() => void auth.signOut()} accessibilityRole="button" accessibilityLabel="Sign out">
        <Text className={buttonText}>Sign out</Text>
      </Pressable>

      <View className="gap-1 mt-2">
        <Pressable onPress={() => void Linking.openURL(links.privacy)} accessibilityRole="link" accessibilityLabel="Privacy policy">
          <Text className={link}>Privacy policy</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(links.rules)} accessibilityRole="link" accessibilityLabel="Community rules">
          <Text className={link}>Community rules</Text>
        </Pressable>
        <Pressable
          onPress={() => { const to = appealsMailto(appeals); if (to) void Linking.openURL(to); }}
          disabled={noAppeals}
          accessibilityRole="link"
          accessibilityLabel="Report a problem"
          accessibilityState={{ disabled: noAppeals }}
        >
          <Text className={noAppeals ? 'text-muted text-[15px] py-2' : link}>Report a problem{appeals ? '' : ' (offline)'}</Text>
        </Pressable>
      </View>

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
    </View>
  );
}
