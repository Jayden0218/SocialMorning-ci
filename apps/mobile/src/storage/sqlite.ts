/**
 * `expo-sqlite` implementations of the four stores.
 *
 * API VERIFIED against the installed typings, not recalled (Principle III):
 * `node_modules/expo-sqlite/build/SQLiteDatabase.d.ts` (expo-sqlite 58.0.3)
 * declares `openDatabaseSync`, `execSync`, `runSync`, `getAllSync<T>`,
 * `getFirstSync<T>` and `withTransactionSync`.
 *
 * NOT VERIFIED: none of this has been executed. `expo-sqlite` is a native
 * module and this build machine has no device and no Android SDK. The rules
 * these stores must obey are pinned by `__tests__/storage.test.ts` against
 * `memory.ts`; that the SQL below implements the same rules is reviewed, not
 * tested, until it runs on the phone.
 */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { episodeId, migrateSchema } from './schema';
import { byNewestFirst } from './memory';
import { mergeRanges } from '@socialmorning/social-core';
import type {
  AuthStore,
  CachedEpisode,
  CachedShow,
  DownloadRow,
  DownloadState,
  DownloadStore,
  DraftStore,
  ExtrasRow,
  ExtrasStore,
  PendingClipRow,
  PendingClipStore,
  ListenedRow,
  ListenedStore,
  FeedCacheRow,
  FeedCacheStore,
  FeedCache,
  InboxLeft,
  InboxStateStore,
  QueueStore,
  SettingsStore,
  SpeedStore,
  PositionRow,
  PositionStore,
  SessionStore,
  SocialCacheStore,
  Stores,
  SubscriptionStore,
  HiddenStore,
  HiddenRow,
  HiddenKind,
  BlockStore,
  BlockRow,
  RecOutboxStore,
  RecEventRow,
} from './types';
import type { Episode } from '@socialmorning/feed-parser';

export const DATABASE_NAME = 'socialmorning.db';

type ShowRow = {
  feed_url: string;
  guid: string | null;
  title: string;
  description: string | null;
  author: string | null;
  image_url: string | null;
  language: string | null;
  link: string | null;
  explicit: number;
  categories: string;
  content_hash: string;
  fetched_at: number;
  etag: string | null;
  last_modified: string | null;
  last_warnings: string;
};

type EpisodeRow = {
  id: string;
  feed_url: string;
  guid: string;
  guid_source: string;
  title: string;
  enclosure_url: string;
  enclosure_type: string | null;
  enclosure_bytes: number | null;
  duration_ms: number | null;
  published_at: number | null;
  shownotes_html: string | null;
  image_url: string | null;
  season: number | null;
  episode_number: number | null;
  episode_type: string | null;
  explicit: number;
  chapters_url: string | null;
  transcripts: string;
  soundbites: string;
  content_hash: string;
};

const put = <K extends string, T>(key: K, v: T | null): { [P in K]?: T } =>
  (v === null ? {} : { [key]: v }) as { [P in K]?: T };

function toShow(r: ShowRow): CachedShow {
  return {
    feedUrl: r.feed_url,
    ...put('guid', r.guid),
    title: r.title,
    ...put('description', r.description),
    ...put('author', r.author),
    ...put('imageUrl', r.image_url),
    ...put('language', r.language),
    ...put('link', r.link),
    explicit: r.explicit === 1,
    categories: JSON.parse(r.categories) as string[],
    contentHash: r.content_hash,
    fetchedAt: r.fetched_at,
    ...put('etag', r.etag),
    ...put('lastModified', r.last_modified),
    lastWarnings: JSON.parse(r.last_warnings) as CachedShow['lastWarnings'],
  };
}

function toEpisode(r: EpisodeRow): CachedEpisode {
  return {
    id: r.id,
    feedUrl: r.feed_url,
    guid: r.guid,
    guidSource: r.guid_source as Episode['guidSource'],
    title: r.title,
    enclosureUrl: r.enclosure_url,
    ...put('enclosureType', r.enclosure_type),
    ...put('enclosureBytes', r.enclosure_bytes),
    ...put('durationMs', r.duration_ms),
    ...put('publishedAt', r.published_at),
    ...put('shownotesHtml', r.shownotes_html),
    ...put('imageUrl', r.image_url),
    ...put('season', r.season),
    ...put('episodeNumber', r.episode_number),
    ...put('episodeType', r.episode_type),
    explicit: r.explicit === 1,
    ...put('chaptersUrl', r.chapters_url),
    transcripts: JSON.parse(r.transcripts) as Episode['transcripts'],
    soundbites: JSON.parse(r.soundbites) as Episode['soundbites'],
    contentHash: r.content_hash,
  };
}

