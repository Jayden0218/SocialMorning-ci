// SQLite stores for sign-in, settings, the social cache, drafts, pending clips, hidden items, blocks, the rec outbox.
// Split out of sqlite.ts (2026-10-31); sqlite.ts re-exports everything here, so importers are unchanged.
import type { SQLiteDatabase } from 'expo-sqlite';
import { put } from './sqlite-open';
import type {
  AuthStore,
  BlockRow,
  BlockStore,
  DraftStore,
  HiddenKind,
  HiddenRow,
  HiddenStore,
  PendingClipRow,
  PendingClipStore,
  RecEventRow,
  RecOutboxStore,
  SettingsStore,
  SocialCacheStore,
} from './types';

export function createSqliteAuthStore(db: SQLiteDatabase): AuthStore {
  type Raw = { listener_id: string; display_name: string; email: string; signed_in_at: number };
  return {
    get() {
      const r = db.getFirstSync<Raw>('SELECT * FROM auth WHERE id = 1');
      return r === null
        ? undefined
        : { listenerId: r.listener_id, displayName: r.display_name, email: r.email, signedInAt: r.signed_in_at };
    },
    set: (a, now) =>
      void db.runSync(
        `INSERT INTO auth (id, listener_id, display_name, email, signed_in_at) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET listener_id = excluded.listener_id, display_name = excluded.display_name,
           email = excluded.email, signed_in_at = excluded.signed_in_at`,
        [a.listenerId, a.displayName, a.email, now],
      ),
    clear: () => void db.runSync('DELETE FROM auth'),
  };
}

export function createSqliteSettingsStore(db: SQLiteDatabase): SettingsStore {
  return {
    get: (k) => db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [k])?.value,
    set: (k, v) => void db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]),
  };
}

export function createSqliteSocialCacheStore(db: SQLiteDatabase): SocialCacheStore {
  type Raw = { episode_id: string; etag: string | null; fetched_at: number; body_json: string };
  return {
    get(episodeIdValue) {
      const r = db.getFirstSync<Raw>('SELECT * FROM social_cache WHERE episode_id = ?', [episodeIdValue]);
      return r === null
        ? undefined
        : { episodeId: r.episode_id, ...put('etag', r.etag), fetchedAt: r.fetched_at, bodyJson: r.body_json };
    },
    put: (r) =>
      void db.runSync(
        `INSERT INTO social_cache (episode_id, etag, fetched_at, body_json) VALUES (?, ?, ?, ?)
         ON CONFLICT(episode_id) DO UPDATE SET etag = excluded.etag, fetched_at = excluded.fetched_at, body_json = excluded.body_json`,
        [r.episodeId, r.etag ?? null, r.fetchedAt, r.bodyJson],
      ),
    bytes: () => Number(db.getFirstSync<{ n: number }>('SELECT coalesce(sum(length(CAST(body_json AS BLOB))), 0) AS n FROM social_cache')?.n ?? 0),
    clear: () => void db.runSync('DELETE FROM social_cache'),
  };
}

export function createSqliteDraftStore(db: SQLiteDatabase): DraftStore {
  type Raw = { episode_id: string; body: string; offset_ms: number | null; parent_id: string | null; saved_at: number };
  return {
    get(episodeIdValue) {
      const r = db.getFirstSync<Raw>('SELECT * FROM drafts WHERE episode_id = ?', [episodeIdValue]);
      return r === null
        ? undefined
        : { episodeId: r.episode_id, body: r.body, ...put('offsetMs', r.offset_ms), ...put('parentId', r.parent_id), savedAt: r.saved_at };
    },
    put: (r) =>
      void db.runSync(
        `INSERT INTO drafts (episode_id, body, offset_ms, parent_id, saved_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(episode_id) DO UPDATE SET body = excluded.body, offset_ms = excluded.offset_ms,
           parent_id = excluded.parent_id, saved_at = excluded.saved_at`,
        [r.episodeId, r.body, r.offsetMs ?? null, r.parentId ?? null, r.savedAt],
      ),
    clear: (episodeIdValue) => void db.runSync('DELETE FROM drafts WHERE episode_id = ?', [episodeIdValue]),
    clearAll: () => void db.runSync('DELETE FROM drafts'),
  };
}

export function createSqlitePendingClipStore(db: SQLiteDatabase): PendingClipStore {
  type Raw = { client_id: string; episode_id: string; start_ms: number; end_ms: number; caption: string; created_at: number; attempts: number; last_error: string | null };
  const row = (r: Raw): PendingClipRow => ({ clientId: r.client_id, episodeId: r.episode_id, startMs: r.start_ms, endMs: r.end_ms, caption: r.caption, createdAt: r.created_at, attempts: r.attempts, ...put('lastError', r.last_error) });
  return {
    list: () => db.getAllSync<Raw>('SELECT * FROM pending_clips ORDER BY created_at').map(row),
    listForEpisode: (id) => db.getAllSync<Raw>('SELECT * FROM pending_clips WHERE episode_id = ? ORDER BY created_at', [id]).map(row),
    put: (r) =>
      void db.runSync(
        `INSERT INTO pending_clips (client_id, episode_id, start_ms, end_ms, caption, created_at, attempts, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET attempts = excluded.attempts, last_error = excluded.last_error`,
        [r.clientId, r.episodeId, r.startMs, r.endMs, r.caption, r.createdAt, r.attempts, r.lastError ?? null],
      ),
    remove: (id) => void db.runSync('DELETE FROM pending_clips WHERE client_id = ?', [id]),
  };
}

