// The "I am 14 or older" tick box on the new-account step, and the "I am under 14" way out.
/**
 * M25 L3e: drawn under the name field on the email page's last step (a new account only). M31 S-C (T061; design-pulse2
 * `emailPage` name step): the 22 tick box beside "I am 14 or older" (Geist 500 14 on 20), 10 apart, and under it the underlined
 * "I am under 14" (Geist 600 14, text-2) — a button with a 48 touch area. "I am under 14" shows the plain line in
 * `UNDER_AGE_TEXT` and the page creates nothing.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { hit } from '@/design';
import { AGE_LINE, MIN_AGE } from './age';
import { AUTH, AUTH_TYPE } from './measures';
import { TICK_SLOP, TickBox } from './parts';

const SLOP = Math.ceil((hit.min - AUTH_TYPE.age.lineHeight) / 2);

export function AgeConfirm(props: { confirmed: boolean; onToggle: () => void; onUnder: () => void }): React.ReactElement {
  return (
    <Box style={{ gap: AUTH.bodyGap }}>
      <Box className="flex-row items-center" style={{ gap: AUTH.box.gap }}>
        <Pressable onPress={props.onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: props.confirmed }} accessibilityLabel={AGE_LINE} hitSlop={TICK_SLOP}>
          <TickBox on={props.confirmed} />
        </Pressable>
        <Type step="note" className="text-text flex-1" style={AUTH_TYPE.age} onPress={props.onToggle}>{AGE_LINE}</Type>
      </Box>
      <Pressable onPress={props.onUnder} accessibilityRole="button" accessibilityLabel={`I am under ${MIN_AGE}`} hitSlop={{ top: SLOP, bottom: SLOP, left: SLOP, right: SLOP }} className="self-start">
        <Type step="compact" className="text-text2 underline" style={AUTH_TYPE.age}>{`I am under ${MIN_AGE}`}</Type>
      </Pressable>
    </Box>
  );
}