export function openDatabase(name: string = DATABASE_NAME): SQLiteDatabase {
  const db = openDatabaseSync(name);
  db.withTransactionSync(() => {
    migrateSchema({
      exec: (sql) => db.execSync(sql),
      getUserVersion: () => db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0,
      setUserVersion: (v) => db.execSync(`PRAGMA user_version = ${v}`),
    });
  });
  return db;
}

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

export function createSqliteSubscriptionStore(db: SQLiteDatabase): SubscriptionStore {
  return {
    list: () =>
      db
        .getAllSync<{ feed_url: string; subscribed_at: number }>(
          'SELECT * FROM subscriptions WHERE deleted_at IS NULL ORDER BY subscribed_at DESC',
        )
        .map((r) => ({ feedUrl: r.feed_url, subscribedAt: r.subscribed_at })),
    add: (feedUrl, now) =>
      void db.runSync(
        // M8: re-subscribing must clear the tombstone, not be swallowed by DO NOTHING.
        'INSERT INTO subscriptions (feed_url, subscribed_at, deleted_at) VALUES (?, ?, NULL) ON CONFLICT(feed_url) DO UPDATE SET subscribed_at = excluded.subscribed_at, deleted_at = NULL WHERE subscriptions.deleted_at IS NOT NULL',
        [feedUrl, now],
      ),
    // FR-023. One statement, one table. Nothing here reaches `positions`, and
    // the schema deliberately gives it no cascade that could.
    // M8: a tombstone, not a DELETE — see SubscriptionStore.remove.
    remove: (feedUrl, now = Date.now()) =>
      void db.runSync('UPDATE subscriptions SET deleted_at = ? WHERE feed_url = ? AND deleted_at IS NULL', [now, feedUrl]),
    has: (feedUrl) =>
      db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM subscriptions WHERE feed_url = ? AND deleted_at IS NULL', [
        feedUrl,
      ])?.n === 1,
    all: () =>
      db
        .getAllSync<{ feed_url: string; subscribed_at: number; deleted_at: number | null; starred: number }>(
          'SELECT feed_url, subscribed_at, deleted_at, starred FROM subscriptions ORDER BY subscribed_at DESC',
        )
        .map((r) => ({ feedUrl: r.feed_url, subscribedAt: r.subscribed_at, ...(r.deleted_at === null ? {} : { deletedAt: r.deleted_at }), starred: r.starred === 1 })),
    replaceAll: (rows) => {
      db.runSync('DELETE FROM subscriptions');
      for (const r of rows) {
        db.runSync('INSERT INTO subscriptions (feed_url, subscribed_at, deleted_at, starred) VALUES (?, ?, ?, ?)',
          [r.feedUrl, r.subscribedAt, r.deletedAt ?? null, r.starred ? 1 : 0]);
      }
    },
  };
}

export function createSqliteRecOutboxStore(db: SQLiteDatabase): RecOutboxStore {
  return {
    add: (r) => void db.runSync('INSERT INTO rec_outbox (episode_id, channel, rank, kind, at) VALUES (?, ?, ?, ?, ?)', [r.episodeId, r.channel, r.rank, r.kind, r.at]),
    take: (limit) =>
      db
        .getAllSync<{ id: number; episode_id: string; channel: string; rank: number; kind: string; at: number }>(
          'SELECT id, episode_id, channel, rank, kind, at FROM rec_outbox ORDER BY id LIMIT ?', [limit])
        .map((r) => ({ id: r.id, episodeId: r.episode_id, channel: r.channel, rank: r.rank, kind: r.kind as RecEventRow['kind'], at: r.at })),
    remove: (ids) => { for (const id of ids) db.runSync('DELETE FROM rec_outbox WHERE id = ?', [id]); },
    clear: () => void db.runSync('DELETE FROM rec_outbox'),
    count: () => db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM rec_outbox')?.n ?? 0,
  };
}

