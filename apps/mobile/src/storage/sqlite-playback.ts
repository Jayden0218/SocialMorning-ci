// SQLite stores for positions, the session, downloads, the queue and its backups, speed, listened ranges, the inbox.
// Split out of sqlite.ts (2026-10-31); sqlite.ts re-exports everything here, so importers are unchanged.
import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeRanges } from '@socialmorning/social-core';
import { put } from './sqlite-open';
import type {
  DownloadRow,
  DownloadState,
  DownloadStore,
  InboxLeft,
  InboxStateStore,
  ListenedRow,
  ListenedStore,
  PositionRow,
  PositionStore,
  QueueBackupStore,
  QueueStore,
  SessionStore,
  SpeedStore,
} from './types';

export function createSqlitePositionStore(db: SQLiteDatabase): PositionStore {
  const row = (r: {
    episode_id: string;
    offset_ms: number;
    duration_ms_at_save: number | null;
    finished: number;
    updated_at: number;
    progress_seq: number;
    explicit_seek: number;
    synced_seq: number;
  }): PositionRow => ({
    episodeId: r.episode_id,
    offsetMs: r.offset_ms,
    ...put('durationMsAtSave', r.duration_ms_at_save),
    finished: r.finished === 1,
    updatedAt: r.updated_at,
    progressSeq: r.progress_seq,
    explicitSeek: r.explicit_seek === 1,
    syncedSeq: r.synced_seq,
  });
  type Raw = Parameters<typeof row>[0];

  return {
    get(episodeIdValue) {
      const r = db.getFirstSync<Raw>('SELECT * FROM positions WHERE episode_id = ?', [
        episodeIdValue,
      ]);
      return r === null ? undefined : row(r);
    },
    save(p, now) {
      // `progress_seq` increments in the UPSERT itself, so two saves racing on
      // the JS thread cannot both read the same previous value and write the
      // same sequence number.
      db.runSync(
        `INSERT INTO positions (episode_id, offset_ms, duration_ms_at_save, finished, updated_at, progress_seq, explicit_seek)
         VALUES (?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(episode_id) DO UPDATE SET
           offset_ms = excluded.offset_ms,
           duration_ms_at_save = excluded.duration_ms_at_save,
           finished = excluded.finished,
           updated_at = excluded.updated_at,
           progress_seq = positions.progress_seq + 1,
           -- M3: a seek's flag stays until the server has seen it (see memory.ts).
           explicit_seek = CASE WHEN excluded.explicit_seek = 1 THEN 1
                                WHEN positions.explicit_seek = 1 AND positions.synced_seq < positions.progress_seq THEN 1
                                ELSE 0 END`,
        [p.episodeId, p.offsetMs, p.durationMsAtSave ?? null, p.finished ? 1 : 0, now, p.explicitSeek ? 1 : 0],
      );
      const saved = db.getFirstSync<Raw>('SELECT * FROM positions WHERE episode_id = ?', [
        p.episodeId,
      ]);
      /* istanbul ignore next -- the row was just written; this is a type guard */
      if (saved === null) throw new Error('position row vanished immediately after write');
      return row(saved);
    },
    all: () => db.getAllSync<Raw>('SELECT * FROM positions').map(row),
    unsynced: () => db.getAllSync<Raw>('SELECT * FROM positions WHERE synced_seq < progress_seq').map(row),
    markSynced: (episodeIdValue, progressSeq) =>
      void db.runSync('UPDATE positions SET synced_seq = ? WHERE episode_id = ? AND synced_seq < ?', [
        progressSeq, episodeIdValue, progressSeq,
      ]),
    applyRemote(p, now) {
      // Same rule as memory.ts: an unchanged offset/finished keeps its progress_seq so a
      // server echo is not re-queued; either way synced_seq = progress_seq afterwards.
      db.runSync(
        `INSERT INTO positions (episode_id, offset_ms, finished, updated_at, progress_seq, explicit_seek, synced_seq)
         VALUES (?, ?, ?, ?, 1, ?, 1)
         ON CONFLICT(episode_id) DO UPDATE SET
           progress_seq = CASE WHEN positions.offset_ms = excluded.offset_ms AND positions.finished = excluded.finished
                               THEN positions.progress_seq ELSE positions.progress_seq + 1 END,
           offset_ms = excluded.offset_ms,
           finished = excluded.finished,
           updated_at = excluded.updated_at,
           explicit_seek = excluded.explicit_seek,
           synced_seq = CASE WHEN positions.offset_ms = excluded.offset_ms AND positions.finished = excluded.finished
                             THEN positions.progress_seq ELSE positions.progress_seq + 1 END`,
        [p.episodeId, p.offsetMs, p.finished ? 1 : 0, now, p.explicitSeek ? 1 : 0],
      );
      const saved = db.getFirstSync<Raw>('SELECT * FROM positions WHERE episode_id = ?', [p.episodeId]);
      /* istanbul ignore next -- the row was just written; this is a type guard */
      if (saved === null) throw new Error('position row vanished immediately after write');
      return row(saved);
    },
  };
}

