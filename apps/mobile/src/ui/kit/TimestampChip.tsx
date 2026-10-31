// The timestamp chip: a time like 14:32 in mono on a hot-tinted pill; tapping it plays from there.
/**
 * M31 T022 (design-pulse2 `.ts`, `.ts.solid`): Geist Mono 12, 22 tall, 7 pt of padding each side,
 * a 7 radius. Soft → hot at 16 % with hot-text words (7.25); solid → the hot fill with void words
 * (6.30) — the hot tag on a Moments card ("HOT · 14:32 – 15:10"). With `onPress` it is a button
 * with a 44 pt tap area (hitSlop 11 above and below the drawn 22) named "Play from 14:32".
 * M31 F2a: minutes are written with two digits, as drawn ("06:10", `chipClock`); the spoken name keeps the plain time.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { bars } from '@/design';
import { Type } from './Type';
import { chipClock } from './format';

const CHIP = { minHeight: bars.stamp, paddingHorizontal: bars.stampPad, justifyContent: 'center' as const };
const SLOP = { top: 11, bottom: 11, left: 4, right: 4 };

export function TimestampChip(props: { text: string; solid?: boolean; onPress?: () => void; accessibilityLabel?: string }): React.ReactElement {
  const body = (
    <Type step="mono" className={props.solid ? 'text-void' : 'text-hotText'} numberOfLines={1}>{chipClock(props.text)}</Type>
  );
  const cls = `rounded-chip self-start ${props.solid ? 'bg-hot' : 'bg-hotSoft'}`;
  if (!props.onPress) return <Box className={cls} style={CHIP}>{body}</Box>;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? `Play from ${props.text}`} hitSlop={SLOP} className={cls} style={CHIP}>
      {body}
    </Pressable>
  );
}
