// Admin routes for redeem codes: list them, make new ones, switch one off.
/**
 * M24 US15 (spec 025, lane A3) — `/v1/admin/redeem*`, owner only (behind `adminOnly` in index.ts).
 * A code is a free grant by the owner — PLUS for some days, or one paid show — never a sale.
 *  - GET  /redeem               → { items, paidShows }
 *  - POST /redeem               { kind, days?, feedUrl?, count?, maxUses?, note?, expiresAt? } → 201 { codes }
 *  - POST /redeem/:code/disable → { disabled: true }
 * Writes go through `adminWrite` (one audit row, area `accounts`, action `redeem.*`).
 */
import { z } from 'zod';
import type { Hono } from 'hono';
import { adminWrite, auditCtx, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { MAX_PLUS_DAYS, codeState, createCodes, disableCode, listCodes, newRedeemCode, normalizeCode, paidShows, type Grant } from '../../db/repos/account/redeem.ts';
import { paidHostedShowRows } from '../../db/repos/admin/admin-users.ts';

const body = z.object({
  kind: z.enum(['plus', 'show']),
  days: z.number().int().min(1).max(MAX_PLUS_DAYS).optional(),
  feedUrl: z.string().trim().url().max(2048).optional(),
  count: z.number().int().min(1).max(100).optional(),
  maxUses: z.number().int().min(1).max(10000).optional(),
  note: z.string().trim().max(200).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export function registerRedeem(admin: Hono<AdminEnv>): void {
  admin.get('/redeem', async (c) => {
    const db = c.get('db');
    return c.json({ items: await listCodes(db), paidShows: await paidShows(db) });
  });

  admin.post('/redeem', json(body), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    let grant: Grant;
    if (b.kind === 'plus') {
      if (!b.days) throw new ApiError('validation', 'Say how many days of PLUS.', { fields: ['days'] });
      grant = { kind: 'plus', days: b.days };
    } else {
      if (!b.feedUrl) throw new ApiError('validation', 'Pick a paid show.', { fields: ['feedUrl'] });
      const [show] = await paidHostedShowRows(db, b.feedUrl);
      if (!show) throw new ApiError('validation', 'That show sells nothing, so a code cannot give it.', { fields: ['feedUrl'] });
      grant = { kind: 'show', feedUrl: b.feedUrl };
    }
    if (b.expiresAt && Date.parse(b.expiresAt) <= Date.now()) throw new ApiError('validation', 'The end date must be in the future.', { fields: ['expiresAt'] });
    const count = b.count ?? 1;
    const wanted = Array.from({ length: count }, () => newRedeemCode());
    let made: string[] = wanted;
    await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'redeem.create', target: `${count} code${count === 1 ? '' : 's'}` },
      (tx) => codeState(tx, made),
      async (tx) => {
        made = await createCodes(tx, { grant, count, maxUses: b.maxUses ?? 1, note: b.note ?? '', expiresAt: b.expiresAt ?? null, createdBy: c.get('listener')!.id }, wanted);
        return made;
      });
    return c.json({ codes: made }, 201);
  });

  admin.post('/redeem/:code/disable', async (c) => {
    const code = normalizeCode(c.req.param('code'));
    if (!code) throw new ApiError('not_found', 'No such code.');
    const db = c.get('db');
    // A missing code throws inside the write, so the transaction (and its audit row) is rolled back.
    await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'redeem.disable', target: code },
      (tx) => codeState(tx, [code]),
      async (tx) => { if (!(await disableCode(tx, code))) throw new ApiError('not_found', 'No such code.'); });
    return c.json({ disabled: true });
  });
}
