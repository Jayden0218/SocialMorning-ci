// Minor mode switch: hides explicit episodes; a 4-digit passcode guards turning it off.
/**
 * Minor mode (未成年模式, M10): hides every episode its publisher marked explicit — in
 * Updates, show pages and the inbox. The mark is the publisher's own `<itunes:explicit>`;
 * an unmarked episode is shown.
 *
 * M17 (`SettingsMinor-B`): a centred page — the umbrella on a yellow disc, the serif title and
 * what the mode does under it, then one card with the switch and its state ("On" / "Off"), and
 * the note about publishers under a hairline. Same switch, same name, same pref.
 *
 * M19 T090 (US9, FR-061): teen mode with a passcode. Turning it on asks for a 4-digit passcode
 * twice (number pad, hidden); turning it off asks for it. 5 wrong tries in a row → no tries for
 * 15 minutes (`src/settings/teen-passcode.ts`, kept on this phone as a salted hash). "Forgot
 * passcode?" emails a 6-digit code to the account (POST /v1/me/teen-reset/start); the right code
 * (…/check) turns the mode off and clears the passcode. A mode turned on before M19 has no
 * passcode, so it turns off as before.
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, size } from '@/design';
import { getPref, setPref } from '@/settings/prefs';
import { checkPasscode, clearPasscode, hasPasscode, isPasscode, lockedUntil, PASSCODE_LENGTH, setPasscode } from '@/settings/teen-passcode';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { useM19Api } from '@/social/m19-api';
import { useStores, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { Card } from '@/ui/kit/Card';
import { PageHeader } from '@/ui/kit/PageHeader';

const TAP = { minHeight: size.row };
const DISC = { width: 112, height: 112 };
const BUTTON = { minHeight: hit.min };

/** What the passcode box is asking for, if anything. */
type Step = { kind: 'none' } | { kind: 'set' } | { kind: 'confirm'; first: string } | { kind: 'off' } | { kind: 'code' };

