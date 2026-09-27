/**
 * The launch screen's timing (owner, 2026-09-27): show it while the app pulls the
 * account's latest state, and for **at least 1 s** so it never flickers.
 *
 * It also has a ceiling. Offline, or with a slow server, the syncs can take their
 * own time — they keep running in the background, and the listener gets the app
 * with what is on the phone (Principle IV: the local rows are the truth).
 */
export const SPLASH_MIN_MS = 1_000;
export const SPLASH_MAX_MS = 6_000;

export type Sleep = (ms: number) => Promise<void>;

const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once every task has settled (resolved or failed) **and** `minMs` has
 * passed — or at `maxMs`, whichever is first. Never rejects.
 */
export function waitForStartup(
  tasks: Promise<unknown>[],
  opts: { minMs?: number; maxMs?: number; sleep?: Sleep } = {},
): Promise<void> {
  const minMs = opts.minMs ?? SPLASH_MIN_MS;
  const maxMs = opts.maxMs ?? SPLASH_MAX_MS;
  const sleep = opts.sleep ?? realSleep;
  const done = Promise.all([Promise.allSettled(tasks), sleep(minMs)]).then(() => undefined);
  return Promise.race([done, sleep(Math.max(minMs, maxMs))]);
}
