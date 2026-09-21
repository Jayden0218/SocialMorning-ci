/**
 * Migration 001 — the whole of M1's on-device schema (data-model.md).
 *
 * Two things in here are load-bearing and easy to "tidy" into a bug:
 *
 *  1. `positions.progress_seq` is NOT NULL and monotonic. The constitution
 *     says last-write-wins on a wall clock is the wrong merge rule, so M3's
 *     sync keys on `updated_at` PLUS this counter. It is in the FIRST
 *     migration because a row already written without it has no ordering
 *     information that can be recovered later.
 *
 *  2. `subscriptions` has NO foreign key and NO cascade to `positions`
 *     (FR-023). Unsubscribing must not destroy where you got to. The tempting
 *     `ON DELETE CASCADE` here is precisely the bug the requirement names.
 *
 * `episodes.id` is `hash(feedUrl + '\u0001' + guid)` — computed in the store,
 * not by SQLite, because the same function has to run in Node for the tests.
 * The separator is U+0001, which cannot appear in a URL or a sane guid, so
 * two different (feedUrl, guid) pairs cannot collide by concatenation.
 */
export const SCHEMA_VERSION = 4;

export const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS shows (
  feed_url       TEXT PRIMARY KEY NOT NULL,
  guid           TEXT,
  title          TEXT NOT NULL,
  description    TEXT,
  author         TEXT,
  image_url      TEXT,
  language       TEXT,
  link           TEXT,
  explicit       INTEGER NOT NULL DEFAULT 0,
  categories     TEXT NOT NULL DEFAULT '[]',
  content_hash   TEXT NOT NULL,
  fetched_at     INTEGER NOT NULL,
  etag           TEXT,
  last_modified  TEXT,
  last_warnings  TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS episodes (
  id              TEXT PRIMARY KEY NOT NULL,
  feed_url        TEXT NOT NULL REFERENCES shows(feed_url) ON DELETE CASCADE,
  guid            TEXT NOT NULL,
  guid_source     TEXT NOT NULL,
  title           TEXT NOT NULL,
  enclosure_url   TEXT NOT NULL,
  enclosure_type  TEXT,
  enclosure_bytes INTEGER,
  duration_ms     INTEGER,
  published_at    INTEGER,
  shownotes_html  TEXT,
  image_url       TEXT,
  season          INTEGER,
  episode_number  INTEGER,
  episode_type    TEXT,
  explicit        INTEGER NOT NULL DEFAULT 0,
  chapters_url    TEXT,
  transcripts     TEXT NOT NULL DEFAULT '[]',
  soundbites      TEXT NOT NULL DEFAULT '[]',
  content_hash    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS episodes_by_show
  ON episodes (feed_url, published_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  feed_url      TEXT PRIMARY KEY NOT NULL,
  subscribed_at INTEGER NOT NULL
);

-- FR-023: deliberately NOT "REFERENCES episodes(id) ON DELETE CASCADE".
-- A position outlives its episode row, its show and its subscription.
CREATE TABLE IF NOT EXISTS positions (
  episode_id         TEXT PRIMARY KEY NOT NULL,
  offset_ms          INTEGER NOT NULL,
  duration_ms_at_save INTEGER NULL,
  finished           INTEGER NOT NULL DEFAULT 0,
  updated_at         INTEGER NOT NULL,
  progress_seq       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  episode_id TEXT,
  intent     TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** U+0001: not legal in a URL, and not something a publisher puts in a guid. */
export const EPISODE_ID_SEPARATOR = '\u0001';

export function episodeId(feedUrl: string, guid: string, hash: (s: string) => string): string {
  return hash(feedUrl + EPISODE_ID_SEPARATOR + guid);
}

/**
 * Migration 002 — M3 (specs/002-m3-social-layer/data-model.md, "Phone").
 *
 * Three new tables and three columns. The token itself is NOT in `auth`: it
 * lives in expo-secure-store; this table holds only what the UI shows.
 *
 * `positions.explicit_seek` is the flag research R5's merge rule needs, and
 * `positions.synced_seq` is the upload queue: a row with
 * `synced_seq < progress_seq` has something the server has not accepted yet.
 * No separate outbox table, so nothing can drift from the row it describes.
 */
export const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  listener_id   TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  signed_in_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS social_cache (
  episode_id    TEXT PRIMARY KEY NOT NULL,
  etag          TEXT,
  fetched_at    INTEGER NOT NULL,
  body_json     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  episode_id    TEXT PRIMARY KEY NOT NULL,
  body          TEXT NOT NULL,
  offset_ms     INTEGER NULL,
  parent_id     TEXT NULL,
  saved_at      INTEGER NOT NULL
);

ALTER TABLE positions ADD COLUMN explicit_seek INTEGER NOT NULL DEFAULT 0;
ALTER TABLE positions ADD COLUMN synced_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE episodes ADD COLUMN show_title TEXT NULL;
`;

/**
 * Migration 003 — M2 (specs/003-m2-real-client/data-model.md). Everything on the
 * phone, nothing synced. No foreign keys: a download, a queue row, an inbox mark
 * outlive the feed row exactly as a position does (M1 FR-023).
 */
export const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS downloads (
  episode_id    TEXT PRIMARY KEY NOT NULL,
  file_path     TEXT NOT NULL,
  state         TEXT NOT NULL,
  bytes_done    INTEGER NOT NULL DEFAULT 0,
  bytes_total   INTEGER NULL,
  resume_data   TEXT NULL,
  allow_mobile  INTEGER NOT NULL DEFAULT 0,
  requested_at  INTEGER NOT NULL,
  completed_at  INTEGER NULL,
  error         TEXT NULL
);

CREATE TABLE IF NOT EXISTS queue (
  episode_id    TEXT PRIMARY KEY NOT NULL,
  position      INTEGER NOT NULL,
  added_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS speed_prefs (
  feed_url      TEXT PRIMARY KEY NOT NULL,
  rate          REAL NOT NULL CHECK (rate BETWEEN 0.5 AND 3.0)
);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY NOT NULL,
  value         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_state (
  episode_id    TEXT PRIMARY KEY NOT NULL,
  left          TEXT NOT NULL,
  at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS episode_extras (
  episode_id      TEXT PRIMARY KEY NOT NULL,
  chapters_json   TEXT NULL,
  transcript_json TEXT NULL,
  fetched_at      INTEGER NOT NULL,
  error           TEXT NULL
);
`;

/** M4 — the graph (specs/004-m4-the-graph/data-model.md). Nothing here is media. */
export const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS pending_clips (
  client_id     TEXT PRIMARY KEY NOT NULL,
  episode_id    TEXT NOT NULL,
  start_ms      INTEGER NOT NULL,
  end_ms        INTEGER NOT NULL,
  caption       TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT NULL
);

CREATE TABLE IF NOT EXISTS listened (
  episode_id    TEXT NOT NULL,
  day           TEXT NOT NULL,
  ranges        TEXT NOT NULL,
  dirty         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (episode_id, day)
);

CREATE TABLE IF NOT EXISTS feed_cache (
  key           TEXT PRIMARY KEY NOT NULL,
  etag          TEXT NULL,
  fetched_at    INTEGER NOT NULL,
  body          TEXT NOT NULL
);
`;

export const MIGRATIONS: readonly string[] = [MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004];

/** The minimum a database must offer for `migrateSchema` (expo-sqlite and node:sqlite both do). */
export interface SchemaDb {
  exec(sql: string): void;
  getUserVersion(): number;
  setUserVersion(v: number): void;
}

/**
 * Applies every migration above the database's `PRAGMA user_version`, in order,
 * then records the new version. Migration 001 is all `IF NOT EXISTS`, so a
 * database from before versioning (user_version 0, tables present) is simply
 * stamped 1 and continues. 002 has `ALTER TABLE`s and MUST run exactly once —
 * that is what the version is for.
 */
export function migrateSchema(db: SchemaDb): number {
  let version = db.getUserVersion();
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]!);
    version = i + 1;
    db.setUserVersion(version);
  }
  return version;
}
