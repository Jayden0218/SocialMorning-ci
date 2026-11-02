// The timestamp chip: a time like 14:32 in mono on a hot-tinted pill; tapping it plays from there.
/**
 * M31 T022 (design-pulse2 `.ts`, `.ts.solid`): Geist Mono 12, 22 tall, 7 pt of padding each side,
 * a 7 radius. Soft → hot at 16 % with hot-text words (7.25); solid → the hot fill with void words
 * (6.30) — the hot tag on a Moments card ("HOT · 14:32 – 15:10"). With `onPress` it is a button
 * with a 44 pt tap area (hitSlop 11 above and below the drawn 22) named "Play from 14:32".
 * M31 F2a: minutes are written with two digits, as drawn ("06:10", `chipClock`); the spoken name keeps the plain time.
 */
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { bars } from '@/design';
import { Type, TYPE_CAP } from './Type';
import { chipClock } from './format';

const CHIP = { minHeight: bars.stamp, paddingHorizontal: bars.stampPad, justifyContent: 'center' as const };
/** Geist Mono's advance in em: every glyph is as wide as a digit. */
const MONO_EM = 0.62;
const SLOP = { top: 11, bottom: 11, left: 4, right: 4 };
/** 036 T015: the pressable is a 44 frame (what Maestro and VoiceOver read) around the drawn 22 pill; -11 above and below keeps the row as drawn. */
const FRAME = { minHeight: bars.circle, marginVertical: -(bars.circle - bars.stamp) / 2, justifyContent: 'center' as const, alignSelf: 'flex-start' as const };

export function TimestampChip(props: { text: string; solid?: boolean; onPress?: () => void; accessibilityLabel?: string }): React.ReactElement {
  const { fontScale } = useWindowDimensions();
  const shown = chipClock(props.text);
  // 035 L2: a one-line pill in a row was squeezed to "00:…". It may not shrink, and keeps room for its whole time at the scale the type cap allows.
  const fit = { flexShrink: 0, minWidth: Math.ceil(shown.length * MONO_EM * 12 * Math.min(fontScale, TYPE_CAP) + bars.stampPad * 2) };
  const body = (
    <Type step="mono" className={props.solid ? 'text-void' : 'text-hotText'} numberOfLines={1}>{shown}</Type>
  );
  const cls = `rounded-chip self-start ${props.solid ? 'bg-hot' : 'bg-hotSoft'}`;
  if (!props.onPress) return <Box className={cls} style={[CHIP, fit]}>{body}</Box>;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? `Play from ${props.text}`} hitSlop={SLOP} style={[FRAME, fit]}>
      <Box className={cls} style={CHIP}>{body}</Box>
    </Pressable>
  );
}
