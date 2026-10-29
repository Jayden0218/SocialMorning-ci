// Reads the speed and the sleep timer from the player, redrawing only when they change.
/**
 * M31 T024 (review C4). The old page called `player.rate()` and `player.sleepRemainingMs()` while it
 * re-rendered on every TICK, so the speed label and the moon's countdown were fresh by accident.
 * The page no longer re-renders per TICK, so these hooks subscribe on purpose:
 *   - `useRate()`  — the rate in force; the runtime tells its listeners when it changes.
 *   - `useSleep()` — the timer and the time left; a one-second clock runs ONLY while a minutes
 *     timer is armed (the old `useSecondTick` ran for ever).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isTimerOff, type SleepTimer } from '@socialmorning/player-core';
import { usePlayer } from '@/playback/store';

export function useRate(): number {
  const player = usePlayer();
  return useSyncExternalStore(player.subscribe, player.rate, player.rate);
}

export type SleepView = { timer: SleepTimer; remainingMs: number | undefined; armed: boolean };

/** The timer as one string, so the store snapshot is a primitive that only changes when the timer does. */
const timerKey = (t: SleepTimer): string => `${t.deadline ?? ''}|${t.minutes ?? ''}|${t.endOfEpisode}`;

export function useSleep(): SleepView {
  const player = usePlayer();
  const read = () => timerKey(player.sleepTimer());
  useSyncExternalStore(player.subscribe, read, read);
  const timer = player.sleepTimer();
  const [, force] = useState(0);
  const counting = timer.deadline !== undefined;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [counting]);
  const remainingMs = player.sleepRemainingMs();
  return { timer, remainingMs, armed: !isTimerOff(timer) };
}
