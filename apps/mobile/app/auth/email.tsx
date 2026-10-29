// Sign in with email: enter email, then 6-digit code, then your name if new.
/**
 * Continue with email (owner, 2026-09-27): no password. Step 1 the email, step 2 the
 * 6-digit code sent to it, step 3 — only for a new email — the name others will see.
 * The same page signs in and signs up. Consent was given on the landing page
 * (`agreed=1`); opened any other way, the box is here too and the same sheet asks.
 *
 * M31 S-C (T061; design-pulse2 `settings.html` `emailPage`, entries `auth-email--screen`, `--code-step`, `--name-step`, `--under-age`,
 * `--suspended`, layout Panel): the title low by the thumb with a close (✕) circle, the form above it, and the step's button in
 * a 52 row at the foot (Send code / Continue › / Create account), disabled to 40 % until the step can go on. The code step
 * puts "Check your email" over the title, the address in a tile with Change, six cells, and "Didn't get it? Send again in n s"
 * beside Continue ›. The name step shows the typed initials in a 110 disc, the name field and the age line. A suspended account's
 * refusal sits in a tile ringed in hot with an Appeal pill. Steps, consent, resend timer and sign-in calls are unchanged.
 *
 * M25 L3e (age gate): the name step — a new account only — also asks "I am 14 or older"
 * (`AgeConfirm`); "Create account" waits for it, and "I am under 14" ends the sign-up with a plain
 * line. The confirmation is kept next to the terms consent (`recordAgeConfirmed`, src/ui/auth/age.ts).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { BusyContent } from '@/ui/kit/BusyContent';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { authColour } from '@/design/tokens';
import { SUSPENDED_KEY, useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { AuthField, AuthShell, CodeCells, NameMonogram, SentTo } from '@/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '@/ui/auth/Consent';
import { describe } from '@/ui/auth/errors';
import { toApp } from '@/ui/auth/navigate';
import { looksLikeEmail, submitAction } from '@/ui/auth/rules';
import { AgeConfirm } from '@/ui/auth/AgeConfirm';
import { UNDER_AGE_TEXT, canCreate, recordAgeConfirmed } from '@/ui/auth/age';
import { AUTH, AUTH_TYPE } from '@/ui/auth/measures';

type Step = 'email' | 'code' | 'name';

const TITLE: Record<Step, string> = { email: 'Continue with email', code: 'Enter the code', name: 'Your name' };
const LEAD: Record<Step, number> = AUTH.lead;

/** A tile (raise, radius 22, padding 16) for the refusal and the under-age line. */
const TILE = { borderRadius: AUTH.tile.radius, padding: AUTH.tile.pad, gap: AUTH.tile.gap };

