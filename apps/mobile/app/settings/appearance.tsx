// Pick the app's accent colour.
/**
 * Appearance (M12 FR-108): the accent colour. Until M17 this page also held System / Light /
 * Dark; M17 (constitution v3.0.0, owner 2026-10-03: "remove it") made the app light only, so
 * only the accent picker is left. The choice is stored ('pref.accent') and applied at once.
 *
 * M17 (`SettingsAppearance-B`, T083): the Editorial accent row — a serif "Accent colour" heading
 * and a sideways row of pills (swatch + name; the chosen one outlined in `text` with a tick).
 * B's theme preview and Light / Dark / Phone cards are not built: dark mode was removed.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { ACCENT_KEY, applyAccent, readAccent } from '@/design/accent';
import { ACCENTS, type AccentName } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PageHeader } from '@/ui/kit/PageHeader';

const SWATCH = { width: 36, height: 36 };
const TAP = { minHeight: hit.min };

export default function AppearanceScreen(): React.ReactElement {
  const stores = useStores();
  // M12 FR-108: the accent theme, applied at once and kept across restarts.
  const [accent, setAccent] = useState<AccentName>(() => readAccent(stores.settings));
  const pick = (a: AccentName) => { stores.settings.set(ACCENT_KEY, a); setAccent(a); applyAccent(a); };
  return (
    <>
    <PageHeader title="Appearance" />
    <Box className="flex-1 bg-background pt-row">
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
    </Box>
    </>
  );
}
