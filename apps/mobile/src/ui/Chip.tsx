/** A small selectable pill — speeds, sleep lengths, filters (M7 FR-007). */
import { Pressable, Text } from 'react-native';

export function Chip(props: { label: string; selected?: boolean; onPress: () => void; accessibilityLabel?: string; className?: string }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ selected: props.selected === true }}
      className={`min-h-12 px-section justify-center rounded-pill border ${props.selected ? 'bg-primary border-primary' : 'border-separator'} ${props.className ?? ''}`}
    >
      <Text className={props.selected ? 'text-onPrimary text-xs font-semibold' : 'text-muted text-xs font-semibold'}>{props.label}</Text>
    </Pressable>
  );
}
