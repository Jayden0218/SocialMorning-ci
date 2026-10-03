// A pill with two to four choices; the chosen one is yellow.
/**
 * M17 (`Following-B`, `History-B`, `Favourites-B`): a pill track of two to four choices; the
 * chosen one is the yellow fill with dark words. Spoken as tabs.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };

export function Segmented<T extends string>(props: {
  items: readonly { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}): React.ReactElement {
  return (
    <Box accessibilityRole="tablist" className={`flex-row gap-1 p-1 bg-surface border border-border rounded-pill ${props.className ?? ''}`}>
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            className={`flex-1 rounded-pill items-center justify-center ${on ? 'bg-primary' : ''}`}
            style={TAP}
          >
            <Text className={on ? 'text-onPrimary text-body font-bold' : 'text-muted text-body'}>{it.label}</Text>
          </Pressable>
        );
      })}
    </Box>
  );
}
