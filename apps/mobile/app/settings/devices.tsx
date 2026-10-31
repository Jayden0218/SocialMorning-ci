// Signed-in devices: every phone and web page signed in to this account; sign one out, or all the others.
/**
 * M25 lane SB (Settings › Account and security › Signed-in devices). Lists GET /v1/me/sessions:
 * each place's name (the phone's own label, "Studio (web browser)" or "Moderation page"), the
 * country of the network it signed in from, and when it was last used; this phone first, marked.
 * "Sign out" on any other one ends it at once on the server. "Sign out all other devices" asks for
 * a second tap (no system dialog — the app draws its own controls).
 *
 * M31 S-A (T060; design-pulse2 `settings-devices--screen`, `--loading`, `--error`, `--signed-out`, `toast--settings-devices`; Panel): the lede (14, text-2), then the devices in one group
 * tile with 1 px dividers — a kind icon 22 (phone, Studio, moderation), the label 15 / 600, "Country · active n h ago" (13); this phone wears a "This phone" chip in hot-text, the
 * others a quiet **Sign out** pill (36). **Sign out all other devices** (ring pill) sits under the list when others exist; the first tap turns it into "Tap again to sign out 2
 * devices", the second does it. Loading is "Loading…" in mono 13 over breathing ghost rows; an error is one tile (alert, "Couldn't load your devices. Tap to try again.", retry) that is
 * the button; signed out is "Sign in to see your devices." in a tile. Edge label SIGNED IN.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { colour } from '@/design';
import { useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { deviceLine, useAccountApi, type Device } from '@/social/account-api';
import { countryName } from '@/ui/me/country';
import { PanelGroup } from '@/ui/me/Panel';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { GhostLines, Lede, Sec, SetButton, SetCard, SetPage, SetRow } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';
import { nowMs as clockMs } from '@/ui/kit/clock';

const ICON: Record<Device['kind'], 'phone-portrait-outline' | 'grid-outline' | 'lock-closed-outline'> = {
  phone: 'phone-portrait-outline', studio: 'grid-outline', mod: 'lock-closed-outline',
};

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Device[] };

export default function DevicesScreen(): React.ReactElement {
  const account = useAccountApi();
  const toast = useToast();
  const { listener } = useSocial();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(() => {
    account.devices().then((items) => setState({ kind: 'ok', items })).catch(() => setState({ kind: 'error' }));
  }, [account]);
  useEffect(() => { if (listener) load(); }, [listener, load]);

  const signOut = (d: Device) => {
    account.signOutDevice(d.id)
      .then(() => { toast(`${d.label} is signed out.`); load(); })
      .catch(() => toast("Couldn't sign that device out — try again when you're online."));
  };
  const signOutOthers = () => {
    if (!confirmAll) { setConfirmAll(true); return; }
    setConfirmAll(false);
    account.signOutOthers()
      .then((n) => { toast(n === 0 ? 'No other device was signed in.' : `Signed out of ${n} other ${n === 1 ? 'device' : 'devices'}.`); load(); })
      .catch(() => toast("Couldn't sign the others out — try again when you're online."));
  };

  const now = clockMs();
  const others = state.kind === 'ok' ? state.items.filter((d) => !d.current).length : 0;
  return (
    <PushedPage title="Signed-in devices" size={28}>
      {(layout) => (
        <SetPage layout={layout}>
          <Lede small>Every place your account is signed in. If you do not know one, sign it out — it will need your email code to come back.</Lede>
          <Sec label="Signed in">
            {!listener ? <SetCard><Type step="body" className="text-text font-medium">Sign in to see your devices.</Type></SetCard>
              : state.kind === 'loading' ? (
                <SetCard testID="devices-loading">
                  <Type step="mono" className="text-text2" style={SET_TYPE.mono13}>Loading…</Type>
                  <GhostLines rows={4} />
                </SetCard>
              ) : state.kind === 'error' ? (
                <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Try loading your devices again" testID="devices-error" className="flex-row items-center bg-raise" style={{ gap: SET.tileGap, borderRadius: SET.radius, padding: SET.tilePad }}>
                  <Icon name="alert-circle-outline" size={SET.rowIcon} color={colour.hotText} />
                  <Type step="body" className="text-text flex-1 font-medium">Couldn't load your devices. Tap to try again.</Type>
                  <Icon name="repeat-outline" size={20} color={colour.text} />
                </Pressable>
              ) : (
                <Box style={{ gap: SET.gap }}>
                  <PanelGroup>
                    {state.items.map((d) => (
                      <SetRow
                        key={d.id}
                        icon={ICON[d.kind]}
                        label={d.label}
                        line={deviceLine(d, now, countryName)}
                        right={d.current ? (
                          <Box className="bg-raise border border-line rounded-pill items-center justify-center" style={{ height: 30, paddingHorizontal: SET.pillPad }} accessible accessibilityLabel="This phone">
                            <Type step="caption" className="text-hotText font-semibold">This phone</Type>
                          </Box>
                        ) : <SetButton label="Sign out" small onPress={() => signOut(d)} accessibilityLabel={`Sign out ${d.label}`} />}
                      />
                    ))}
                  </PanelGroup>
                  {others > 0 ? (
                    <Box className="self-start">
                      <PulseButton kind="ring" icon="send" label={confirmAll ? `Tap again to sign out ${others} ${others === 1 ? 'device' : 'devices'}` : 'Sign out all other devices'} accessibilityLabel={confirmAll ? 'Tap again to sign out every other device' : 'Sign out all other devices'} onPress={signOutOthers} />
                    </Box>
                  ) : null}
                </Box>
              )}
          </Sec>
        </SetPage>
      )}
    </PushedPage>
  );
}