export function createSqliteFeedCache(db: SQLiteDatabase, hash: (s: string) => string): FeedCache {
  return {
    getShow(feedUrl) {
      const r = db.getFirstSync<ShowRow>('SELECT * FROM shows WHERE feed_url = ?', [feedUrl]);
      return r === null ? undefined : toShow(r);
    },
    getEpisode(id) {
      const r = db.getFirstSync<EpisodeRow>('SELECT * FROM episodes WHERE id = ?', [id]);
      return r === null ? undefined : toEpisode(r);
    },
    listEpisodes(feedUrl) {
      // `published_at IS NULL` first in the ORDER BY is the portable spelling
      // of NULLS LAST, and it sorts undated episodes to the end (FR-002).
      return db
        .getAllSync<EpisodeRow>(
          'SELECT * FROM episodes WHERE feed_url = ? ORDER BY published_at IS NULL, published_at DESC',
          [feedUrl],
        )
        .map(toEpisode)
        .sort(byNewestFirst);
    },
    put(feedUrl, parsed, http, now) {
      const rows = parsed.episodes.map((episode) => ({
        id: episodeId(feedUrl, episode.guid, hash),
        episode,
      }));
      // One transaction: a refresh interrupted half-way must leave either the
      // old episode list or the new one, never a mixture.
      db.withTransactionSync(() => {
        db.runSync(
          `INSERT INTO shows (feed_url, guid, title, description, author, image_url, language, link,
                              explicit, categories, content_hash, fetched_at, etag, last_modified, last_warnings)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(feed_url) DO UPDATE SET
             guid = excluded.guid, title = excluded.title, description = excluded.description,
             author = excluded.author, image_url = excluded.image_url, language = excluded.language,
             link = excluded.link, explicit = excluded.explicit, categories = excluded.categories,
             content_hash = excluded.content_hash, fetched_at = excluded.fetched_at,
             etag = excluded.etag, last_modified = excluded.last_modified,
             last_warnings = excluded.last_warnings`,
          [
            feedUrl,
            parsed.show.guid ?? null,
            parsed.show.title,
            parsed.show.description ?? null,
            parsed.show.author ?? null,
            parsed.show.imageUrl ?? null,
            parsed.show.language ?? null,
            parsed.show.link ?? null,
            parsed.show.explicit ? 1 : 0,
            JSON.stringify(parsed.show.categories),
            parsed.show.contentHash,
            now,
            http.etag ?? null,
            http.lastModified ?? null,
            JSON.stringify(parsed.warnings),
          ],
        );

        // Episodes the feed no longer carries go; the rest are upserted. The
        // `WHERE content_hash IS DISTINCT` guard is what keeps a poll that
        // changed nothing from rewriting every row (and its rowids).
        const keep = rows.map((r) => r.id);
        const placeholders = keep.map(() => '?').join(', ');
        db.runSync(
          keep.length === 0
            ? 'DELETE FROM episodes WHERE feed_url = ?'
            : `DELETE FROM episodes WHERE feed_url = ? AND id NOT IN (${placeholders})`,
          [feedUrl, ...keep],
        );

        for (const { id, episode } of rows) {
          db.runSync(
            `INSERT INTO episodes (id, feed_url, guid, guid_source, title, enclosure_url, enclosure_type,
                                   enclosure_bytes, duration_ms, published_at, shownotes_html, image_url,
                                   season, episode_number, episode_type, explicit, chapters_url,
                                   transcripts, soundbites, content_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               guid = excluded.guid, guid_source = excluded.guid_source, title = excluded.title,
               enclosure_url = excluded.enclosure_url, enclosure_type = excluded.enclosure_type,
               enclosure_bytes = excluded.enclosure_bytes, duration_ms = excluded.duration_ms,
               published_at = excluded.published_at, shownotes_html = excluded.shownotes_html,
               image_url = excluded.image_url, season = excluded.season,
               episode_number = excluded.episode_number, episode_type = excluded.episode_type,
               explicit = excluded.explicit, chapters_url = excluded.chapters_url,
               transcripts = excluded.transcripts, soundbites = excluded.soundbites,
               content_hash = excluded.content_hash
             WHERE episodes.content_hash <> excluded.content_hash`,
            [
              id,
              feedUrl,
              episode.guid,
              episode.guidSource,
              episode.title,
              episode.enclosureUrl,
              episode.enclosureType ?? null,
              episode.enclosureBytes ?? null,
              episode.durationMs ?? null,
              episode.publishedAt ?? null,
              episode.shownotesHtml ?? null,
              episode.imageUrl ?? null,
              episode.season ?? null,
              episode.episodeNumber ?? null,
              episode.episodeType ?? null,
              episode.explicit ? 1 : 0,
              episode.chaptersUrl ?? null,
              JSON.stringify(episode.transcripts),
              JSON.stringify(episode.soundbites),
              episode.contentHash,
            ],
          );
        }
      });
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

// ---- M2 ----

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

export function createSqliteSpeedStore(db: SQLiteDatabase): SpeedStore {
  return {
    get: (f) => db.getFirstSync<{ rate: number }>('SELECT rate FROM speed_prefs WHERE feed_url = ?', [f])?.rate,
    set: (f, r) => void db.runSync('INSERT INTO speed_prefs (feed_url, rate) VALUES (?, ?) ON CONFLICT(feed_url) DO UPDATE SET rate = excluded.rate', [f, r]),
    clear: (f) => void db.runSync('DELETE FROM speed_prefs WHERE feed_url = ?', [f]),
  };
}

export function createSqliteSettingsStore(db: SQLiteDatabase): SettingsStore {
  return {
    get: (k) => db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [k])?.value,
    set: (k, v) => void db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]),
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

export function createSqliteExtrasStore(db: SQLiteDatabase): ExtrasStore {
  type Raw = { episode_id: string; chapters_json: string | null; transcript_json: string | null; fetched_at: number; error: string | null };
  return {
    get(id) {
      const r = db.getFirstSync<Raw>('SELECT * FROM episode_extras WHERE episode_id = ?', [id]);
      return r === null ? undefined : { episodeId: r.episode_id, ...put('chaptersJson', r.chapters_json), ...put('transcriptJson', r.transcript_json), fetchedAt: r.fetched_at, ...put('error', r.error) };
    },
    put: (e) =>
      void db.runSync(
        `INSERT INTO episode_extras (episode_id, chapters_json, transcript_json, fetched_at, error) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(episode_id) DO UPDATE SET chapters_json = excluded.chapters_json, transcript_json = excluded.transcript_json, fetched_at = excluded.fetched_at, error = excluded.error`,
        [e.episodeId, e.chaptersJson ?? null, e.transcriptJson ?? null, e.fetchedAt, e.error ?? null],
      ),
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

export function createSqliteFeedCacheStore(db: SQLiteDatabase): FeedCacheStore {
  type Raw = { key: string; etag: string | null; fetched_at: number; body: string };
  return {
    get(k) {
      const r = db.getFirstSync<Raw>('SELECT * FROM feed_cache WHERE key = ?', [k]);
      return r === null ? undefined : { key: r.key, ...put('etag', r.etag), fetchedAt: r.fetched_at, body: r.body };
    },
    set: (r) =>
      void db.runSync(
        'INSERT INTO feed_cache (key, etag, fetched_at, body) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET etag = excluded.etag, fetched_at = excluded.fetched_at, body = excluded.body',
        [r.key, r.etag ?? null, r.fetchedAt, r.body],
      ),
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

export function createSqliteStores(hash: (s: string) => string, name?: string): Stores {
  const db = openDatabase(name);
  return {
    positions: createSqlitePositionStore(db),
    subscriptions: createSqliteSubscriptionStore(db),
    recOutbox: createSqliteRecOutboxStore(db),
    feeds: createSqliteFeedCache(db, hash),
    session: createSqliteSessionStore(db),
    auth: createSqliteAuthStore(db),
    socialCache: createSqliteSocialCacheStore(db),
    drafts: createSqliteDraftStore(db),
    downloads: createSqliteDownloadStore(db),
    queue: createSqliteQueueStore(db),
    speed: createSqliteSpeedStore(db),
    settings: createSqliteSettingsStore(db),
    inboxState: createSqliteInboxStateStore(db),
    extras: createSqliteExtrasStore(db),
    pendingClips: createSqlitePendingClipStore(db),
    listened: createSqliteListenedStore(db),
    feedCache: createSqliteFeedCacheStore(db),
    hidden: createSqliteHiddenStore(db),
    blocks: createSqliteBlockStore(db),
  };
}

