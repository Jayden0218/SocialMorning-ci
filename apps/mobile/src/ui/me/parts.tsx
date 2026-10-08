// Me page pieces: a menu row with icon and arrow, and an empty-page picture.
/**
 * Pieces of the Me tab and its pages (M10, owner 2026-09-27; Editorial sizes since M17 — they
 * sit inside a `Card`): a menu row (picture, label,
 * an optional note or badge, a chevron), and the empty state with a large picture and one
 * muted line, as in the reference.
 */
import { Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, size } from '@/design';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { Icon, type IconName } from '@/ui/kit/Icon';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };

/** `onPress` (M17) replaces the link — e.g. Wallet opening Coming soon; `href` stays the row's real place. */
export function MenuRow(props: { href: string; icon: IconName; label: string; note?: string; badge?: number; onPress?: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const spoken = [props.label, props.badge ? `${props.badge} new` : undefined, props.note].filter(Boolean).join(', ');
  const body = (
    <>
      <Box className="w-7 items-center"><Icon name={props.icon} size={20} color={c.accent} /></Box>
      <Text className="text-text text-body flex-1">{props.label}</Text>
      {props.note ? <Text className="text-muted text-xs" numberOfLines={1}>{props.note}</Text> : null}
      {props.badge ? (
        <Box className="bg-accent rounded-pill min-w-6 h-6 px-1 items-center justify-center"><Text className="text-background text-xs font-bold">{props.badge > 99 ? '99+' : props.badge}</Text></Box>
      ) : null}
      <Icon name="chevron-forward" size={16} color={c.muted} />
    </>
  );
  if (props.onPress) {
    return <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>{body}</Pressable>;
  }
  return (
    <Link href={props.href as never} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>{body}</Pressable>
    </Link>
  );
}

/**
 * A tile is 64 pt tall at the default text size (`Me-B`), and grows with it. M24 US18: the
 * settings hub's tiles (`Account-B`, design-settings) are `large` — 84 pt, 14 pt padding, a 24 pt
 * icon and a 14 / 700 label that wraps to 2 lines ("Downloads and cache" was cut).
 */
const TILE = {
  regular: { box: { minHeight: 64 }, pad: 'p-row', icon: 22 },
  large: { box: { minHeight: 84, padding: 14 }, pad: '', icon: 24 },
} as const;

/**
 * M17 (`Me-B`): one tile of the Me tab's two-column grid — a white card with a thin border, the
 * icon in the accent at the top, the label under it, an optional count badge in the corner.
 * Used as the child of `<Link href=… asChild>` on the screen, so the screen keeps each literal
 * destination (tap-counts, the action inventory); the Link's press and ref pass through `rest`;
 * the tile's own spoken name (with its count) wins over the Link's static label.
 */
export function MenuTile({ icon, label, badge, size, ...rest }: { icon: IconName; label: string; badge?: number; size?: keyof typeof TILE } & Omit<ComponentProps<typeof Pressable>, 'children'>): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const spoken = [label, badge ? `${badge} new` : undefined].filter(Boolean).join(', ');
  const t = TILE[size ?? 'regular'];
  return (
    <Pressable {...rest} accessibilityRole="link" accessibilityLabel={spoken} className={`flex-1 bg-surface border border-border rounded-row justify-between gap-1.5 ${t.pad}`} style={t.box}>
      <Icon name={icon} size={t.icon} color={c.accent} />
      <Text className={size === 'large' ? 'text-text text-body font-bold' : 'text-text text-meta font-semibold'} numberOfLines={2}>{label}</Text>
      {badge ? (
        <Box className="absolute top-2 right-2 bg-accent rounded-pill min-w-6 h-6 px-1 items-center justify-center"><Text className="text-background text-xs font-bold">{badge > 99 ? '99+' : badge}</Text></Box>
      ) : null}
    </Pressable>
  );
}

export function EmptyPicture(props: { icon: IconName; line: string }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  return (
    <Box className="flex-1 items-center justify-center py-24 gap-section" accessible accessibilityLabel={props.line}>
      <Box className="w-28 h-28 rounded-pill bg-surface items-center justify-center"><Icon name={props.icon} size={44} color={c.muted} /></Box>
      <Text className="text-muted text-sm text-center px-screen-x">{props.line}</Text>
    </Box>
  );
}
