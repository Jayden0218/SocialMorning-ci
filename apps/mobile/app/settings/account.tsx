/**
 * Account and security (M10: moved here from /account, which is now Settings).
 * Account (US5): who you are, sign out, delete account. Deletion is confirmed with a
 * code sent to the account's email (owner, 2026-09-27: no passwords) and clears
 * everything of the account's on this phone — auth row,
 * token, drafts — but NOT M1's positions or the episode caches (T048).
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Input, InputField } from '../../src/ui/lib/input';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { ApiError } from '../../src/social/api';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { OTHER_METHODS } from '../../src/ui/auth/methods';

export default function AccountSecurityScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { auth, listener } = useSocial();
  const [more, setMore] = useState(false);
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
      <Stack.Screen options={{ title: more ? 'More' : 'Account and security' }} />
      {/* M10 (owner, 2026-09-27), after the reference: the ways you sign in, then deletion.
          SocialNet signs in by an emailed code; Google and Facebook are not set up yet. */}
      {/* M12 FR-096: deletion sits one level down, under More (was on the first screen). */}
      {more ? null : (<>
      <Box className="flex-row items-center gap-section min-h-14">
        <Icon name="mail-outline" size={24} color={c.accent} />
        <Text className="text-text text-sm flex-1">Email</Text>
        <Text className="text-muted text-xs">{masked || 'Not signed in'}</Text>
      </Box>
      {OTHER_METHODS.map((m) => (
        <Box key={m.id} className="flex-row items-center gap-section min-h-14" accessible accessibilityLabel={`${m.label.replace('Continue with ', '')}: not set up yet`}>
          <Icon name={m.icon} size={24} color={c.muted} />
          <Text className="text-text text-sm flex-1">{m.label.replace('Continue with ', '')}</Text>
          <Text className="text-muted text-xs">Not set up yet</Text>
        </Box>
      ))}
      <Box className="border-b-hairline border-separator my-row" />
      <Pressable onPress={() => setMore(true)} accessibilityRole="button" accessibilityLabel="More account options" className="flex-row items-center min-h-14">
        <Text className="text-text text-sm flex-1">More</Text>
        <Icon name="chevron-forward" size={20} color={c.muted} />
      </Pressable>
      </>)}
      {!more ? null : !listener ? <Text className="text-muted text-sm">Sign in to manage your account.</Text> : null}
      {!more ? null : !confirming ? (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button">
          <Text className={link}>Delete my account…</Text>
        </Pressable>
      ) : (
        <Box className="gap-2 mt-2">
          <Text className="text-text">This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense. This cannot be undone.</Text>
          {codeSent ? (
            <Input className="border border-separator rounded-lg h-auto px-0">
              <InputField
              placeholderTextColor={c.muted} placeholder="The 6-digit code we emailed you" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} accessibilityLabel="Code"  className="p-3 text-sm text-text" />
            </Input>
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
        </Box>
      )}
    </ScrollView>
  );
}
