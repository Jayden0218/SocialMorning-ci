import type { SleepChoice, SleepTimer } from './types';

/** FR-015: the fixed choices; `endOfEpisode` is a flag, not a clock. */
export function armTimer(choice: SleepChoice, now: number): SleepTimer {
  if (choice === 'off') return { kind: 'off' };
  if (choice === 'endOfEpisode') return { kind: 'endOfEpisode' };
  return { kind: 'minutes', deadline: now + choice * 60_000 };
}

export function timerRemainingMs(t: SleepTimer, now: number): number | undefined {
  return t.kind === 'minutes' ? Math.max(0, t.deadline - now) : undefined;
}

export function timerFired(t: SleepTimer, now: number): boolean {
  return t.kind === 'minutes' && now >= t.deadline;
}

/** FR-016: only "end of episode" stops the queue; a minutes timer pauses where it is. Guard G3. */
export function shouldAdvance(t: SleepTimer): boolean {
  return t.kind !== 'endOfEpisode';
}
