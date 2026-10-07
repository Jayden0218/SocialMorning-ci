// A pill with two to four choices; the chosen one is yellow.
/**
 * M17 (`Following-B`, `History-B`, `Favourites-B`): a pill track of two to four choices; the
 * chosen one is the yellow fill with dark words. Spoken as tabs.
 *
 * M24 US18 (design-core cause 2): the B track is beige #f1ebdd with no border, each choice 40 pt
 * with 13 pt words on one line. `tone="dark"` is the `Comments-B` / `Show-B` form: a white track
 * with a thin border and the chosen choice dark #16130d with paper words. The tap stays 48 pt:
 * the track's 4 pt rim plus `hitSlop` make up the 8 pt the 40 pt choice lacks.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { Icon, type IconName } from './Icon';

/** The B choice height; with the rim and the slop the tap is still `hit.min`. */
export const SEGMENT_HEIGHT = 40;
const CHOICE = { minHeight: SEGMENT_HEIGHT };
const SLOP = { top: (hit.min - SEGMENT_HEIGHT) / 2, bottom: (hit.min - SEGMENT_HEIGHT) / 2 };

const LOOK = {
  yellow: { track: 'bg-surface border border-border', on: 'bg-primary', words: 'text-onPrimary text-meta font-bold', icon: colour.onPrimary },
  dark: { track: 'bg-surface border border-border', on: 'bg-text', words: 'text-background text-meta font-bold', icon: colour.background },
} as const;

export function Segmented<T extends string>(props: {
  /** `icon` (optional, owner 2026-10-04): drawn before the label, as on Notifications' switch. */
  items: readonly { value: T; label: string; accessibilityLabel?: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** `yellow` (default: History, Favourites, Subscriptions, Category) or `dark` (Comments, Show). */
  tone?: keyof typeof LOOK;
}): React.ReactElement {
  const look = LOOK[props.tone ?? 'yellow'];
  return (
    <Box accessibilityRole="tablist" className={`flex-row gap-1 p-1 rounded-pill ${look.track} ${props.className ?? ''}`}>
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            className={`flex-1 flex-row gap-1.5 px-1 rounded-pill items-center justify-center ${on ? look.on : ''}`}
            style={CHOICE}
            hitSlop={SLOP}
          >
            {it.icon ? <Icon name={it.icon} size={16} color={on ? look.icon : colour.muted} /> : null}
            <Text className={on ? look.words : 'text-muted text-meta font-medium'} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        );
      })}
    </Box>
  );
}
