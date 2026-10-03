/**
 * M11 — a show's numbers for the Studio (specs/011-m11-studio/spec.md FR-006..FR-012).
 * Every query is scoped by the show's feed_url; nothing here is ever called without the
 * role check in `routes/studio/` having passed first.
 *
 * Definitions (research R3, R5):
 *   play       — one `activity` 'listened' row: one listener, one episode, one day (hidden included, FR-012)
 *   completion — per (listener, episode): the union of listened ranges ≥ 90 % of the length, or finished
 *   like       — a listener who reacted to an episode (not a bucket: one fan is not 40 likes)
 *   save       — a live `fav_episode` library item
 *   share      — a `share_events` row (counted from the build that records them)
 */
import { completionRate, isComplete, type Range } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';

export const METRICS = ['plays', 'subs', 'comments', 'saves', 'shares', 'likes'] as const;
export type Metric = (typeof METRICS)[number];

/** A live, visible comment on this feed (the same filter everywhere the Studio counts comments). */
const VISIBLE = 'c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL';

export type Totals = { plays: number; completionRate: number | null; subscribers: number; comments: number; likes: number; clips: number; saves: number; shares: number };

async function count(db: Db, sql: string, feedUrl: string): Promise<number> {
  const [r] = await db.query<{ n: number | string }>(sql, [feedUrl]);
  return Number(r?.n ?? 0);
}

/** Completion over every (listener, episode) that has a play, as one rate; per-episode when `episodeId` given. */
export async function completion(db: Db, feedUrl: string): Promise<{ all: number | null; byEpisode: Map<string, number | null> }> {
  const rows = await db.query<{ episode_id: string; ranges: (Range[] | string)[] | null; duration_ms: number | null; finished: boolean | null }>(
    `SELECT a.episode_id, e.duration_ms,
            (SELECT jsonb_agg(lr.ranges) FROM listened_ranges lr
              WHERE lr.listener_id = a.actor_id AND lr.episode_id = a.episode_id) AS ranges,
            (SELECT p.finished FROM positions p
              WHERE p.listener_id = a.actor_id AND p.episode_id = a.episode_id) AS finished
       FROM (SELECT DISTINCT actor_id, episode_id FROM activity WHERE kind = 'listened') a
       JOIN episodes e ON e.id = a.episode_id
      WHERE e.feed_url = $1`,
    [feedUrl],
  );
  const per = new Map<string, (boolean | null)[]>();
  const all: (boolean | null)[] = [];
  for (const r of rows) {
    // A set stored as a JSON string (the driver's double-encoding, repaired by migration 012) still counts.
    const sets = (r.ranges ?? []).map((s) => (typeof s === 'string' ? (JSON.parse(s) as Range[]) : s));
    const done = isComplete(sets, r.duration_ms, r.finished === true);
    all.push(done);
    per.set(r.episode_id, [...(per.get(r.episode_id) ?? []), done]);
  }
  return { all: completionRate(all), byEpisode: new Map([...per].map(([k, v]) => [k, completionRate(v)])) };
}

export async function totals(db: Db, feedUrl: string): Promise<Totals> {
  const [plays, subscribers, comments, likes, clips, saves, shares, comp] = await Promise.all([
    count(db, "SELECT count(*) AS n FROM activity a JOIN episodes e ON e.id = a.episode_id WHERE e.feed_url = $1 AND a.kind = 'listened'", feedUrl),
    count(db, 'SELECT count(*) AS n FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL', feedUrl),
    count(db, `SELECT count(*) AS n FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE e.feed_url = $1 AND ${VISIBLE}`, feedUrl),
    count(db, 'SELECT count(*) AS n FROM (SELECT DISTINCT r.listener_id, r.episode_id FROM reactions r JOIN episodes e ON e.id = r.episode_id WHERE e.feed_url = $1) x', feedUrl),
    count(db, 'SELECT count(*) AS n FROM clips k JOIN episodes e ON e.id = k.episode_id WHERE e.feed_url = $1 AND k.deleted_at IS NULL', feedUrl),
    count(db, "SELECT count(*) AS n FROM library_items li JOIN episodes e ON e.id = li.item_key WHERE e.feed_url = $1 AND li.kind = 'fav_episode' AND li.deleted_at IS NULL", feedUrl),
    count(db, 'SELECT count(*) AS n FROM share_events WHERE feed_url = $1', feedUrl),
    completion(db, feedUrl),
  ]);
  return { plays, completionRate: comp.all, subscribers, comments, likes, clips, saves, shares };
}

