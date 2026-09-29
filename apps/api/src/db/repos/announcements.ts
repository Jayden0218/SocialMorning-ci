/**
 * M11 US5 — a show's announcements (FR-020, FR-021). At most 2 are PUSHED per show per UTC
 * calendar month; over the limit, publishing is refused rather than silently not pushed, so the
 * creator is never surprised (guard G-N2). An edit changes the text and never pushes again.
 */
import type { Db } from '../db.ts';
import { ApiError } from '../../errors.ts';
import { sendExpo, type PushMessage } from './push.ts';

export const PUSHES_PER_MONTH = 2;

export type Announcement = { id: string; body: string; createdAt: string; editedAt: string | null; pushedAt: string | null };
type Row = { id: string; body: string; created_at: Date | string; edited_at: Date | string | null; pushed_at: Date | string | null };
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());
const toA = (r: Row): Announcement => ({ id: r.id, body: r.body, createdAt: iso(r.created_at)!, editedAt: iso(r.edited_at), pushedAt: iso(r.pushed_at) });

/** The first day of next month (UTC), as YYYY-MM-DD. */
export function resetsOn(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

async function pushedThisMonth(db: Db, feedUrl: string): Promise<number> {
  const [r] = await db.query<{ n: string | number }>(
    "SELECT count(*) AS n FROM announcements WHERE feed_url = $1 AND pushed_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    [feedUrl],
  );
  return Number(r?.n ?? 0);
}

export async function listAnnouncements(db: Db, feedUrl: string, limit = 50) {
  const rows = await db.query<Row>(
    'SELECT id, body, created_at, edited_at, pushed_at FROM announcements WHERE feed_url = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $2',
    [feedUrl, limit],
  );
  return { items: rows.map(toA), pushesLeftThisMonth: Math.max(0, PUSHES_PER_MONTH - (await pushedThisMonth(db, feedUrl))), resetsOn: resetsOn() };
}

/** Publish and push, or refuse over the monthly limit. The count and the insert share one transaction. */
export async function publish(db: Db, f: typeof fetch, feedUrl: string, showTitle: string | null, authorId: string, body: string): Promise<{ announcement: Announcement; pushed: { devices: number } }> {
  const created = await db.transaction(async (tx) => {
    // Serialise publishes for one show, so two tabs cannot both take the last push.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`announce|${feedUrl}`]);
    if ((await pushedThisMonth(tx, feedUrl)) >= PUSHES_PER_MONTH) {
      throw new ApiError('locked', `You have sent ${PUSHES_PER_MONTH} announcements this month.`, { reason: 'monthly_limit', resetsOn: resetsOn() });
    }
    const [r] = await tx.query<Row>(
      'INSERT INTO announcements (feed_url, author_id, body, pushed_at) VALUES ($1, $2, $3, now()) RETURNING id, body, created_at, edited_at, pushed_at',
      [feedUrl, authorId, body],
    );
    // "Never tell a device twice" (G-N1) is push_sent's key; episode_id holds the announcement id.
    const told = await tx.query<{ listener_id: string }>(
      `INSERT INTO push_sent (listener_id, episode_id, kind)
       SELECT s.listener_id, $2, 'announcement' FROM subscriptions s
       LEFT JOIN push_prefs p ON p.listener_id = s.listener_id
       WHERE s.feed_url = $1 AND s.deleted_at IS NULL AND COALESCE(p.new_episodes, true)
       ON CONFLICT (listener_id, episode_id, kind) DO NOTHING RETURNING listener_id`,
      [feedUrl, r!.id],
    );
    return { row: r!, told: told.map((t) => t.listener_id) };
  });
  let devices = 0;
  if (created.told.length > 0) {
    const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = ANY($1::uuid[])', [created.told]);
    const messages = tokens.map((t): PushMessage => ({
      to: t.token, title: showTitle ?? 'An announcement', body: body.length > 160 ? body.slice(0, 157) + '…' : body,
      data: { kind: 'announcement', feedUrl, announcementId: created.row.id }, sound: 'default',
    }));
    // A failed send is not a failed publish: the announcement is on the show page either way (Principle IV).
    if (messages.length > 0) devices = (await sendExpo(db, f, messages).catch(() => ({ sent: 0 }))).sent;
  }
  return { announcement: toA(created.row), pushed: { devices } };
}

export async function edit(db: Db, feedUrl: string, id: string, body: string): Promise<Announcement> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such announcement.');
  const [r] = await db.query<Row>(
    'UPDATE announcements SET body = $3, edited_at = now() WHERE id = $1 AND feed_url = $2 AND deleted_at IS NULL RETURNING id, body, created_at, edited_at, pushed_at',
    [id, feedUrl, body],
  );
  if (!r) throw new ApiError('not_found', 'No such announcement.');
  return toA(r);
}

export async function remove(db: Db, feedUrl: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db.query('UPDATE announcements SET deleted_at = now() WHERE id = $1 AND feed_url = $2', [id, feedUrl]);
}
