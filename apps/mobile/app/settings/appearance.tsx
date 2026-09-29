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
import { APPEARANCE_KEY, readAppearance, type Appearance } from '../../src/ui/useColours';

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
    </ScrollView>
  );
}
