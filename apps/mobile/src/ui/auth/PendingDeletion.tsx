// After signing in during the 15-day deletion wait: a sheet saying the date, with Keep my account and Continue.
/**
 * M22 US11 (FR-034; contracts/api.md "Account deletion"). The sign-in answer carries
 * `pendingDeletion: { dueAt }` while an account waits to be deleted; the auth code keeps it in
 * `pendingDeletionStore`. This sheet then asks "Your account is due to be deleted on <date>.
 * Keep it?":
 *  - Keep my account → POST /v1/me/deletion/cancel; the profile, comments and statuses come back.
 *  - Continue → signed out again on this phone; the deletion stays on its date.
 *
 * M31 S-C (T062; design-pulse2 `settings.html` `pending-deletion--sheet`, `toast--pending-deletion`): the kit sheet, locked — "cannot
 * be swiped away (no close, no backdrop tap)". The title is Unbounded 800 26, the line Geist 500 15 on 22, then Continue (quiet,
 * raise fill, 1 part) beside Keep my account (light, 1.4 parts). A failure shows "Couldn't reach the server. Try again." in
 * hot-text. The toast after Keep my account is the app's light toast (3 s).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box } from '@/ui/lib/box';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { dueDateText, pendingDeletionStore, useM22Api } from '@/social/api-m22-server';
import { AUTH, AUTH_TYPE } from './measures';

/** Keep my account takes 1.4 parts to Continue's 1 (`flex:1.4` against `flex:1`). */
export const KEEP_FLEX = 1.4;

export function PendingDeletionSheet(): React.ReactElement {
  const pending = useSyncExternalStore(pendingDeletionStore.subscribe, pendingDeletionStore.get, pendingDeletionStore.get);
  const { auth, listener } = useSocial();
  const api = useM22Api();
  const toast = useToast();
  const [busy, setBusy] = useState<'keep' | 'continue' | null>(null);
  const [error, setError] = useState<string | undefined>();
  // Signed out some other way: nothing to ask. M31 F8: only when the listener GOES (was there, now is not) — a sign-in answer sets the store
  // before the context attaches the listener, and clearing then lost the sheet (wave-5 defect 3).
  const had = useRef(false);
  useEffect(() => {
    if (listener) { had.current = true; return; }
    if (had.current) { had.current = false; if (pending) pendingDeletionStore.set(null); }
  }, [listener, pending]);
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
    <ActionSheet open={open} onClose={() => undefined} locked label="Keep your account?">
      <Type step="hero" className="text-text" style={AUTH_TYPE.pendingTitle} accessibilityRole="header">Keep your account?</Type>
      <Type step="body" className="text-text2 font-medium" style={AUTH_TYPE.sheetLine}>
        {`Your account is due to be deleted on ${pending ? dueDateText(pending.dueAt) : ''}. Until then nobody else can see it.`}
      </Type>
      {error ? <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type> : null}
      <Box className="flex-row" style={{ gap: AUTH.box.gap }}>
        <Box style={{ flex: 1 }}>
          <PulseButton label="Continue" accessibilityLabel="Continue with the deletion" kind="quiet" full busy={busy === 'continue'} disabled={busy !== null} onPress={() => { void goOn(); }} />
        </Box>
        <Box style={{ flex: KEEP_FLEX }}>
          <PulseButton label="Keep my account" kind="light" full busy={busy === 'keep'} disabled={busy !== null} onPress={() => { void keep(); }} />
        </Box>
      </Box>
    </ActionSheet>
  );
}
