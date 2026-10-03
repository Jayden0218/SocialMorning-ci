import { createPoller, POLL_INTERVAL_MS } from '../src/social/poll';

jest.useFakeTimers();

function build() {
  const ticks: string[] = [];
  const poller = createPoller(
    { tick: async (id) => { ticks.push(id); }, setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    { episodeId: 'e' },
  );
  return { poller, ticks };
}

// quickstart A18
it('ticks every 10 s only while focused AND foreground AND online', async () => {
  const { poller, ticks } = build();
  expect(poller.isRunning()).toBe(false);

  poller.update({ focused: true });
  await Promise.resolve();
  expect(ticks).toEqual(['e']); // immediate first tick
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(ticks).toHaveLength(4);

  poller.update({ focused: false });
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(ticks).toHaveLength(4);
  expect(poller.isRunning()).toBe(false);

  poller.update({ focused: true, foreground: false });
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(ticks).toHaveLength(4);

  poller.update({ foreground: true, online: false });
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
  expect(ticks).toHaveLength(4);

  poller.update({ online: true });
  await Promise.resolve();
  expect(ticks).toHaveLength(5);
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(ticks).toHaveLength(6);
  poller.dispose();
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
  expect(ticks).toHaveLength(6);
});

it('does not overlap ticks while one is in flight, and restarts on an episode change', async () => {
  let resolve: (() => void) | undefined;
  const ticks: string[] = [];
  const poller = createPoller(
    { tick: (id) => { ticks.push(id); return new Promise<void>((r) => { resolve = r; }); }, setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    { focused: true, episodeId: 'e' },
  );
  expect(ticks).toEqual(['e']);
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
  expect(ticks).toEqual(['e']); // still in flight
  resolve!();
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(ticks).toEqual(['e', 'e']);
  resolve!();
  await jest.advanceTimersByTimeAsync(0); // let the in-flight tick settle
  poller.update({ episodeId: 'f' });
  expect(ticks).toEqual(['e', 'e', 'f']);
  poller.dispose();
});

it('a tick that rejects does not stop the poll', async () => {
  let n = 0;
  const poller = createPoller(
    { tick: async () => { n++; throw new Error('network'); }, setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
    { focused: true, episodeId: 'e' },
  );
  await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  expect(n).toBe(2);
  poller.dispose();
});
