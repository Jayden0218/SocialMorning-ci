/**
 * Appearance (外观设置, M10b US4): System, Light or Dark. The choice is stored ('pref.appearance')
 * and applied at once through `applyAppearance` (UniWind on M9; a no-op on main until then) —
 * the Settings row appears only when DARK_READY is on, so it is never a switch that does nothing.
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { size } from '../../src/design';
import { applyAppearance } from '../../src/design/theme';
import { useStores } from '../../src/ui/providers';
import { APPEARANCE_KEY, readAppearance, useColours, type Appearance } from '../../src/ui/useColours';
import { ACCENT_KEY, applyAccent, readAccent } from '../../src/design/accent';
import { ACCENTS, colourDark, type AccentName } from '../../src/design';
import { Icon } from '../../src/ui/Icon';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };
const CHOICES: { value: Appearance; label: string; line: string }[] = [
  { value: 'system', label: 'Follow the phone', line: 'Light or dark, as the phone is set' },
  { value: 'light', label: 'Light', line: 'Always light' },
  { value: 'dark', label: 'Dark', line: 'Always dark' },
];

export default function AppearanceScreen(): React.ReactElement {
  const stores = useStores();
  const [value, setValue] = useState<Appearance>(() => readAppearance(stores.settings));
  const choose = (a: Appearance) => { stores.settings.set(APPEARANCE_KEY, a); setValue(a); applyAppearance(a); };
  // M12 FR-108: the accent theme, applied at once and kept across restarts.
  const c = useColours(stores.settings);
  const [accent, setAccent] = useState<AccentName>(() => readAccent(stores.settings));
  const pick = (a: AccentName) => { stores.settings.set(ACCENT_KEY, a); setAccent(a); applyAccent(a); };
  const dark = c.background === colourDark.background;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'Appearance' }} />
      {CHOICES.map((c) => (
        <Pressable key={c.value} onPress={() => choose(c.value)} accessibilityRole="radio" accessibilityState={{ checked: value === c.value }} accessibilityLabel={`${c.label}. ${c.line}`} className="flex-row items-center gap-section" style={TAP}>
          <Box className={`w-5 h-5 rounded-pill border-2 ${value === c.value ? 'border-accent bg-accent' : 'border-separator'}`} />
          <Box className="flex-1">
            <Text className="text-text text-sm">{c.label}</Text>
            <Text className="text-muted text-xs">{c.line}</Text>
          </Box>
        </Pressable>
      ))}
      <Text className="text-muted text-xs mt-section mb-row" accessibilityRole="header">Accent colour</Text>
      <Box className="flex-row flex-wrap gap-section">
        {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
          const t = ACCENTS[name];
          const on = accent === name;
          return (
            <Pressable key={name} onPress={() => pick(name)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Accent: ${t.label}`} className="items-center gap-1 w-16" style={TAP}>
              <Box className={`w-12 h-12 rounded-pill items-center justify-center ${on ? 'border-2 border-text' : ''}`} style={{ backgroundColor: (dark ? t.dark : t.light).primary }}>
                {on ? <Icon name="checkmark" size={22} color={(dark ? t.dark : t.light).onPrimary} /> : null}
              </Box>
              <Text className={on ? 'text-text text-xs font-semibold' : 'text-muted text-xs'}>{t.label}</Text>
            </Pressable>
          );
        })}
      </Box>
    </ScrollView>
  );
}
