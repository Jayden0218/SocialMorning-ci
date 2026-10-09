// Admin dashboard numbers: totals only, each section fails on its own.
/**
 * M18 (specs/019-m18-admin-dashboard, contracts/metrics-api.md). Aggregates only — nothing here
 * returns a listener's id, email or name (FR-013, guard G-AD2). Each section runs in its own `try`:
 * one failing query marks that section `{ ok: false }` and the rest still answer (FR-017, G-AD4).
 *
 * Days are calendar days in UTC+8 (research R3), computed in SQL from UTC so the database's own
 * time zone never matters; listening keeps the phone's stored day (FR-019).
 */
import { unionLength, type Range } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';

export const METRIC_RANGES = [7, 30, 90] as const;
export type MetricRange = (typeof METRIC_RANGES)[number];
export type Point = { date: string; value: number };
type Ok<T> = { ok: true } & T;
type Failed = { ok: false; message: string };
export type Section<T> = Ok<T> | Failed;

const HOUR_MS = 3_600_000;
const UTC8_MS = 8 * HOUR_MS;
/** A timestamptz column → its UTC+8 calendar day, as text. */
const day = (col: string) => `(((${col}) AT TIME ZONE 'UTC') + interval '8 hours')::date::text`;

/** The range's days, oldest first, ending today (UTC+8). */
export function rangeDays(days: number, now: number): string[] {
  const today = Date.parse(new Date(now + UTC8_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** The first instant of a UTC+8 day, as an ISO timestamp for a `>=` filter. */
const startOf = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - UTC8_MS).toISOString();

/** Rows `{ d, n }` → one point per day of the range, 0 where nothing happened (FR-018). */
function series(days: string[], rows: { d: string; n: number | string }[]): Point[] {
  const by = new Map(rows.map((r) => [r.d, Number(r.n)]));
  return days.map((date) => ({ date, value: by.get(date) ?? 0 }));
}

async function one(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  const [r] = await db.query<{ n: number | string | null }>(sql, params);
  return Number(r?.n ?? 0);
}

/** Count of rows per UTC+8 day of `col`, from the range's first instant. */
async function perDay(db: Db, days: string[], table: string, col: string, where = 'TRUE'): Promise<Point[]> {
  const rows = await db.query<{ d: string; n: number }>(
    `SELECT ${day(col)} AS d, count(*)::int AS n FROM ${table} WHERE ${col} >= $1 AND ${where} GROUP BY 1`,
    [startOf(days[0]!)],
  );
  return series(days, rows);
}

async function section<T>(name: string, f: () => Promise<T>): Promise<Section<T>> {
  try {
    return { ok: true, ...(await f()) };
  } catch (e) {
    console.warn(`[metrics ${name}] ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, message: `The ${name} numbers could not be counted.` };
  }
}

const users = (db: Db, days: string[]) => section('users', async () => {
  const notStudio = "device_label IS DISTINCT FROM 'studio-web'";
  const activeIn = (d: number) => one(db, `SELECT count(DISTINCT listener_id)::int AS n FROM sessions WHERE ${notStudio} AND last_seen_at > now() - interval '${d} days'`);
  const [total, suspended, d1, d7, d30, newPerDay, dau, since] = await Promise.all([
    one(db, 'SELECT count(*)::int AS n FROM listeners'),
    one(db, 'SELECT count(*)::int AS n FROM listeners WHERE suspended_at IS NOT NULL'),
    activeIn(1), activeIn(7), activeIn(30),
    perDay(db, days, 'listeners', 'created_at'),
    db.query<{ d: string; n: number }>('SELECT day::text AS d, count(*)::int AS n FROM daily_active WHERE day >= $1::date GROUP BY 1', [days[0]]),
    db.query<{ d: string | null }>('SELECT min(day)::text AS d FROM daily_active'),
  ]);
  return { total, suspended, active: { d1, d7, d30 }, newPerDay, dauPerDay: series(days, dau), recordedSince: since[0]?.d ?? null };
});

const listening = (db: Db, days: string[]) => section('listening', async () => {
  const rows = await db.query<{ listener_id: string; episode_id: string; d: string; ranges: Range[] | string; feed_url: string | null; title: string | null; show_title: string | null }>(
    `SELECT lr.listener_id, lr.episode_id, lr.day::text AS d, lr.ranges, e.feed_url, e.title, e.show_title
       FROM listened_ranges lr LEFT JOIN episodes e ON e.id = lr.episode_id
      WHERE lr.day >= $1::date AND lr.day <= $2::date`,
    [days[0], days[days.length - 1]],
  );
  // One union per (listener, episode, day) across devices, as each person's own stats count it (R4).
  const sets = new Map<string, { listener: string; episode: string; d: string; feedUrl: string | null; title: string | null; showTitle: string | null; ranges: Range[][] }>();
  for (const r of rows) {
    const k = `${r.listener_id}\u0000${r.episode_id}\u0000${r.d}`;
    const cur = sets.get(k) ?? { listener: r.listener_id, episode: r.episode_id, d: r.d, feedUrl: r.feed_url, title: r.title, showTitle: r.show_title, ranges: [] };
    cur.ranges.push(typeof r.ranges === 'string' ? (JSON.parse(r.ranges) as Range[]) : r.ranges);
    sets.set(k, cur);
  }
  const listeners = new Map<string, Set<string>>();
  const ms = new Map<string, number>();
  const shows = new Map<string, { feedUrl: string; title: string; ms: number }>();
  const episodes = new Map<string, { episodeId: string; title: string; showTitle: string; ms: number }>();
  for (const s of sets.values()) {
    const n = unionLength(s.ranges);
    if (n <= 0) continue;
    listeners.set(s.d, (listeners.get(s.d) ?? new Set()).add(s.listener));
    ms.set(s.d, (ms.get(s.d) ?? 0) + n);
    if (s.feedUrl) {
      const sh = shows.get(s.feedUrl) ?? { feedUrl: s.feedUrl, title: s.showTitle ?? s.feedUrl, ms: 0 };
      sh.ms += n; shows.set(s.feedUrl, sh);
    }
    const ep = episodes.get(s.episode) ?? { episodeId: s.episode, title: s.title ?? s.episode, showTitle: s.showTitle ?? '', ms: 0 };
    ep.ms += n; episodes.set(s.episode, ep);
  }
  const hours = (n: number) => Math.round((n / HOUR_MS) * 100) / 100;
  const top = <T extends { ms: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.ms - a.ms).slice(0, 10).map(({ ms: n, ...rest }) => ({ ...rest, hours: hours(n) }));
  const finished = await one(db, 'SELECT count(*)::int AS n FROM positions WHERE finished AND received_at >= $1', [startOf(days[0]!)]);
  return {
    listenersPerDay: days.map((date) => ({ date, value: listeners.get(date)?.size ?? 0 })),
    hoursPerDay: days.map((date) => ({ date, value: hours(ms.get(date) ?? 0) })),
    finished,
    topShows: top(shows),
    topEpisodes: top(episodes),
  };
});

const library = (db: Db, days: string[]) => section('library', async () => {
  const [addedPerDay, removedPerDay, topRows] = await Promise.all([
    perDay(db, days, 'subscription_events', 'at', "kind = 'sub'"),
    perDay(db, days, 'subscription_events', 'at', "kind = 'unsub'"),
    db.query<{ feed_url: string; title: string | null; n: number }>(
      `SELECT s.feed_url, (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL LIMIT 1) AS title, count(*)::int AS n
         FROM subscriptions s WHERE s.deleted_at IS NULL GROUP BY s.feed_url ORDER BY n DESC, s.feed_url LIMIT 10`),
  ]);
  return { addedPerDay, removedPerDay, topShows: topRows.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? r.feed_url, subscribers: Number(r.n) })) };
});

const social = (db: Db, days: string[]) => section('social', async () => {
  const [commentsPerDay, reactionsPerDay, clipsPerDay, followsPerDay, sharesPerDay, voicePostsLive] = await Promise.all([
    perDay(db, days, 'comments', 'created_at'),
    perDay(db, days, 'reactions', 'created_at'),
    perDay(db, days, 'clips', 'created_at'),
    perDay(db, days, 'follows', 'created_at'),
    perDay(db, days, 'share_events', 'at'),
    // Voice posts lose their row at 48 h (research R7): only the live ones can be counted.
    one(db, 'SELECT count(*)::int AS n FROM voice_posts WHERE expires_at > now()'),
  ]);
  return { commentsPerDay, reactionsPerDay, clipsPerDay, followsPerDay, sharesPerDay, voicePostsLive };
});

const recs = (db: Db, days: string[]) => section('recs', async () => {
  const rows = await db.query<{ channel: string; shown: number; played: number }>(
    `SELECT channel, count(*) FILTER (WHERE kind = 'impression')::int AS shown, count(*) FILTER (WHERE kind = 'play')::int AS played
       FROM rec_events WHERE at >= $1 GROUP BY channel ORDER BY channel`,
    [startOf(days[0]!)],
  );
  return { byChannel: rows.map((r) => ({ channel: r.channel, shown: Number(r.shown), played: Number(r.played) })) };
});

const safety = (db: Db, days: string[]) => section('safety', async () => {
  const from = [startOf(days[0]!)];
  const [openReports, reports, actions, blocks] = await Promise.all([
    one(db, 'SELECT count(*)::int AS n FROM reports WHERE closed_at IS NULL'),
    one(db, 'SELECT count(*)::int AS n FROM reports WHERE created_at >= $1', from),
    one(db, 'SELECT count(*)::int AS n FROM moderation_actions WHERE created_at >= $1', from),
    one(db, 'SELECT count(*)::int AS n FROM blocks WHERE created_at >= $1', from),
  ]);
  return { openReports, reports, actions, blocks };
});

const money = (db: Db, days: string[]) => section('money', async () => {
  const from = [startOf(days[0]!)];
  const [activePurchases, purchases, tips, amounts] = await Promise.all([
    one(db, "SELECT count(*)::int AS n FROM purchases WHERE status = 'active'"),
    one(db, 'SELECT count(*)::int AS n FROM purchases WHERE created_at >= $1', from),
    one(db, 'SELECT count(*)::int AS n FROM tips WHERE created_at >= $1', from),
    // Only what the stores sent (research R10): summed per currency, never converted.
    db.query<{ currency: string; micros: string | number }>(
      'SELECT currency, sum(amount_micros)::text AS micros FROM purchases WHERE created_at >= $1 AND amount_micros IS NOT NULL AND currency IS NOT NULL GROUP BY currency ORDER BY currency', from),
  ]);
  return { activePurchases, purchases, tips, amounts: amounts.map((a) => ({ currency: a.currency, micros: Number(a.micros) })) };
});

const creators = (db: Db) => section('creators', async () => {
  const [claimedShows, hostedShows, hostedEpisodes, teamMembers] = await Promise.all([
    one(db, "SELECT count(DISTINCT feed_url)::int AS n FROM creator_claims WHERE status = 'proven'"),
    one(db, 'SELECT count(*)::int AS n FROM hosted_shows WHERE deleted_at IS NULL'),
    one(db, "SELECT count(*)::int AS n FROM hosted_episodes WHERE deleted_at IS NULL AND status = 'published'"),
    one(db, 'SELECT count(*)::int AS n FROM show_members'),
  ]);
  return { claimedShows, hostedShows, hostedEpisodes, teamMembers };
});

export type Metrics = Awaited<ReturnType<typeof computeMetrics>>;

export async function computeMetrics(db: Db, range: MetricRange, now: number = Date.now()) {
  const days = rangeDays(range, now);
  const sections = {
    users: await users(db, days),
    listening: await listening(db, days),
    library: await library(db, days),
    social: await social(db, days),
    recs: await recs(db, days),
    safety: await safety(db, days),
    money: await money(db, days),
    creators: await creators(db),
  };
  return {
    days: range, from: days[0]!, to: days[days.length - 1]!, countedAt: new Date(now).toISOString(),
    partial: Object.values(sections).some((s) => !s.ok),
    sections,
  };
}

/** Drops one cached dashboard result (a partial one is served once, never kept). */
export async function dropCachedMetrics(db: Db, key: string): Promise<void> {
  await db.query('DELETE FROM cache WHERE key = $1', [key]);
}
