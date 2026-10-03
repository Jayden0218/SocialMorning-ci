import { createPositionSync, RETRY_SCHEDULE_MS, UPLOAD_EVERY_MS } from '../src/sync/positions';
import { ApiError, type ApiClient, type PositionRowOut } from '../src/social/api';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

jest.useFakeTimers();

function build(over: Partial<ApiClient> = {}, signedIn = true) {
  const stores = createMemoryStores(hash);
  const puts: { at: number; rows: { episodeId: string; offsetMs: number }[] }[] = [];
  let clock = 0;
  const api = {
    putPositions: async (_d: string, obs: { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean }[]) => {
      puts.push({ at: clock, rows: obs });
      return obs.map<PositionRowOut>((o) => ({ ...o, receivedAt: new Date(clock).toISOString(), deviceId: 'p1' }));
    },
    getPositions: async () => ({ positions: [], serverTime: 'now' }),
    registerEpisode: async () => {},
    ...over,
  } as unknown as ApiClient;
  const sync = createPositionSync({
    api, positions: stores.positions, deviceId: 'p1', isSignedIn: () => signedIn, now: () => clock,
    registration: () => ({ feedUrl: 'f', guid: 'g', title: 't', enclosureUrl: 'u' }),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  const tick = async (ms: number) => { clock += ms; await jest.advanceTimersByTimeAsync(ms); };
  return { stores, sync, puts, tick, clockNow: () => clock };
}

// quickstart A19
it('A19: 2 h of playing with 3 pauses and 1 seek → ≤ 245 PUTs; each pause/seek uploads within 1 s', async () => {
  const { stores, sync, puts, tick, clockNow } = build();
  // 30 s timer ticks + savePosition every 5 s (M1 FR-016), like the adapter would.
  let offset = 0;
  for (let t = 0; t < 2 * 3600; t += 5) {
    offset = t * 1000;
    const row = stores.positions.save({ episodeId: 'e', offsetMs: offset, finished: false }, clockNow());
    sync.onSaved(row, 'tick');
    if (t % 30 === 0 && t > 0) sync.onTimer();
    if (t === 1800 || t === 3600 || t === 5400) {
      const before = puts.length;
      const paused = stores.positions.save({ episodeId: 'e', offsetMs: offset, finished: false }, clockNow());
      sync.onSaved(paused, 'stop');
      await tick(1000);
      expect(puts.length).toBeGreaterThan(before);
      expect(puts[puts.length - 1]!.at - clockNow()).toBeGreaterThanOrEqual(-1000);
    }
    if (t === 2700) {
      const before = puts.length;
      const sought = stores.positions.save({ episodeId: 'e', offsetMs: 100_000, finished: false, explicitSeek: true }, clockNow());
      sync.onSaved(sought, 'seek');
      await tick(1000);
      expect(puts.length).toBe(before + 1);
    }
    await tick(5000);
  }
  expect(puts.length).toBeLessThanOrEqual(245);
  expect(puts.length).toBeGreaterThanOrEqual(240 - 5);
  // The last few 5 s ticks wait for the next timer — a stop sends them at once.
  sync.onSaved(stores.positions.save({ episodeId: 'e', offsetMs: offset, finished: false }, clockNow()), 'stop');
  await tick(0);
  expect(stores.positions.unsynced()).toEqual([]);
});

// quickstart A20
it('A20: a 500 leaves the local row untouched and retries at 2/4/8/16/30/30 s', async () => {
  let fail = true;
  const attempts: number[] = [];
  let clock = 0;
  const { stores, sync, tick } = build({
    putPositions: async () => {
      attempts.push(clock);
      if (fail) throw new ApiError('internal', 'boom', 500);
      return [];
    },
  });
  const row = stores.positions.save({ episodeId: 'e', offsetMs: 872_000, finished: false }, 0);
  sync.onSaved(row, 'stop');
  await jest.advanceTimersByTimeAsync(0);
  expect(attempts).toHaveLength(1);
  expect(stores.positions.get('e')).toMatchObject({ offsetMs: 872_000, syncedSeq: 0 });
  for (const delay of RETRY_SCHEDULE_MS) {
    clock += delay;
    await tick(delay);
  }
  expect(attempts.length).toBe(1 + RETRY_SCHEDULE_MS.length);
  expect(stores.positions.get('e')?.offsetMs).toBe(872_000);
  fail = false;
  clock += 30_000;
  await tick(30_000);
  expect(stores.positions.unsynced()).toEqual([]);
});

it('a not_found for the episode registers it once and retries the upload', async () => {
  let registered = 0;
  let calls = 0;
  const { stores, sync } = build({
    putPositions: async (_d: string, obs: never[]) => {
      calls++;
      if (calls === 1) throw new ApiError('not_found', 'unknown', 404, { episodeId: 'e' });
      return (obs as { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean }[]).map((o) => ({ ...o, receivedAt: new Date(0).toISOString(), deviceId: 'p1' }));
    },
    registerEpisode: async () => { registered++; },
  });
  sync.onSaved(stores.positions.save({ episodeId: 'e', offsetMs: 5, finished: false }, 0), 'stop');
  await jest.advanceTimersByTimeAsync(0);
  expect([registered, calls]).toEqual([1, 2]);
  expect(stores.positions.unsynced()).toEqual([]);
});

it('the server\'s newer progress from another phone overwrites; the local higher one stands and is marked synced', async () => {
  const { stores, sync } = build({
    putPositions: async () => [{ episodeId: 'e', offsetMs: 1_200_000, finished: false, progressSeq: 3, explicitSeek: false, receivedAt: new Date(10).toISOString(), deviceId: 'p2' }],
  });
  sync.onSaved(stores.positions.save({ episodeId: 'e', offsetMs: 900_000, finished: false }, 0), 'stop');
  await jest.advanceTimersByTimeAsync(0);
  expect(stores.positions.get('e')).toMatchObject({ offsetMs: 1_200_000 });
  expect(stores.positions.unsynced()).toEqual([]);
});

it('nothing is uploaded while signed out or for a plain tick without the timer', async () => {
  const signedOut = build({}, false);
  signedOut.sync.onSaved(signedOut.stores.positions.save({ episodeId: 'e', offsetMs: 1, finished: false }, 0), 'stop');
  await jest.advanceTimersByTimeAsync(0);
  expect(signedOut.puts).toEqual([]);
  const { stores, sync, puts, tick } = build();
  sync.onSaved(stores.positions.save({ episodeId: 'e', offsetMs: 1, finished: false }, 0), 'tick');
  await tick(UPLOAD_EVERY_MS - 1);
  expect(puts).toEqual([]);
});

it('S9-row-4 regression: an offline seek back, ticks, then relaunch — the phone keeps 20:53, the server takes it', async () => {
  // Server holds 45:29 from earlier. Phone seeks back to 19:53 while offline, plays to 20:53,
  // then the app is killed before any upload succeeded. On relaunch reconcile() runs.
  const serverRow = { episodeId: 'e', offsetMs: 2_729_000, finished: false, progressSeq: 400, explicitSeek: false, receivedAt: new Date(1000).toISOString(), deviceId: 'p1' };
  let held = serverRow;
  const { stores, sync } = build({
    putPositions: async (_d: string, obs: { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean }[]) => {
      const o = obs[0]!;
      // The real server: a newer explicit seek wins even backwards (R5 rule 2).
      held = o.explicitSeek || o.offsetMs >= held.offsetMs ? { ...o, receivedAt: new Date(2000).toISOString(), deviceId: 'p1' } : held;
      return [held];
    },
    getPositions: async () => ({ positions: [held], serverTime: 'now' }),
  });
  stores.positions.save({ episodeId: 'e', offsetMs: 2_729_000, finished: false }, 0);
  stores.positions.markSynced('e', stores.positions.get('e')!.progressSeq);
  stores.positions.save({ episodeId: 'e', offsetMs: 1_193_000, finished: false, explicitSeek: true }, 1); // offline seek
  stores.positions.save({ episodeId: 'e', offsetMs: 1_253_000, finished: false }, 2);                      // ticks
  await sync.reconcile();
  expect(stores.positions.get('e')?.offsetMs).toBe(1_253_000);
  expect(held.offsetMs).toBe(1_253_000);
  expect(stores.positions.unsynced()).toEqual([]);
});
