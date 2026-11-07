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
 *
 * M31 S-A (T060; design-pulse2 `settings-appearance--screen`, `--app-icon-locked`, `--app-icon-plus`, `--change-icon-dialog`, `toast--settings-appearance`; Panel):
 * **Dark only** — there is no Light / Dark choice and none is added; the subtitle says so ("Dark only · the accent tints Pulse's hot colour"). Accent
 * colour: the seven accents as 44 swatches in a 4-column grid in one tile; the chosen one has a void tick and a 2 light ring, its name in bold. The
 * accents are the ones in `ACCENTS` (src/design/tokens.ts), each measured against void / raise / raise-2 before adoption and re-checked by guard
 * G-A1b (`ACCENT_PAIRS`, __tests__/m31-sa-appearance.test.tsx names every pair). Vibration is a large switch tile (most used) with its line in the
 * tile beside it. App icon (only where the phone supports other icons): five icons 52 in one tile, the current one ringed 2 light; not PLUS = 40 %
 * and not pressable, with a row "Part of PLUS." and **Open Wallet** (quiet pill 40) → /wallet (store purchase only). Edge labels ACCENT · FEEL ·
 * APP ICON.
 */
import { useEffect, useState } from 'react';
import { Image } from '@/ui/lib/image';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSocial } from '@/social/context';
import { useConfirm } from '@/ui/kit/confirm';
import { HAPTICS_KEY, hapticsOn, setHapticsEnabled } from '@/ui/kit/haptics';
import * as AltIcons from '../../modules/alternate-icons';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { useStores, useToast } from '@/ui/shell/providers';
import { ACCENT_KEY, applyAccent, readAccent } from '@/design/accent';
import { ACCENTS, colour, type AccentName } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { BigGrid, BigTile, Sec, SetButton, SetCard, SetPage } from '@/ui/settings/hub-parts';
import { SET, SET_TYPE } from '@/ui/settings/hub-measures';

/** The swatch is 44; a chosen one wears a 3 gap and a 2 light ring outside it (drawn as shadows, so they take no room: margin -5). */
const SWATCH = 44;
const RING = { gap: 3, width: 2 };
const RING_SIZE = SWATCH + 2 * (RING.gap + RING.width);
const COLUMNS = 4;
const ICON_PREVIEW = 52;
const ICON_IMAGES: Record<AltIcons.AltIcon | 'Default', number> = {
  Default: require('../../assets/app-icon.png'),
  Sunrise: require('../../assets/icons/alt/sunrise-180.png'),
  Ocean: require('../../assets/icons/alt/ocean-180.png'),
  Forest: require('../../assets/icons/alt/forest-180.png'),
  Plum: require('../../assets/icons/alt/plum-180.png'),
};

