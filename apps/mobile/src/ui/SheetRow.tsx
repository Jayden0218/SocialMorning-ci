/**
 * One row of an action sheet (M12 FR-032): full width, 50 pt, a leading icon, the label, and
 * an optional muted detail on the right. The episode ⋯ sheet used 32 pt pill chips in wrapping
 * rows with text links under them — under the 44 pt floor and hard to scan.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from './Icon';
import { size } from '@/design';

const ROW = { minHeight: size.row };

export function SheetRow(props: { icon: IconName; label: string; detail?: string; iconColour: string; onPress?: () => void; accessibilityLabel?: string; selected?: boolean; tone?: 'normal' | 'accent' | 'muted' }): React.ReactElement {
  const label = props.tone === 'accent' ? 'text-accent text-body flex-1' : props.tone === 'muted' ? 'text-muted text-body flex-1' : 'text-text text-body flex-1';
  const body = (
    <>
      <Icon name={props.icon} size={20} color={props.iconColour} />
      <Text className={label}>{props.label}</Text>
      {props.detail ? <Text className="text-muted text-meta">{props.detail}</Text> : null}
    </>
  );
  if (!props.onPress) {
    return <Box className="flex-row items-center gap-section border-b-hairline border-separator" style={ROW} accessible accessibilityLabel={props.accessibilityLabel ?? props.label}>{body}</Box>;
  }
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      {...(props.selected !== undefined ? { accessibilityState: { selected: props.selected } } : {})}
      className="flex-row items-center gap-section border-b-hairline border-separator"
      style={ROW}
    >
      {body}
    </Pressable>
  );
}
