// Public Academy articles and Help questions: GET /v1/content/:kind and /v1/content/:kind/:slug.
/**
 * M25 A8. Mounted at /v1/content, no sign-in; published pages only, in their order. The body is
 * the Markdown subset as text — the phone draws it as text runs (never HTML) and keeps its bundled
 * copy for when this cannot be reached. ETag / 304 like /v1/config.
 */
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { getPage, isContentKind, listPages, type ContentPage } from '../db/repos/config/content.ts';

export const content = new Hono<AuthEnv>();

const shown = (p: ContentPage) => ({ slug: p.slug, title: p.title, summary: p.summary, tag: p.tag, body: p.body, position: p.position, updatedAt: p.updatedAt });

const kindOf = (k: string) => {
  if (!isContentKind(k)) throw new ApiError('not_found', 'No such content.');
  return k;
};

content.get('/:kind', async (c) => {
  const items = (await listPages(c.get('db'), kindOf(c.req.param('kind')), { all: false })).map(shown);
  const etag = `W/"${createHash('sha256').update(JSON.stringify(items)).digest('base64url').slice(0, 16)}"`;
  c.header('Cache-Control', 'public, max-age=60');
  c.header('ETag', etag);
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  return c.json({ items });
});

content.get('/:kind/:slug', async (c) => {
  const p = await getPage(c.get('db'), kindOf(c.req.param('kind')), c.req.param('slug'));
  if (!p || !p.published) throw new ApiError('not_found', 'No such page.');
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(shown(p));
});
