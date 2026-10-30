// Appearance: the accent colour, the Vibration switch, and the app icon.
/**
 * Appearance (M12 FR-108): the accent colour. Until M17 this page also held System / Light /
 * Dark; M17 (constitution v3.0.0, owner 2026-10-03: "remove it") made the app light only, so
 * only the accent picker is left. The choice is stored ('pref.accent') and applied at once.
 *
 * M17 (`SettingsAppearance-B`, T083): the Editorial accent row — a serif "Accent colour" heading
 * and a sideways row of pills (swatch + name; the chosen one outlined in `text` with a tick).
 * B's theme preview and Light / Dark / Phone cards are not built: dark mode was removed.
 *
 * M22 US17: "Vibration" (T074, on by default) turns every tap tick off (src/ui/kit/haptics.ts).
 * "App icon" (T076, moved from M20 T070–T071): our own four icons from the local module
 * modules/alternate-icons. PLUS members pick one (iOS says the icon changed; on Android the
 * launcher may close the app, so we warn first); others see the icons, "Part of PLUS" and a
 * Wallet button. Hidden when this build has no native module or the phone cannot switch icons.
 */
import { useEffect, useState } from 'react';
import { Image } from '@/ui/lib/image';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
import { SwitchRow } from '@/ui/settings/rows';
import { useSocial } from '@/social/context';
import { useConfirm } from '@/ui/kit/confirm';
import { HAPTICS_KEY, hapticsOn, setHapticsEnabled } from '@/ui/kit/haptics';
import * as AltIcons from '../../modules/alternate-icons';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useStores, useToast } from '@/ui/shell/providers';
import { ACCENT_KEY, applyAccent, readAccent } from '@/design/accent';
import { ACCENTS, type AccentName } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PageHeader } from '@/ui/kit/PageHeader';

const SWATCH = { width: 36, height: 36 };
const ICON_PREVIEW = { width: 60, height: 60 };
/** Our own icons (assets/icons/alt, drawn by modules/alternate-icons/scripts/render-icons.mjs). */
const ICON_IMAGES: Record<AltIcons.AltIcon | 'Default', number> = {
  Default: require('../../assets/app-icon.png'),
  Sunrise: require('../../assets/icons/alt/sunrise-180.png'),
  Ocean: require('../../assets/icons/alt/ocean-180.png'),
  Forest: require('../../assets/icons/alt/forest-180.png'),
  Plum: require('../../assets/icons/alt/plum-180.png'),
};
const TAP = { minHeight: hit.min };

export default function AppearanceScreen(): React.ReactElement {
  const stores = useStores();
  // M12 FR-108: the accent theme, applied at once and kept across restarts.
  const [accent, setAccent] = useState<AccentName>(() => readAccent(stores.settings));
  const pick = (a: AccentName) => { stores.settings.set(ACCENT_KEY, a); setAccent(a); applyAccent(a); };
  // M22 T074: Vibration, on by default.
  const [vibration, setVibration] = useState(() => hapticsOn(stores.settings));
  const vibrate = (on: boolean) => { setVibration(on); stores.settings.set(HAPTICS_KEY, on ? '1' : '0'); setHapticsEnabled(on); };
  return (
    <>
    <PageHeader title="Appearance" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pt-row pb-24">
      <Text className="text-text text-base font-display px-screen-x mb-row" accessibilityRole="header">Accent colour</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="px-screen-x gap-gap">
        {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
          const t = ACCENTS[name];
          const on = accent === name;
          return (
            <Pressable key={name} onPress={() => pick(name)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Accent: ${t.label}`} className={`flex-row items-center gap-gap rounded-pill bg-surface pl-1.5 pr-section ${on ? 'border-2 border-text' : 'border border-border'}`} style={TAP}>
              <Box className="rounded-pill items-center justify-center" style={[SWATCH, { backgroundColor: t.light.primary }]}>
                {on ? <Icon name="checkmark" size={18} color={t.light.onPrimary} /> : null}
              </Box>
              <Text className={on ? 'text-text text-body font-bold' : 'text-text text-body'}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Box className="px-screen-x mt-section">
        <Card>
          <SwitchRow icon="phone-portrait-outline" label="Vibration" line="A light tick when you scroll a picker or tap some buttons" value={vibration} onChange={vibrate} />
        </Card>
      </Box>
      <AppIconSection />
    </ScrollView>
    </>
  );
}

/** M22 T076: the App icon picker; renders nothing where icons cannot be switched. */
function AppIconSection(): React.ReactElement | null {
  const router = useRouter();
  const toast = useToast();
  const { api, listener } = useSocial();
  const [confirm, dialog] = useConfirm();
  const [supported, setSupported] = useState(false);
  const [current, setCurrent] = useState<AltIcons.AltIcon | null>(null);
  const [plus, setPlus] = useState(false);
  useEffect(() => {
    let live = true;
    if (!AltIcons.isAvailable()) return;
    void AltIcons.supported().then((ok) => { if (live) setSupported(ok); });
    void AltIcons.currentIcon().then((name) => { if (live) setCurrent(name); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    if (listener === undefined) { setPlus(false); return; }
    void api.me().then((m) => { if (live) setPlus(m.plus === true); }, () => undefined);
    return () => { live = false; };
  }, [api, listener]);
  if (!supported) return null;
  const change = (name: AltIcons.AltIcon | null) => {
    void AltIcons.setIcon(name).then((ok) => {
      if (ok) setCurrent(name); else toast('The icon could not be changed. Try again.');
    });
  };
  const choose = (name: AltIcons.AltIcon | null) => {
    if (!plus || name === current) return;
    if (Platform.OS === 'android') {
      confirm({ title: 'Change the app icon?', message: 'The app will close to change its icon.', action: 'Change', onConfirm: () => change(name) });
    } else {
      change(name);
    }
  };
  const options: (AltIcons.AltIcon | 'Default')[] = ['Default', ...AltIcons.ALT_ICONS];
  return (
    <Box className="px-screen-x mt-section">
      <Text className="text-text text-base font-display mb-row" accessibilityRole="header">App icon</Text>
      <Box className="flex-row flex-wrap gap-section">
        {options.map((name) => {
          const value = name === 'Default' ? null : name;
          const on = current === value;
          return (
            <Pressable key={name} onPress={() => choose(value)} disabled={!plus} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !plus }} accessibilityLabel={`App icon: ${name}`} className="items-center gap-1" style={TAP}>
              <Box className={`rounded-[16px] p-0.5 ${on ? 'border-2 border-text' : 'border-2 border-background'}`}>
                <Image source={ICON_IMAGES[name]} style={ICON_PREVIEW} className="rounded-[14px]" accessible={false} />
              </Box>
              <Text className={on ? 'text-text text-xs font-bold' : 'text-muted text-xs'}>{name}</Text>
            </Pressable>
          );
        })}
      </Box>
      {plus ? null : (
        <Box className="mt-row gap-gap">
          <Text className="text-muted text-body">Part of PLUS.</Text>
          <Button label="Open Wallet" kind="secondary" onPress={() => router.push('/wallet')} />
        </Box>
      )}
      {dialog}
    </Box>
  );
}
