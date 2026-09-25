/**
 * M8 US1 (quickstart A9's phone half, guard G-M1) — unsubscribing writes a TOMBSTONE.
 *
 * Why this test is worth more than it looks: a deleted row cannot sync. Phone A
 * unsubscribes, phone B still holds the row, and B's next reconcile puts the show back.
 * So `remove` stops being a DELETE — and the moment it does, **every read of the table
 * must filter `deleted_at IS NULL`**. One missed read makes unsubscribed shows reappear,
 * which is exactly the bug the tombstone was introduced to prevent.
 *
 * Run against a real SQLite (node:sqlite) AND the in-memory store, because the two have
 * to agree; a divergence there is a bug that only shows up on the device.
 */
import { DatabaseSync } from 'node:sqlite';
import { createMemorySubscriptionStore } from '../src/storage/memory';
import { createSqliteSubscriptionStore } from '../src/storage/sqlite';
import { migrateSchema, SCHEMA_VERSION, type SchemaDb } from '../src/storage/schema';
import { createSubscriptionSync, fromWire, toWire } from '../src/sync/subscriptions';
import type { SubscriptionStore } from '../src/storage/types';

const F1 = 'https://feeds.example.com/one.xml';
const F2 = 'https://feeds.example.com/two.xml';

function wrap(db: DatabaseSync): SchemaDb {
  return {
    exec: (sql) => db.exec(sql),
    getUserVersion: () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    setUserVersion: (v) => db.exec(`PRAGMA user_version = ${v}`),
  };
}

function sqliteStore(): SubscriptionStore {
  const db = new DatabaseSync(':memory:');
  migrateSchema(wrap(db));
  // The store takes the expo-sqlite surface; node:sqlite offers the same three calls.
  return createSqliteSubscriptionStore({
    getAllSync: (sql: string, params?: unknown[]) => db.prepare(sql).all(...((params ?? []) as never[])),
    getFirstSync: (sql: string, params?: unknown[]) => db.prepare(sql).get(...((params ?? []) as never[])) ?? null,
    runSync: (sql: string, params?: unknown[]) => db.prepare(sql).run(...((params ?? []) as never[])),
  } as never);
}

const stores: [string, () => SubscriptionStore][] = [
  ['memory', createMemorySubscriptionStore],
  ['sqlite', sqliteStore],
];

describe.each(stores)('%s subscription store', (_name, make) => {
  it('unsubscribe writes a tombstone: the row survives, but no read sees it (G-M1)', () => {
    const s = make();
    s.add(F1, 1000);
    s.add(F2, 1001);
    expect(s.list().map((r) => r.feedUrl).sort()).toEqual([F1, F2].sort());
    expect(s.has(F1)).toBe(true);

    s.remove(F1, 2000);

    expect(s.has(F1)).toBe(false);
    expect(s.list().map((r) => r.feedUrl)).toEqual([F2]);
    // …but the row is still there, which is the whole point.
    const all = s.all();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.feedUrl === F1)?.deletedAt).toBe(2000);
  });

  it('re-subscribing clears the tombstone rather than being swallowed', () => {
    const s = make();
    s.add(F1, 1000);
    s.remove(F1, 2000);
    s.add(F1, 3000);

    expect(s.has(F1)).toBe(true);
    expect(s.all().find((r) => r.feedUrl === F1)?.deletedAt).toBeUndefined();
  });

  it('removing something already removed does not move the tombstone', () => {
    const s = make();
    s.add(F1, 1000);
    s.remove(F1, 2000);
    s.remove(F1, 5000);
    expect(s.all().find((r) => r.feedUrl === F1)?.deletedAt).toBe(2000);
  });

  it('replaceAll takes the server set wholesale, tombstones and all', () => {
    const s = make();
    s.add(F1, 1000);
    s.replaceAll([
      { feedUrl: F2, subscribedAt: 4000, starred: false },
      { feedUrl: F1, subscribedAt: 1000, deletedAt: 4500, starred: false },
    ]);
    expect(s.list().map((r) => r.feedUrl)).toEqual([F2]);
    expect(s.all()).toHaveLength(2);
    expect(s.has(F1)).toBe(false);
  });
});

describe('the sync', () => {
  const iso = (ms: number) => new Date(ms).toISOString();

  it('round-trips a row through the wire without losing the tombstone', () => {
    const row = { feedUrl: F1, subscribedAt: 1000, deletedAt: 2000, starred: true };
    expect(fromWire(toWire(row))).toEqual(row);
    const live = { feedUrl: F2, subscribedAt: 1000, starred: false };
    expect(fromWire(toWire(live))).toEqual(live);
  });

  it('uploads the whole local set including tombstones and replaces the table with the answer', async () => {
    const subscriptions = createMemorySubscriptionStore();
    subscriptions.add(F1, 1000);
    subscriptions.remove(F1, 2000);
    subscriptions.add(F2, 3000);

    const sent: unknown[] = [];
    const api = {
      putSubscriptions: jest.fn(async (items: unknown[]) => {
        sent.push(items);
        // The server merged in a show this phone had never heard of.
        return { items: [...(items as never[]), { feedUrl: 'https://feeds.example.com/three.xml', createdAt: iso(9000), starred: false }], serverTime: iso(9001) };
      }),
    };
    const sync = createSubscriptionSync({ api: api as never, subscriptions, isSignedIn: () => true });

    await sync.reconcile();

    expect((sent[0] as { feedUrl: string; deletedAt?: string }[]).find((i) => i.feedUrl === F1)?.deletedAt).toBe(iso(2000));
    expect(subscriptions.all()).toHaveLength(3);
    expect(subscriptions.list().map((r) => r.feedUrl).sort()).toEqual([F2, 'https://feeds.example.com/three.xml'].sort());
    expect(subscriptions.has(F1)).toBe(false);
  });

  it('does nothing at all when signed out — a local subscribe still works (FR-003)', async () => {
    const subscriptions = createMemorySubscriptionStore();
    subscriptions.add(F1, 1000);
    const api = { putSubscriptions: jest.fn() };
    const sync = createSubscriptionSync({ api: api as never, subscriptions, isSignedIn: () => false });

    await sync.reconcile();

    expect(api.putSubscriptions).not.toHaveBeenCalled();
    expect(subscriptions.has(F1)).toBe(true);
  });

  it('a failed push never throws and never touches the local table', async () => {
    const subscriptions = createMemorySubscriptionStore();
    subscriptions.add(F1, 1000);
    const api = { putSubscriptions: jest.fn(async () => { throw new Error('offline'); }) };
    const sync = createSubscriptionSync({ api: api as never, subscriptions, isSignedIn: () => true });

    expect(() => sync.push()).not.toThrow();
    await expect(sync.reconcile()).rejects.toThrow('offline');
    expect(subscriptions.has(F1)).toBe(true);
  });
});
