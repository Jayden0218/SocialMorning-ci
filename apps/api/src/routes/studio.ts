/**
 * M11 — the Studio's API, `/v1/studio/*` (specs/011-m11-studio/contracts/studio-api.md).
 *
 * Order of the walls, for every route:
 *   1. `Cache-Control: private, no-store` on every response, errors included (guard G-X1):
 *      the Studio reaches us through a Vercel rewrite, which caches by upstream headers.
 *   2. CSRF: a write without `X-Studio: 1` is refused (G-X2).
 *   3. A live `studio-web` session, idle ≤ 12 h (G-S1) — except `POST /session`, which trades
 *      a fresh studio-web token for the cookie.
 *   4. `/shows/:show/*`: the caller's role on that show, or 403 `no_role` (G-A1);
 *      owner-only routes add `ownerOnly` (G-A2).
 */
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { tokenHash, publicListener } from '../auth/session.ts';
import { STUDIO_COOKIE, STUDIO_IDLE_MS, studioAuth, studioCsrf, studioListener, studioToken, type StudioEnv } from '../auth/studio-session.ts';
import { ApiError } from '../errors.ts';
import { roleFor, showsFor } from '../db/repos/studio-roles.ts';
import { METRICS, claimedAt, recentComments, recentEpisodes, totals, trend, validTz, type Metric } from '../db/repos/studio-numbers.ts';

export type { StudioEnv };

export const studio = new Hono<StudioEnv>();

studio.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  await next();
  c.res.headers.set('Cache-Control', 'private, no-store');
});
studio.use('*', studioCsrf);

const secure = (url: string) => new URL(url).protocol === 'https:';

/**
 * Sign-in happens at `/v1/auth/sign-in` or `/v1/auth/code/verify` with `deviceLabel: 'studio-web'`
 * (one sign-in path for the whole product). The Studio then posts that token here as a Bearer
 * and gets it back as a first-party HttpOnly cookie. The body repeats the token for the
 * Bearer fallback (research R1) in case the proxy drops `Set-Cookie`.
 */
studio.post('/session', async (c) => {
  const token = studioToken(c);
  const who = token ? await studioListener(c.get('db'), c.get('pepper'), token) : undefined;
  if (who === 'expired') throw new ApiError('session_expired', 'You were away for a while. Sign in again.');
  if (!who || !token) throw new ApiError('unauthenticated', 'Sign in with deviceLabel "studio-web" first.');
  setCookie(c, STUDIO_COOKIE, token, { httpOnly: true, secure: secure(c.req.url), sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
  return c.json({ token, me: publicListener(who), shows: await showsFor(c.get('db'), who.id) });
});

studio.use('*', async (c, next) => (c.req.path.endsWith('/v1/studio/session') && c.req.method === 'POST' ? next() : studioAuth(c, next)));

studio.post('/session/sign-out', async (c) => {
  await c.get('db').query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(c.get('token')!, c.get('pepper'))]);
  deleteCookie(c, STUDIO_COOKIE, { path: '/', secure: secure(c.req.url) });
  return c.body(null, 204);
});

studio.get('/me', async (c) => {
  const me = c.get('listener')!;
  return c.json({ me: publicListener(me), shows: await showsFor(c.get('db'), me.id) });
});

// ---- Show scope (G-A1) ----
studio.use('/shows/:show/*', async (c, next) => {
  const show = await roleFor(c.get('db'), c.get('listener')!.id, c.req.param('show'));
  if (!show) throw new ApiError('no_role', 'You do not manage this show.');
  c.set('show', show);
  await next();
});

/** Owner-only routes (G-A2): settings, team, tips, release. */
export const ownerOnly: MiddlewareHandler<StudioEnv> = async (c, next) => {
  if (c.get('show').role !== 'owner') throw new ApiError('owner_only', 'Only the owner of this show can do this.');
  await next();
};

const days = (v: string | undefined): 7 | 30 | 90 => (v === '7' ? 7 : v === '90' ? 90 : 30);
const metric = (v: string | undefined): Metric => ((METRICS as readonly string[]).includes(v ?? '') ? (v as Metric) : 'plays');

studio.get('/shows/:show/overview', async (c) => {
  const db = c.get('db');
  const { feedUrl } = c.get('show');
  const [t, comments, episodes, since] = await Promise.all([
    totals(db, feedUrl), recentComments(db, feedUrl), recentEpisodes(db, feedUrl), claimedAt(db, feedUrl),
  ]);
  return c.json({ show: c.get('show'), claimedAt: since, totals: t, recentComments: comments, recentEpisodes: episodes });
});

studio.get('/shows/:show/trend', async (c) => {
  const m = metric(c.req.query('metric'));
  const n = days(c.req.query('days'));
  const tz = validTz(c.req.query('tz'));
  return c.json({ metric: m, tz, days: await trend(c.get('db'), c.get('show').feedUrl, m, n, tz) });
});