export function createSqliteSessionStore(db: SQLiteDatabase): SessionStore {
  return {
    get() {
      const r = db.getFirstSync<{
        episode_id: string | null;
        intent: string;
        updated_at: number;
      }>('SELECT * FROM session WHERE id = 1');
      if (r === null) return undefined;
      return {
        ...put('episodeId', r.episode_id),
        intent: r.intent as 'play' | 'pause',
        updatedAt: r.updated_at,
      };
    },
    set: (s, now) =>
      void db.runSync(
        `INSERT INTO session (id, episode_id, intent, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           episode_id = excluded.episode_id, intent = excluded.intent, updated_at = excluded.updated_at`,
        [s.episodeId ?? null, s.intent, now],
      ),
  };
}

export function createSqliteDownloadStore(db: SQLiteDatabase): DownloadStore {
  type Raw = {
    episode_id: string; file_path: string; state: string; bytes_done: number; bytes_total: number | null;
    resume_data: string | null; allow_mobile: number; requested_at: number; completed_at: number | null; error: string | null;
  };
  const row = (r: Raw): DownloadRow => ({
    episodeId: r.episode_id,
    filePath: r.file_path,
    state: r.state as DownloadState,
    bytesDone: r.bytes_done,
    ...put('bytesTotal', r.bytes_total),
    ...put('resumeData', r.resume_data),
    allowMobile: r.allow_mobile === 1,
    requestedAt: r.requested_at,
    ...put('completedAt', r.completed_at),
    ...put('error', r.error),
  });
  return {
    get(id) {
      const r = db.getFirstSync<Raw>('SELECT * FROM downloads WHERE episode_id = ?', [id]);
      return r === null ? undefined : row(r);
    },
    put: (d) =>
      void db.runSync(
        `INSERT INTO downloads (episode_id, file_path, state, bytes_done, bytes_total, resume_data, allow_mobile, requested_at, completed_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(episode_id) DO UPDATE SET file_path = excluded.file_path, state = excluded.state, bytes_done = excluded.bytes_done,
           bytes_total = excluded.bytes_total, resume_data = excluded.resume_data, allow_mobile = excluded.allow_mobile,
           requested_at = excluded.requested_at, completed_at = excluded.completed_at, error = excluded.error`,
        [d.episodeId, d.filePath, d.state, d.bytesDone, d.bytesTotal ?? null, d.resumeData ?? null, d.allowMobile ? 1 : 0, d.requestedAt, d.completedAt ?? null, d.error ?? null],
      ),
    list: () => db.getAllSync<Raw>('SELECT * FROM downloads ORDER BY requested_at').map(row),
    remove: (id) => void db.runSync('DELETE FROM downloads WHERE episode_id = ?', [id]),
    active() {
      const r = db.getFirstSync<Raw>("SELECT * FROM downloads WHERE state = 'downloading' LIMIT 1");
      return r === null ? undefined : row(r);
    },
  };
}

export function createSqliteQueueStore(db: SQLiteDatabase): QueueStore {
  return {
    list: () => db.getAllSync<{ episode_id: string }>('SELECT episode_id FROM queue ORDER BY position').map((r) => r.episode_id),
    replace(ids, now) {
      db.withTransactionSync(() => {
        const existing = new Map(db.getAllSync<{ episode_id: string; added_at: number }>('SELECT episode_id, added_at FROM queue').map((r) => [r.episode_id, r.added_at]));
        db.runSync('DELETE FROM queue');
        ids.forEach((id, i) => db.runSync('INSERT INTO queue (episode_id, position, added_at) VALUES (?, ?, ?)', [id, i, existing.get(id) ?? now]));
      });
    },
  };
}

