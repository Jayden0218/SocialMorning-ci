// For You route: the personal recommendation list — signed in, or signed out with picked categories.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { forYou, forYouAnon } from '../../db/repos/discover/foryou.ts';
import { cleanGenreIds } from '../../db/repos/account/interests.ts';

/**
 * Mounted at /v1/for-you (M8 US2). Signed in — or, since M22 US5, signed out with
 * `?interests=1303,1487` (the categories picked on first open, kept on the phone). Without
 * either it answers 401 as before; `/v1/discover` is left exactly as it was for everyone else.
 *
 * `warnings` never leaves the server: which channel failed is a fact about other
 * people's data, and `/mod/recs` is where it belongs.
 */
export const foryou = new Hono<AuthEnv>();

foryou.get('/', optionalAuth, async (c) => {
  const cat = c.get('catalog');
  const listener = c.get('listener');
  // M22 US5: signed out, the list is seeded only by `?interests=` (the categories picked on the phone).
  const picked = cleanGenreIds((c.req.query('interests') ?? '').split(',').filter((s) => /^\d{1,6}$/.test(s)).map(Number));
  if (!listener && picked.length === 0) throw new ApiError('unauthenticated', 'Sign in to see For You.');
  const { body, stale } = listener
    ? await forYou(c.get('db'), cat.fetch, cat.picks, cat.today(), listener.id)
    : await forYouAnon(c.get('db'), cat.fetch, cat.picks, cat.today(), picked);

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
