// Wallet › Redeem a code: type a code from SocialNet and get PLUS days or a paid series, free.
/**
 * M24 US15 (spec 025, lane A3). A code is a free gift from SocialNet (made in Admin) — nothing is
 * bought here. The field groups the code in fours as it is typed; the server takes it with or
 * without dashes. One use per code per account; the server limits tries (10 an hour).
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Input, InputField } from '@/ui/lib/input';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { shortDate } from '@/ui/kit/format';
import { useStores } from '@/ui/shell/providers';
import { ApiError } from '@/social/api';
import { codeReady, grantLine, groupCode, useAccountApi } from '@/social/account-api';

export default function RedeemScreen(): React.ReactElement {
  const api = useAccountApi();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const ready = codeReady(code);

  async function redeem() {
    setBusy(true);
    setError(undefined);
    try {
      const g = await api.redeem(code);
      setDone(grantLine(g, (iso) => shortDate(Date.parse(iso))));
      setCode('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <PageHeader title="Redeem a code" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-section gap-section" keyboardShouldPersistTaps="handled">
      <Card className="py-section gap-row">
        <Text className="text-text text-title font-display">Have a code?</Text>
        <Text className="text-muted text-body">A code from SocialNet gives you PLUS days or a paid series, free. Each code works once per account.</Text>
        <Input className="bg-background border border-border rounded-row h-auto px-0">
          <InputField
            placeholderTextColor={c.muted}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            value={code}
            onChangeText={(v) => { setCode(groupCode(v)); setError(undefined); }}
            accessibilityLabel="Code"
            className="p-row text-base text-text"
          />
        </Input>
        {error ? <Text className="text-accent text-body" accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button label="Redeem" onPress={() => void redeem()} disabled={!ready} busy={busy} />
      </Card>
      {done ? (
        <Box className="flex-row items-center gap-row bg-accentTint rounded-row p-section" accessible accessibilityLiveRegion="polite" accessibilityLabel={done}>
          <Icon name="checkmark-circle" size={24} color={c.accent} />
          <Text className="text-text text-body font-semibold flex-1">{done}</Text>
        </Box>
      ) : null}
    </ScrollView>
    </>
  );
}
