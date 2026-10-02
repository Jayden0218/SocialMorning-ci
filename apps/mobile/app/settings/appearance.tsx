/**
 * Appearance (M12 FR-108): the accent colour. Until M17 this page also held System / Light /
 * Dark; M17 (constitution v3.0.0, owner 2026-10-03: "remove it") made the app light only, so
 * only the accent picker is left. The choice is stored ('pref.accent') and applied at once.
 */
import { useState } from 'react';
import { Pressable } from '../../src/ui/lib/pressable';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { size } from '../../src/design';
import { useStores } from '../../src/ui/providers';
import { ACCENT_KEY, applyAccent, readAccent } from '../../src/design/accent';
import { ACCENTS, type AccentName } from '../../src/design';
import { Icon } from '../../src/ui/Icon';
import { PageHeader } from '../../src/ui/PageHeader';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };
export default function AppearanceScreen(): React.ReactElement {
  const stores = useStores();
  // M12 FR-108: the accent theme, applied at once and kept across restarts.
  const [accent, setAccent] = useState<AccentName>(() => readAccent(stores.settings));
  const pick = (a: AccentName) => { stores.settings.set(ACCENT_KEY, a); setAccent(a); applyAccent(a); };
  return (
    <>
    <PageHeader title="Appearance" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Text className="text-muted text-xs mb-row" accessibilityRole="header">Accent colour</Text>
      <Box className="flex-row flex-wrap gap-section">
        {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
          const t = ACCENTS[name];
          const on = accent === name;
          return (
            <Pressable key={name} onPress={() => pick(name)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Accent: ${t.label}`} className="items-center gap-1 w-16" style={TAP}>
              <Box className={`w-12 h-12 rounded-pill items-center justify-center ${on ? 'border-2 border-text' : ''}`} style={{ backgroundColor: t.light.primary }}>
                {on ? <Icon name="checkmark" size={22} color={t.light.onPrimary} /> : null}
              </Box>
              <Text className={on ? 'text-text text-xs font-semibold' : 'text-muted text-xs'}>{t.label}</Text>
            </Pressable>
          );
        })}
      </Box>
    </ScrollView>
    </>
  );
}
