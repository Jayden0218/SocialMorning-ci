// Delete your account: email a code, enter it, confirm delete.
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
 *
 * M17 (`SettingsAccountMore-B`, T081): the Editorial layout. Before confirming, "Delete my
 * account…" sits in a card. Once confirming: a serif "Delete my account" heading, the warning,
 * "This cannot be undone." in serif accent, then three numbered steps — 1 email a code (a tick
 * and "Sent to …" once sent), 2 the 6-digit code field, 3 delete — and a bar at the foot with
 * "Keep my account" and the step's primary action ("Email me a code to confirm", then "Delete
 * account", enabled at 6 digits). Same handlers, same names, same order of steps as before.
 */
import { useState } from 'react';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { BottomBar } from '@/ui/kit/BottomBar';
import { hit } from '@/design';

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

  const masked = listener?.email ? listener.email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`) : '';
  const ready = code.trim().length === 6;

  return (
    <>
    <PageHeader title="More" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-row">
      {!listener ? <Text className="text-muted text-sm">Sign in to manage your account.</Text> : null}
      {!confirming ? (
        <Card>
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel="Delete my account" className="flex-row items-center gap-section" style={TAP}>
            <Icon name="trash-outline" size={20} color={c.accent} />
            <Text className="text-accent text-body flex-1">Delete my account…</Text>
            <Icon name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
        </Card>
      ) : (
        <Box className="gap-row">
          <Text className="text-text text-hero font-display" accessibilityRole="header">Delete my account</Text>
          <Text className="text-text text-body">This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense.</Text>
          <Text className="text-accent text-title font-display">This cannot be undone.</Text>
          <Box className="gap-section mt-row">
            <Step n={1} done={codeSent} active={!codeSent} title="Email me a code to confirm" line={codeSent && masked ? `Sent to ${masked}` : undefined} />
            <Step n={2} done={codeSent && ready} active={codeSent && !ready} title="Enter the 6-digit code">
              {codeSent ? (
                <Box className="gap-1 mt-gap">
                  <Text className="text-muted text-xs">Code</Text>
                  <Input className="bg-surface border border-border rounded-row h-auto px-0">
                    <InputField
                    placeholderTextColor={c.muted} placeholder="The 6-digit code we emailed you" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} accessibilityLabel="Code"  className="p-row text-base text-text" />
                  </Input>
                </Box>
              ) : null}
            </Step>
            <Step n={3} done={false} active={ready} title="Delete account" line={ready ? undefined : 'Available once all 6 digits are in.'} />
          </Box>
          {error ? <Text className="text-accent text-body">{error}</Text> : null}
        </Box>
      )}
    </ScrollView>
    {confirming ? (
      <BottomBar tone="page" className="flex-row gap-row">
          <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" accessibilityLabel="Keep my account" className={`${pill} bg-surface border border-border`} style={TAP}><Text className="text-text text-body font-bold">Keep my account</Text></Pressable>
          {codeSent ? (
            <Pressable className={`${pill} bg-primary ${busy || !ready ? 'opacity-40' : ''}`} disabled={busy || code.trim().length !== 6} onPress={remove} accessibilityRole="button" accessibilityLabel="Delete account" accessibilityState={{ disabled: busy || !ready }} style={TAP}>
              <Text className="text-onPrimary text-body font-bold">Delete account</Text>
            </Pressable>
          ) : (
            <Pressable className={`${pill} bg-primary ${busy ? 'opacity-40' : ''}`} disabled={busy} onPress={sendCode} accessibilityRole="button" accessibilityLabel="Email me a code to confirm" accessibilityState={{ disabled: busy }} style={TAP}>
              <Text className="text-onPrimary text-body font-bold text-center" numberOfLines={2}>Email me a code to confirm</Text>
            </Pressable>
          )}
      </BottomBar>
    ) : null}
    </>
  );
}

const pill = 'flex-1 rounded-pill items-center justify-center px-row';
const TAP = { minHeight: hit.min };
const DOT = { width: 32, height: 32 };

/** M17: one numbered step — a yellow tick when done, a dark number when current, an outline otherwise. */
function Step(props: { n: number; done: boolean; active: boolean; title: string; line?: string | undefined; children?: React.ReactNode }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const dot = props.done ? 'bg-primary' : props.active ? 'bg-text' : 'border border-border';
  return (
    <Box className="flex-row gap-row">
      <Box className={`rounded-pill items-center justify-center ${dot}`} style={DOT} accessible={false}>
        {props.done
          ? <Icon name="checkmark" size={16} color={c.onPrimary} />
          : <Text className={props.active ? 'text-background text-meta font-bold' : 'text-muted text-meta font-bold'}>{props.n}</Text>}
      </Box>
      <Box className="flex-1">
        <Text className={props.done || props.active ? 'text-text text-sm font-bold' : 'text-muted text-sm font-bold'}>{props.title}</Text>
        {props.line ? <Text className="text-muted text-xs mt-1">{props.line}</Text> : null}
        {props.children}
      </Box>
    </Box>
  );
}
