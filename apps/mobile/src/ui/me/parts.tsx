/**
 * Pieces of the Me tab and its pages (M10, owner 2026-09-27): a menu row (picture, label,
 * an optional note or badge, a chevron), and the empty state with a large picture and one
 * muted line, as in the reference.
 */
import { Link } from 'expo-router';
import { Pressable } from '../lib/pressable';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { colour, size } from '../../design';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { Icon, type IconName } from '../Icon';

/** M12 FR-050: one row height for every list (was hit.min + 8 = 56). */
const TAP = { minHeight: size.row };

export function MenuRow(props: { href: string; icon: IconName; label: string; note?: string; badge?: number }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const spoken = [props.label, props.badge ? `${props.badge} new` : undefined, props.note].filter(Boolean).join(', ');
  return (
    <Link href={props.href as never} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
        <Box className="w-7 items-center"><Icon name={props.icon} size={22} color={c.text} /></Box>
        <Text className="text-text text-sm flex-1">{props.label}</Text>
        {props.note ? <Text className="text-muted text-xs" numberOfLines={1}>{props.note}</Text> : null}
        {props.badge ? (
          <Box className="bg-accent rounded-pill min-w-6 h-6 px-1 items-center justify-center"><Text className="text-onPrimary text-xs font-bold">{props.badge > 99 ? '99+' : props.badge}</Text></Box>
        ) : null}
        <Text className="text-muted text-base">›</Text>
      </Pressable>
    </Link>
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
