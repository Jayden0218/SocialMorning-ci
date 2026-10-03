// Admin routes for curated issues and collections: list, read, save, retire.
/**
 * Admin API (`/v1/admin/*`, owner only) — US2: issues; US2: collections
 */
import { z } from 'zod';
import { adminWrite, auditCtx } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { checkCollection, checkIssue, getIssueRow, listCollectionRows, listIssueRows, putCollection, putIssue, retireCollection, retireIssue } from '../../db/repos/admin/admin-curated.ts';
import type { Db } from '../../db/db.ts';
import type { Hono } from 'hono';
import { DATE, feedUrl, guid, version, catalogChanged, target } from './common.ts';
import type { AdminEnv } from '../../auth/admin.ts';

export function registerCurated(admin: Hono<AdminEnv>): void {
  const issueBody = z.object({
    version,
    day: z.string().regex(DATE),
    title: z.string().trim().min(1).max(80),
    intro: z.string().trim().min(1).max(600),
    items: z.array(z.object({ feedUrl, guid, note: z.string().trim().min(1).max(280) })).max(30),
  });

  admin.get('/issues', async (c) => {
    const rows = await listIssueRows(c.get('db'));
    const ids = new Set(rows.map((r) => r.id));
    // The merged catalogue holds the file's issues that the tables do not override.
    const file = c.get('catalog').issues.filter((i) => !ids.has(i.id)).map((i) => ({
      id: i.id, day: i.date, title: i.title, intro: i.intro, items: i.items.map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note })),
      version: 0, retired: false, source: 'file' as const,
    }));
    return c.json({ items: [...rows.map((r) => ({ ...r, source: 'admin' as const })), ...file].sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id)) });
  });

  admin.get('/issues/:id', async (c) => {
    const id = c.req.param('id');
    const row = await getIssueRow(c.get('db'), id);
    if (row) return c.json({ ...row, source: 'admin' });
    const f = c.get('catalog').issues.find((i) => i.id === id);
    if (!f) throw new ApiError('not_found', 'No such issue.');
    return c.json({ id, day: f.date, title: f.title, intro: f.intro, items: f.items.map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note })), version: 0, retired: false, source: 'file' });
  });

  admin.put('/issues/:id', json(issueBody), async (c) => {
    const id = c.req.param('id');
    const b = c.req.valid('json');
    const issue = checkIssue(id, b);
    const db = c.get('db');
    const next = await adminWrite(db, auditCtx(c), { area: 'issues', action: 'save', target: id },
      async (tx) => (await getIssueRow(tx, id)) ?? null, (tx) => putIssue(tx, id, b.version, issue));
    await catalogChanged(db);
    return c.json({ id, version: next });
  });

  admin.delete('/issues/:id', async (c) => {
    const id = c.req.param('id');
    const v = Number(c.req.query('version') ?? 'NaN');
    if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
    const db = c.get('db');
    const file = c.get('catalog').issues.find((i) => i.id === id);
    const next = await adminWrite(db, auditCtx(c), { area: 'issues', action: 'retire', target: id },
      async (tx) => (await getIssueRow(tx, id)) ?? null, (tx) => retireIssue(tx, id, v, file));
    await catalogChanged(db);
    return c.json({ id, version: next, retired: true });
  });

  const collectionBody = z.object({
    version,
    title: z.string().trim().min(1).max(60),
    subtitle: z.string().trim().min(1).max(120).optional(),
    position: z.number().int().min(0).max(100).default(0),
    items: z.array(z.object({ feedUrl, guid, why: z.string().trim().min(1).max(140).optional() })).min(1).max(10),
  });

  admin.get('/collections', async (c) => {
    const rows = await listCollectionRows(c.get('db'));
    const ids = new Set(rows.map((r) => r.id));
    const file = c.get('catalog').collections.filter((x) => !ids.has(x.id)).map((x, i) => ({ ...x, position: 100 + i, version: 0, retired: false, source: 'file' as const }));
    return c.json({ items: [...rows.map((r) => ({ ...r, source: 'admin' as const })), ...file] });
  });

  admin.put('/collections/:id', json(collectionBody), async (c) => {
    const id = c.req.param('id');
    const b = c.req.valid('json');
    const col = checkCollection(id, { title: b.title, ...(b.subtitle ? { subtitle: b.subtitle } : {}), position: b.position, items: b.items });
    const db = c.get('db');
    const read = async (tx: Db) => (await listCollectionRows(tx)).find((r) => r.id === id) ?? null;
    const next = await adminWrite(db, auditCtx(c), { area: 'collections', action: 'save', target: id }, read, (tx) => putCollection(tx, id, b.version, col, b.position));
    await catalogChanged(db);
    return c.json({ id, version: next });
  });

  admin.delete('/collections/:id', async (c) => {
    const id = c.req.param('id');
    const v = Number(c.req.query('version') ?? 'NaN');
    if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
    const db = c.get('db');
    const file = c.get('catalog').collections.find((x) => x.id === id);
    const read = async (tx: Db) => (await listCollectionRows(tx)).find((r) => r.id === id) ?? null;
    const next = await adminWrite(db, auditCtx(c), { area: 'collections', action: 'retire', target: id }, read, (tx) => retireCollection(tx, id, v, file));
    await catalogChanged(db);
    return c.json({ id, version: next, retired: true });
  });
}
