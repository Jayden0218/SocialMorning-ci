// After signing in during the 15-day deletion wait: a sheet saying the date, with Keep my account and Continue.
/**
 * M22 US11 (FR-034; contracts/api.md "Account deletion"). The sign-in answer carries
 * `pendingDeletion: { dueAt }` while an account waits to be deleted; the auth code keeps it in
 * `pendingDeletionStore`. This sheet then asks "Your account is due to be deleted on <date>.
 * Keep it?":
 *  - Keep my account → POST /v1/me/deletion/cancel; the profile, comments and statuses come back.
 *  - Continue → signed out again on this phone; the deletion stays on its date.
 * Our own sheet (gluestack Actionsheet, Editorial look), never a native alert.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent } from '@/ui/lib/actionsheet';
import { Button } from '@/ui/kit/Button';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { dueDateText, pendingDeletionStore, useM22Api } from '@/social/api-m22-server';

export function PendingDeletionSheet(): React.ReactElement {
  const pending = useSyncExternalStore(pendingDeletionStore.subscribe, pendingDeletionStore.get, pendingDeletionStore.get);
  const { auth, listener } = useSocial();
  const api = useM22Api();
  const toast = useToast();
  const [busy, setBusy] = useState<'keep' | 'continue' | null>(null);
  const [error, setError] = useState<string | undefined>();
  // Signed out some other way: nothing to ask.
  useEffect(() => { if (!listener && pending) pendingDeletionStore.set(null); }, [listener, pending]);
  const open = pending !== null && listener !== undefined;

  const keep = async (): Promise<void> => {
    setBusy('keep'); setError(undefined);
    try {
      await api.cancelDeletion();
      pendingDeletionStore.set(null);
      toast('Your account is staying. Everything is back.');
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally { setBusy(null); }
  };
  const goOn = async (): Promise<void> => {
    setBusy('continue');
    try { await auth.signOut(); } finally { pendingDeletionStore.set(null); setBusy(null); }
  };

  return (
    <Actionsheet isOpen={open} onClose={() => undefined}>
      <ActionsheetBackdrop accessibilityRole="none" />
      <ActionsheetContent className="px-screen-x pt-section items-stretch" accessibilityViewIsModal>
        <Text className="text-text font-display text-title" accessibilityRole="header">Keep your account?</Text>
        <Text className="text-muted text-body mt-row">
          {`Your account is due to be deleted on ${pending ? dueDateText(pending.dueAt) : ''}. Until then nobody else can see it.`}
        </Text>
        {error ? <Text className="text-accent text-body mt-row">{error}</Text> : null}
        <Box className="flex-row gap-gap mt-section">
          <Button kind="secondary" label="Continue" accessibilityLabel="Continue with the deletion" busy={busy === 'continue'} disabled={busy !== null} onPress={() => { void goOn(); }} className="flex-1" />
          <Button label="Keep my account" busy={busy === 'keep'} disabled={busy !== null} onPress={() => { void keep(); }} className="flex-1" />
        </Box>
        <Box className="h-section" />
      </ActionsheetContent>
    </Actionsheet>
  );
}
