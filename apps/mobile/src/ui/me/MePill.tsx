// A place Me opens, as a pill: the child of a `<Link asChild>` on the screen, or (Wallet while purchases are off) a button that opens Coming soon first.
/** Spec 039 US2: the pill is the Chip's look (36 drawn, 44 to touch, raise2 fill, 1 px line, Geist 600 13). The screen wraps it in a `Link` with the literal href (as the tiles are), so the router, VoiceOver, the tap-count contract and the action inventory see where it goes; the Link's press and ref pass through `rest`. */
import type { ComponentProps } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { bars, colour } from '@/design';

const PILL = { minHeight: bars.circle, minWidth: bars.circle, paddingHorizontal: bars.chipPad, gap: 6 } as const;
const SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

export function MePill({ label, icon, badge, spoken, href, button, style, ...rest }: { label: string; icon?: IconName; badge?: number; spoken?: string; /** Where it goes (the testID; the screen's Link makes the press). */ href?: string; /** A button, not a link (Wallet while purchases are off). */ button?: boolean } & Omit<ComponentProps<typeof Pressable>, 'children'>): React.ReactElement {
  const name = spoken ?? (badge ? `${label}, ${badge} new` : label);
  return (
    <Pressable
      accessibilityRole={button ? 'button' : 'link'}
      {...(href ? { testID: `pill${href}` } : {})}
      hitSlop={SLOP}
      className="rounded-pill flex-row items-center justify-center border bg-raise2 border-line"
      {...rest}
      style={style ? [PILL, style as never] : PILL}
      accessibilityLabel={name}
    >
      {icon ? <Icon name={icon} size={16} color={colour.text} /> : null}
      <Type step="small" className="text-text font-semibold" numberOfLines={1}>{label}</Type>
      {badge ? (
        <Box className="bg-hot items-center justify-center rounded-pill" style={{ minWidth: 20, height: 20 }}>
          <Type step="tag" className="text-void font-semibold">{badge > 99 ? '99+' : badge}</Type>
        </Box>
      ) : null}
    </Pressable>
  );
}
