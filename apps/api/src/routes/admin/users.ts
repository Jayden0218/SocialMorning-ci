// Admin routes for users and safety: list, rename, suspend, restore, act on reports.
/**
 * Admin API (`/v1/admin/*`, owner only) — US6: users and safety
 * M24 US5: GET /users/:id (purchases, PLUS, tips, gifts, reports against, sessions, deletion);
 * POST|DELETE /users/:id/plus (by hand, recorded); DELETE /users/:id/avatar, /users/:id/bio.
 */
import { type Context } from 'hono';
import { z } from 'zod';
import { actionsFor, groupReports, RETENTION_DAYS, type Action, type TargetKind } from '@socialmorning/social-core';
import { adminWrite, auditCtx, insertAudit, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { act, recentActions } from '../../db/repos/safety/moderation.ts';
import { closedReports, openReports, type QueueRow } from '../../db/repos/safety/reports.ts';
import type { Db } from '../../db/db.ts';
import type { Hono } from 'hono';
import { uuidParam, target } from './common.ts';

/** M24 US5: the `entitlements.ref` of a PLUS the admin gave by hand. */
export const PLUS_BY_ADMIN = 'admin';

export function registerUsers(admin: Hono<AdminEnv>): void {
  type UserRow = { id: string; display_name: string; email: string; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };

  const toUser = (r: UserRow) => ({ id: r.id, displayName: r.display_name, email: r.email, createdAt: new Date(r.created_at).toISOString(), suspended: r.suspended_at !== null, madeByAdmin: r.made_by !== null });

  const userById = async (db: Db, id: string) => {
    const [r] = await db.query<UserRow>('SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners WHERE id = $1', [id]);
    return r ? toUser(r) : null;
  };

  admin.get('/users', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 1 || q.length > 80) throw new ApiError('validation', 'q must be 1–80 characters.', { fields: ['q'] });
    const like = q.replace(/[\\%_]/g, (m) => '\\' + m);
    const rows = await c.get('db').query<UserRow>(
      `SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners
        WHERE display_name ILIKE '%' || $1 || '%' OR email::text ILIKE '%' || $1 || '%'
        ORDER BY (display_name ILIKE $1 || '%') DESC, lower(display_name), id LIMIT 50`, [like]);
    return c.json({ items: rows.map(toUser) });
  });

  admin.patch('/users/:id', json(z.object({ displayName: z.string().trim().min(1).max(40) })), async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    if (!(await userById(db, id))) throw new ApiError('not_found', 'No such account.');
    const user = await adminWrite(db, auditCtx(c), { area: 'users', action: 'rename', target: id }, (tx) => userById(tx, id), async (tx) => {
      await tx.query('UPDATE listeners SET display_name = $2 WHERE id = $1', [id, c.req.valid('json').displayName]);
      return userById(tx, id);
    });
    return c.json({ user });
  });

  // ---- M24 US5: one account in full, PLUS by hand, removing a photo or bio ----

  type Money = { id: string; product_id: string; store: string; status: string; amount_micros: string | number | null; currency: string | null; created_at: Date | string; expires_at: Date | string | null };
  const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

  async function detail(db: Db, id: string) {
    const user = await userById(db, id);
    if (!user) return null;
    const [p] = await db.query<{ avatar_url: string | null; bio: string | null; sessions: number }>(
      `SELECT avatar_url, bio, (SELECT count(*)::int FROM sessions s WHERE s.listener_id = l.id) AS sessions FROM listeners l WHERE l.id = $1`, [id]);
    const plus = await db.query<{ ref: string; until: Date | string | null; source_purchase_id: string | null }>(
      "SELECT ref, until, source_purchase_id FROM entitlements WHERE listener_id = $1 AND kind = 'plus' ORDER BY until DESC NULLS FIRST", [id]);
    const purchases = await db.query<Money>(
      'SELECT id, product_id, store, status, amount_micros, currency, created_at, expires_at FROM purchases WHERE listener_id = $1 ORDER BY created_at DESC LIMIT 100', [id]);
    const tips = await db.query<{ id: string; to_feed_url: string; created_at: Date | string; status: string }>(
      'SELECT t.id, t.to_feed_url, t.created_at, p.status FROM tips t JOIN purchases p ON p.id = t.purchase_id WHERE t.from_listener = $1 ORDER BY t.created_at DESC LIMIT 100', [id]);
    const gifts = await db.query<{ id: string; feed_url: string; bought: boolean; claimed_at: Date | string | null; cancelled_at: Date | string | null; created_at: Date | string }>(
      `SELECT id, feed_url, buyer_id = $1 AS bought, claimed_at, cancelled_at, created_at FROM gifts WHERE buyer_id = $1 OR claimed_by = $1 ORDER BY created_at DESC LIMIT 100`, [id]);
    const against = await db.query<{ id: string; target_kind: string; target_id: string; reason: string; created_at: Date | string; close_reason: string | null }>(
      `SELECT id, target_kind, target_id, reason, created_at, close_reason FROM reports
        WHERE (target_kind = 'profile' AND target_id = $1::text) OR snapshot->>'authorId' = $1::text ORDER BY created_at DESC LIMIT 50`, [id]);
    const [del] = await db.query<{ requested_at: Date | string; due_at: Date | string }>('SELECT requested_at, due_at FROM account_deletions WHERE listener_id = $1 AND cancelled_at IS NULL', [id]);
    const live = plus.filter((e) => e.until === null || new Date(e.until).getTime() > Date.now());
    return {
      user, avatarUrl: p?.avatar_url ?? null, bio: p?.bio ?? null, sessions: Number(p?.sessions ?? 0),
      plus: { active: live.length > 0, until: live.some((e) => e.until === null) ? null : iso(live[0]?.until ?? null), byAdmin: plus.some((e) => e.ref === PLUS_BY_ADMIN && e.source_purchase_id === null) },
      purchases: purchases.map((r) => ({ id: r.id, productId: r.product_id, store: r.store, status: r.status, amountMicros: r.amount_micros === null ? null : Number(r.amount_micros), currency: r.currency, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at) })),
      tips: tips.map((r) => ({ id: r.id, feedUrl: r.to_feed_url, status: r.status, createdAt: iso(r.created_at) })),
      gifts: gifts.map((r) => ({ id: r.id, feedUrl: r.feed_url, role: r.bought ? 'bought' : 'received', claimedAt: iso(r.claimed_at), cancelledAt: iso(r.cancelled_at), createdAt: iso(r.created_at) })),
      reportsAgainst: against.map((r) => ({ id: r.id, targetKind: r.target_kind, targetId: r.target_id, reason: r.reason, createdAt: iso(r.created_at), closeReason: r.close_reason })),
      deletion: del ? { requestedAt: iso(del.requested_at), dueAt: iso(del.due_at) } : null,
    };
  }

  admin.get('/users/:id', async (c) => {
    const d = await detail(c.get('db'), uuidParam(c.req.param('id')));
    if (!d) throw new ApiError('not_found', 'No such account.');
    return c.json(d);
  });

  /** Grant: PLUS for `days` from now (ref 'admin', no purchase). Revoke: every PLUS row goes, bought or given. */
  admin.post('/users/:id/plus', json(z.object({ days: z.number().int().min(1).max(3660) })), async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    if (!(await userById(db, id))) throw new ApiError('not_found', 'No such account.');
    const days = c.req.valid('json').days;
    await adminWrite(db, auditCtx(c), { area: 'users', action: `grant plus ${days} days`, target: id }, async (tx) => ({ plus: (await detail(tx, id))!.plus }), async (tx) => {
      await tx.query(
        `INSERT INTO entitlements (listener_id, kind, ref, until) VALUES ($1, 'plus', $2, now() + make_interval(days => $3::int))
         ON CONFLICT (listener_id, kind, ref) DO UPDATE SET until = excluded.until`, [id, PLUS_BY_ADMIN, days]);
    });
    return c.json(await detail(db, id));
  });

  admin.delete('/users/:id/plus', async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    if (!(await userById(db, id))) throw new ApiError('not_found', 'No such account.');
    await adminWrite(db, auditCtx(c), { area: 'users', action: 'revoke plus', target: id }, async (tx) => ({ plus: (await detail(tx, id))!.plus }),
      (tx) => tx.query("DELETE FROM entitlements WHERE listener_id = $1 AND kind = 'plus'", [id]));
    return c.json(await detail(db, id));
  });

  /** An abusive photo: the row first (nobody sees it again), then the file from storage. */
  admin.delete('/users/:id/avatar', async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    const [r] = await db.query<{ avatar_url: string | null }>('SELECT avatar_url FROM listeners WHERE id = $1', [id]);
    if (!r) throw new ApiError('not_found', 'No such account.');
    await adminWrite(db, auditCtx(c), { area: 'users', action: 'remove photo', target: id }, async (tx) => ({ avatarUrl: (await detail(tx, id))!.avatarUrl }),
      (tx) => tx.query('UPDATE listeners SET avatar_url = NULL, avatar_path = NULL, avatar_bytes = NULL WHERE id = $1', [id]));
    if (r.avatar_url) { try { await c.get('avatars').remove(r.avatar_url); } catch (e) { console.error('avatar not removed', e); } }
    return c.json(await detail(db, id));
  });

  admin.delete('/users/:id/bio', async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    if (!(await userById(db, id))) throw new ApiError('not_found', 'No such account.');
    await adminWrite(db, auditCtx(c), { area: 'users', action: 'remove bio', target: id }, async (tx) => ({ bio: (await detail(tx, id))!.bio }),
      (tx) => tx.query('UPDATE listeners SET bio = NULL WHERE id = $1', [id]));
    return c.json(await detail(db, id));
  });

  /**
   * G-U1: suspension and report actions go through `/mod`'s own `act()` — one place for the rule.
   * `act()` runs its own transaction (a nested one is not portable across the two drivers), so the
   * record is written right after it, with the before and after it read.
   */
  async function adminAct(c: Context<AdminEnv, any, any>, area: 'users' | 'reports', item: { kind: TargetKind; id: string }, action: Action) {
    const db = c.get('db');
    const me = c.get('listener')!.id;
    if (action === 'suspend' && item.kind === 'profile' && item.id === me) throw new ApiError('validation', 'You cannot suspend yourself.', { fields: ['id'] });
    const read = async () => ({
      ...(item.kind === 'profile' ? { user: await userById(db, item.id) } : {}),
      openReports: Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE target_kind = $1 AND target_id = $2 AND closed_at IS NULL', [item.kind, item.id]))[0]?.n ?? 0),
    });
    const before = await read();
    const a = await act(db, me, item, action);
    await insertAudit(db, auditCtx(c), { area, action, target: `${item.kind}:${item.id}` }, before, { ...(await read()), moderationActionId: a.id });
    return a;
  }

  admin.post('/users/:id/suspend', async (c) => {
    const id = uuidParam(c.req.param('id'));
    if (!(await userById(c.get('db'), id))) throw new ApiError('not_found', 'No such account.');
    await adminAct(c, 'users', { kind: 'profile', id }, 'suspend');
    return c.json({ user: await userById(c.get('db'), id) });
  });

  admin.post('/users/:id/restore', async (c) => {
    const id = uuidParam(c.req.param('id'));
    if (!(await userById(c.get('db'), id))) throw new ApiError('not_found', 'No such account.');
    await adminAct(c, 'users', { kind: 'profile', id }, 'unsuspend');
    return c.json({ user: await userById(c.get('db'), id) });
  });

  const reportRow = (r: QueueRow) => ({ targetKind: r.target_kind, targetId: r.target_id, reporterId: r.reporter_id, reporterName: r.display_name, reason: r.reason, note: r.note, snapshot: r.snapshot, createdAt: new Date(r.created_at).getTime() });

  admin.get('/reports', async (c) => {
    const db = c.get('db');
    const state = c.req.query('state') === 'closed' ? 'closed' : 'open';
    const actions = (await recentActions(db, 50)).map((a) => ({ id: a.id, action: a.action, targetKind: a.target_kind, targetId: a.target_id, actorName: a.actor_name, at: new Date(a.created_at).toISOString() }));
    if (state === 'open') {
      const items = groupReports((await openReports(db)).map(reportRow)).map((i) => ({ ...i, actions: actionsFor(i.targetKind) }));
      return c.json({ state, items, actions });
    }
    const closed = (await closedReports(db, RETENTION_DAYS)).map((r) => ({
      id: r.id, targetKind: r.target_kind, targetId: r.target_id, reason: r.reason, reporterName: r.display_name,
      createdAt: new Date(r.created_at).toISOString(), closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null, closeReason: r.close_reason,
    }));
    return c.json({ state, items: closed, actions });
  });

  const ACTIONS: readonly Action[] = ['dismiss', 'remove', 'hide_show', 'suspend', 'unsuspend', 'unhide_show'];

  admin.post('/reports/act', json(z.object({
    kind: z.enum(['comment', 'clip', 'profile', 'show', 'episode', 'transcript', 'status', 'chat_message', 'list']),
    id: z.string().min(1).max(2048),
    action: z.enum(ACTIONS as [Action, ...Action[]]),
  })), async (c) => {
    const b = c.req.valid('json');
    // The same rule `/mod` applies (pages/mod.ts `POST /mod/act`).
    if (!(actionsFor(b.kind).includes(b.action) || b.action === 'unsuspend' || b.action === 'unhide_show')) throw new ApiError('validation', 'That action does not fit this item.', { fields: ['action'] });
    const a = await adminAct(c, 'reports', { kind: b.kind, id: b.id }, b.action);
    return c.json({ action: { id: a.id, action: a.action, targetKind: a.target_kind, targetId: a.target_id } });
  });
}