export default function EmailScreen(): React.ReactElement {
  const { auth } = useSocial();
  const stores = useStores();
  const c = useColours();
  const params = useLocalSearchParams<{ agreed?: string }>();
  const consentGiven = params.agreed === '1';
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [suspended, setSuspended] = useState<string | undefined>(() => stores.settings.get(SUSPENDED_KEY) || undefined);
  const [error, setError] = useState<string | undefined>();
  // Owner, 2026-10-04: one flag made "Continue" busy (and shrink) when "Send again" was pressed.
  // Sending a code and checking one are now apart: only the pressed button shows busy.
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const busy = sending || verifying;
  const [agreed, setAgreed] = useState(consentGiven);
  const [ageOk, setAgeOk] = useState(false);
  const [under, setUnder] = useState(false);
  const [asking, setAsking] = useState(false);
  const [wait, setWait] = useState(0);
  const legal = useLegalOverlay();

  // The resend countdown.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function run(setBusy: (b: boolean) => void, work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try { await work(); } catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  const sendCode = () => run(setSending, async () => {
    const r = await auth.requestCode(email.trim());
    setWait(r.resendAfterSeconds);
    setCode('');
    setStep('code');
  });

  const verify = (displayName?: string) => run(setVerifying, async () => {
    // M25 L3e: a new account is made only after the age is confirmed; the record sits by the terms consent.
    if (displayName !== undefined) recordAgeConfirmed(stores.settings);
    const r = await auth.signInWithCode(email.trim(), code.trim(), displayName);
    if (r === 'needsName') { setStep('name'); return; }
    stores.settings.set(SUSPENDED_KEY, '');
    setSuspended(undefined);
    toApp();
  });

  const emailAction = submitAction({ valid: looksLikeEmail(email), agreed, busy });

  const foot = step === 'email' ? (
    <PulseButton label="Send code" kind="light" height={AUTH.foot.button} className="flex-1" disabled={emailAction === 'disabled'} busy={sending} onPress={() => (emailAction === 'ask' ? setAsking(true) : void sendCode())} />
  ) : step === 'code' ? (
    <>
      <Box className="flex-1">
        <Type step="caption" className="text-text2">Didn't get it?</Type>
        {wait > 0
          ? <Type step="mono" className="text-text3">{`Send again in ${wait} s`}</Type>
          : <Pressable onPress={() => void sendCode()} disabled={busy} accessibilityRole="button" accessibilityLabel="Send the code again" accessibilityState={{ disabled: busy, busy: sending }} hitSlop={12} className="self-start">
              <BusyContent busy={sending} size={12}>
                <Type step="caption" className="text-hotText font-semibold">Send again</Type>
              </BusyContent>
            </Pressable>}
      </Box>
      <PulseButton label="Continue ›" accessibilityLabel="Continue" kind="light" height={AUTH.foot.button} disabled={code.length !== 6} busy={verifying} onPress={() => void verify()} />
    </>
  ) : (
    <PulseButton label="Create account" kind="light" height={AUTH.foot.button} className="flex-1" disabled={under || !canCreate(name, ageOk)} busy={verifying} onPress={() => { if (canCreate(name, ageOk)) void verify(name.trim()); }} />
  );

  return (
    <AuthShell
      title={TITLE[step]}
      lead={LEAD[step]}
      {...(step === 'code' ? { eyebrow: 'Check your email' } : {})}
      {...(step === 'name' ? { subtitle: 'This is the name others see. You can use any name.' } : {})}
      foot={foot}
    >
      {step === 'email' ? (
        <>
          <AuthField placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoFocus value={email} onChangeText={setEmail} accessibilityLabel="Email" />
          {consentGiven ? null : <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />}
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <Type step="body" className="text-text2 font-medium" style={AUTH_TYPE.sheetLine}>We sent a 6-digit code to</Type>
          <SentTo email={email.trim()} onChange={() => { setStep('email'); setError(undefined); }} />
          <CodeCells value={code} onChange={setCode} />
        </>
      ) : null}
      {step === 'name' ? (
        <>
          <NameMonogram name={name} />
          <AuthField label="Name" placeholder="Display name" autoFocus maxLength={40} value={name} onChangeText={setName} accessibilityLabel="Display name" />
          {under
            ? <Box testID="under-age" className="bg-raise" style={TILE}><Type step="note" className="text-text" accessibilityLiveRegion="polite">{UNDER_AGE_TEXT}</Type></Box>
            : <AgeConfirm confirmed={ageOk} onToggle={() => setAgeOk((a) => !a)} onUnder={() => { setUnder(true); setAgeOk(false); setName(''); }} />}
        </>
      ) : null}
      {/* M24 US6: a suspended listener can appeal from here, with the token the refusal carried. */}
      {suspended ? (
        <Box testID="suspended-tile" className="bg-raise" style={{ ...TILE, borderWidth: 1, borderColor: authColour.refusalRing }}>
          <Box className="flex-row items-start" style={{ gap: AUTH.tile.gap }}>
            <Icon name="warning-outline" size={20} color={c.hotText} />
            <Type step="note" className="text-hotText flex-1" accessibilityLiveRegion="polite">{suspended}</Type>
          </Box>
          <PulseButton label="Appeal" accessibilityLabel="Appeal the suspension" kind="ring" height={40} onPress={() => router.push('/appeal' as never)} />
        </Box>
      ) : null}
      {error ? <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type> : null}
      <ConsentDialog
        visible={asking}
        action="continue"
        open={legal.open}
        onCancel={() => setAsking(false)}
        onAgree={() => { setAsking(false); setAgreed(true); void sendCode(); }}
      />
      {legal.overlay}
    </AuthShell>
  );
}
