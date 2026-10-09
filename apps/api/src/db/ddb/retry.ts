// Retry for optimistic writes: a version check or transaction conflict is retried a few times, never forever.
/**
 * M26 F0-06, data-model.md §8 ("SELECT … FOR UPDATE → a `v` attribute; read, compute, write with
 * `v = :read`, retry ≤ 3 on ConditionalCheckFailed").
 *
 * The SDK already retries throttling on its own; it does NOT retry a cancelled transaction (research R3),
 * and DynamoDB Local never produces a `TransactionConflict` (research R9) — the conflict wrapper in
 * test-wrappers.ts makes one so this path is tested.
 */
import { TxCancelled } from './tx.ts';

const nameOf = (e: unknown): string | undefined => (e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : undefined);

/** A single-item write whose ConditionExpression was false, or a transaction cancelled by one. */
export function isConditionFailed(e: unknown): boolean {
  return nameOf(e) === 'ConditionalCheckFailedException' || (e instanceof TxCancelled && e.conditionFailed);
}

/** Two writers touched the same item at once. */
export function isConflict(e: unknown): boolean {
  return nameOf(e) === 'TransactionConflictException' || (e instanceof TxCancelled && e.conflict);
}

export function isThrottle(e: unknown): boolean {
  const n = nameOf(e);
  return n === 'ProvisionedThroughputExceededException' || n === 'ThrottlingException' || n === 'RequestLimitExceeded'
    || (e instanceof TxCancelled && e.reasons.some((r) => r.code === 'ThrottlingError' || r.code === 'ProvisionedThroughputExceeded'));
}

export type RetryOptions = {
  /** Total attempts, including the first (default 3). */
  tries?: number;
  /** Which errors are worth another attempt (default: conflicts). */
  retryOn?: (e: unknown) => boolean;
  /** First back-off in ms; doubles each time, with jitter (default 15). */
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

/** Runs `fn(attempt)` (attempt 1, 2, …) until it succeeds or the error is not retryable or attempts run out. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3);
  const retryOn = opts.retryOn ?? isConflict;
  const sleep = opts.sleep ?? realSleep;
  const base = opts.baseMs ?? 15;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt >= tries || !retryOn(e)) throw e;
      await sleep(base * 2 ** (attempt - 1) * (0.5 + Math.random()));
    }
  }
}

/** Optimistic read-modify-write: retries on a failed version condition or a conflict. */
export const withVersionRetry = <T>(fn: (attempt: number) => Promise<T>, opts: Omit<RetryOptions, 'retryOn'> = {}) =>
  withRetry(fn, { ...opts, retryOn: (e) => isConditionFailed(e) || isConflict(e) });
