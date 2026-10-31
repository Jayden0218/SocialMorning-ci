// SQLite stores for shows, episodes, the raw feed cache, subscriptions and chapters/transcripts.
// Split out of sqlite.ts (2026-10-31); sqlite.ts re-exports everything here, so importers are unchanged.
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Episode } from '@socialmorning/feed-parser';
import { episodeId } from './schema';
import { byNewestFirst } from './memory';
import { put } from './sqlite-open';
import type { CachedEpisode, CachedShow, ExtrasStore, FeedCache, FeedCacheStore, SubscriptionStore } from './types';

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
    bytes: () => Number(db.getFirstSync<{ n: number }>('SELECT coalesce(sum(length(CAST(body AS BLOB))), 0) AS n FROM feed_cache')?.n ?? 0),
    clear: () => void db.runSync('DELETE FROM feed_cache'),
  };
}

export function createSqliteSubscriptionStore(db: SQLiteDatabase): SubscriptionStore {
  return {
    list: () =>
      db
        .getAllSync<{ feed_url: string; subscribed_at: number; starred: number }>(
          'SELECT * FROM subscriptions WHERE deleted_at IS NULL ORDER BY subscribed_at DESC',
        )
        .map((r) => ({ feedUrl: r.feed_url, subscribedAt: r.subscribed_at, starred: r.starred === 1 })),
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
    setStarred: (feedUrl, starred, now) =>
      void db.runSync('UPDATE subscriptions SET starred = ?, starred_at = ? WHERE feed_url = ? AND deleted_at IS NULL', [starred ? 1 : 0, now, feedUrl]),
    all: () =>
      db
        .getAllSync<{ feed_url: string; subscribed_at: number; deleted_at: number | null; starred: number; starred_at: number | null }>(
          'SELECT feed_url, subscribed_at, deleted_at, starred, starred_at FROM subscriptions ORDER BY subscribed_at DESC',
        )
        .map((r) => ({ feedUrl: r.feed_url, subscribedAt: r.subscribed_at, ...(r.deleted_at === null ? {} : { deletedAt: r.deleted_at }), starred: r.starred === 1, ...(r.starred_at === null ? {} : { starredAt: r.starred_at }) })),
    replaceAll: (rows) => {
      db.runSync('DELETE FROM subscriptions');
      for (const r of rows) {
        db.runSync('INSERT INTO subscriptions (feed_url, subscribed_at, deleted_at, starred, starred_at) VALUES (?, ?, ?, ?, ?)',
          [r.feedUrl, r.subscribedAt, r.deletedAt ?? null, r.starred ? 1 : 0, r.starredAt ?? null]);
      }
    },
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
