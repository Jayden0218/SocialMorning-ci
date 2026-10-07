// Tests that unsubscribing keeps a removal marker so it can sync to other phones.
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
import { createMemorySubscriptionStore } from '@/storage/memory';
import { createSqliteSubscriptionStore } from '@/storage/sqlite';
import { migrateSchema, SCHEMA_VERSION, type SchemaDb } from '@/storage/schema';
import { createSubscriptionSync, fromWire, toWire } from '@/sync/subscriptions';
import type { SubscriptionStore } from '@/storage/types';

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

/**
 * T007 — migration 006. A v5 phone (an M6/M7 build) upgrades without losing a single
 * subscription, and the rows it already had come back as live, not as tombstones.
 */
it('a v5 database upgrades to v6 with its subscriptions intact and none of them tombstoned', () => {
  const { MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004, MIGRATION_005 } = require('@/storage/schema');
  const db = new DatabaseSync(':memory:');
  for (const m of [MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004, MIGRATION_005]) db.exec(m);
  db.exec('PRAGMA user_version = 5');
  db.exec(`INSERT INTO subscriptions (feed_url, subscribed_at) VALUES ('${F1}', 1000), ('${F2}', 2000)`);

  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION);

  const rows = db.prepare('SELECT feed_url, subscribed_at, deleted_at, starred FROM subscriptions ORDER BY subscribed_at').all() as Record<string, unknown>[];
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r['deleted_at'] === null)).toBe(true);
  expect(rows.every((r) => r['starred'] === 0)).toBe(true);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
  expect(tables).toContain('rec_outbox');
});

/**
 * M12 guard G-ST2 (FR-081): starring stamps `starredAt`, and the stamp goes up with the sync,
 * so the server's star merge (G-ST1) can let it win. Both stores; a tombstone cannot be starred.
 * The break: leave `starredAt` out of `toWire`.
 */
describe.each(stores)('%s store: stars', (_name, make) => {
  it('setStarred stamps the star and the wire carries it', () => {
    const s = make();
    s.add(F1, 1000);
    s.add(F2, 1000);
    s.setStarred(F1, true, 5000);
    expect(s.list().find((r) => r.feedUrl === F1)?.starred).toBe(true);
    const row = s.all().find((r) => r.feedUrl === F1)!;
    expect(row.starredAt).toBe(5000);
    expect(toWire(row)).toEqual(expect.objectContaining({ starred: true, starredAt: new Date(5000).toISOString() }));
    expect(fromWire(toWire(row))).toEqual(row);
    s.remove(F2, 6000);
    s.setStarred(F2, true, 7000);
    expect(s.all().find((r) => r.feedUrl === F2)?.starred).toBe(false);
  });
});

it('a v6 database upgrades to the latest with its stars intact', () => {
  const { MIGRATIONS } = require('@/storage/schema');
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS.slice(0, 6)) db.exec(m);
  db.exec('PRAGMA user_version = 6');
  db.exec(`INSERT INTO subscriptions (feed_url, subscribed_at, starred) VALUES ('${F1}', 1000, 1)`);
  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION); // 7 at M12, 8 since M22 (queue backups)
  expect(db.prepare('SELECT starred, starred_at FROM subscriptions').get()).toEqual({ starred: 1, starred_at: null });
});
