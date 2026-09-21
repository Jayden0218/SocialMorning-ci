/**
 * Sign-in throttling (research R3, FR-005).
 *
 * Nothing for the first four failures. From the fifth, the lock doubles:
 * 1 s, 2 s, 4 s … capped at 15 minutes. The cap matters: without it a
 * determined attacker locks a real listener out of their own account for days.
 */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MAX_MS = 15 * 60 * 1000;

export function lockoutUntil(failedAttempts: number, now: number): number | null {
  if (failedAttempts < LOCKOUT_THRESHOLD) return null;
  const exponent = failedAttempts - LOCKOUT_THRESHOLD;
  // 2^exponent seconds; past 2^20 s (~12 days) the cap already applies, so stop growing.
  const delayMs = exponent >= 20 ? LOCKOUT_MAX_MS : Math.min(LOCKOUT_MAX_MS, 1000 * 2 ** exponent);
  return now + delayMs;
}
