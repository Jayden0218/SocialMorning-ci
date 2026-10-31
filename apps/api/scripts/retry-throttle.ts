// M30 T019: retry a DynamoDB call that was throttled (1-WCU indexes on the free environment); nothing else is retried.
const THROTTLE = new Set(['ProvisionedThroughputExceededException', 'ThrottlingException', 'RequestLimitExceeded']);

export const isThrottle = (e: unknown): boolean => typeof e === 'object' && e !== null && THROTTLE.has((e as { name?: string }).name ?? '');

export type RetryOpts = { tries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void>; random?: () => number };

/** Runs `fn`; on a throttling error waits base·2^n plus up to 100% jitter and tries again, up to `tries` (8) in all, then throws the last error. */
export async function withThrottleRetry<T>(fn: () => Promise<T>, o: RetryOpts = {}): Promise<T> {
  const tries = o.tries ?? 8, base = o.baseMs ?? 100;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = o.random ?? Math.random;
  for (let n = 0; ; n++) {
    try { return await fn(); } catch (e) {
      if (!isThrottle(e) || n + 1 >= tries) throw e;
      await sleep(base * 2 ** n * (1 + random()));
    }
  }
}
