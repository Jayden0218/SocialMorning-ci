/**
 * The comment icon under an Updates row, with how many comments the episode has (M12
 * FR-080). No count yet, or none at all → the icon alone, never a "0".
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export function CommentsButton(props: { title: string; count?: number; colour: string; onPress: () => void }): React.ReactElement {
  const n = props.count ?? 0;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={n > 0 ? `Comments on ${props.title}, ${plural(n, 'comment')}` : `Comments on ${props.title}`} className="flex-row items-center gap-1 justify-center pr-section" style={TAP}>
      <Icon name="chatbubble-outline" size={20} color={props.colour} />
      {n > 0 ? <Text className="text-accent text-sm">{n > 999 ? '999+' : n}</Text> : null}
    </Pressable>
  );
}