const PROMPT: Record<Exclude<Step['kind'], 'none'>, string> = {
  set: 'Choose a 4-digit passcode. You will need it to turn minor mode off.',
  confirm: 'Enter the same 4 digits again.',
  off: 'Enter your passcode to turn minor mode off.',
  code: 'Enter the 6-digit code we emailed to your account.',
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function MinorMode(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [on, setOn] = useState(() => getPref(stores.settings, 'hideExplicit'));
  const toast = useToast();
  const { listener } = useSocial();
  const m19 = useM19Api();
  const [step, setStep] = useState<Step>({ kind: 'none' });
  const [entry, setEntry] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const go = (next: Step, why?: string) => { setStep(next); setEntry(''); setProblem(why); };
  const turn = (v: boolean) => { setOn(v); setPref(stores.settings, 'hideExplicit', v); };
  const locked = lockedUntil(stores.settings, Date.now());

  const onToggle = (v: boolean) => {
    if (v) { go({ kind: 'set' }); return; }
    // Turned on before M19 (no passcode): it turns off as it always did.
    if (!hasPasscode(stores.settings)) { turn(false); return; }
    go({ kind: 'off' });
  };
  const submit = (value: string) => {
    if (step.kind === 'code') {
      if (!/^\d{6}$/.test(value) || busy) return;
      setBusy(true);
      m19.teenResetCheck(value)
        .then(() => { clearPasscode(stores.settings); turn(false); go({ kind: 'none' }); toast('Minor mode is off and the passcode is cleared.'); })
        .catch((e) => go({ kind: 'code' }, e instanceof ApiError && (e.status === 422 || e.status === 400 || e.status === 401) ? 'That code is wrong or has expired.' : "Couldn't reach the server. Try again."))
        .finally(() => setBusy(false));
      return;
    }
    if (!isPasscode(value)) return;
    if (step.kind === 'set') { go({ kind: 'confirm', first: value }); return; }
    if (step.kind === 'confirm') {
      if (value !== step.first) { go({ kind: 'set' }, "The two didn't match. Choose the passcode again."); return; }
      setPasscode(stores.settings, value);
      turn(true);
      go({ kind: 'none' });
      toast('Minor mode is on. Keep the passcode somewhere safe.');
      return;
    }
    if (step.kind === 'off') {
      const r = checkPasscode(stores.settings, value, Date.now());
      if (r.kind === 'ok') { clearPasscode(stores.settings); turn(false); go({ kind: 'none' }); return; }
      if (r.kind === 'wrong') { go({ kind: 'off' }, `Wrong passcode. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left before a 15-minute wait.`); return; }
      // Locked: the card says until when (from the stored time, so it survives leaving the page).
      go({ kind: 'off' });
    }
  };
  const forgot = () => {
    if (!listener) { setProblem('Sign in to the account on this phone to reset the passcode by email.'); return; }
    if (busy) return;
    setBusy(true);
    m19.teenResetStart()
      .then(() => go({ kind: 'code' }))
      .catch(() => setProblem("Couldn't send the code. Try again."))
      .finally(() => setBusy(false));
  };
  const typing = step.kind !== 'none';
  const length = step.kind === 'code' ? 6 : PASSCODE_LENGTH;
  const blocked = step.kind === 'off' && locked !== undefined;
  return (
    <>
    {/* M17: an empty middle — the title is drawn centred under the disc instead. */}
    <PageHeader middle={<Box />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-row pb-24">
      <Box className="items-center">
        <Box className="bg-primary rounded-pill items-center justify-center" style={DISC}>
          <Icon name="umbrella-outline" size={48} color={c.onPrimary} />
        </Box>
        <Text className="text-text text-display font-display text-center mt-section" accessibilityRole="header">Minor mode</Text>
        <Text className="text-muted text-body text-center mt-gap leading-[22px]">Episodes their publisher marks explicit are not listed in Updates, show pages or the inbox.</Text>
      </Box>
      <Card className="mt-section py-row">
        <Box className="flex-row items-center gap-section" style={TAP}>
          <Box className="flex-1">
            <Text className="text-text text-body font-bold">Hide explicit episodes</Text>
            <Text className="text-accent text-xs font-bold mt-0.5">{on ? 'On' : 'Off'}</Text>
          </Box>
          {/* M16a T004: the app's own toggle, not the iOS switch. */}
          {/* M19 T090: on asks for a new passcode; off asks for it (the pref changes only after). */}
          <Toggle value={on} onChange={onToggle} label="Hide explicit episodes" disabled={typing} />
        </Box>
        {on && hasPasscode(stores.settings) && !typing ? <Text className="text-muted text-xs mt-gap">Locked with a passcode</Text> : null}
      </Card>
      {typing ? (
        <Card className="mt-row py-row gap-row">
          <Text className="text-text text-body font-bold">{PROMPT[step.kind]}</Text>
          {blocked ? (
            <Text className="text-accent text-body">{`Too many wrong tries. Try again after ${clock(locked ?? 0)}.`}</Text>
          ) : (
            <Input className="bg-background border border-border rounded-row h-auto px-0">
              <InputField
                key={step.kind}
                value={entry}
                onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, length); setEntry(d); if (d.length === length) submit(d); }}
                keyboardType="number-pad"
                secureTextEntry={step.kind !== 'code'}
                maxLength={length}
                autoFocus
                placeholder={step.kind === 'code' ? '6-digit code' : '4 digits'}
                placeholderTextColor={c.muted}
                accessibilityLabel={step.kind === 'code' ? 'Emailed code' : step.kind === 'confirm' ? 'Passcode again' : 'Passcode'}
                className="p-row text-text text-lg text-center"
              />
            </Input>
          )}
          {problem ? <Text className="text-accent text-meta">{problem}</Text> : null}
          <Box className="flex-row justify-between items-center">
            <Pressable onPress={() => go({ kind: 'none' })} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center" style={BUTTON}>
              <Text className="text-accent text-body font-bold">Cancel</Text>
            </Pressable>
            {step.kind === 'off' ? (
              <Pressable onPress={forgot} disabled={busy} accessibilityRole="button" accessibilityLabel="Forgot passcode?" className="justify-center" style={BUTTON}>
                <Text className="text-accent text-body font-semibold">Forgot passcode?</Text>
              </Pressable>
            ) : null}
          </Box>
        </Card>
      ) : null}
      <Box className="border-b-hairline border-separator mt-section mx-1" />
      <Text className="text-muted text-xs mt-row mx-1">This relies on each publisher marking its episodes. SocialNet does not check the audio itself.</Text>
    </ScrollView>
    </>
  );
}
