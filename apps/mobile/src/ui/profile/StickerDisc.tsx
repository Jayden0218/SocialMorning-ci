// A sticker as a disc: the premium tint with a hot ring and a hot-text mark when earned, faint when not.
/**
 * M31 W4-A (T050; design-pulse2 social.html `stk()`): a circle `size` wide, the tint `premiumTint` and a 2 hot ring with the mark in
 * hot-text when it is on; the raise fill, a line ring and the idle colour when it is not. It can be turned (`rotate`, degrees) as the
 * hero tile and the decorate stage float it. Decoration: the tile it sits in says what it is.
 */
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';

export function StickerDisc(props: { icon: IconName; size: number; on?: boolean; rotate?: number; ring?: number; testID?: string }): React.ReactElement {
  const on = props.on !== false;
  return (
    <Box
      testID={props.testID ?? 'sticker-disc'}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className={`items-center justify-center ${on ? 'bg-premiumTint border-hot' : 'bg-raise border-line'}`}
      style={{ width: props.size, height: props.size, borderRadius: props.size / 2, borderWidth: props.ring ?? 2, ...(props.rotate ? { transform: [{ rotate: `${props.rotate}deg` }] } : {}) }}
    >
      <Icon name={props.icon} size={Math.round(props.size * 0.5)} color={on ? colour.hotText : colour.idle} />
    </Box>
  );
}
