/**
 * Admin API (`/v1/admin/*`, owner only) — US6: users and safety
 */
import { type Context } from 'hono';
import { z } from 'zod';
import { actionsFor, groupReports, RETENTION_DAYS, type Action, type TargetKind } from '@socialmorning/social-core';
import { adminWrite, auditCtx, insertAudit, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { act, recentActions } from '../../db/repos/moderation.ts';
import { closedReports, openReports, type QueueRow } from '../../db/repos/reports.ts';
import type { Db } from '../../db/db.ts';
import type { Hono } from 'hono';
import { uuidParam, target } from './common.ts';

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
    kind: z.enum(['comment', 'clip', 'profile', 'show']),
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
