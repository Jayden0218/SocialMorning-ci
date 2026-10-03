/**
 * M17 (contracts/ui-components.md, `SettingsOpml-B`, `Categories-B`): a round chip — white with
 * a thin border, or the yellow fill with dark words when chosen. At least 48 pt to tap.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };

export function Chip(props: { label: string; chosen?: boolean; onPress: () => void; accessibilityLabel?: string }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.chosen === true }}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      className={`px-section rounded-pill items-center justify-center border ${props.chosen ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
      style={TAP}
    >
      <Text className={props.chosen ? 'text-onPrimary text-body font-bold' : 'text-text text-body font-semibold'}>{props.label}</Text>
    </Pressable>
  );
}
