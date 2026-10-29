// The small drawn parts the account pages share: the tick box.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `cbox`): a 22 box with a radius of 7. Ticked it is the hot fill with a void tick;
 * unticked a 1.5 rim of `authColour.boxRim`. The drawn box is under the 48 touch floor, so the tap area reaches it through
 * `TICK_SLOP` (13 each side) and the box stays as drawn. The state is also `accessibilityState.checked`, never the colour alone.
 */
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { authColour } from '@/design/tokens';
import { Icon } from '@/ui/kit/Icon';
import { AUTH } from './measures';

const SLOP = Math.ceil((hit.min - AUTH.box.size) / 2);
const HIT = { top: SLOP, bottom: SLOP, left: SLOP, right: SLOP };

export function TickBox(props: { on: boolean }): React.ReactElement {
  return (
    <Box
      testID="tick-box"
      className={`items-center justify-center ${props.on ? 'bg-hot' : ''}`}
      style={{ width: AUTH.box.size, height: AUTH.box.size, borderRadius: AUTH.box.radius, ...(props.on ? null : { borderWidth: AUTH.box.rim, borderColor: authColour.boxRim }) }}
    >
      {props.on ? <Icon name="checkmark" size={AUTH.box.size - 7} color={colour.void} /> : null}
    </Box>
  );
}

/** The tap area round the box: 13 each side makes the 22 box a 48 target. A page puts it on its own `Pressable` (so the action inventory sees the checkbox by its name). */
export const TICK_SLOP = HIT;
