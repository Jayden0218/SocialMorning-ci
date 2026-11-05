// One of the four equal tiles on Me: a glyph over the name and a count.
/** Spec 039 US2 (`design/B-Me.dc.html` `.tile`): raise fill (hot for the accent tile), radius 22, padding 16; as tall as the drawing's 104 at the default text size, and growing with it. */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { colour, radius, spacing } from '@/design';
import type { ComponentProps } from 'react';

export const TILE_HEIGHT = spacing.region * 2 + spacing.gap;
const TILE = { flex: 1, minHeight: TILE_HEIGHT, borderRadius: radius.artworkLarge, padding: spacing.section, justifyContent: 'space-between' } as const;

export function MeTile({ icon, label, count, accent, spoken, ...rest }: { icon: IconName; label: string; count?: number; accent?: boolean; /** The spoken name when it says more than the label. */ spoken?: string } & Omit<ComponentProps<typeof Pressable>, 'children'>): React.ReactElement {
  const words = accent ? 'text-void' : 'text-text';
  return (
    <Pressable {...rest} accessibilityRole="link" accessibilityLabel={spoken ?? (count === undefined ? label : `${label}, ${count}`)} className={accent ? 'bg-hot' : 'bg-raise'} style={TILE}>
      <Icon name={icon} size={spacing.block} color={accent ? colour.void : colour.text} />
      <Box>
        <Type step="strong" className={words} numberOfLines={2}>{label}</Type>
        {count !== undefined ? <Type step="heading" className={words} testID={accent ? 'moments-count' : undefined}>{String(count)}</Type> : null}
      </Box>
    </Pressable>
  );
}
