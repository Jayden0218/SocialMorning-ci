// Tests the phone's playlist sync: two phones agree, a conflict asks, the loser is backed up, restore works.
/**
 * M22 US4 (FR-014..016, SC-003). Two phones on one fake account server that keeps a version
 * and refuses a stale write with the account's list, as `PUT /v1/me/queue` does.
 */
import { createQueueSync, readAgreed, SYNCED_KEY, VERSION_KEY, type QueueSyncDeps } from '@/sync/queue';
import { createMemoryQueueBackupStore, createMemoryQueueStore, createMemorySettingsStore } from '@/storage/memory';
import type { ServerQueue } from '@/social/api-m22-library';

function fakeServer() {
  let q: ServerQueue = { items: [], version: 0, deviceId: null, updatedAt: null };
  return {
    get current() { return q; },
    getQueue: jest.fn(async () => ({ ...q, items: [...q.items] })),
    putQueue: jest.fn(async (items: readonly string[], baseVersion: number, deviceId: string) => {
      if (baseVersion !== q.version) return { ok: false as const, server: { ...q, items: [...q.items] } };
      q = { items: [...items], version: q.version + 1, deviceId, updatedAt: '2026-10-07T00:00:00Z' };
      return { ok: true as const, version: q.version };
    }),
  };
}

function phone(server: ReturnType<typeof fakeServer>, deviceId: string, signedIn: { id?: string } = { id: 'L1' }) {
  const deps: QueueSyncDeps = {
    api: server,
    queue: createMemoryQueueStore(),
    backups: createMemoryQueueBackupStore(),
    settings: createMemorySettingsStore(),
    listenerId: () => signedIn.id,
    deviceId: () => deviceId,
    now: () => 1_000,
  };
  return { deps, sync: createQueueSync(deps) };
}

it('SC-003: phone A queues 3; phone B shows the same 3 in order on its next sync', async () => {
  const server = fakeServer();
  const a = phone(server, 'A');
  const b = phone(server, 'B');
  a.deps.queue.replace(['e1', 'e2', 'e3'], 0);
  await a.sync.sync();
  expect(server.current.items).toEqual(['e1', 'e2', 'e3']);
  await b.sync.sync();
  expect(b.deps.queue.list()).toEqual(['e1', 'e2', 'e3']);
  expect(b.deps.settings.get(VERSION_KEY)).toBe('1');
  // B reorders: it goes up; A pulls it.
  b.deps.queue.replace(['e3', 'e1', 'e2'], 0);
  await b.sync.sync();
  await a.sync.sync();
  expect(a.deps.queue.list()).toEqual(['e3', 'e1', 'e2']);
  // Nothing changed anywhere: nothing written.
  const puts = server.putQueue.mock.calls.length;
  await a.sync.sync();
  expect(server.putQueue.mock.calls.length).toBe(puts);
});

it('both changed: the chooser is held, nothing replaced; keeping this phone pushes it and backs up the other', async () => {
  const server = fakeServer();
  const a = phone(server, 'A');
  const b = phone(server, 'B');
  a.deps.queue.replace(['x'], 0);
  await a.sync.sync();
  await b.sync.sync();
  a.deps.queue.replace(['x', 'fromA'], 0);
  b.deps.queue.replace(['x', 'fromB'], 0);
  await a.sync.sync();
  const told = jest.fn();
  const off = b.sync.subscribe(told);
  await b.sync.sync();
  expect(told).toHaveBeenCalledTimes(1);
  expect(b.sync.pending()).toEqual({ local: ['x', 'fromB'], server: ['x', 'fromA'], serverDevice: 'A', version: 2 });
  expect(b.deps.queue.list()).toEqual(['x', 'fromB']);
  // While a choice waits, syncs do nothing.
  const gets = server.getQueue.mock.calls.length;
  await b.sync.sync();
  expect(server.getQueue.mock.calls.length).toBe(gets);
  await b.sync.choose('local');
  expect(b.sync.pending()).toBeUndefined();
  expect(server.current.items).toEqual(['x', 'fromB']);
  expect(b.deps.backups.list().map((k) => [k.items, k.device, k.reason])).toEqual([[['x', 'fromA'], 'A', 'chooser']]);
  // The choice wins on both: A pulls it next time.
  await a.sync.sync();
  expect(a.deps.queue.list()).toEqual(['x', 'fromB']);
  off();
});

it('keeping the account list replaces this phone and backs this phone up; a 409 on push asks too', async () => {
  const server = fakeServer();
  const a = phone(server, 'A');
  const b = phone(server, 'B');
  a.deps.queue.replace(['a1'], 0);
  await a.sync.sync();
  b.deps.queue.replace(['b1'], 0);
  await b.sync.sync(); // first sync, two different lists → ask
  expect(b.sync.pending()?.server).toEqual(['a1']);
  await b.sync.choose('server');
  expect(b.deps.queue.list()).toEqual(['a1']);
  expect(b.deps.backups.list()[0]).toMatchObject({ items: ['b1'], device: 'This phone', reason: 'chooser' });
  // A push that loses a race gets 409 → the chooser.
  b.deps.queue.replace(['a1', 'b2'], 0);
  a.deps.queue.replace(['a1', 'a2'], 0);
  await a.sync.sync(); // version 2 now
  server.getQueue.mockImplementationOnce(async () => ({ items: ['a1'], version: 1, deviceId: 'A', updatedAt: null }));
  await b.sync.sync(); // B believes nothing moved and pushes from version 1 → 409
  expect(b.sync.pending()).toMatchObject({ local: ['a1', 'b2'], server: ['a1', 'a2'], version: 2 });
});

it('signed out, or another account: nothing is sent, and another account starts fresh', async () => {
  const server = fakeServer();
  const who: { id?: string } = {};
  const a = phone(server, 'A', who);
  a.deps.queue.replace(['e1'], 0);
  await a.sync.sync();
  await a.sync.choose('local');
  expect(server.getQueue).not.toHaveBeenCalled();
  who.id = 'L1';
  await a.sync.sync();
  expect(readAgreed(a.deps.settings, 'L1')).toEqual({ items: ['e1'], version: 1 });
  expect(readAgreed(a.deps.settings, 'L2')).toBeUndefined();
  a.deps.settings.set(SYNCED_KEY, 'not json');
  expect(readAgreed(a.deps.settings, 'L1')).toBeUndefined();
});

it('restore: the backup becomes the queue, the current one is saved, and it syncs up', async () => {
  const server = fakeServer();
  const a = phone(server, 'A');
  a.deps.queue.replace(['now'], 0);
  await a.sync.sync();
  a.deps.backups.add({ items: ['old1', 'old2'], device: 'B', reason: 'chooser', createdAt: 1 });
  const id = a.deps.backups.list()[0]!.id;
  await a.sync.restore(id);
  expect(a.deps.queue.list()).toEqual(['old1', 'old2']);
  expect(server.current.items).toEqual(['old1', 'old2']);
  expect(a.deps.backups.list().some((k) => k.reason === 'restore' && k.items[0] === 'now')).toBe(true);
  await a.sync.restore(99_999); // unknown: nothing
  expect(a.deps.queue.list()).toEqual(['old1', 'old2']);
});
