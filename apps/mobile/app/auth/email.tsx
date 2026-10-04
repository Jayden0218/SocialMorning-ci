// Sign in with email: enter email, then 6-digit code, then your name if new.
/**
 * Continue with email (owner, 2026-09-27): no password. Step 1 the email, step 2 the
 * 6-digit code sent to it, step 3 — only for a new email — the name others will see.
 * The same page signs in and signs up. Consent was given on the landing page
 * (`agreed=1`); opened any other way, the box is here too and the same dialog asks.
 * Each step's main button sits in the bar pinned to the bottom (owner's screenshot, 2026-10-03).
 * The code step (owner's screenshot, 2026-10-03): "CHECK YOUR EMAIL" over the title, ✕ on the
 * right, the address in a card with "Change", 6 cells, and the bar holds the resend at the
 * left and "Continue →" at the right.
 *
 * M17 T071 (`EmailAuth-B`, `EmailCode-B`, `SignUp-B`): each step takes B's title size and
 * weight; the code step's bar is the page colour with "Didn't get it?" in 13 pt and a 52 pt
 * "Continue →"; the name step shows a monogram of the typed name over its title. Steps,
 * consent, resend timer and sign-in calls are unchanged.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { BusyContent } from '@/ui/kit/BusyContent';
import { SUSPENDED_KEY, useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { AuthButton, AuthField, AuthShell, CodeCells, NameMonogram, SentTo, type Heading } from '@/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '@/ui/auth/Consent';
import { describe, errorText } from '@/ui/auth/errors';
import { toApp } from '@/ui/auth/navigate';
import { looksLikeEmail, submitAction } from '@/ui/auth/rules';

type Step = 'email' | 'code' | 'name';

const TITLE: Record<Step, string> = { email: 'Continue\nwith email', code: 'Enter the code', name: 'Your name' };
/** B's title per step: 44 SemiBold, 36 Bold, 40 SemiBold. */
const HEADING: Record<Step, Heading> = {
  email: { size: 44, semibold: true, tracking: -1, leading: 48 },
  code: { size: 36, leading: 40 },
  name: { size: 40, semibold: true, tracking: -0.8, leading: 44 },
};

export default function EmailScreen(): React.ReactElement {
  const { auth } = useSocial();
  const stores = useStores();
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
    const r = await auth.signInWithCode(email.trim(), code.trim(), displayName);
    if (r === 'needsName') { setStep('name'); return; }
    stores.settings.set(SUSPENDED_KEY, '');
    setSuspended(undefined);
    toApp();
  });

  const emailAction = submitAction({ valid: looksLikeEmail(email), agreed, busy });

  return (
    <AuthShell
      title={TITLE[step]}
      heading={HEADING[step]}
      eyebrow={step === 'code' ? 'Check your email' : undefined}
      closeRight={step === 'code'}
      compact={step === 'code'}
      bar={step === 'code' ? 'page' : 'surface'}
      hero={step === 'name' ? <NameMonogram name={name} /> : undefined}
      subtitle={step === 'email' ? null : <Text className="text-muted text-sm leading-[23px]">{step === 'code' ? 'We sent a 6-digit code to' : 'This is the name others see. You can use any name.'}</Text>}
      footer={
        step === 'email' ? <AuthButton label="Send code" className="rounded-pill" bold disabled={emailAction === 'disabled'} busy={sending} onPress={() => (emailAction === 'ask' ? setAsking(true) : void sendCode())} />
        : step === 'code' ? (
          <Box className="flex-row items-center gap-row">
            <Box className="flex-1">
              <Text className="text-muted text-meta">Didn't get it?</Text>
              {wait > 0
                ? <Text className="text-muted text-meta">Send again in {wait} s</Text>
                : <Pressable onPress={() => void sendCode()} disabled={busy} accessibilityRole="button" accessibilityLabel="Send the code again" accessibilityState={{ disabled: busy, busy: sending }} hitSlop={12} className="self-start">
                    <BusyContent busy={sending} size={12}>
                      <Text className="text-accent text-meta font-bold">Send again</Text>
                    </BusyContent>
                  </Pressable>}
            </Box>
            <AuthButton label="Continue" trail="arrow-forward" className="rounded-pill px-7" slim bold disabled={code.length !== 6} busy={verifying} onPress={() => void verify()} />
          </Box>
        )
        : <AuthButton label="Create account" className="rounded-pill" bold disabled={name.trim().length === 0} busy={verifying} onPress={() => void verify(name.trim())} />
      }
    >
      {step === 'email' ? (
        <>
          <AuthField placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoFocus value={email} onChangeText={setEmail} accessibilityLabel="Email" />
          {consentGiven ? null : <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />}
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <SentTo email={email.trim()} onChange={() => { setStep('email'); setError(undefined); }} />
          <Box className="mt-7"><CodeCells value={code} onChange={setCode} /></Box>
        </>
      ) : null}
      {step === 'name' ? (
        <>
          <AuthField label="Name" placeholder="Display name" autoFocus maxLength={40} value={name} onChangeText={setName} accessibilityLabel="Display name" />
        </>
      ) : null}
      {suspended ? <Text className={errorText} accessibilityLiveRegion="polite">{suspended}</Text> : null}
      {error ? <Text className={errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
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
