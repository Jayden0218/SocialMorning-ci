import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { AuthEnv } from '../auth/session.ts';
import { discoverBody } from '../db/repos/discover.ts';

/** Mounted at /v1/discover — public; ETag/304; `stale` when the catalogue could not be refreshed. */
export const discover = new Hono<AuthEnv>();

discover.get('/', async (c) => {
  const cat = c.get('catalog');
  const { body, stale } = await discoverBody(c.get('db'), cat.fetch, cat.picks, cat.today());
  const etag = `W/"${createHash('sha256').update(JSON.stringify([body.date, body.picks.map((p) => p.key), body.talkedAbout.map((p) => p.key), body.trending.map((p) => p.key)])).digest('base64url').slice(0, 16)}"`;
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('ETag', etag);
  const { warnings, ...pub } = body;
  if (warnings.length > 0) console.warn(`[discover] ${warnings.join(' | ')}`);
  return c.json({ ...pub, stale, serverTime: new Date().toISOString() });
});
