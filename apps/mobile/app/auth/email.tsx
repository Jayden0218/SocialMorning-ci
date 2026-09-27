/**
 * Sign in with email and password (US5), one of the ways in from the landing page
 * (owner, 2026-09-27). Consent was given on the landing page (`agreed=1`); opened any
 * other way, the box is here too and the same dialog asks.
 */
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SUSPENDED_KEY, useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { AuthButton, AuthField, AuthShell } from '../../src/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { describe, errorText } from '../../src/ui/auth/errors';
import { looksLikeEmail, submitAction } from '../../src/ui/auth/rules';

export default function EmailSignInScreen(): React.ReactElement {
  const { auth } = useSocial();
  const stores = useStores();
  const params = useLocalSearchParams<{ agreed?: string }>();
  const consentGiven = params.agreed === '1';
  const [suspended, setSuspended] = useState<string | undefined>(() => stores.settings.get(SUSPENDED_KEY));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(consentGiven);
  const [asking, setAsking] = useState(false);
  const legal = useLegalOverlay();

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signIn(email.trim(), password);
      stores.settings.set(SUSPENDED_KEY, '');
      setSuspended(undefined);
      // Pop this page and the landing page: the listener lands back where they started.
      if (router.canGoBack()) router.back();
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  const action = submitAction({ valid: looksLikeEmail(email) && password.length > 0, agreed, busy });

  return (
    <AuthShell title="Sign in with email">
      <AuthField placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <AuthField placeholder="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {suspended ? <Text className={errorText} accessibilityLiveRegion="polite">{suspended}</Text> : null}
      {error ? <Text className={errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
      <AuthButton label="Sign in" disabled={action === 'disabled'} busy={busy} onPress={() => (action === 'ask' ? setAsking(true) : void submit())} />
      {consentGiven ? null : <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />}
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
