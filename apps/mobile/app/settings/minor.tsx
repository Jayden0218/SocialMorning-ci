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
 *
 * M31 S-A (T060; design-pulse2 `settings-minor--screen`, `--set-passcode`, `--confirm-passcode`, `--turn-off-prompt`, `--forgot-passcode`, `toast--settings-minor`; Stage + Panel): a 112 disc
 * (hot-text to hot to violet, a moon 48 in void, a hot glow) centred at the top with the line under it in 14 / 20; **Hide explicit episodes** as one large switch tile (Unbounded 17, its state
 * "On / Off" in mono 12; on = the tinted wash with a hot ring and "· Locked with a passcode"); the note "This relies on each publisher…" (12, centred) closes the page. Turning it on asks for a
 * passcode (set, then confirm), turning it off asks for it (with **Forgot passcode?** by email code); the switch is disabled while a passcode is being typed. Then the disc shrinks to 72 and a
 * tile ringed in hot asks the question: four 18 dots fill as digits arrive (or six cells for the emailed code); a wrong try says how many are left; locked says until when, in place of the dots.
 * The number pad is the page's own hidden field (so the keyboard, the spoken name "Passcode" and secure entry are the real ones); **Cancel** (quiet) and **Forgot passcode?** (ring) sit in the tile.
 */
