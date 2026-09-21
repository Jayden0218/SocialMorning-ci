import { Hono } from 'hono';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { etagFor, feedFor, toFeedItem } from '../db/repos/activity.ts';

/** Mounted at /v1/me/feed — GET with If-None-Match → 304 on the first page. */
export const feed = new Hono<AuthEnv>();

feed.get('/', requireAuth, async (c) => {
  const before = c.req.query('before') || undefined;
  const { items, next } = await feedFor(c.get('db'), c.get('listener')!.id, before);
  const etag = before ? undefined : etagFor(items);
  if (etag && c.req.header('if-none-match') === etag) return c.body(null, 304);
  if (etag) c.header('ETag', etag);
  return c.json({ items: items.map(toFeedItem), ...(next ? { next } : {}), serverTime: new Date().toISOString() });
});
