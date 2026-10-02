/**
 * Account and security → More (M12 FR-096): deleting the account. Deletion is confirmed with a
 * code sent to the account's email (owner, 2026-09-27: no passwords) and clears everything of
 * the account's on this phone — auth row, token, drafts — but NOT M1's positions or the episode
 * caches (T048).
 *
 * M17 (phone walk 2026-10-02): this was a sub-view toggled inside `app/settings/account.tsx`, so
 * ← and the edge swipe both popped the one route and landed on Settings. As its own route it
 * sits on the stack above "Account and security", and back returns there.
 * Guard: __tests__/account-more-route.test.ts.
 */
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
import { PageHeader } from '../../src/ui/PageHeader';
import { hit } from '../../src/design';

export default function AccountMoreScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
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

  return (
    <>
    <PageHeader title="More" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-section gap-3">
      {!listener ? <Text className="text-muted text-sm">Sign in to manage your account.</Text> : null}
      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel="Delete my account" className="flex-row items-center gap-section min-h-14">
          <Icon name="trash-outline" size={24} color={c.accent} />
          <Text className="text-accent text-sm flex-1">Delete my account…</Text>
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
            <Pressable className={`${button} ${busy || code.trim().length !== 6 ? 'opacity-50' : ''}`} disabled={busy || code.trim().length !== 6} onPress={remove} accessibilityRole="button" accessibilityLabel="Delete account" style={{ minHeight: hit.min }}>
              <Text className={buttonText}>Delete account</Text>
            </Pressable>
          ) : (
            <Pressable className={`${button} ${busy ? 'opacity-50' : ''}`} disabled={busy} onPress={sendCode} accessibilityRole="button" accessibilityLabel="Email me a code to confirm" style={{ minHeight: hit.min }}>
              <Text className={buttonText}>Email me a code to confirm</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Keep my account" className="justify-center" style={{ minHeight: hit.min }}><Text className={link}>Keep my account</Text></Pressable>
        </Box>
      )}
    </ScrollView>
    </>
  );
}