import { useState } from 'react';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { LinearGradient } from '@/design/tailwind';
import { colour, glow } from '@/design';
import { getPref, setPref } from '@/settings/prefs';
import { checkPasscode, clearPasscode, hasPasscode, isPasscode, lockedUntil, PASSCODE_LENGTH, setPasscode } from '@/settings/teen-passcode';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { useM19Api } from '@/social/m19-api';
import { useStores, useToast } from '@/ui/shell/providers';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { KeyboardPage } from '@/ui/me/lists';
import { settingsColour } from '@/design/tokens';
import { Note, Sec, SetCard, SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

/** The disc is 112 (72 while a passcode is typed); its moon is 48 (32). */
const DISC = { big: 112, small: 72, moonBig: 48, moonSmall: 32 } as const;
const DOT = 18;
const CELL = 58;

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
  const disc = typing ? DISC.small : DISC.big;
  return (
    <KeyboardPage>
      <PushedPage title="Minor mode">
        {(layout) => (
          <SetPage layout={layout}>
            <Box className="items-center" style={{ gap: SET.gap, paddingTop: typing ? 0 : 20, paddingHorizontal: 10 }}>
              <Box testID="minor-disc" className="overflow-hidden items-center justify-center" style={{ width: disc, height: disc, borderRadius: disc / 2, shadowColor: glow.cover.color, shadowOpacity: glow.cover.opacity, shadowRadius: glow.cover.radius, shadowOffset: { width: 0, height: 0 } }}>
                <LinearGradient colors={[colour.hotText, colour.hot, colour.violet]} locations={[0, 0.55, 1]} start={{ x: 0.3, y: 0.25 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
                <Icon name="moon-outline" size={typing ? DISC.moonSmall : DISC.moonBig} color={colour.void} />
              </Box>
              <Type step="note" className="text-text2 text-center">Episodes their publisher marks explicit are not listed in Updates, show pages or the inbox.</Type>
            </Box>
            <Sec label="Switch">
              <Box testID="minor-switch" className="flex-row items-center" style={{ gap: SET.rowGap, padding: SET.tilePad, borderRadius: SET.radius, ...(on ? { backgroundColor: settingsColour.wash, borderWidth: 1, borderColor: settingsColour.ring } : { backgroundColor: colour.raise }) }}>
                <Box className="flex-1">
                  <Type step="lede" className="text-text font-bold" style={SET_TYPE.display17}>Hide explicit episodes</Type>
                  <Type step="mono" className={on ? 'text-hotText' : 'text-text3'} style={[SET_TYPE.mono12, { marginTop: 4 }]}>{`${on ? 'On' : 'Off'}${on && hasPasscode(stores.settings) && !typing ? ' · Locked with a passcode' : ''}`}</Type>
                </Box>
                {/* M16a T004: the app's own toggle, not the iOS switch. */}
                {/* M19 T090: on asks for a new passcode; off asks for it (the pref changes only after). */}
                <Toggle value={on} onChange={onToggle} label="Hide explicit episodes" disabled={typing} />
              </Box>
            </Sec>
            {typing ? (
              <SetCard testID="passcode-card" wash gap={SET.rowGap}>
                <Type step="row" className="text-text" style={SET_TYPE.field15}>{PROMPT[step.kind]}</Type>
                {blocked ? (
                  <Type step="caption" className="text-hotText" style={SET_TYPE.line13}>{`Too many wrong tries. Try again after ${clock(locked ?? 0)}.`}</Type>
                ) : (
                  <Box style={{ paddingVertical: step.kind === 'code' ? 0 : SET.gap }}>
                    {step.kind === 'code' ? (
                      <Box testID="code-cells" className="flex-row" style={{ gap: SET.gap }} accessible={false} importantForAccessibility="no-hide-descendants">
                        {Array.from({ length }, (_, k) => (
                          <Box key={k} className="flex-1 bg-raise2 items-center justify-center" style={{ height: CELL, borderRadius: 16, ...(k === entry.length ? { borderWidth: 1.5, borderColor: colour.hot } : null) }}>
                            <Type step="lede" className="text-text font-bold" style={SET_TYPE.cell26}>{entry[k] ?? ''}</Type>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Box testID="passcode-dots" className="flex-row justify-center" style={{ gap: 14 }} accessible={false} importantForAccessibility="no-hide-descendants">
                        {Array.from({ length }, (_, k) => (
                          <Box key={k} style={{ width: DOT, height: DOT, borderRadius: DOT / 2, ...(k < entry.length ? { backgroundColor: colour.text } : { borderWidth: 2, borderColor: colour.idle }) }} />
                        ))}
                      </Box>
                    )}
                    {/* The number pad: a real field laid over the dots, drawn invisible, so the keyboard, secure entry and the spoken name are the phone's. */}
                    <Input className="absolute border-0 bg-transparent" style={{ left: 0, right: 0, top: 0, bottom: 0, opacity: 0 }}>
                      <InputField
                        key={step.kind}
                        value={entry}
                        onChangeText={(t) => { const d = t.replace(/\D/g, '').slice(0, length); setEntry(d); if (d.length === length) submit(d); }}
                        keyboardType="number-pad"
                        secureTextEntry={step.kind !== 'code'}
                        maxLength={length}
                        autoFocus
                        placeholder={step.kind === 'code' ? '6-digit code' : '4 digits'}
                        placeholderTextColor={colour.text3}
                        accessibilityLabel={step.kind === 'code' ? 'Emailed code' : step.kind === 'confirm' ? 'Passcode again' : 'Passcode'}
                        className="text-text"
                      />
                    </Input>
                  </Box>
                )}
                {problem ? <Type step="caption" className="text-hotText" style={SET_TYPE.line13} accessibilityLiveRegion="polite">{problem}</Type> : null}
                <Box className="flex-row" style={{ gap: SET.tileGap }}>
                  <Box className="flex-1"><PulseButton kind="quiet2" label="Cancel" onPress={() => go({ kind: 'none' })} full /></Box>
                  {step.kind === 'off' ? <Box className="flex-1"><PulseButton kind="ring" label="Forgot passcode?" onPress={forgot} disabled={busy} full /></Box> : null}
                </Box>
              </SetCard>
            ) : null}
            <Note centre>This relies on each publisher marking its episodes. SocialNet does not check the audio itself.</Note>
          </SetPage>
        )}
      </PushedPage>
    </KeyboardPage>
  );
}
