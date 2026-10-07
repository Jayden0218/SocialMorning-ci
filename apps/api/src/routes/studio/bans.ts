// Studio ban routes: list the listeners banned from commenting on a show, ban one with a reason, lift a ban.
/**
 * Studio API (`/v1/studio/*`) — M22 US10 (FR-031, FR-032; research R9). A ban is the existing
 * per-show host mute (`show_mutes`, M11) with a reason the host keeps for themself. A banned
 * listener can't post a comment, reply or voice comment on any episode of the show (403 from the
 * comment routes, guard G-M22-10); the show's owner, helpers and invited co-hosts can't be banned
 * (409 `is_cohost`). The listener is never told by a push — only when they try to post.
 */
import { z } from 'zod';
import type { Hono } from 'hono';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import type { Db } from '../../db/db.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Ban = { listenerId: string; name: string; reason: string | null; createdAt: string };

export async function listBans(db: Db, feedUrl: string): Promise<{ items: Ban[] }> {
  const rows = await db.query<{ id: string; display_name: string; reason: string | null; created_at: Date | string }>(
    `SELECT l.id, l.display_name, m.reason, m.created_at
       FROM show_mutes m JOIN listeners l ON l.id = m.listener_id
      WHERE m.feed_url = $1 ORDER BY m.created_at DESC`, [feedUrl]);
  return { items: rows.map((r) => ({ listenerId: r.id, name: r.display_name, reason: r.reason, createdAt: new Date(r.created_at).toISOString() })) };
}

/** Owner (proven claim), helpers (`show_members`) and invited co-hosts (`show_hosts`) are the show's team. */
export async function isTeam(db: Db, feedUrl: string, listenerId: string): Promise<boolean> {
  const r = await db.query(
    `SELECT 1 FROM creator_claims WHERE feed_url = $1 AND listener_id = $2 AND status = 'proven'
     UNION ALL SELECT 1 FROM show_members WHERE feed_url = $1 AND listener_id = $2
     UNION ALL SELECT 1 FROM show_hosts WHERE feed_url = $1 AND listener_id = $2`, [feedUrl, listenerId]);
  return r.length > 0;
}

export async function ban(db: Db, feedUrl: string, listenerId: string, by: string, reason: string | null): Promise<void> {
  if (!UUID.test(listenerId)) throw new ApiError('not_found', 'No such listener.');
  const [l] = await db.query('SELECT 1 FROM listeners WHERE id = $1', [listenerId]);
  if (!l) throw new ApiError('not_found', 'No such listener.');
  if (await isTeam(db, feedUrl, listenerId)) throw new ApiError('is_cohost', "A host of this show can't be banned from it.");
  // Banning again only updates the reason.
  await db.query(
    `INSERT INTO show_mutes (feed_url, listener_id, muted_by, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (feed_url, listener_id) DO UPDATE SET reason = EXCLUDED.reason`, [feedUrl, listenerId, by, reason]);
}

export async function lift(db: Db, feedUrl: string, listenerId: string): Promise<void> {
  if (!UUID.test(listenerId)) return;
  await db.query('DELETE FROM show_mutes WHERE feed_url = $1 AND listener_id = $2', [feedUrl, listenerId]);
}

const banBody = z.object({ reason: z.string().trim().max(200).optional() });

export function registerBans(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/bans', async (c) => c.json(await listBans(c.get('db'), c.get('show').feedUrl)));

  studio.put('/shows/:show/bans/:listenerId', json(banBody), async (c) => {
    const reason = c.req.valid('json').reason;
    await ban(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'), c.get('listener')!.id, reason ? reason : null);
    return c.body(null, 204);
  });

  studio.delete('/shows/:show/bans/:listenerId', async (c) => {
    await lift(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
    return c.body(null, 204);
  });
}
