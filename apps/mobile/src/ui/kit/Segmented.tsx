// A pill with two to four choices; the chosen one is yellow.
/**
 * M17 (`Following-B`, `History-B`, `Favourites-B`): a pill track of two to four choices; the
 * chosen one is the yellow fill with dark words. Spoken as tabs.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { Icon, type IconName } from './Icon';

const TAP = { minHeight: hit.min };

export function Segmented<T extends string>(props: {
  /** `icon` (optional, owner 2026-10-04): drawn before the label, as on Notifications' switch. */
  items: readonly { value: T; label: string; accessibilityLabel?: string; icon?: IconName }[];
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
            className={`flex-1 flex-row gap-1.5 rounded-pill items-center justify-center ${on ? 'bg-primary' : ''}`}
            style={TAP}
          >
            {it.icon ? <Icon name={it.icon} size={16} color={on ? colour.onPrimary : colour.muted} /> : null}
            <Text className={on ? 'text-onPrimary text-body font-bold' : 'text-muted text-body'}>{it.label}</Text>
          </Pressable>
        );
      })}
    </Box>
  );
}