/**
 * One (timestamp or date) column per metric. Plays use `activity.day`, which is already the
 * listener's own local day as the phone reported it, so it is not shifted by the viewer's tz.
 */
const SOURCES: Record<Metric, { sql: string; isDate?: true }> = {
  plays: { sql: "SELECT a.day AS t FROM activity a JOIN episodes e ON e.id = a.episode_id WHERE e.feed_url = $1 AND a.kind = 'listened'", isDate: true },
  subs: { sql: "SELECT at AS t FROM subscription_events WHERE feed_url = $1 AND kind = 'sub'" },
  comments: { sql: `SELECT c.created_at AS t FROM comments c JOIN episodes e ON e.id = c.episode_id WHERE e.feed_url = $1 AND ${VISIBLE}` },
  saves: { sql: "SELECT li.updated_at AS t FROM library_items li JOIN episodes e ON e.id = li.item_key WHERE e.feed_url = $1 AND li.kind = 'fav_episode' AND li.deleted_at IS NULL" },
  shares: { sql: 'SELECT at AS t FROM share_events WHERE feed_url = $1' },
  // A like is dated by the listener's FIRST reaction on the episode, so the trend sums to the total.
  likes: { sql: 'SELECT min(r.created_at) AS t FROM reactions r JOIN episodes e ON e.id = r.episode_id WHERE e.feed_url = $1 GROUP BY r.listener_id, r.episode_id' },
};

/** A zone the database can use; anything else is refused before it reaches SQL. */
export function validTz(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Exactly `days` points ending today (in `tz`), every missing day 0. */
export async function trend(db: Db, feedUrl: string, metric: Metric, days: number, tz: string): Promise<{ date: string; value: number }[]> {
  const src = SOURCES[metric];
  const bucket = src.isDate ? 'x.t::date' : '(x.t AT TIME ZONE $3)::date';
  const rows = await db.query<{ d: string | Date; n: number | string }>(
    `WITH days AS (
       SELECT generate_series((now() AT TIME ZONE $3)::date - ($2::int - 1), (now() AT TIME ZONE $3)::date, interval '1 day')::date AS d
     ), hits AS (
       SELECT ${bucket} AS d, count(*) AS n FROM (${src.sql}) x GROUP BY 1
     )
     SELECT days.d, coalesce(hits.n, 0) AS n FROM days LEFT JOIN hits ON hits.d = days.d ORDER BY days.d`,
    [feedUrl, days, tz],
  );
  return rows.map((r) => ({ date: isoDate(r.d), value: Number(r.n) }));
}

const isoDate = (d: string | Date): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export type RecentComment = { id: string; episodeId: string; episodeTitle: string; author: string | null; body: string; offsetMs: number | null; createdAt: string };
export type RecentEpisode = { id: string; title: string; publishedAt: string | null; plays: number; comments: number };

export async function recentComments(db: Db, feedUrl: string, limit = 5): Promise<RecentComment[]> {
  const rows = await db.query<{ id: string; episode_id: string; title: string; display_name: string | null; body: string; offset_ms: number | null; created_at: Date | string }>(
    `SELECT c.id, c.episode_id, e.title, l.display_name, c.body, c.offset_ms, c.created_at
       FROM comments c JOIN episodes e ON e.id = c.episode_id LEFT JOIN listeners l ON l.id = c.author_id
      WHERE e.feed_url = $1 AND ${VISIBLE} AND c.body IS NOT NULL
      ORDER BY c.created_at DESC LIMIT $2`,
    [feedUrl, limit],
  );
  return rows.map((r) => ({ id: r.id, episodeId: r.episode_id, episodeTitle: r.title, author: r.display_name, body: r.body, offsetMs: r.offset_ms, createdAt: new Date(r.created_at).toISOString() }));
}

export async function recentEpisodes(db: Db, feedUrl: string, limit = 5): Promise<RecentEpisode[]> {
  const rows = await db.query<{ id: string; title: string; published_at: Date | string | null; plays: number | string; comments: number | string }>(
    `SELECT e.id, e.title, e.published_at,
            (SELECT count(*) FROM activity a WHERE a.episode_id = e.id AND a.kind = 'listened') AS plays,
            (SELECT count(*) FROM comments c WHERE c.episode_id = e.id AND ${VISIBLE}) AS comments
       FROM episodes e WHERE e.feed_url = $1
      ORDER BY e.published_at DESC NULLS LAST, e.first_seen_at DESC LIMIT $2`,
    [feedUrl, limit],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null, plays: Number(r.plays), comments: Number(r.comments) }));
}

