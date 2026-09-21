/**
 * The phone's schema, exercised on a REAL SQLite (node:sqlite, built into Node)
 * rather than expo-sqlite, which needs a device. Same SQL, same migration
 * runner. What this proves: a v1 database (M1, user_version 0) upgrades to v2
 * with its positions intact and gains the new columns. What it does not prove:
 * that expo-sqlite on the phone behaves the same — that is a device row.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATION_001, MIGRATION_002, migrateSchema, SCHEMA_VERSION, type SchemaDb } from '../src/storage/schema';

function wrap(db: DatabaseSync): SchemaDb {
  return {
    exec: (sql) => db.exec(sql),
    getUserVersion: () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    setUserVersion: (v) => db.exec(`PRAGMA user_version = ${v}`),
  };
}

it('upgrades a v1 database to v2 with positions intact and new columns present', () => {
  const db = new DatabaseSync(':memory:');
  // An M1 phone: migration 001 applied by the old openDatabase, user_version never set.
  db.exec(MIGRATION_001);
  db.exec(`INSERT INTO positions (episode_id, offset_ms, finished, updated_at, progress_seq) VALUES ('ep', 872000, 0, 1, 7)`);

  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION);

  const row = db.prepare('SELECT * FROM positions').get() as Record<string, unknown>;
  expect(row).toMatchObject({ episode_id: 'ep', offset_ms: 872000, progress_seq: 7, explicit_seek: 0, synced_seq: 0 });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect(tables).toEqual(expect.arrayContaining(['auth', 'drafts', 'social_cache', 'positions', 'episodes']));
  const cols = (db.prepare('PRAGMA table_info(episodes)').all() as { name: string }[]).map((c) => c.name);
  expect(cols).toContain('show_title');
});

it('is idempotent: a second run applies nothing', () => {
  const db = new DatabaseSync(':memory:');
  migrateSchema(wrap(db));
  expect(() => migrateSchema(wrap(db))).not.toThrow();
  expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
});

it('M2: a v2 database (M3 phone) upgrades to v3 with positions and auth intact and the six new tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION_001);
  db.exec(MIGRATION_002);
  db.exec('PRAGMA user_version = 2');
  db.exec(`INSERT INTO positions (episode_id, offset_ms, finished, updated_at, progress_seq) VALUES ('ep', 626500, 0, 1, 522)`);
  db.exec(`INSERT INTO auth (id, listener_id, display_name, email, signed_in_at) VALUES (1, 'L', 'Jayden', 'j@x', 1)`);
  expect(migrateSchema(wrap(db))).toBe(SCHEMA_VERSION); // v2 → the latest (3 at M2, 4 since M4)
  expect(db.prepare('SELECT offset_ms, progress_seq FROM positions').get()).toMatchObject({ offset_ms: 626500, progress_seq: 522 });
  expect(db.prepare('SELECT display_name FROM auth').get()).toMatchObject({ display_name: 'Jayden' });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  expect(tables).toEqual(expect.arrayContaining(['downloads', 'queue', 'speed_prefs', 'settings', 'inbox_state', 'episode_extras']));
  expect(() => db.exec("INSERT INTO speed_prefs (feed_url, rate) VALUES ('f', 3.5)")).toThrow();
});
