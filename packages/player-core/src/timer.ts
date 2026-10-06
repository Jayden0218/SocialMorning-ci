// Sleep timer rules: set it, time left, when it fires, the fade, end of episode, restart.
import type { SleepChoice, SleepMinutes, SleepTimer } from './types';

/** Nothing armed. */
export const SLEEP_OFF: SleepTimer = { endOfEpisode: false };

/** M21 FR-005: the last 10 s fade to silence. */
export const FADE_MS = 10_000;

/**
 * FR-015 / M21 FR-002: a minutes choice sets the deadline and keeps the End-of-episode switch;
 * 'endOfEpisode' turns the switch on and keeps the deadline; 'off' clears both. Both may be
 * armed at once — whichever comes first stops playback.
 */
export function armTimer(choice: SleepChoice, now: number, prev: SleepTimer = SLEEP_OFF): SleepTimer {
  if (choice === 'off') return SLEEP_OFF;
  if (choice === 'endOfEpisode') return { ...prev, endOfEpisode: true };
  return { deadline: now + choice * 60_000, minutes: choice, endOfEpisode: prev.endOfEpisode };
}

/** M21 FR-002: the End-of-episode switch on its own, the deadline untouched. */
export function setEndOfEpisode(t: SleepTimer, on: boolean): SleepTimer {
  return { ...t, endOfEpisode: on };
}

export function isTimerOff(t: SleepTimer): boolean {
  return t.deadline === undefined && !t.endOfEpisode;
}

export function timerRemainingMs(t: SleepTimer, now: number): number | undefined {
  return t.deadline === undefined ? undefined : Math.max(0, t.deadline - now);
}

export function timerFired(t: SleepTimer, now: number): boolean {
  return t.deadline !== undefined && now >= t.deadline;
}

/** FR-016: only "end of episode" stops the queue; a minutes timer pauses where it is. Guard G3. */
export function shouldAdvance(t: SleepTimer): boolean {
  return !t.endOfEpisode;
}

/**
 * M21 FR-007, guard G-M21-3: End of episode stops at the end even with Loop on. The native
 * player's loop never reports an end, so while the switch is on the loop is not applied.
 */
export function nativeLoop(t: SleepTimer, loop: boolean): boolean {
  return loop && !t.endOfEpisode;
}

/**
 * M21 FR-005, guard G-M21-1: the volume for this moment. `undefined` = no fade (no deadline,
 * or more than 10 s left); else (remaining / 10 s)², which falls to 0 at the deadline.
 */
export function fadeVolume(t: SleepTimer, now: number): number | undefined {
  const remaining = timerRemainingMs(t, now);
  if (remaining === undefined || remaining > FADE_MS) return undefined;
  const x = remaining / FADE_MS;
  return x * x;
}

/** M21 FR-006, guard G-M21-2: a saved timer after a restart. A deadline already passed is dropped. */
export function restoreTimer(saved: { deadline?: number; minutes?: number; endOfEpisode?: boolean }, now: number): SleepTimer {
  const live = saved.deadline !== undefined && Number.isFinite(saved.deadline) && saved.deadline > now;
  const eoe = saved.endOfEpisode === true;
  if (!live) return { endOfEpisode: eoe };
  const minutes = MINUTES.find((m) => m === saved.minutes);
  return minutes === undefined ? { deadline: saved.deadline as number, endOfEpisode: eoe } : { deadline: saved.deadline as number, minutes, endOfEpisode: eoe };
}

/** The tiles, in order. */
export const MINUTES: readonly SleepMinutes[] = [5, 10, 15, 30, 45, 60, 90];
