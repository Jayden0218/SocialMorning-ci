// Admin routes for Academy articles and Help questions (Admin › Content): list, save, delete.
/**
 * M25 A8 (`/v1/admin/content*`, owner only). Unpublished pages are listed here and never served
 * by `/v1/content`. Every write is version-checked and recorded in `admin_audit` (area `content`).
 * The body is stored as written; the Studio's preview and the phone draw it as text (never HTML).
 */
import { z } from 'zod';
import type { Hono } from 'hono';
import { adminWrite, auditCtx, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { ACADEMY_TAGS, SLUG, deletePage, getPage, isContentKind, listPages, putPage } from '../../db/repos/config/content.ts';
import { version } from './common.ts';

const kindParam = (k: string) => {
  if (!isContentKind(k)) throw new ApiError('not_found', 'No such content.');
  return k;
};
const slugParam = (s: string) => {
  if (!SLUG.test(s)) throw new ApiError('validation', 'The address must be 1–64 lower-case letters, digits or dashes.', { fields: ['slug'] });
  return s;
};
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

const pageBody = z.object({
  version,
  title: z.string().trim().min(1).max(120),
  summary: optText(200),
  tag: optText(40),
  body: z.string().trim().min(1).max(8000),
  position: z.number().int().min(0).max(1000).default(0),
  published: z.boolean().default(true),
});

export function registerContent(admin: Hono<AdminEnv>): void {
  admin.get('/content', async (c) => {
    const kind = kindParam(c.req.query('kind') ?? 'academy');
    return c.json({ kind, items: await listPages(c.get('db'), kind, { all: true }), academyTags: ACADEMY_TAGS });
  });

  admin.put('/content/:kind/:slug', json(pageBody), async (c) => {
    const kind = kindParam(c.req.param('kind'));
    const slug = slugParam(c.req.param('slug'));
    const b = c.req.valid('json');
    if (kind === 'academy' && b.tag !== null && !(ACADEMY_TAGS as readonly string[]).includes(b.tag)) {
      throw new ApiError('validation', `An Academy tab is one of ${ACADEMY_TAGS.join(', ')}.`, { fields: ['tag'] });
    }
    const db = c.get('db');
    const next = await adminWrite(db, auditCtx(c), { area: 'content', action: b.version === 0 ? 'create' : 'save', target: `${kind}/${slug}` },
      (tx) => getPage(tx, kind, slug),
      (tx) => putPage(tx, kind, slug, b.version, { title: b.title, summary: b.summary, tag: b.tag, body: b.body, position: b.position, published: b.published }));
    return c.json({ kind, slug, version: next });
  });

  admin.delete('/content/:kind/:slug', async (c) => {
    const kind = kindParam(c.req.param('kind'));
    const slug = slugParam(c.req.param('slug'));
    const v = Number(c.req.query('version') ?? 'NaN');
    if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'content', action: 'delete', target: `${kind}/${slug}` },
      (tx) => getPage(tx, kind, slug), (tx) => deletePage(tx, kind, slug, v));
    return c.json({ kind, slug, deleted: true });
  });
}
