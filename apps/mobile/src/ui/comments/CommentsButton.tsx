// Comment icon with the comment count under an Updates row.
/**
 * The comment icon under an Updates row, with how many comments the episode has (M12
 * FR-080). No count yet, or none at all → the icon alone, never a "0". M31 W2-B: the count is mono hot text (Updates deck's
 * action row); the props and names are unchanged.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export function CommentsButton(props: { title: string; count?: number; colour: string; onPress: () => void }): React.ReactElement {
  const n = props.count ?? 0;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={n > 0 ? `Comments on ${props.title}, ${plural(n, 'comment')}` : `Comments on ${props.title}`} className="flex-row items-center gap-hair justify-center pr-section" style={TAP}>
      <Icon name="chatbubble-outline" size={20} color={props.colour} />
      {n > 0 ? <Type step="mono" className="text-hotText">{n > 999 ? '999+' : n}</Type> : null}
    </Pressable>
  );
}
