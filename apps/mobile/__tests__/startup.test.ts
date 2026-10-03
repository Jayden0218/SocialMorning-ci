/**
 * The launch screen's timing: at least 1 s, waits for the syncs, never longer than the
 * ceiling. The break that turns the first test red: drop `sleep(minMs)` from
 * `waitForStartup` in `src/ui/startup.ts`.
 */
import { SPLASH_MIN_MS, waitForStartup } from '../src/ui/startup';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function settledAt(p: Promise<void>, stepMs: number, maxMs: number): Promise<number> {
  let done = false;
  void p.then(() => { done = true; });
  for (let t = 0; t <= maxMs; t += stepMs) {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    if (done) return t;
    jest.advanceTimersByTime(stepMs);
  }
  return -1;
}

it('stays up for at least 1 s even when the syncs finish at once', async () => {
  expect(SPLASH_MIN_MS).toBe(1_000);
  const at = await settledAt(waitForStartup([Promise.resolve()]), 100, 10_000);
  expect(at).toBe(1_000);
});

it('waits for a sync that takes longer than 1 s', async () => {
  const slow = new Promise((r) => setTimeout(r, 2_500));
  const at = await settledAt(waitForStartup([slow]), 100, 10_000);
  expect(at).toBe(2_500);
});

it('a failed sync does not hold the screen or throw', async () => {
  const at = await settledAt(waitForStartup([Promise.reject(new Error('offline'))]), 100, 10_000);
  expect(at).toBe(1_000);
});

it('lifts at the ceiling when a sync never answers', async () => {
  const never = new Promise(() => undefined);
  const at = await settledAt(waitForStartup([never], { maxMs: 3_000 }), 100, 10_000);
  expect(at).toBe(3_000);
});
