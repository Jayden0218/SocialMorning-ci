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
 * M22 US11 (FR-033): deletion now waits 15 days. The page names the date; during the wait the
 * account is hidden and signed out everywhere, and signing in again offers Keep
 * (`src/ui/auth/PendingDeletion.tsx`). After the date the server deletes it as before.
 *
 * M17 (`SettingsAccountMore-B`, T081): the Editorial layout. Before confirming, "Delete my
 * account…" sits in a card. Once confirming: a serif "Delete my account" heading, the warning,
 * "This cannot be undone." in serif accent, then three numbered steps — 1 email a code (a tick
 * and "Sent to …" once sent), 2 the 6-digit code field, 3 delete — and a bar at the foot with
 * "Keep my account" and the step's primary action ("Email me a code to confirm", then "Delete
 * account", enabled at 6 digits). Same handlers, same names, same order of steps as before.
 *
 * M31 S-A (T060; design-pulse2 `settings-account-more--screen`, `--signed-out`, `--delete-steps`, `--code-sent`; Panel): the page is one group tile
 * with one row — a trash icon and "Delete my account…" in hot-text, a chevron — under the edge label ACCOUNT; the rest stays empty on purpose so the
 * one destructive way out is not brushed by mistake (signed out: a tile "Sign in to manage your account." and the row dimmed, it does nothing without
 * an account). Tapping it turns the page into the three-step delete — no page is pushed — titled "Delete my account": a tile of what goes with
 * "Deleted for good on {date}." in Unbounded 17 hot-text, the steps as a small thread in one tile (dots 32: active = light, done = hot with a tick,
 * waiting = outline), and the bottom zone **Keep my account** (quiet) with **Email me a code to confirm** (hot), then **Delete account** (hot, 40 %
 * until six digits are in; busy shows a bar).
 */
import { useState } from 'react';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { PanelGroup } from '@/ui/me/Panel';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { KeyboardPage } from '@/ui/me/lists';
import { dueDateText } from '@/social/api-m22-server';
import { FieldLabel, Note, Sec, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

const WAIT_DAYS = 15;
const DOT = 32;

export default function AccountMoreScreen(): React.ReactElement {
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
  const due = dueDateText(new Date(Date.now() + WAIT_DAYS * 86_400_000).toISOString());

  // M24 US20 (`SettingsAccountMore-B`): one title — "Delete my account" replaces "More" once the deletion steps show.
  const foot = confirming ? (
    <Box className="flex-row" style={{ gap: SET.tileGap }}>
      <Box className="flex-1"><PulseButton kind="quiet" label="Keep my account" onPress={() => setConfirming(false)} full /></Box>
      <Box style={{ flex: codeSent ? 1 : 1.3 }}>
        {codeSent ? (
          <PulseButton kind="hot" label="Delete account" onPress={remove} disabled={!ready} busy={busy} full />
        ) : (
          <PulseButton kind="hot" label="Email me a code to confirm" onPress={sendCode} busy={busy} full />
        )}
      </Box>
    </Box>
  ) : undefined;
  return (
    <KeyboardPage>
      <PushedPage title={confirming ? 'Delete my account' : 'More'} {...(confirming ? { size: 28, below: foot, belowHeight: hit.min } : {})}>
        {(layout) => (
          <SetPage layout={layout}>
            {!confirming ? (
              <>
                {!listener ? <SetCard><Type step="body" className="text-text font-medium">Sign in to manage your account.</Type></SetCard> : null}
                <Sec label="Account">
                  <PanelGroup>
                    <SetRow icon="trash-outline" label="Delete my account…" accessibilityLabel="Delete my account" hot dim={!listener} onPress={() => setConfirming(true)} disabled={!listener} />
                  </PanelGroup>
                </Sec>
              </>
            ) : (
              <>
                <Sec label="What goes">
                  <SetCard gap={SET.rowGap}>
                    <Type step="body" className="text-text2" style={SET_TYPE.note14}>This removes your comments, reactions and listening positions from every phone. Where someone replied to you, "Comment deleted" stays so their reply still makes sense.</Type>
                    <Type step="lede" className="text-hotText font-bold" style={SET_TYPE.display17}>{`Deleted for good on ${due}.`}</Type>
                    <Type step="body" className="text-text2" style={SET_TYPE.note14}>{`Until then your account is hidden from everyone and signed out on every phone. Changed your mind? Sign in before ${due} and keep it.`}</Type>
                  </SetCard>
                </Sec>
                <Sec label="Steps">
                  <SetCard gap={SET.tilePad}>
                    <Step n={1} done={codeSent} active={!codeSent} title="Email me a code to confirm" line={codeSent && masked ? `Sent to ${masked}` : undefined} />
                    <Step n={2} done={codeSent && ready} active={codeSent && !ready} title="Enter the 6-digit code">
                      {codeSent ? (
                        <FieldLabel label="Code">
                          <Input className="border-0 h-auto w-auto bg-transparent">
                            <InputField
                              placeholderTextColor={colour.text3} placeholder="The 6-digit code we emailed you" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} accessibilityLabel="Code" className="text-text font-medium" style={[SET_TYPE.field15, { paddingHorizontal: 0, paddingVertical: 0 }]} />
                          </Input>
                        </FieldLabel>
                      ) : null}
                    </Step>
                    <Step n={3} done={false} active={ready} title="Delete account" line={ready ? undefined : 'Available once all 6 digits are in.'} />
                  </SetCard>
                </Sec>
                {error ? <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type> : null}
              </>
            )}
          </SetPage>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}

/** One step of the delete thread: a 32 dot (done = hot with a tick, active = light, waiting = outline) and its words. */
function Step(props: { n: number; done: boolean; active: boolean; title: string; line?: string | undefined; children?: React.ReactNode }): React.ReactElement {
  const dot = props.done ? 'bg-hot' : props.active ? 'bg-text' : 'border-[1.5px] border-line';
  return (
    <Box className="flex-row items-start" style={{ gap: SET.rowGap }}>
      <Box className={`items-center justify-center ${dot}`} style={{ width: DOT, height: DOT, borderRadius: DOT / 2 }} accessible={false}>
        {props.done
          ? <Icon name="checkmark" size={16} color={colour.void} />
          : <Type step="badge" className={props.active ? 'text-void' : 'text-text3'} style={SET_TYPE.mono13}>{String(props.n)}</Type>}
      </Box>
      <Box className="flex-1" style={{ paddingTop: 5, gap: 6 }}>
        <Type step="compact" className={props.done || props.active ? 'text-text font-bold' : 'text-text3 font-bold'}>{props.title}</Type>
        {props.line ? <Note>{props.line}</Note> : null}
        {props.children}
      </Box>
    </Box>
  );
}
