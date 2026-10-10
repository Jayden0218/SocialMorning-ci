// Admin routes for appeals (accept = undo, reject) and the account deletion queue.
/**
 * Admin API (`/v1/admin/*`, owner only) — M24 lane A1:
 *   GET  /appeals?state=open|decided → { state, items: AdminAppeal[] }
 *   POST /appeals/:id/accept         → { appeal }  undoes the action: a suspension through `act('unsuspend')`
 *                                                 (G-U1: the one place for that rule), a removal by restoring the item
 *   POST /appeals/:id/reject         → { appeal }
 *   GET  /deletions                  → { items: { listenerId, displayName, email, requestedAt, dueAt }[] }  (US7)
 * Either decision sends the listener a system notice.
 */
import { adminWrite, auditCtx, insertAudit, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import type { Hono } from 'hono';
import { act } from '../../db/repos/safety/moderation.ts';
import { adminAppeals, appealById, decide, restoreRemoved } from '../../db/repos/safety/appeals.ts';

export function registerAppeals(admin: Hono<AdminEnv>): void {
  admin.get('/appeals', async (c) => {
    const state = c.req.query('state') === 'decided' ? 'decided' : 'open';
    return c.json({ state, items: await adminAppeals(c.get('db'), state) });
  });

  for (const verdict of ['accept', 'reject'] as const) {
    admin.post(`/appeals/:id/${verdict}`, async (c) => {
      const db = c.get('db');
      const me = c.get('listener')!.id;
      const a = await appealById(db, c.req.param('id'));
      if (!a) throw new ApiError('not_found', 'No such appeal.');
      if (a.state !== 'open') throw new ApiError('conflict', 'This appeal was already decided.');
      const read = async (tx: typeof db) => ({ appeal: (await appealById(tx, a.id))?.state ?? null });
      if (verdict === 'accept' && a.action === 'suspend') {
        // `act()` runs its own transaction, so it goes first and is recorded on its own (as users.ts does).
        const before = await read(db);
        const done = await act(db, me, { kind: 'profile', id: a.listener_id }, 'unsuspend');
        await insertAudit(db, auditCtx(c), { area: 'appeals', action: 'accept: unsuspend', target: `appeal:${a.id}` }, before, { moderationActionId: done.id });
      }
      await adminWrite(db, auditCtx(c), { area: 'appeals', action: verdict, target: `appeal:${a.id}` }, read, async (tx) => {
        if (verdict === 'accept' && a.action === 'remove') await restoreRemoved(tx, a.target_kind, a.target_id);
        await decide(tx, a.id, a.listener_id, verdict === 'accept', me);
      });
      return c.json({ appeal: { id: a.id, state: verdict === 'accept' ? 'accepted' : 'rejected' } });
    });
  }

  admin.get('/deletions', async (c) => {
    const rows = await c.get('db').query<{ listener_id: string; display_name: string; email: string; requested_at: Date | string; due_at: Date | string }>(
      `SELECT d.listener_id, l.display_name, l.email::text AS email, d.requested_at, d.due_at
         FROM account_deletions d JOIN listeners l ON l.id = d.listener_id
        WHERE d.cancelled_at IS NULL ORDER BY d.due_at ASC LIMIT 500`);
    return c.json({ items: rows.map((r) => ({ listenerId: r.listener_id, displayName: r.display_name, email: r.email, requestedAt: new Date(r.requested_at).toISOString(), dueAt: new Date(r.due_at).toISOString() })) });
  });
}
