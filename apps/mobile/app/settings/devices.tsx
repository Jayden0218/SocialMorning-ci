// Signed-in devices: every phone and web page signed in to this account; sign one out, or all the others.
/**
 * M25 lane SB (Settings › Account and security › Signed-in devices). Lists GET /v1/me/sessions:
 * each place's name (the phone's own label, "Studio (web browser)" or "Moderation page"), the
 * country of the network it signed in from, and when it was last used; this phone first, marked.
 * "Sign out" on any other one ends it at once on the server. "Sign out all other devices" asks for
 * a second tap (no system dialog — the app draws its own controls).
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { deviceLine, useAccountApi, type Device } from '@/social/account-api';
import { countryName } from '@/ui/me/country';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };
const ICON: Record<Device['kind'], 'phone-portrait-outline' | 'desktop-outline' | 'shield-checkmark-outline'> = {
  phone: 'phone-portrait-outline', studio: 'desktop-outline', mod: 'shield-checkmark-outline',
};

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Device[] };

export default function DevicesScreen(): React.ReactElement {
  const account = useAccountApi();
  const toast = useToast();
  const stores = useStores();
  const c = useColours(stores.settings);
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

  const now = Date.now();
  const others = state.kind === 'ok' ? state.items.filter((d) => !d.current).length : 0;
  return (
    <>
    <PageHeader title="Signed-in devices" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
      <Text className="text-muted text-body">Every place your account is signed in. If you do not know one, sign it out — it will need your email code to come back.</Text>
      {!listener ? <Text className="text-muted text-body">Sign in to see your devices.</Text>
        : state.kind === 'loading' ? <Text className="text-muted text-body">Loading…</Text>
        : state.kind === 'error' ? (
          <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Try loading your devices again" style={TAP} className="justify-center">
            <Text className="text-muted text-body">Couldn't load your devices. Tap to try again.</Text>
          </Pressable>
        ) : (
          <Card className="py-1">
            {state.items.map((d, i) => (
              <Box key={d.id}>
                {i > 0 ? <CardDivider /> : null}
                <Box className="flex-row items-center gap-row py-row" style={TAP}>
                  <Icon name={ICON[d.kind]} size={24} color={d.current ? c.accent : c.muted} />
                  <Box className="flex-1">
                    <Text className="text-text text-body font-semibold" numberOfLines={1}>{d.label}</Text>
                    <Text className="text-muted text-xs mt-0.5">{deviceLine(d, now, countryName)}</Text>
                  </Box>
                  {d.current ? (
                    <Box className="bg-accentTint rounded-pill px-row py-1.5" accessible accessibilityLabel="This phone"><Text className="text-accent text-meta font-bold">This phone</Text></Box>
                  ) : (
                    <Pressable onPress={() => signOut(d)} accessibilityRole="button" accessibilityLabel={`Sign out ${d.label}`} className="px-row rounded-pill border border-border items-center justify-center" style={TAP}>
                      <Text className="text-text text-meta font-semibold">Sign out</Text>
                    </Pressable>
                  )}
                </Box>
              </Box>
            ))}
          </Card>
        )}
      {state.kind === 'ok' && others > 0 ? (
        <Pressable onPress={signOutOthers} accessibilityRole="button" accessibilityLabel={confirmAll ? 'Tap again to sign out every other device' : 'Sign out all other devices'} className="flex-row items-center justify-center gap-gap rounded-pill border border-border" style={TAP}>
          <Icon name="log-out-outline" size={18} color={c.text} />
          <Text className="text-text text-body font-semibold">{confirmAll ? `Tap again to sign out ${others} ${others === 1 ? 'device' : 'devices'}` : 'Sign out all other devices'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
    </>
  );
}