type BackupRow = { id: number; items: string; device: string | null; reason: string; created_at: number };
const toBackup = (r: BackupRow) => ({ id: r.id, items: JSON.parse(r.items) as string[], device: r.device, reason: r.reason as 'chooser' | 'manual' | 'restore', createdAt: r.created_at });

export function createSqliteQueueBackupStore(db: SQLiteDatabase): QueueBackupStore {
  return {
    list: () => db.getAllSync<BackupRow>('SELECT * FROM queue_backups ORDER BY created_at DESC, id DESC').map(toBackup),
    add(b, keep = 10) {
      db.withTransactionSync(() => {
        db.runSync('INSERT INTO queue_backups (items, device, reason, created_at) VALUES (?, ?, ?, ?)', [JSON.stringify(b.items), b.device, b.reason, b.createdAt]);
        db.runSync('DELETE FROM queue_backups WHERE id NOT IN (SELECT id FROM queue_backups ORDER BY created_at DESC, id DESC LIMIT ?)', [keep]);
      });
    },
    get(id) {
      const r = db.getFirstSync<BackupRow>('SELECT * FROM queue_backups WHERE id = ?', [id]);
      return r ? toBackup(r) : undefined;
    },
  };
}

export function createSqliteSpeedStore(db: SQLiteDatabase): SpeedStore {
  return {
    get: (f) => db.getFirstSync<{ rate: number }>('SELECT rate FROM speed_prefs WHERE feed_url = ?', [f])?.rate,
    set: (f, r) => void db.runSync('INSERT INTO speed_prefs (feed_url, rate) VALUES (?, ?) ON CONFLICT(feed_url) DO UPDATE SET rate = excluded.rate', [f, r]),
    clear: (f) => void db.runSync('DELETE FROM speed_prefs WHERE feed_url = ?', [f]),
  };
}

export function createSqliteListenedStore(db: SQLiteDatabase): ListenedStore {
  type Raw = { episode_id: string; day: string; ranges: string; dirty: number };
  const row = (r: Raw): ListenedRow => ({ episodeId: r.episode_id, day: r.day, ranges: JSON.parse(r.ranges) as [number, number][], dirty: r.dirty === 1 });
  return {
    get(e, d) {
      const r = db.getFirstSync<Raw>('SELECT * FROM listened WHERE episode_id = ? AND day = ?', [e, d]);
      return r === null ? undefined : row(r);
    },
    addRanges(e, d, ranges) {
      const cur = db.getFirstSync<Raw>('SELECT * FROM listened WHERE episode_id = ? AND day = ?', [e, d]);
      const merged = mergeRanges([...(cur === null ? [] : (JSON.parse(cur.ranges) as [number, number][])), ...ranges]);
      db.runSync(
        'INSERT INTO listened (episode_id, day, ranges, dirty) VALUES (?, ?, ?, 1) ON CONFLICT(episode_id, day) DO UPDATE SET ranges = excluded.ranges, dirty = 1',
        [e, d, JSON.stringify(merged)],
      );
    },
    dirty: () => db.getAllSync<Raw>('SELECT * FROM listened WHERE dirty = 1').map(row),
    markPushed(keys) {
      for (const k of keys) db.runSync('UPDATE listened SET dirty = 0 WHERE episode_id = ? AND day = ?', [k.episodeId, k.day]);
    },
  };
}

export function createSqliteInboxStateStore(db: SQLiteDatabase): InboxStateStore {
  return {
    get(id) {
      const r = db.getFirstSync<{ left: string; at: number }>('SELECT left, at FROM inbox_state WHERE episode_id = ?', [id]);
      return r === null ? undefined : { left: r.left as InboxLeft, at: r.at };
    },
    mark: (id, left, now) => void db.runSync('INSERT OR IGNORE INTO inbox_state (episode_id, left, at) VALUES (?, ?, ?)', [id, left, now]),
    all: () => new Set(db.getAllSync<{ episode_id: string }>('SELECT episode_id FROM inbox_state').map((r) => r.episode_id)),
  };
}
