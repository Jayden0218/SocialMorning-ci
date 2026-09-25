import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { forYou } from '../db/repos/foryou.ts';

/**
 * Mounted at /v1/for-you (M8 US2). **Signed in only** — there is no anonymous
 * personalisation, and `/v1/discover` is left exactly as it was for everyone else.
 *
 * `warnings` never leaves the server: which channel failed is a fact about other
 * people's data, and `/mod/recs` is where it belongs.
 */
export const foryou = new Hono<AuthEnv>();

foryou.get('/', requireAuth, async (c) => {
  const cat = c.get('catalog');
  const { body, stale } = await forYou(c.get('db'), cat.fetch, cat.picks, cat.today(), c.get('listener')!.id);

  const etag = `W/"${createHash('sha256')
    .update(JSON.stringify([body.computedAt, body.items.map((i) => i.episode.id)]))
    .digest('base64url')
    .slice(0, 16)}"`;
  if (c.req.header('if-none-match') === etag) return c.body(null, 304);
  c.header('ETag', etag);

  if (body.warnings.length > 0) console.warn(`[for-you] ${body.warnings.join(' | ')}`);
  const { warnings, ...pub } = body;
  return c.json({ ...pub, stale, serverTime: new Date().toISOString() });
});
