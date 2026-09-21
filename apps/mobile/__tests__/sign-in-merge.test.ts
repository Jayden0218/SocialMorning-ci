/**
 * T057 / FR-029: on sign-in the account's positions and the phone's are merged by
 * the one rule; nothing is discarded. Local 16:00 vs server 15:00 → 16:00 on both
 * sides; a server "finished" makes the local row finished.
 */
import { createPositionSync } from '../src/sync/positions';
import type { ApiClient, PositionRowOut } from '../src/social/api';
import { createMemoryStores } from '../src/storage/memory';
import { hash } from '../src/feeds/hash';

jest.useFakeTimers();

it('sign-in merge: local 16:00 beats server 15:00 and is uploaded; server finished sticks locally', async () => {
  const stores = createMemoryStores(hash);
  stores.positions.save({ episodeId: 'a', offsetMs: 960_000, finished: false }, 1);   // local 16:00
  stores.positions.save({ episodeId: 'b', offsetMs: 100_000, finished: false }, 1);   // local, server says finished
  const serverRows: PositionRowOut[] = [
    { episodeId: 'a', offsetMs: 900_000, finished: false, progressSeq: 9, explicitSeek: false, receivedAt: new Date(500).toISOString(), deviceId: 'p2' },
    { episodeId: 'b', offsetMs: 2_899_000, finished: true, progressSeq: 2, explicitSeek: false, receivedAt: new Date(500).toISOString(), deviceId: 'p2' },
    { episodeId: 'c', offsetMs: 42_000, finished: false, progressSeq: 1, explicitSeek: false, receivedAt: new Date(500).toISOString(), deviceId: 'p2' },
  ];
  const uploaded: { episodeId: string; offsetMs: number }[] = [];
  // A tiny stateful server: PUT merges by "higher offset wins" (the real one runs
  // mergePosition on its clock); GET returns what it now holds.
  const api = {
    getPositions: async () => ({ positions: serverRows, serverTime: 'now' }),
    putPositions: async (_d: string, obs: { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean }[]) => {
      uploaded.push(...obs);
      return obs.map<PositionRowOut>((o) => {
        const i = serverRows.findIndex((r) => r.episodeId === o.episodeId);
        const held = serverRows[i];
        const winner: PositionRowOut = held && held.offsetMs > o.offsetMs ? held : { ...o, receivedAt: new Date(600).toISOString(), deviceId: 'p1' };
        if (i >= 0) serverRows[i] = winner; else serverRows.push(winner);
        return winner;
      });
    },
    registerEpisode: async () => {},
  } as unknown as ApiClient;
  const sync = createPositionSync({
    api, positions: stores.positions, deviceId: 'p1', isSignedIn: () => true, now: () => 2,
    registration: () => undefined, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });

  await sync.reconcile();

  expect(stores.positions.get('a')?.offsetMs).toBe(960_000);          // local newer progress stands
  expect(stores.positions.get('b')).toMatchObject({ offsetMs: 2_899_000, finished: true }); // server finished applied
  expect(stores.positions.get('c')?.offsetMs).toBe(42_000);           // server-only row arrives
  expect(uploaded.map((u) => u.episodeId).sort()).toEqual(['a', 'b']); // both local rows were offered; the server kept its 'b'
  expect(stores.positions.unsynced()).toEqual([]);
});
