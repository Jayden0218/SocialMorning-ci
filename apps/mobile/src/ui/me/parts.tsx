/**
 * Pieces of the Me tab and its pages (M10, owner 2026-09-27): a menu row (picture, label,
 * an optional note or badge, a chevron), and the empty state with a large picture and one
 * muted line, as in the reference.
 */
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colour, hit } from '../../design';
import { Icon, type IconName } from '../Icon';

const TAP = { minHeight: hit.min + 8 };

export function MenuRow(props: { href: string; icon: IconName; label: string; note?: string; badge?: number }): React.ReactElement {
  const spoken = [props.label, props.badge ? `${props.badge} new` : undefined, props.note].filter(Boolean).join(', ');
  return (
    <Link href={props.href as never} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={spoken} className="flex-row items-center gap-section" style={TAP}>
        <View className="w-7 items-center"><Icon name={props.icon} size={22} color={colour.text} /></View>
        <Text className="text-text text-sm flex-1">{props.label}</Text>
        {props.note ? <Text className="text-muted text-xs" numberOfLines={1}>{props.note}</Text> : null}
        {props.badge ? (
          <View className="bg-accent rounded-pill min-w-6 h-6 px-1 items-center justify-center"><Text className="text-onPrimary text-xs font-bold">{props.badge > 99 ? '99+' : props.badge}</Text></View>
        ) : null}
        <Text className="text-muted text-base">›</Text>
      </Pressable>
    </Link>
  );
}

export function EmptyPicture(props: { icon: IconName; line: string }): React.ReactElement {
  return (
    <View className="flex-1 items-center justify-center py-24 gap-section" accessible accessibilityLabel={props.line}>
      <View className="w-28 h-28 rounded-pill bg-surface items-center justify-center"><Icon name={props.icon} size={44} color={colour.muted} /></View>
      <Text className="text-muted text-sm">{props.line}</Text>
    </View>
  );
}
