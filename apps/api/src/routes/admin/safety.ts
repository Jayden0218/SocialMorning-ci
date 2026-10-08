// Admin routes for blocked words, the maintenance switch and system notices.
/**
 * Admin API (`/v1/admin/*`, owner only) — M24 lane A1:
 *   GET    /words                        → { items: { word, addedBy, addedAt }[] }
 *   POST   /words { words: string[] }    → { added, items }   (each folded; empty or too long → 422)
 *   DELETE /words/:word                  → { items }
 *   GET    /maintenance                  → { stored, active }
 *   PUT    /maintenance { on, message?, until? } → { stored, active }  (on → until must be in the future)
 *   GET    /notices                      → { items }  (the notices to everyone)
 *   POST   /notices { title, body, link?, push } → 201 { notice, pushed? }
 *   DELETE /notices/:id                  → 204
 * Every write goes through `adminWrite` (one audit row). Each change drops this process's memo.
 */
import { z } from 'zod';
import { normaliseWord, WORD_MAX } from '@socialmorning/social-core';
import { adminWrite, auditCtx, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import type { Hono } from 'hono';
import type { Db } from '../../db/db.ts';
import { addWords, dropWordsMemo, listWords, removeWord } from '../../db/repos/safety/words.ts';
import { activeMaintenance, dropMaintenanceMemo, MAINTENANCE_MESSAGE_MAX, setMaintenance, storedMaintenance } from '../../db/repos/safety/maintenance.ts';
import { broadcastNotices, deleteNotice, insertNotice, NOTICE_BODY_MAX, NOTICE_TITLE_MAX, pushNotice } from '../../db/repos/social/system-notices.ts';

/** An in-app path the phone may open: "/x…", no scheme, no "//", no spaces (the phone's `systemAction` rule). */
const ROUTE = /^\/(?!\/)[^\s\\:]{1,199}$/;

export function registerSafety(admin: Hono<AdminEnv>): void {
  admin.get('/words', async (c) => c.json({ items: await listWords(c.get('db')) }));

  admin.post('/words', json(z.object({ words: z.array(z.string().max(200)).min(1).max(200) })), async (c) => {
    const db = c.get('db');
    const words = [...new Set(c.req.valid('json').words.map((w) => normaliseWord(w)))];
    if (words.some((w) => w === undefined)) throw new ApiError('validation', `Each word is 1–${WORD_MAX} characters.`, { fields: ['words'] });
    const list = words as string[];
    const added = await adminWrite(db, auditCtx(c), { area: 'safety', action: 'add words', target: list.join(', ').slice(0, 2048) },
      async (tx) => ({ count: (await listWords(tx)).length }), (tx) => addWords(tx, list, c.get('listener')!.id));
    dropWordsMemo(db);
    return c.json({ added, items: await listWords(db) });
  });

  admin.delete('/words/:word', async (c) => {
    const db = c.get('db');
    const word = normaliseWord(c.req.param('word'));
    // Checked first: a refused call writes no record row.
    if (!word || !(await listWords(db)).some((w) => w.word === word)) throw new ApiError('not_found', 'No such word.');
    await adminWrite(db, auditCtx(c), { area: 'safety', action: 'remove word', target: word },
      async (tx) => ({ present: (await listWords(tx)).some((w) => w.word === word) }), (tx) => removeWord(tx, word));
    dropWordsMemo(db);
    return c.json({ items: await listWords(db) });
  });

  const maintenanceNow = async (db: Db) => ({ stored: await storedMaintenance(db), active: await activeMaintenance(db) });

  admin.get('/maintenance', async (c) => {
    dropMaintenanceMemo(c.get('db'));
    return c.json(await maintenanceNow(c.get('db')));
  });

  admin.put('/maintenance', json(z.object({
    on: z.boolean(),
    message: z.string().trim().max(MAINTENANCE_MESSAGE_MAX).optional(),
    until: z.string().max(40).optional(),
  })), async (c) => {
    const db = c.get('db');
    const b = c.req.valid('json');
    let next: { until: string; message: string } | null = null;
    if (b.on) {
      const at = b.until ? Date.parse(b.until) : NaN;
      if (!Number.isFinite(at) || at <= Date.now()) throw new ApiError('validation', 'Pick an end time in the future.', { fields: ['until'] });
      if (at > Date.now() + 7 * 86_400_000) throw new ApiError('validation', 'Maintenance can last at most 7 days.', { fields: ['until'] });
      next = { until: new Date(at).toISOString(), message: b.message || 'SocialNet is being updated.' };
    }
    await adminWrite(db, auditCtx(c), { area: 'safety', action: b.on ? 'maintenance on' : 'maintenance off', target: 'maintenance' },
      async (tx) => ({ stored: await storedMaintenance(tx) }), (tx) => setMaintenance(tx, next, c.get('listener')!.id));
    dropMaintenanceMemo(db);
    return c.json(await maintenanceNow(c.get('db')));
  });

  admin.get('/notices', async (c) => c.json({ items: await broadcastNotices(c.get('db')) }));

  admin.post('/notices', json(z.object({
    title: z.string().trim().min(1).max(NOTICE_TITLE_MAX),
    body: z.string().trim().min(1).max(NOTICE_BODY_MAX),
    link: z.object({ label: z.string().trim().min(1).max(40), route: z.string().trim().regex(ROUTE) }).optional(),
    push: z.boolean().optional(),
  })), async (c) => {
    const db = c.get('db');
    const b = c.req.valid('json');
    const notice = await adminWrite(db, auditCtx(c), { area: 'notices', action: b.push ? 'send with push' : 'send', target: b.title },
      async (tx) => ({ notices: (await broadcastNotices(tx)).length }), (tx) => insertNotice(tx, { title: b.title, body: b.body, ...(b.link ? { link: b.link } : {}), push: b.push === true, createdBy: c.get('listener')!.id }));
    // The push goes after the notice is saved: a failed push never loses the notice.
    let pushed: { sent: number; dropped: number } | undefined;
    if (b.push) {
      try { pushed = await pushNotice(db, c.get('catalog').pushFetch, { title: b.title, body: b.body, listenerId: null }); }
      catch (e) { console.error(c.get('requestId'), 'notice push', e); pushed = { sent: 0, dropped: 0 }; }
    }
    return c.json({ notice, ...(pushed ? { pushed } : {}) }, 201);
  });

  admin.delete('/notices/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('not_found', 'No such notice.');
    const db = c.get('db');
    if (!(await broadcastNotices(db)).some((n) => n.id === id)) throw new ApiError('not_found', 'No such notice.');
    await adminWrite(db, auditCtx(c), { area: 'notices', action: 'delete', target: id },
      async (tx) => ({ present: (await broadcastNotices(tx)).some((n) => n.id === id) }), (tx) => deleteNotice(tx, id));
    return c.body(null, 204);
  });
}