export function createSqliteHiddenStore(db: SQLiteDatabase): HiddenStore {
  type Raw = { kind: HiddenKind; id: string; reason: string; note: string | null; at: number; pending: number };
  const row = (r: Raw): HiddenRow => ({ kind: r.kind, id: r.id, reason: r.reason, ...put('note', r.note), at: r.at, pending: r.pending === 1 });
  return {
    has: (kind, id) => db.getFirstSync('SELECT 1 FROM hidden WHERE kind = ? AND id = ?', [kind, id]) !== null,
    all: () => db.getAllSync<Raw>('SELECT * FROM hidden ORDER BY at').map(row),
    put: (r) => void db.runSync('INSERT OR IGNORE INTO hidden (kind, id, reason, note, at, pending) VALUES (?, ?, ?, ?, ?, ?)', [r.kind, r.id, r.reason, r.note ?? null, r.at, r.pending ? 1 : 0]),
    pending: () => db.getAllSync<Raw>('SELECT * FROM hidden WHERE pending = 1 ORDER BY at').map(row),
    markDelivered: (kind, id) => void db.runSync('UPDATE hidden SET pending = 0 WHERE kind = ? AND id = ?', [kind, id]),
    replaceDelivered(list, now) {
      db.runSync('DELETE FROM hidden WHERE pending = 0');
      for (const r of list) db.runSync('INSERT OR IGNORE INTO hidden (kind, id, reason, note, at, pending) VALUES (?, ?, ?, NULL, ?, 0)', [r.kind, r.id, 'server', now]);
    },
    clearAll: () => void db.runSync('DELETE FROM hidden'),
  };
}

export function createSqliteBlockStore(db: SQLiteDatabase): BlockStore {
  type Raw = { listener_id: string; display_name: string | null; at: number; pending: number };
  const row = (r: Raw): BlockRow => ({ listenerId: r.listener_id, ...put('displayName', r.display_name), at: r.at, pending: r.pending as 1 | 0 | -1 });
  return {
    has: (id) => db.getFirstSync('SELECT 1 FROM blocks WHERE listener_id = ? AND pending >= 0', [id]) !== null,
    all: () => db.getAllSync<Raw>('SELECT * FROM blocks ORDER BY at').map(row),
    put: (r) => void db.runSync('INSERT INTO blocks (listener_id, display_name, at, pending) VALUES (?, ?, ?, ?) ON CONFLICT(listener_id) DO UPDATE SET display_name = excluded.display_name, at = excluded.at, pending = excluded.pending', [r.listenerId, r.displayName ?? null, r.at, r.pending]),
    remove: (id) => void db.runSync('DELETE FROM blocks WHERE listener_id = ?', [id]),
    pending: () => db.getAllSync<Raw>('SELECT * FROM blocks WHERE pending <> 0 ORDER BY at').map(row),
    replaceDelivered(list, now) {
      db.runSync('DELETE FROM blocks WHERE pending = 0');
      for (const r of list) db.runSync('INSERT OR IGNORE INTO blocks (listener_id, display_name, at, pending) VALUES (?, ?, ?, 0)', [r.id, r.displayName ?? null, now]);
    },
    clearAll: () => void db.runSync('DELETE FROM blocks'),
  };
}

export function createSqliteRecOutboxStore(db: SQLiteDatabase): RecOutboxStore {
  return {
    add: (r) => void db.runSync('INSERT INTO rec_outbox (episode_id, channel, rank, kind, at) VALUES (?, ?, ?, ?, ?)', [r.episodeId, r.channel, r.rank, r.kind, r.at]),
    take: (limit) =>
      db
        .getAllSync<{ id: number; episode_id: string; channel: string; rank: number; kind: string; at: number }>(
          'SELECT id, episode_id, channel, rank, kind, at FROM rec_outbox ORDER BY id LIMIT ?', [limit])
        .map((r) => ({ id: r.id, episodeId: r.episode_id, channel: r.channel as RecEventRow['channel'], rank: r.rank, kind: r.kind as RecEventRow['kind'], at: r.at })),
    remove: (ids) => { for (const id of ids) db.runSync('DELETE FROM rec_outbox WHERE id = ?', [id]); },
    clear: () => void db.runSync('DELETE FROM rec_outbox'),
    count: () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM rec_outbox')?.n ?? 0,
  };
}
