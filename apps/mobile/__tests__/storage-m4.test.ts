/**
 * M4 stores and migration 004 (quickstart T007). The memory stores are the spec; the
 * expo-sqlite ones mirror them and are VERIFIED only on the phone (G0). Migration 004
 * runs on a REAL SQLite (node:sqlite) over a v3 database with M2 rows in it.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_001, MIGRATION_002, MIGRATION_003, migrateSchema, SCHEMA_VERSION, type SchemaDb } from '../src/storage/schema';
import { createMemoryFeedCacheStore, createMemoryListenedStore, createMemoryPendingClipStore } from '../src/storage/memory';

function wrap(db: DatabaseSync): SchemaDb {
  return {
    exec: (sql) => db.exec(sql),
    getUserVersion: () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    setUserVersion: (v) => db.exec(`PRAGMA user_version = ${v}`),
  };
}

it('M4: a v3 database (M2 phone) upgrades to v4 with downloads and settings intact and the three new tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_001); db.exec(MIGRATION_002); db.exec(MIGRATION_003);
  db.exec('PRAGMA user_version = 3');
  db.exec(`INSERT INTO downloads (episode_id, file_path, state, bytes_done, bytes_total, allow_mobile, requested_at) VALUES ('ep', '/f', 'complete', 57, 57, 0, 1)`);
  db.exec(`INSERT INTO settings (key, value) VALUES ('downloads.budgetBytes', '209715200')`);
  expect(SCHEMA_VERSION).toBe(5);
  expect(migrateSchema(wrap(db))).toBe(5);
  expect(db.prepare('SELECT state, bytes_total FROM downloads').get()).toMatchObject({ state: 'complete', bytes_total: 57 });
  expect(db.prepare("SELECT value FROM settings WHERE key='downloads.budgetBytes'").get()).toMatchObject({ value: '209715200' });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect(tables).toEqual(expect.arrayContaining(['pending_clips', 'listened', 'feed_cache']));
  expect(migrateSchema(wrap(db))).toBe(5); // idempotent
});

describe('ListenedStore', () => {
  it('unions ranges per episode-day, marks dirty, and markPushed clears only the named keys', () => {
    const s = createMemoryListenedStore();
    s.addRanges('e', '2026-09-21', [[0, 60_000]]);
    s.addRanges('e', '2026-09-21', [[30_000, 90_000], [200_000, 210_000]]);
    s.addRanges('e', '2026-09-22', [[0, 1_000]]);
    expect(s.get('e', '2026-09-21')).toEqual({ episodeId: 'e', day: '2026-09-21', ranges: [[0, 90_000], [200_000, 210_000]], dirty: true });
    expect(s.dirty()).toHaveLength(2);
    s.markPushed([{ episodeId: 'e', day: '2026-09-21' }, { episodeId: 'nope', day: 'x' }]);
    expect(s.dirty().map((r) => r.day)).toEqual(['2026-09-22']);
    s.addRanges('e', '2026-09-21', [[90_000, 91_000]]);
    expect(s.get('e', '2026-09-21')?.dirty).toBe(true);
    expect(s.get('missing', 'd')).toBeUndefined();
  });
});

describe('PendingClipStore', () => {
  it('lists in creation order, per episode, updates attempts, removes', () => {
    const s = createMemoryPendingClipStore();
    s.put({ clientId: 'b', episodeId: 'e1', startMs: 0, endMs: 5_000, caption: '', createdAt: 2, attempts: 0 });
    s.put({ clientId: 'a', episodeId: 'e2', startMs: 0, endMs: 5_000, caption: 'x', createdAt: 1, attempts: 0 });
    expect(s.list().map((r) => r.clientId)).toEqual(['a', 'b']);
    expect(s.listForEpisode('e1').map((r) => r.clientId)).toEqual(['b']);
    s.put({ ...s.list()[0]!, attempts: 1, lastError: 'network' });
    expect(s.list()[0]).toMatchObject({ attempts: 1, lastError: 'network' });
    s.remove('a');
    expect(s.list().map((r) => r.clientId)).toEqual(['b']);
  });
});

describe('FeedCacheStore', () => {
  it('stores one body per key with its etag', () => {
    const s = createMemoryFeedCacheStore();
    expect(s.get('following')).toBeUndefined();
    s.set({ key: 'following', etag: 'W/"1"', fetchedAt: 5, body: '{"items":[]}' });
    s.set({ key: 'following', fetchedAt: 6, body: '{"items":[1]}' });
    expect(s.get('following')).toEqual({ key: 'following', fetchedAt: 6, body: '{"items":[1]}' });
  });
});
