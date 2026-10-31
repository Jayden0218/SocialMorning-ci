// A pill with two to four choices; the chosen one is filled.
/**
 * A pill track of two to four choices; the chosen one is the filled choice (`primary`, void words).
 * Spoken as tabs. Each choice is 40 pt with 13 pt words on one line; the tap stays 48 pt: the
 * track's 4 pt rim plus `hitSlop` make up the 8 pt the 40 pt choice lacks.
 *
 * M31 T101 (converge G28): the Editorial `tone` variants (`yellow`, and `dark` for Comments / Show)
 * had no callers and were deleted; there is one look. `scripts/retired-check.mjs` keeps them out.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/kit/Text';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { Icon, type IconName } from './Icon';

/** The B choice height; with the rim and the slop the tap is still `hit.min`. */
export const SEGMENT_HEIGHT = 40;
const CHOICE = { minHeight: SEGMENT_HEIGHT };
const SLOP = { top: (hit.min - SEGMENT_HEIGHT) / 2, bottom: (hit.min - SEGMENT_HEIGHT) / 2 };

const TRACK = 'bg-segment';
const ON = 'bg-primary';
const ON_WORDS = 'text-onPrimary text-meta font-bold';

export function Segmented<T extends string>(props: {
  /** `icon` (optional, owner 2026-10-04): drawn before the label, as on Notifications' switch. */
  items: readonly { value: T; label: string; accessibilityLabel?: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}): React.ReactElement {
  return (
    <Box accessibilityRole="tablist" className={`flex-row gap-hair p-hair rounded-pill ${TRACK} ${props.className ?? ''}`}>
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            className={`flex-1 flex-row gap-gap px-hair rounded-pill items-center justify-center ${on ? ON : ''}`}
            style={CHOICE}
            hitSlop={SLOP}
          >
            {it.icon ? <Icon name={it.icon} size={16} color={on ? colour.onPrimary : colour.muted} /> : null}
            <Text className={on ? ON_WORDS : 'text-muted text-meta font-medium'} numberOfLines={1}>{it.label}</Text>
          </Pressable>
        );
      })}
    </Box>
  );
}
