// Tests the app's own error log: keeps 50, sends at most one batch of 20 a minute, never loops.
/**
 * M23 US8 (FR-013): `reportError` replaces the empty catches. It must keep the last 50 on the
 * phone, send unsent ones to POST /v1/errors as { reports } (≤ 20, ≤ 1 send a minute), skip
 * "Couldn't reach the server", never throw, and never report its own failed send.
 *
 * The break that turns it red: in `src/telemetry/reportError.ts` `schedule`, drop the
 * `lastSentAt + SEND_EVERY_MS` wait (`const wait = 0`) — the second test then sees two sends.
 */
import { ApiError } from '@/social/api';
import { BATCH, configureErrorReports, KEEP, recentErrors, reportAndDrop, reportError, resetErrorReports, SEND_EVERY_MS, type ErrorReport } from '@/telemetry/reportError';
import { withErrors } from '@/settings/feedback';

let now = 1_000_000;
let sent: ErrorReport[][] = [];

beforeEach(() => {
  jest.useFakeTimers();
  resetErrorReports();
  now = 1_000_000;
  sent = [];
});
afterEach(() => {
  resetErrorReports();
  jest.useRealTimers();
});

const start = (send: (r: ErrorReport[]) => Promise<void> = async (r) => { sent.push(r); }) =>
  configureErrorReports({ send, appVersion: '1.2.3', platform: 'ios', now: () => now });

async function advance(ms: number): Promise<void> {
  now += ms;
  await jest.advanceTimersByTimeAsync(ms);
}

it('keeps the last 50 on the phone, newest last, with scope, message and version', () => {
  start();
  for (let i = 0; i < 60; i += 1) reportError('test.scope', new Error(`boom ${i}`));
  const kept = recentErrors(KEEP);
  expect(kept).toHaveLength(KEEP);
  expect(kept[kept.length - 1]).toMatchObject({ scope: 'test.scope', message: 'boom 59', appVersion: '1.2.3', platform: 'ios' });
  expect(recentErrors(20)).toHaveLength(20);
});

it('sends in batches of at most 20, and at most one send a minute', async () => {
  start();
  for (let i = 0; i < 30; i += 1) reportError('a', new Error(`e${i}`));
  await advance(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toHaveLength(BATCH);
  expect(sent[0]![0]).toEqual(expect.objectContaining({ scope: 'a', message: 'e0', appVersion: '1.2.3', platform: 'ios' }));
  await advance(SEND_EVERY_MS - 1);
  expect(sent).toHaveLength(1);
  await advance(1);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toHaveLength(10);
});

it('does not send "Couldn\'t reach the server" (offline is normal), but keeps it on the phone', async () => {
  start();
  reportError('sync', new ApiError('network', "Couldn't reach the server.", 0));
  await advance(SEND_EVERY_MS);
  expect(sent).toEqual([]);
  expect(recentErrors()).toHaveLength(1);
});

it('a failed send is dropped quietly — never reported, never thrown', async () => {
  let calls = 0;
  start(async () => { calls += 1; throw new Error('server down'); });
  reportError('x', 'a string error');
  await advance(0);
  await advance(SEND_EVERY_MS * 3);
  expect(calls).toBe(1);
  expect(recentErrors().map((e) => e.scope)).toEqual(['x']);
});

it('never throws, whatever it is given; reportAndDrop resolves to undefined', async () => {
  const circular: Record<string, unknown> = {};
  circular['self'] = circular;
  expect(() => reportError('weird', circular)).not.toThrow();
  expect(() => reportError('weird', undefined)).not.toThrow();
  await expect(Promise.reject(new Error('no')).catch(reportAndDrop('p'))).resolves.toBeUndefined();
  expect(recentErrors().map((e) => e.scope)).toEqual(['weird', 'weird', 'p']);
});

it('feedback adds the errors under the message only when given, within the length limit', () => {
  expect(withErrors('  hello  ', [])).toBe('hello');
  const text = withErrors('hello', [{ scope: 'a.b', message: 'it broke\nbadly', appVersion: '1.0' }]);
  expect(text).toContain('hello\n\n');
  expect(text).toContain('a.b: it broke badly · 1.0');
  expect(withErrors('x'.repeat(1990), Array.from({ length: 20 }, () => ({ scope: 's', message: 'm'.repeat(200), appVersion: '1' }))).length).toBeLessThanOrEqual(2000);
});
