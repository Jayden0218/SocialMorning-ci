// A round tap-able label; turns yellow (or dark) when chosen.
/**
 * M17 (contracts/ui-components.md, `SettingsOpml-B`, `Categories-B`): a round chip — white with
 * a thin border, or the yellow fill with dark words when chosen. At least 48 pt to tap.
 * M24 US18 (design-settings G10): `tone="dark"` is the `SettingsHelp-B` / `SettingsFeedback-B`
 * chip — chosen is dark #16130d with paper words.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };

export function Chip(props: { label: string; chosen?: boolean; onPress: () => void; accessibilityLabel?: string; tone?: 'yellow' | 'dark' }): React.ReactElement {
  const dark = props.tone === 'dark';
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.chosen === true }}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      className={`px-section rounded-pill items-center justify-center border ${props.chosen ? (dark ? 'bg-text border-text' : 'bg-primary border-primary') : 'bg-surface border-border'}`}
      style={TAP}
    >
      <Text className={props.chosen ? (dark ? 'text-background text-body font-bold' : 'text-onPrimary text-body font-bold') : 'text-text text-body font-semibold'}>{props.label}</Text>
    </Pressable>
  );
}
