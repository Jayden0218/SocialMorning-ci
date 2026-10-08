// A show's subscribers: totals, trend, listening hours, names, and muted listeners.
/**
 * M11 US4 — who subscribes, how that changes, and who may not comment (FR-017..FR-019).
 *
 * Names are shown by the owner's decision (spec Q1 = B) after the privacy page says so (FR-031).
 * Listening hours are a PROXY: the time each listen was recorded (research R3), labelled as such.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

export async function subscriberStats(db: Db, feedUrl: string, days: number, tz: string) {
  const [total, trend, hours, platforms, since] = await Promise.all([
    db.query<{ n: string | number }>('SELECT count(*) AS n FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]),
    db.query<{ d: string | Date; sub: string | number; unsub: string | number }>(
      `WITH days AS (
         SELECT generate_series((now() AT TIME ZONE $3)::date - ($2::int - 1), (now() AT TIME ZONE $3)::date, interval '1 day')::date AS d
       ), ev AS (
         SELECT (at AT TIME ZONE $3)::date AS d, count(*) FILTER (WHERE kind = 'sub') AS sub, count(*) FILTER (WHERE kind = 'unsub') AS unsub
           FROM subscription_events WHERE feed_url = $1 GROUP BY 1
       )
       SELECT days.d, coalesce(ev.sub, 0) AS sub, coalesce(ev.unsub, 0) AS unsub FROM days LEFT JOIN ev ON ev.d = days.d ORDER BY days.d`,
      [feedUrl, days, tz],
    ),
    db.query<{ h: number | string; n: string | number }>(
      `SELECT extract(hour FROM a.created_at AT TIME ZONE $2)::int AS h, count(*) AS n
         FROM activity a JOIN episodes e ON e.id = a.episode_id
        WHERE e.feed_url = $1 AND a.kind = 'listened' GROUP BY 1`,
      [feedUrl, tz],
    ),
    db.query<{ platform: string | null; n: string | number }>(
      `SELECT p.platform, count(*) AS n FROM (
         SELECT s.listener_id, (SELECT t.platform FROM push_tokens t WHERE t.listener_id = s.listener_id ORDER BY t.created_at DESC LIMIT 1) AS platform
           FROM subscriptions s WHERE s.feed_url = $1 AND s.deleted_at IS NULL
       ) p GROUP BY 1`,
      [feedUrl],
    ),
    db.query<{ at: Date | string | null }>("SELECT applied_at AS at FROM schema_migrations WHERE version = 8"),
  ]);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const h of hours) byHour[Number(h.h)] = Number(h.n);
  const plat = { ios: 0, android: 0, unknown: 0 };
  for (const p of platforms) plat[p.platform === 'ios' ? 'ios' : p.platform === 'android' ? 'android' : 'unknown'] += Number(p.n);
  return {
    total: Number(total[0]?.n ?? 0),
    trend: trend.map((r) => ({ date: typeof r.d === 'string' ? r.d.slice(0, 10) : r.d.toISOString().slice(0, 10), sub: Number(r.sub), unsub: Number(r.unsub) })),
    hours: byHour,
    platforms: plat,
    historySince: since[0]?.at ? new Date(since[0].at).toISOString().slice(0, 10) : null,
  };
}

/** Current subscribers, newest first, 50 a page; suspended accounts are left out. */
/** M24 US14: `q` narrows to display names containing it (case-insensitive; % and _ match themselves). */
export async function subscriberList(db: Db, feedUrl: string, page: number, q = '') {
  const like = q.trim() ? `%${q.trim().slice(0, 100).replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
  const [n] = await db.query<{ n: string | number }>(
    `SELECT count(*) AS n FROM subscriptions s JOIN listeners l ON l.id = s.listener_id WHERE s.feed_url = $1 AND s.deleted_at IS NULL AND l.suspended_at IS NULL AND l.hidden_at IS NULL
       AND ($2::text IS NULL OR l.display_name ILIKE $2::text)`, [feedUrl, like]);
  const rows = await db.query<{ id: string; display_name: string; created_at: Date | string; muted: boolean }>(
    `SELECT l.id, l.display_name, s.created_at,
            EXISTS (SELECT 1 FROM show_mutes m WHERE m.feed_url = s.feed_url AND m.listener_id = l.id) AS muted
       FROM subscriptions s JOIN listeners l ON l.id = s.listener_id
      WHERE s.feed_url = $1 AND s.deleted_at IS NULL AND l.suspended_at IS NULL AND l.hidden_at IS NULL
        AND ($3::text IS NULL OR l.display_name ILIKE $3::text)
      ORDER BY s.created_at DESC, l.id LIMIT 50 OFFSET $2`,
    [feedUrl, (page - 1) * 50, like],
  );
  return { total: Number(n?.n ?? 0), page, pageSize: 50, items: rows.map((r) => ({ id: r.id, displayName: r.display_name, subscribedAt: new Date(r.created_at).toISOString(), muted: r.muted })) };
}

// ---- Mutes (FR-019, guard G-M1) ----

/** The owner and the show's operators cannot be muted on their own show. */
async function isMember(db: Db, feedUrl: string, listenerId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM creator_claims WHERE feed_url = $1 AND listener_id = $2 AND status = 'proven'
     UNION ALL SELECT 1 FROM show_members WHERE feed_url = $1 AND listener_id = $2`, [feedUrl, listenerId]);
  return r.length > 0;
}

export async function mute(db: Db, feedUrl: string, listenerId: string, by: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(listenerId)) throw new ApiError('not_found', 'No such listener.');
  const [l] = await db.query('SELECT 1 FROM listeners WHERE id = $1', [listenerId]);
  if (!l) throw new ApiError('not_found', 'No such listener.');
  if (await isMember(db, feedUrl, listenerId)) throw new ApiError('conflict', 'The owner and helpers of a show cannot be muted on it.', { reason: 'cannot_mute_member' });
  await db.query('INSERT INTO show_mutes (feed_url, listener_id, muted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [feedUrl, listenerId, by]);
}

export async function unmute(db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(listenerId)) return;
  await db.query('DELETE FROM show_mutes WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId]);
}

export async function listMutes(db: Db, feedUrl: string) {
  const rows = await db.query<{ id: string; display_name: string; created_at: Date | string; by: string | null }>(
    `SELECT l.id, l.display_name, m.created_at, b.display_name AS by
       FROM show_mutes m JOIN listeners l ON l.id = m.listener_id LEFT JOIN listeners b ON b.id = m.muted_by
      WHERE m.feed_url = $1 ORDER BY m.created_at DESC`, [feedUrl]);
  return { items: rows.map((r) => ({ id: r.id, displayName: r.display_name, mutedAt: new Date(r.created_at).toISOString(), mutedBy: r.by })) };
}

/** For the app's comment POST: is this listener muted on the show this episode belongs to? */
export async function isMutedOn(db: Db, feedUrl: string, listenerId: string): Promise<boolean> {
  return (await db.query('SELECT 1 FROM show_mutes WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId])).length > 0;
}
