/**
 * Sign in (US5). The 409/429 messages come from the server verbatim (contracts/api.md).
 * Laid out after the owner's reference screenshots (2026-09-27): see `src/ui/auth/`.
 */
import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { ApiError } from '../../src/social/api';
import { SUSPENDED_KEY, useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { askForNotifications } from '../../src/notify/permission';
import { expoNotify } from '../../src/notify/expo';
import { AuthButton, AuthField, AuthShell } from '../../src/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { looksLikeEmail, submitAction } from '../../src/ui/auth/rules';

export default function SignInScreen(): React.ReactElement {
  const { auth } = useSocial();
  const stores = useStores();
  const [suspended, setSuspended] = useState<string | undefined>(() => stores.settings.get(SUSPENDED_KEY));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [asking, setAsking] = useState(false);
  const legal = useLegalOverlay();

  // Owner, 2026-09-27: the OS asks for notification permission when this page opens.
  useEffect(() => { void askForNotifications(expoNotify); }, []);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signIn(email.trim(), password);
      stores.settings.set(SUSPENDED_KEY, '');
      setSuspended(undefined);
      router.back();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  const action = submitAction({ valid: looksLikeEmail(email) && password.length > 0, agreed, busy });

  return (
    <AuthShell title="Sign in">
      <AuthField placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <AuthField placeholder="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {suspended ? <Text className={errorText} accessibilityLiveRegion="polite">{suspended}</Text> : null}
      {error ? <Text className={errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
      <AuthButton label="Sign in" disabled={action === 'disabled'} busy={busy} onPress={() => (action === 'ask' ? setAsking(true) : void submit())} />
      <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />
      <Link href="/auth/sign-up" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Create an account" className="items-center justify-center min-h-12">
          <Text className="text-accent text-sm">Create an account</Text>
        </Pressable>
      </Link>
      <ConsentDialog
        visible={asking}
        action="sign in"
        open={legal.open}
        onCancel={() => setAsking(false)}
        onAgree={() => { setAsking(false); setAgreed(true); void submit(); }}
      />
      {legal.overlay}
    </AuthShell>
  );
}

export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'locked' && e.retryAfterSeconds !== undefined) return `Too many attempts — try again in ${e.retryAfterSeconds} s.`;
    return e.message;
  }
  return 'Something went wrong. Try again.';
}

/** Shared with sign-up. */
export const errorText = 'text-accent text-sm';
