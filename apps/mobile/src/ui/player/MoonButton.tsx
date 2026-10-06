// The player's moon button: opens the sleep timer and shows its time left.
/**
 * M21 US1 (FR-001, SC-002): the sleep timer is one tap from the player, not behind the speed
 * pill. The button reads "Sleep" when nothing is armed, the time left (m:ss) while a minutes
 * timer runs, or "End" when only End of episode is on. Its sheet holds SleepTimerControl.
 */
import { useState } from 'react';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Icon } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { mmss } from '@/ui/kit/format';
import { usePlayer } from '@/playback/store';
import { SleepTimerControl, useSecondTick } from '@/ui/player/SleepTimerControl';
import { isTimerOff, type SleepTimer } from '@socialmorning/player-core';

/** What the button says: nothing armed → "Sleep"; a deadline → m:ss; End of episode alone → "End". */
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

export function MoonButton(props: { className: string; colour: string; activeColour: string }): React.ReactElement {
  const player = usePlayer();
  useSecondTick();
  const [open, setOpen] = useState(false);
  const timer = player.sleepTimer();
  const remaining = player.sleepRemainingMs();
  const armed = !isTimerOff(timer);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={moonA11y(timer, remaining)} className={props.className} style={{ minHeight: TAP.minHeight }}>
        <Icon name={armed ? 'moon' : 'moon-outline'} size={22} color={armed ? props.activeColour : props.colour} />
        {/* Same look as the bar's other labels (player.tsx BAR_LABEL). */}
        <Text className="text-xs font-semibold text-text">{moonLabel(timer, remaining)}</Text>
      </Pressable>
      <Actionsheet isOpen={open} onClose={() => setOpen(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row gap-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <SleepTimerControl />
          <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center rounded-pill bg-primary mt-1" style={{ minHeight: TAP.minHeight }}>
            <Text className="text-sm font-bold text-onPrimary">Done</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </>
  );
}
