// System notices: messages from SocialNet to everyone or to one listener, and their optional push.
/**
 * M24 US3. Written in Admin (to everyone) or by the server itself (to one listener: "your comment
 * was removed", an appeal's answer). The phone's System page lists them (app/notifications/system.tsx).
 * A card's one button is an in-app path (`link_route` starts with "/"; the phone's `systemAction`
 * drops anything else).
 *
 * A push is optional and respects the listener's "System notices" switch (push_prefs.system,
 * migration 026 — M24 fix F-S; before it, notices rode on "Popular content"). A listener who
 * turned it off is never pushed.
 */
import type { Db } from '../../db.ts';
import { sendExpo, type PushMessage } from '../account/push.ts';

export const NOTICE_TITLE_MAX = 80;
export const NOTICE_BODY_MAX = 1000;
export const NOTICES_PAGE = 50;
/** Where a notice push opens on the phone (src/notify/route.ts allows it). */
export const NOTICES_HREF = '/notifications/system';

export type NoticeIn = { title: string; body: string; link?: { label: string; route: string }; push?: boolean; listenerId?: string | null; createdBy?: string | null };
export type NoticeOut = { id: string; title: string; body: string; createdAt: string; action?: { label: string; route: string }; to: 'everyone' | 'you'; push: boolean };

type Row = { id: string; listener_id: string | null; title: string; body: string; link_label: string | null; link_route: string | null; push: boolean; created_at: Date | string };

const toOut = (r: Row): NoticeOut => ({
  id: r.id, title: r.title, body: r.body, createdAt: new Date(r.created_at).toISOString(),
  ...(r.link_label && r.link_route ? { action: { label: r.link_label, route: r.link_route } } : {}),
  to: r.listener_id === null ? 'everyone' : 'you', push: r.push,
});

export async function insertNotice(db: Db, n: NoticeIn): Promise<NoticeOut> {
  const [r] = await db.query<Row>(
    `INSERT INTO system_notices (listener_id, title, body, link_label, link_route, push, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, listener_id, title, body, link_label, link_route, push, created_at`,
    [n.listenerId ?? null, n.title.slice(0, NOTICE_TITLE_MAX), n.body.slice(0, NOTICE_BODY_MAX), n.link?.label ?? null, n.link?.route ?? null, n.push === true, n.createdBy ?? null]);
  return toOut(r!);
}

/** What one listener sees: notices to everyone and to them, newest first. */
export async function noticesFor(db: Db, listenerId: string): Promise<NoticeOut[]> {
  const rows = await db.query<Row>(
    `SELECT id, listener_id, title, body, link_label, link_route, push, created_at FROM system_notices
      WHERE listener_id IS NULL OR listener_id = $1 ORDER BY created_at DESC, id LIMIT $2`, [listenerId, NOTICES_PAGE]);
  return rows.map(toOut);
}

/** Admin's list: the notices sent to everyone (account notices to one listener stay private). */
export async function broadcastNotices(db: Db): Promise<NoticeOut[]> {
  const rows = await db.query<Row>(
    'SELECT id, listener_id, title, body, link_label, link_route, push, created_at FROM system_notices WHERE listener_id IS NULL ORDER BY created_at DESC, id LIMIT 100');
  return rows.map(toOut);
}

export async function deleteNotice(db: Db, id: string): Promise<boolean> {
  return (await db.query('DELETE FROM system_notices WHERE id = $1 AND listener_id IS NULL RETURNING id', [id])).length > 0;
}

/** Pushes a notice to its listener (or everyone) whose "System notices" switch is on. */
export async function pushNotice(db: Db, f: typeof fetch, n: { title: string; body: string; listenerId: string | null }): Promise<{ sent: number; dropped: number }> {
  const tokens = await db.query<{ token: string }>(
    `SELECT t.token FROM push_tokens t LEFT JOIN push_prefs p ON p.listener_id = t.listener_id
       JOIN listeners l ON l.id = t.listener_id AND l.suspended_at IS NULL
      WHERE COALESCE(p.system, true) AND ($1::uuid IS NULL OR t.listener_id = $1::uuid)`, [n.listenerId]);
  const messages = tokens.map((t): PushMessage => ({ to: t.token, title: n.title, body: n.body.slice(0, 180), data: { href: NOTICES_HREF, kind: 'system' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(db, f, messages);
}