export default function AppearanceScreen(): React.ReactElement {
  const stores = useStores();
  // M12 FR-108: the accent theme, applied at once and kept across restarts.
  const [accent, setAccent] = useState<AccentName>(() => readAccent(stores.settings));
  const pick = (a: AccentName) => { stores.settings.set(ACCENT_KEY, a); setAccent(a); applyAccent(a); };
  // M22 T074: Vibration, on by default.
  const [vibration, setVibration] = useState(() => hapticsOn(stores.settings));
  const vibrate = (on: boolean) => { setVibration(on); stores.settings.set(HAPTICS_KEY, on ? '1' : '0'); setHapticsEnabled(on); };
  const names = Object.keys(ACCENTS) as AccentName[];
  const rows: AccentName[][] = [];
  for (let i = 0; i < names.length; i += COLUMNS) rows.push(names.slice(i, i + COLUMNS));
  return (
    <PushedPage title="Appearance" subtitle="Dark only · the accent tints Pulse's hot colour">
      {(layout) => (
        <SetPage layout={layout}>
          <Sec label="Accent">
            <SetCard testID="accent-card" gap={SET.rowGap}>
              <Type step="row" className="text-text" accessibilityRole="header">Accent colour</Type>
              <Box style={{ gap: SET.rowGap }}>
                {rows.map((row, r) => (
                  <Box key={r} className="flex-row" style={{ gap: 8 }}>
                    {row.map((name) => {
                      const t = ACCENTS[name];
                      const on = accent === name;
                      return (
                        <Pressable key={name} onPress={() => pick(name)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Accent: ${t.label}`} className="items-center" style={{ flex: 1, minHeight: 48, gap: 6 }}>
                          <Box style={{ width: SWATCH, height: SWATCH }}>
                            <Box testID="accent-swatch" className="items-center justify-center" style={{ width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, backgroundColor: t.light.primary }}>
                              {on ? <Icon name="checkmark" size={20} color={t.light.onPrimary} /> : null}
                            </Box>
                            {on ? <Box testID="accent-ring" pointerEvents="none" className="absolute" style={{ left: -(RING.gap + RING.width), top: -(RING.gap + RING.width), width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2, borderWidth: RING.width, borderColor: colour.text }} /> : null}
                          </Box>
                          <Type step="chip" className={on ? 'text-text font-bold' : 'text-text2 font-medium'} style={{ marginTop: RING.gap + RING.width - 2 }}>{t.label}</Type>
                        </Pressable>
                      );
                    })}
                    {row.length < COLUMNS ? Array.from({ length: COLUMNS - row.length }, (_, k) => <Box key={`s${k}`} style={{ flex: 1 }} />) : null}
                  </Box>
                ))}
              </Box>
            </SetCard>
          </Sec>
          <Sec label="Feel">
            <BigGrid>
              <BigTile icon="phone-portrait-outline" label="Vibration" state={vibration ? 'On · a light tick' : 'Off'} on={vibration} right={<Toggle value={vibration} onChange={vibrate} label="Vibration" />} />
              <Box className="bg-raise justify-end" style={{ flex: 1, minWidth: 0, borderRadius: SET.radius, padding: SET.bigPad }}>
                <Type step="caption" className="text-text2" style={SET_TYPE.line12}>A light tick when you scroll a picker or tap some buttons</Type>
              </Box>
            </BigGrid>
          </Sec>
          <AppIconSection />
        </SetPage>
      )}
    </PushedPage>
  );
}

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
    <Sec label="App icon">
      <SetCard testID="icon-card" gap={SET.rowGap}>
        <Box className="flex-row justify-between" style={{ opacity: plus ? 1 : 0.4 }}>
          {options.map((name) => {
            const value = name === 'Default' ? null : name;
            const on = current === value;
            return (
              <Pressable key={name} onPress={() => choose(value)} disabled={!plus} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: !plus }} accessibilityLabel={`App icon: ${name}`} className="items-center" style={{ gap: 6, minHeight: 48 }}>
                <Box testID={on ? 'icon-ring' : undefined} style={{ padding: 2, borderRadius: 17, borderWidth: 2, borderColor: on ? colour.text : colour.clear, margin: -2 }}>
                  <Image source={ICON_IMAGES[name]} style={{ width: ICON_PREVIEW, height: ICON_PREVIEW, borderRadius: 14 }} accessible={false} />
                </Box>
                <Type step="tag" className={on ? 'text-text font-bold' : 'text-text2 font-medium'} style={{ marginTop: 6 }}>{name}</Type>
              </Pressable>
            );
          })}
        </Box>
        {plus ? null : (
          <Box testID="plus-row" className="flex-row items-center border-t border-line" style={{ gap: 10, paddingTop: SET.rowGap }}>
            <Icon name="crown" size={20} color={colour.hotText} />
            <Type step="compact" className="text-text flex-1">Part of PLUS.</Type>
            <SetButton label="Open Wallet" onPress={() => router.push('/wallet')} />
          </Box>
        )}
      </SetCard>
      {dialog}
    </Sec>
  );
}
