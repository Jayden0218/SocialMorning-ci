// A round tap-able label; turns yellow when chosen.
/**
 * M17 (contracts/ui-components.md, `SettingsOpml-B`, `Categories-B`): a round chip. M31 T022
 * (design-pulse2 `kit.css` `.chip`): 36 tall, a full pill, 14 pt of padding each side, a raise
 * fill with a 1 px line, the words Geist 600 13/18 in text colour; chosen → the text fill with
 * void words (18.11). The drawn chip is 36, under the 44 touch floor, so the tap area reaches
 * 44 by `hitSlop` (4 above and below) and the chip's own height stays as drawn.
 * M31 D-A: an empty `label` with an `icon` is an icon-only chip (Subscriptions' search chip); its spoken name is `accessibilityLabel`.
 * M24 US18 (design-settings G10): `tone="dark"` is the `SettingsHelp-B` / `SettingsFeedback-B`
 * chip — in Pulse both tones are the same light chosen chip; the prop stays so callers compile.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { bars } from '@/design';
import { Icon, type IconName } from './Icon';
import { Type } from './Type';
import { useColours } from './useColours';

const CHIP = { height: bars.chip, paddingHorizontal: bars.chipPad };
/** The Show screen's chip row is drawn tighter so four fit (design-pulse2 `showBody`: padding 0 10, Geist 600 12). */
const COMPACT = { height: bars.chip, paddingHorizontal: 10 };
/** The drawn `.new` badge: Geist Mono 600 10, 3 / 6 of padding, radius 5, hot fill with void words, 2 after the label. */
const TAG = { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5, marginLeft: 2 };
/** The drawn `.chip` gap between the glyph and the words. */
const ICON_GAP = { gap: 6 };
const SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

/** M31 W4-B: `icon` draws a 16 glyph before the words, 6 apart (`.chip` is `inline-flex; gap: 6px`: the status composer's Add episode / Add photo). */
export function Chip(props: { label: string; chosen?: boolean; onPress: () => void; accessibilityLabel?: string; tone?: 'yellow' | 'dark'; icon?: IconName; disabled?: boolean; /** Tighter padding and the 12 pt `chip` step (the Show screen's row of four). */ compact?: boolean; /** A hot badge after the words ("NEW"); a caller names it in its own accessibilityLabel. */ tag?: string }): React.ReactElement {
  const chosen = props.chosen === true;
  const c = useColours();
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={props.disabled === undefined ? { selected: chosen } : { selected: chosen, disabled: props.disabled }}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      hitSlop={SLOP}
      className={`rounded-pill flex-row items-center justify-center border ${chosen ? 'bg-text border-text' : 'bg-raise border-line'} ${props.disabled === true ? 'opacity-40' : ''}`}
      style={props.icon && props.label !== '' ? [props.compact ? COMPACT : CHIP, ICON_GAP] : props.compact ? COMPACT : CHIP}
    >
      {props.icon ? <Icon name={props.icon} size={16} color={chosen ? c.void : c.text} /> : null}
      {props.label !== '' ? <Type step={props.compact ? 'chip' : 'caption'} className={chosen ? 'text-void font-semibold' : 'text-text font-semibold'} numberOfLines={1}>{props.label}</Type> : null}
      {props.tag ? <Box className="bg-hot" style={TAG} accessible={false} importantForAccessibility="no-hide-descendants"><Type step="badge" className="text-void">{props.tag}</Type></Box> : null}
    </Pressable>
  );
}
