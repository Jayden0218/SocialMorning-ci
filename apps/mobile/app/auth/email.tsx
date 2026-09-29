/**
 * Continue with email (owner, 2026-09-27): no password. Step 1 the email, step 2 the
 * 6-digit code sent to it, step 3 — only for a new email — the name others will see.
 * The same page signs in and signs up. Consent was given on the landing page
 * (`agreed=1`); opened any other way, the box is here too and the same dialog asks.
 */
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { SUSPENDED_KEY, useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { AuthButton, AuthField, AuthShell } from '../../src/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { describe, errorText } from '../../src/ui/auth/errors';
import { toApp } from '../../src/ui/auth/navigate';
import { looksLikeEmail, submitAction } from '../../src/ui/auth/rules';

type Step = 'email' | 'code' | 'name';

const TITLE: Record<Step, string> = { email: 'Continue with email', code: 'Enter the code', name: 'Your name' };

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
  const [busy, setBusy] = useState(false);
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

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(undefined);
    try { await work(); } catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  const sendCode = () => run(async () => {
    const r = await auth.requestCode(email.trim());
    setWait(r.resendAfterSeconds);
    setCode('');
    setStep('code');
  });

  const verify = (displayName?: string) => run(async () => {
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
      subtitle={step === 'email' ? null : <Text className="text-muted text-sm leading-[22px] text-center">{step === 'code' ? `We sent a 6-digit code to ${email.trim()}.` : 'This is the name others see. You can use any name.'}</Text>}
    >
      {step === 'email' ? (
        <>
          <AuthField placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoFocus value={email} onChangeText={setEmail} accessibilityLabel="Email" />
          <AuthButton label="Send code" disabled={emailAction === 'disabled'} busy={busy} onPress={() => (emailAction === 'ask' ? setAsking(true) : void sendCode())} />
          {consentGiven ? null : <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />}
        </>
      ) : null}
      {step === 'code' ? (
        <>
          <AuthField placeholder="6-digit code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} autoFocus value={code} onChangeText={setCode} accessibilityLabel="Code" />
          <AuthButton label="Continue" disabled={busy || code.trim().length !== 6} busy={busy} onPress={() => void verify()} />
          <Pressable onPress={() => void sendCode()} disabled={busy || wait > 0} accessibilityRole="button" accessibilityLabel="Send the code again" className="items-center justify-center min-h-12">
            <Text className={wait > 0 ? 'text-muted text-sm' : 'text-accent text-sm'}>{wait > 0 ? `Send again in ${wait} s` : 'Send the code again'}</Text>
          </Pressable>
          <Pressable onPress={() => { setStep('email'); setError(undefined); }} accessibilityRole="button" accessibilityLabel="Use a different email" className="items-center justify-center min-h-12">
            <Text className="text-muted text-sm">Use a different email</Text>
          </Pressable>
        </>
      ) : null}
      {step === 'name' ? (
        <>
          <AuthField placeholder="Display name" autoFocus maxLength={40} value={name} onChangeText={setName} accessibilityLabel="Display name" />
          <AuthButton label="Create account" disabled={busy || name.trim().length === 0} busy={busy} onPress={() => void verify(name.trim())} />
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
