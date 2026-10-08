// Account and security › Change email: a code goes to the new address; the right code switches the sign-in email.
/**
 * M24 US16 (spec 025, lane A3). Two steps, like deleting the account: 1 type the new address and
 * get a code there, 2 type the 6-digit code. The server refuses an address another account uses,
 * allows 5 tries and 10 minutes, and emails the OLD address once the change is made. The phone
 * then keeps the new address in its sign-in row, so Account shows it at once.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Input, InputField } from '@/ui/lib/input';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { BottomBar } from '@/ui/kit/BottomBar';
import { Button } from '@/ui/kit/Button';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { isEmail, useAccountApi } from '@/social/account-api';

export default function ChangeEmailScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const { listener, refreshListener } = useSocial();
  const api = useAccountApi();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      await api.startEmailChange(email);
      setSentTo(email.trim().toLowerCase());
      setCode('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      const now = await api.confirmEmailChange(code);
      if (listener) stores.auth.set({ listenerId: listener.listenerId, displayName: listener.displayName, email: now }, Date.now());
      refreshListener();
      toast('Your sign-in email is changed.');
      router.back();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const ready = sentTo ? code.trim().length === 6 : isEmail(email);
  return (
    <>
    <PageHeader title="Change email" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-section gap-section" keyboardShouldPersistTaps="handled">
      <Card className="py-section gap-row">
        <Text className="text-muted text-xs">Now</Text>
        <Text className="text-text text-body font-semibold" numberOfLines={1}>{listener?.email ?? 'Not signed in'}</Text>
      </Card>
      <Box className="gap-1">
        <Text className="text-muted text-xs">New email</Text>
        <Input className="bg-surface border border-border rounded-row h-auto px-0">
          <InputField
            placeholderTextColor={c.muted} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={sentTo === undefined}
            value={email} onChangeText={(v) => { setEmail(v); setError(undefined); }} accessibilityLabel="New email" className="p-row text-base text-text" />
        </Input>
      </Box>
      {sentTo ? (
        <Box className="gap-1">
          <Text className="text-muted text-xs">{`Code sent to ${sentTo}`}</Text>
          <Input className="bg-surface border border-border rounded-row h-auto px-0">
            <InputField
              placeholderTextColor={c.muted} placeholder="The 6-digit code" keyboardType="number-pad" maxLength={6}
              value={code} onChangeText={(v) => { setCode(v); setError(undefined); }} accessibilityLabel="Code" className="p-row text-base text-text" />
          </Input>
          <Text className="text-muted text-xs">It works for 10 minutes. We tell your old address once it is changed.</Text>
        </Box>
      ) : (
        <Text className="text-muted text-body">We email a code to the new address. You keep signing in with the old one until you enter it.</Text>
      )}
      {error ? <Text className="text-accent text-body" accessibilityLiveRegion="polite">{error}</Text> : null}
    </ScrollView>
    <BottomBar tone="page" className="flex-row gap-row">
      {sentTo ? <Button kind="secondary" label="Use another email" onPress={() => { setSentTo(undefined); setCode(''); setError(undefined); }} className="flex-1" /> : null}
      <Button
        label={sentTo ? 'Change email' : 'Email me a code'}
        onPress={() => void (sentTo ? confirm() : send())}
        disabled={!ready}
        busy={busy}
        className="flex-1"
      />
    </BottomBar>
    </>
  );
}
