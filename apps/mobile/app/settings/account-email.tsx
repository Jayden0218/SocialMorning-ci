// Account and security › Change email: a code to the new address and one to the current; both right switch the sign-in email.
/**
 * M24 US16 (spec 025, lane A3). Two steps, like deleting the account: 1 type the new address and
 * get a code there, 2 type the 6-digit code. M25 S5: a second code goes to the CURRENT address at
 * the same time, and both are needed — a stolen session alone cannot move the account. The server refuses an address another account uses,
 * allows 5 tries and 10 minutes, and emails the OLD address once the change is made. The phone
 * then keeps the new address in its sign-in row, so Account shows it at once.
 *
 * M31 S-A (T060; design-pulse2 `settings-account-email--screen`, `--codes-sent`, `toast--settings-account-email`; Panel): a "Now" tile with the
 * current address in mono 15; the New email field (48, radius 18, raise-2; focused = a 1.5 hot ring) and the explanation in 14 text-2; after the
 * codes are sent the new address locks at 60 % and two code fields follow, labelled "Code sent to …". The buttons are the page's bottom zone,
 * under the title bar: **Email me a code** (light 52), or **Use another email** (quiet) and **Change email** (light). Server errors show in
 * hot-text 14 under the fields. Edge labels NOW, NEW.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { PushedPage } from '@/ui/kit/PushedPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { KeyboardPage } from '@/ui/me/lists';
import { useStores, useToast } from '@/ui/shell/providers';
import { ApiError } from '@/social/api';
import { useSocial } from '@/social/context';
import { emailChangedLine, isEmail, useAccountApi } from '@/social/account-api';
import { FieldLabel, Lede, Note, Sec, SetCard, SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

export default function ChangeEmailScreen(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const toast = useToast();
  const { listener, refreshListener } = useSocial();
  const api = useAccountApi();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [focus, setFocus] = useState(false);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      await api.startEmailChange(email);
      setSentTo(email.trim().toLowerCase());
      setCode('');
      setOldCode('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      const now = await api.confirmEmailChange(code, oldCode);
      if (listener) stores.auth.set({ listenerId: listener.listenerId, displayName: listener.displayName, email: now.email }, Date.now());
      refreshListener();
      // M24 fix F-P: the server signs out the other devices and says how many.
      toast(emailChangedLine(now.signedOut));
      router.back();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const ready = sentTo ? code.trim().length === 6 && oldCode.trim().length === 6 : isEmail(email);
  const field = { paddingHorizontal: 0, paddingVertical: 0 };
  const foot = (
    <Box className="flex-row" style={{ gap: SET.tileGap }}>
      {sentTo ? <Box className="flex-1"><PulseButton kind="quiet" label="Use another email" onPress={() => { setSentTo(undefined); setCode(''); setOldCode(''); setError(undefined); }} full /></Box> : null}
      <Box className="flex-1">
        <PulseButton label={sentTo ? 'Change email' : 'Email me a code'} onPress={() => void (sentTo ? confirm() : send())} disabled={!ready} busy={busy} {...(sentTo ? {} : { height: SET.button })} full />
      </Box>
    </Box>
  );
  return (
    <KeyboardPage>
      <PushedPage title="Change email" below={foot} belowHeight={sentTo ? hit.min : SET.button}>
        {(layout) => (
          <SetPage layout={layout}>
            <Sec label="Now">
              <SetCard>
                <Type step="caption" className="text-text2" style={SET_TYPE.line12}>Now</Type>
                <Type step="mono" className="text-text" style={SET_TYPE.mono15} numberOfLines={1}>{listener?.email ?? 'Not signed in'}</Type>
              </SetCard>
            </Sec>
            <Sec label="New">
              <Box style={{ gap: SET.gap }}>
                <FieldLabel label="New email" ring={focus && sentTo === undefined} dim={sentTo !== undefined}>
                  <Input className="border-0 h-auto w-auto bg-transparent">
                    <InputField
                      placeholderTextColor={colour.text3} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={sentTo === undefined}
                      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                      value={email} onChangeText={(v) => { setEmail(v); setError(undefined); }} accessibilityLabel="New email" className="text-text font-medium" style={[SET_TYPE.field15, field]} />
                  </Input>
                </FieldLabel>
                {sentTo ? (
                  <>
                    <FieldLabel label={`Code sent to ${sentTo}`}>
                      <Input className="border-0 h-auto w-auto bg-transparent">
                        <InputField
                          placeholderTextColor={colour.text3} placeholder="The 6-digit code" keyboardType="number-pad" maxLength={6}
                          value={code} onChangeText={(v) => { setCode(v); setError(undefined); }} accessibilityLabel="Code from your new email" className="text-text font-medium" style={[SET_TYPE.field15, field]} />
                      </Input>
                    </FieldLabel>
                    <FieldLabel label={`Code sent to ${listener?.email ?? 'your current email'}`}>
                      <Input className="border-0 h-auto w-auto bg-transparent">
                        <InputField
                          placeholderTextColor={colour.text3} placeholder="The 6-digit code" keyboardType="number-pad" maxLength={6}
                          value={oldCode} onChangeText={(v) => { setOldCode(v); setError(undefined); }} accessibilityLabel="Code from your current email" className="text-text font-medium" style={[SET_TYPE.field15, field]} />
                      </Input>
                    </FieldLabel>
                    <Note>Both codes work for 10 minutes. We tell your old address once it is changed.</Note>
                  </>
                ) : (
                  <Lede small>We email a code to the new address and one to your current address. You keep signing in with the current one until you enter both.</Lede>
                )}
                {error ? <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type> : null}
              </Box>
            </Sec>
          </SetPage>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