export async function claimedAt(db: Db, feedUrl: string): Promise<string | null> {
  const [r] = await db.query<{ proven_at: Date | string | null }>(
    "SELECT proven_at FROM creator_claims WHERE feed_url = $1 AND status = 'proven' LIMIT 1", [feedUrl]);
  return r?.proven_at ? new Date(r.proven_at).toISOString() : null;
}

// ---- US2: Data (FR-008..FR-010) ----

/** Yesterday in the viewer's zone (plays by the listener's own day, like the trend). */
export async function yesterday(db: Db, feedUrl: string, tz: string): Promise<{ plays: number; subs: number; comments: number; shares: number }> {
  const one = async (m: Metric) => {
    const days = await trend(db, feedUrl, m, 2, tz);
    return days[0]?.value ?? 0;
  };
  const [plays, subs, comments, shares] = await Promise.all([one('plays'), one('subs'), one('comments'), one('shares')]);
  return { plays, subs, comments, shares };
}

export type EpisodeStats = {
  id: string; title: string; publishedAt: string | null; plays: number; completionRate: number | null;
  comments: number; shares: number; saves: number; likes: number;
};

export const EPISODE_SORTS = ['publishedAt', 'plays', 'completionRate', 'comments', 'shares', 'saves', 'likes', 'title'] as const;
export type EpisodeSort = (typeof EPISODE_SORTS)[number];

/** Every episode of the feed with its numbers — the one source for the table, its CSV and the top 5. */
export async function episodeStats(db: Db, feedUrl: string): Promise<EpisodeStats[]> {
  const [rows, comp] = await Promise.all([
    db.query<{ id: string; title: string; published_at: Date | string | null; plays: string | number; comments: string | number; shares: string | number; saves: string | number; likes: string | number }>(
      `SELECT e.id, e.title, e.published_at,
              (SELECT count(*) FROM activity a WHERE a.episode_id = e.id AND a.kind = 'listened') AS plays,
              (SELECT count(*) FROM comments c WHERE c.episode_id = e.id AND ${VISIBLE}) AS comments,
              (SELECT count(*) FROM share_events s WHERE s.target_kind = 'episode' AND s.target_id = e.id) AS shares,
              (SELECT count(*) FROM library_items li WHERE li.kind = 'fav_episode' AND li.item_key = e.id AND li.deleted_at IS NULL) AS saves,
              (SELECT count(DISTINCT r.listener_id) FROM reactions r WHERE r.episode_id = e.id) AS likes 
         FROM episodes e WHERE e.feed_url = $1`,
      [feedUrl],
    ),
    completion(db, feedUrl),
  ]);
  return rows.map((r) => ({
    id: r.id, title: r.title, publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    plays: Number(r.plays), completionRate: comp.byEpisode.get(r.id) ?? null,
    comments: Number(r.comments), shares: Number(r.shares), saves: Number(r.saves), likes: Number(r.likes),
  }));
}

