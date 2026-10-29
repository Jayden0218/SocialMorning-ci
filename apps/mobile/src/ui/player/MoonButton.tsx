// The player's moon button: opens the sleep timer and shows its time left.
/**
 * M21 US1 (FR-001, SC-002): the sleep timer is one tap from the player, not behind the speed
 * pill. M31 T024 (design-pulse2 `player--screen`, `player--sleep-timer-sheet`): a 44 button at the right
 * of the controls — the moon (24, always the outline glyph as drawn), text colour when off, hot-text when armed — and, while a timer runs,
 * the time left in mono 11 under it ("24:12", or "End" when only End of episode is on; nothing when off). The
 * spoken name still says what is armed. Its sheet is the `ActionSheet` titled "Sleep": the clock
 * (`SleepTimerControl` in its full layout), then Done.
 *
 * The one-second clock runs only while a minutes timer is armed (`useSleep`).
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { useColours } from '@/ui/kit/useColours';
import { mmss } from '@/ui/kit/format';
import { SleepTimerControl } from '@/ui/player/SleepTimerControl';
import { useSleep } from '@/ui/player/useRuntime';
import { PLAYER } from '@/ui/player/measures';

/** The drawn circle is 44; the finger gets 48. */
const MOON_SLOP = (hit.min - PLAYER.moon) / 2;
import { isTimerOff, type SleepTimer } from '@socialmorning/player-core';

/** What the button says: nothing armed → "Sleep" (not drawn since M31); a deadline → m:ss; End of episode alone → "End". */
export function moonLabel(timer: SleepTimer, remainingMs: number | undefined): string {
  if (remainingMs !== undefined) return mmss(remainingMs);
  return timer.endOfEpisode ? 'End' : 'Sleep';
}

/** The spoken name: says what is armed, not only the number. */
export function moonA11y(timer: SleepTimer, remainingMs: number | undefined): string {
  if (isTimerOff(timer)) return 'Sleep timer, off';
  if (remainingMs !== undefined) return `Sleep timer, pausing in ${mmss(remainingMs)}`;
  return 'Sleep timer, stops at the end of this episode';
}

export function MoonButton(): React.ReactElement {
  const c = useColours();
  const [open, setOpen] = useState(false);
  const { timer, remainingMs: remaining, armed } = useSleep();
  const label = moonLabel(timer, remaining);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={moonA11y(timer, remaining)} className="items-center justify-center" hitSlop={MOON_SLOP} style={{ height: PLAYER.moon, width: PLAYER.moon }}>
        <Icon name="moon-outline" size={PLAYER.moonGlyph} color={armed ? c.hotText : c.text} />
        {armed ? <Box className="absolute" style={{ bottom: 0 }}><Type step="badge" className="text-hotText" style={{ fontSize: PLAYER.tileDetail, lineHeight: PLAYER.tileDetailLine }}>{label}</Type></Box> : null}
      </Pressable>
      <ActionSheet open={open} onClose={() => setOpen(false)} label="Sleep" title="Sleep">
        <SleepTimerControl />
        <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center rounded-pill bg-text" style={{ height: hit.min }}>
          <Type step="row" className="text-void">Done</Type>
        </Pressable>
      </ActionSheet>
    </>
  );
}
