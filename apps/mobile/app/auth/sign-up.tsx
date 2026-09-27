/** Create an account (US5 #1, #2). Display names need not be unique (clarified 2026-09-21). */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { useSocial } from '../../src/social/context';
import { describe, errorText } from '../../src/ui/auth/errors';
import { AuthButton, AuthField, AuthShell } from '../../src/ui/auth/AuthShell';
import { ConsentDialog, ConsentRow, useLegalOverlay } from '../../src/ui/auth/Consent';
import { looksLikeEmail, submitAction } from '../../src/ui/auth/rules';

export default function SignUpScreen(): React.ReactElement {
  const { auth } = useSocial();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [asking, setAsking] = useState(false);
  const legal = useLegalOverlay();

  const valid = looksLikeEmail(email) && password.length >= 8 && displayName.trim().length >= 1 && displayName.trim().length <= 40;

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      await auth.signUp(email.trim(), password, displayName.trim());
      // Pop both auth screens: the listener lands back where they started.
      if (router.canGoBack()) router.back();
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  }

  const action = submitAction({ valid, agreed, busy });

  return (
    <AuthShell title="Create account">
      <AuthField placeholder="Display name (what others see)" value={displayName} onChangeText={setDisplayName} maxLength={40} accessibilityLabel="Display name" />
      <AuthField placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} accessibilityLabel="Email" />
      <AuthField placeholder="Password (8+ characters)" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} accessibilityLabel="Password" />
      {error ? <Text className={errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
      <AuthButton label="Create account" disabled={action === 'disabled'} busy={busy} onPress={() => (action === 'ask' ? setAsking(true) : void submit())} />
      <ConsentRow agreed={agreed} onToggle={() => setAgreed((a) => !a)} open={legal.open} />
      <ConsentDialog
        visible={asking}
        action="create account"
        open={legal.open}
        onCancel={() => setAsking(false)}
        onAgree={() => { setAsking(false); setAgreed(true); void submit(); }}
      />
      {legal.overlay}
    </AuthShell>
  );
}