export function sortEpisodes(items: EpisodeStats[], sort: EpisodeSort = 'publishedAt', dir: 'asc' | 'desc' = 'desc'): EpisodeStats[] {
  const k = dir === 'asc' ? 1 : -1;
  const val = (e: EpisodeStats): number | string => {
    if (sort === 'title') return e.title.toLowerCase();
    if (sort === 'publishedAt') return e.publishedAt ? Date.parse(e.publishedAt) : -Infinity;
    const v = e[sort];
    return v === null ? -Infinity : v;
  };
  return [...items].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1) * k;
  });
}

/** Other shows this show's live subscribers also follow — hidden under 5 subscribers (FR-010, G-L1). */
export const ALSO_FOLLOW_MIN = 5;
export async function alsoFollow(db: Db, feedUrl: string): Promise<{ hidden: 'too_few' } | { shows: { feedUrl: string; title: string | null; image: string | null; listeners: number }[] }> {
  const [n] = await db.query<{ n: string | number }>('SELECT count(*) AS n FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]);
  if (Number(n?.n ?? 0) < ALSO_FOLLOW_MIN) return { hidden: 'too_few' };
  const rows = await db.query<{ feed_url: string; listeners: string | number; title: string | null; image: string | null }>(
    `SELECT o.feed_url, count(DISTINCT o.listener_id) AS listeners,
            (SELECT coalesce(e.show_title, e.title) FROM episodes e WHERE e.feed_url = o.feed_url ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title,
            (SELECT e.image_url FROM episodes e WHERE e.feed_url = o.feed_url AND e.image_url IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS image
       FROM subscriptions me JOIN subscriptions o ON o.listener_id = me.listener_id AND o.feed_url <> me.feed_url AND o.deleted_at IS NULL
      WHERE me.feed_url = $1 AND me.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM hidden_feeds h WHERE h.feed_url = o.feed_url)
      GROUP BY o.feed_url ORDER BY listeners DESC, o.feed_url LIMIT 5`,
    [feedUrl],
  );
  return { shows: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title, image: r.image, listeners: Number(r.listeners) })) };
}

/** One episode of the feed: its numbers, its 100-bucket heat curve (0–1) and comments per minute. */
export async function episodeDetail(db: Db, feedUrl: string, episodeId: string) {
  const stats = (await episodeStats(db, feedUrl)).find((e) => e.id === episodeId);
  if (!stats) return undefined;
  const [heat, perMinute, dur] = await Promise.all([
    db.query<{ bucket: number; n: number }>('SELECT bucket, distinct_listeners AS n FROM episode_heat WHERE episode_id = $1', [episodeId]),
    db.query<{ minute: number | string; n: number | string }>(
      `SELECT (c.offset_ms / 60000) AS minute, count(*) AS n FROM comments c
        WHERE c.episode_id = $1 AND c.offset_ms IS NOT NULL AND ${VISIBLE} GROUP BY 1 ORDER BY 1`, [episodeId]),
    db.query<{ duration_ms: number | null }>('SELECT duration_ms FROM episodes WHERE id = $1', [episodeId]),
  ]);
  const curve = Array.from({ length: 100 }, () => 0);
  for (const h of heat) curve[h.bucket] = Number(h.n);
  const max = Math.max(0, ...curve);
  return {
    episode: { ...stats, durationMs: dur[0]?.duration_ms ?? null },
    heat: curve.map((v) => (max === 0 ? 0 : v / max)),
    commentsByMinute: perMinute.map((m) => ({ minute: Number(m.minute), count: Number(m.n) })),
  };
}

// ---- CSV (FR-009): built from the same values the JSON routes return (G-E1) ----

const cell = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180, CRLF rows, a UTF-8 BOM so spreadsheet apps read Chinese titles correctly. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const episodeCsv = (items: EpisodeStats[]) =>
  toCsv(
    ['Title', 'Published', 'Plays', 'Completion %', 'Comments', 'Shares', 'Saves', 'Likes'],
    items.map((e) => [e.title, e.publishedAt ? e.publishedAt.slice(0, 10) : null, e.plays, e.completionRate === null ? null : Math.round(e.completionRate * 1000) / 10, e.comments, e.shares, e.saves, e.likes]),
  );

export const trendCsv = (metric: Metric, days: { date: string; value: number }[]) => toCsv(['Date', metric], days.map((d) => [d.date, d.value]));
