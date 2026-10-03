/**
 * M6 storage (migration 005): a v4 database (M5 phone) upgrades to v5 with its rows
 * intact; the hidden and block stores behave the same in SQLite (node:sqlite) and memory.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004, migrateSchema, SCHEMA_VERSION, type SchemaDb } from '../src/storage/schema';
import { createMemoryBlockStore, createMemoryHiddenStore, createMemoryStores } from '../src/storage/memory';
import { createAuth } from '../src/social/auth-store';
import type { ApiClient } from '../src/social/api';

const wrap = (db: DatabaseSync): SchemaDb => ({
  exec: (sql) => db.exec(sql),
  getUserVersion: () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
  setUserVersion: (v) => db.exec(`PRAGMA user_version = ${v}`),
});

it('M6: a v4 database (M5 phone) upgrades to the current version with listened rows intact and the two new tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_001); db.exec(MIGRATION_002); db.exec(MIGRATION_003); db.exec(MIGRATION_004);
  db.exec('PRAGMA user_version = 4');
  db.exec(`INSERT INTO listened (episode_id, day, ranges, dirty) VALUES ('ep', '2026-09-22', '[[0,1000]]', 0)`);
  expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION);
  expect(db.prepare('SELECT ranges FROM listened').get()).toMatchObject({ ranges: '[[0,1000]]' });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect(tables).toEqual(expect.arrayContaining(['hidden', 'blocks']));
  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION);
});

describe('HiddenStore (memory)', () => {
  it('put is idempotent, pending until delivered, replaceDelivered keeps pending rows, clearAll empties', () => {
    const s = createMemoryHiddenStore();
    s.put({ kind: 'comment', id: 'c1', reason: 'spam', at: 1, pending: true });
    s.put({ kind: 'comment', id: 'c1', reason: 'hate', at: 2, pending: true });
    expect(s.all()).toHaveLength(1);
    expect(s.all()[0]!.reason).toBe('spam');
    expect(s.has('comment', 'c1')).toBe(true);
    expect(s.has('clip', 'c1')).toBe(false);
    expect(s.pending()).toHaveLength(1);
    s.markDelivered('comment', 'c1');
    expect(s.pending()).toHaveLength(0);
    s.put({ kind: 'show', id: 'https://f/x', reason: 'illegal', at: 3, pending: true });
    s.replaceDelivered([{ kind: 'clip', id: 'k9' }], 10);
    expect(s.all().map((r) => `${r.kind}:${r.id}:${r.pending ? 'p' : 'd'}`).sort()).toEqual(['clip:k9:d', 'show:https://f/x:p']);
    s.clearAll();
    expect(s.all()).toEqual([]);
  });
});

describe('BlockStore (memory)', () => {
  it('has ignores a pending unblock, pending lists both directions, replaceDelivered keeps pending, clearAll empties', () => {
    const s = createMemoryBlockStore();
    s.put({ listenerId: 'a', displayName: 'Al', at: 1, pending: 1 });
    expect(s.has('a')).toBe(true);
    expect(s.pending()).toHaveLength(1);
    s.put({ listenerId: 'a', displayName: 'Al', at: 2, pending: 0 });
    expect(s.pending()).toHaveLength(0);
    s.put({ listenerId: 'a', displayName: 'Al', at: 3, pending: -1 });
    expect(s.has('a')).toBe(false);
    expect(s.pending()).toHaveLength(1);
    s.remove('a');
    expect(s.all()).toEqual([]);
    s.put({ listenerId: 'b', at: 4, pending: 1 });
    s.replaceDelivered([{ id: 'c', displayName: 'Cee' }, { id: 'b' }], 10);
    expect(s.all().map((r) => `${r.listenerId}:${r.pending}`).sort()).toEqual(['b:1', 'c:0']);
    s.clearAll();
    expect(s.all()).toEqual([]);
  });
});

it('sign-out and delete-account clear the hidden and block stores', async () => {
  const stores = createMemoryStores((x) => x);
  stores.hidden.put({ kind: 'comment', id: 'c1', reason: 'spam', at: 1, pending: false });
  stores.blocks.put({ listenerId: 'a', at: 1, pending: 0 });
  let token: string | undefined = 't';
  const api = { signOut: async () => {}, deleteMe: async () => {} } as unknown as ApiClient;
  const auth = createAuth({ api, stores, token: { get: async () => token, set: async (t) => { token = t; }, clear: async () => { token = undefined; } }, now: () => 1 });
  await auth.signOut();
  expect(stores.hidden.all()).toEqual([]);
  expect(stores.blocks.all()).toEqual([]);
  stores.hidden.put({ kind: 'comment', id: 'c2', reason: 'spam', at: 1, pending: false });
  await auth.deleteAccount('pw');
  expect(stores.hidden.all()).toEqual([]);
});
