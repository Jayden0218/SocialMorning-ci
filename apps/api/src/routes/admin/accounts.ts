// Admin routes for accounts: list, create, edit, and act as an account.
/**
 * Admin API (`/v1/admin/*`, owner only) — US4: accounts
 */
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { ACT_AS_COOKIE, adminWrite, auditCtx, startActing, stopActing } from '../../auth/admin.ts';
import { STUDIO_IDLE_MS } from '../../auth/studio-session.ts';
import { hashPassword } from '../../auth/password.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { accountsByIds, createAccounts, emailTaken, MAX_BULK, madeAccounts, updateAccount } from '../../db/repos/admin/admin-accounts.ts';
import { listCurators, setCurator } from '../../db/repos/studio/curators.ts';
import { act } from '../../db/repos/safety/moderation.ts';
import type { Db } from '../../db/db.ts';
import type { Hono } from 'hono';
import { feedUrl, uuidParam, target } from './common.ts';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerAccounts(admin: Hono<AdminEnv>): void {
  const accountRow = z.object({
    displayName: z.string().trim().min(1).max(40),
    bio: z.string().trim().max(160).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('').transform(() => undefined)),
  });

  admin.get('/accounts', async (c) => c.json({ items: await madeAccounts(c.get('db')), curators: await listCurators(c.get('db')) }));

  admin.post('/accounts', json(z.object({ accounts: z.array(accountRow).min(1).max(MAX_BULK) })), async (c) => {
    const rows = c.req.valid('json').accounts;
    const db = c.get('db');
    const me = c.get('listener')!.id;
    // One hash of random bytes nobody knows, for the batch (scrypt is ~32 MiB a call; 50 calls would not fit a request).
    const hash = await hashPassword(randomBytes(32).toString('hex'));
    let ids: string[] = [];
    const results = await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'create', target: `${rows.length} account${rows.length === 1 ? '' : 's'}` },
      async (tx) => ({ accounts: await accountsByIds(tx, ids) }),
      async (tx) => { const r = await createAccounts(tx, me, rows, hash); ids = r.flatMap((x) => (x.ok ? [x.id] : [])); return r; });
    return c.json({ results });
  });

  admin.patch('/accounts/:id', json(z.object({
    displayName: z.string().trim().min(1).max(40).optional(),
    bio: z.string().trim().max(160).nullable().optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  })), async (c) => {
    const id = uuidParam(c.req.param('id'));
    const b = c.req.valid('json');
    const db = c.get('db');
    const [cur] = await accountsByIds(db, [id]);
    if (!cur || cur.madeBy === null) throw new ApiError('not_found', 'No such account made in Admin.');
    if (b.email && (await emailTaken(db, b.email, id))) throw new ApiError('conflict', 'Another account uses this email.', { fields: ['email'] });
    const account = await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'edit', target: id },
      async (tx) => (await accountsByIds(tx, [id]))[0] ?? null, (tx) => updateAccount(tx, id, b));
    return c.json({ account });
  });

  const secure = (url: string) => new URL(url).protocol === 'https:';

  // Registered before `/act-as/:id` so "stop" is never read as an id.
  admin.post('/act-as/stop', async (c) => {
    const db = c.get('db');
    const me = c.get('listener')!.id;
    await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'act_as_stop', target: me },
      async (tx) => ({ acting: (await tx.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [me])).map((r) => r.listener_id) }),
      (tx) => stopActing(tx, me));
    deleteCookie(c, ACT_AS_COOKIE, { path: '/', secure: secure(c.req.url) });
    return c.json({ actingAs: null });
  });

  admin.post('/act-as/:id', async (c) => {
    const id = uuidParam(c.req.param('id'));
    const db = c.get('db');
    const me = c.get('listener')!.id;
    const [target] = await accountsByIds(db, [id]);
    if (!target || target.madeBy === null) throw new ApiError('not_found', 'You can act only as an account made in Admin.');
    let token = '';
    await adminWrite(db, { ...auditCtx(c), actingAs: id }, { area: 'accounts', action: 'act_as', target: id },
      async (tx) => ({ acting: (await tx.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [me])).map((r) => r.listener_id) }),
      async (tx) => { token = await startActing(tx, c.get('pepper'), me, id); });
    setCookie(c, ACT_AS_COOKIE, token, { httpOnly: true, secure: secure(c.req.url), sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
    return c.json({ actingAs: { id: target.id, displayName: target.displayName } });
  });

  admin.get('/curators', async (c) => c.json({ items: await listCurators(c.get('db')) }));

  admin.put('/curators', json(z.object({ feedUrl, listenerId: z.string().uuid().nullable() })), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    if (b.listenerId) {
      const [who] = await accountsByIds(db, [b.listenerId]);
      if (!who) throw new ApiError('not_found', 'No such account.');
    }
    const read = async (tx: Db) => (await listCurators(tx)).find((x) => x.feedUrl === b.feedUrl) ?? null;
    await adminWrite(db, auditCtx(c), { area: 'accounts', action: b.listenerId ? 'set_curator' : 'remove_curator', target: b.feedUrl }, read,
      (tx) => setCurator(tx, b.feedUrl, b.listenerId, c.get('listener')!.id));
    const now = await read(db);
    return c.json({ curator: now ? now.curator : null });
  });
}
