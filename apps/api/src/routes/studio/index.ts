// Studio router: no-cache, cross-site check, session and show-role walls for every route.
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
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { tokenHash, publicListener } from '../../auth/session.ts';
import { STUDIO_COOKIE, STUDIO_IDLE_MS, studioAuth, studioCsrf, studioListener, studioToken, type StudioEnv } from '../../auth/studio-session.ts';
import { ApiError } from '../../errors.ts';
import { roleFor, showsFor } from '../../db/repos/studio/studio-roles.ts';
import { deleteSessionByHash } from '../../db/repos/account/sessions.ts';
import { ACT_AS_COOKIE, ensureSeeded, insertAudit, isAdmin, stopActing } from '../../auth/admin.ts';
import { https } from './common.ts';
import { registerClaims } from './claims.ts';
import { registerCreate } from './create.ts';
import { registerOverview } from './overview.ts';
import { registerData } from './data.ts';
import { registerComments } from './comments.ts';
import { registerSubscribers } from './subscribers.ts';
import { registerAnnouncements } from './announcements.ts';
import { registerSettings } from './settings.ts';
import { registerTips } from './tips.ts';
import { registerEpisodes } from './episodes.ts';
import { registerHosts } from './hosts.ts';
import { registerMedia } from './media.ts';
import { registerTranscriptReportDone, registerTranscriptReports } from './transcript-reports.ts';
import { registerHostPicks } from './host-picks.ts';
import { registerFeed } from './feed.ts';
import { registerSecondFactor } from './second-factor.ts';

export { ownerOnly } from './common.ts';

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
  const who = token ? await studioListener(c.get('db'), c.get('pepper'), token, c.get('pepperNext')) : undefined;
  if (who === 'expired') throw new ApiError('session_expired', 'You were away for a while. Sign in again.');
  if (!who || !token) throw new ApiError('unauthenticated', 'Sign in with deviceLabel "studio-web" first.');
  setCookie(c, STUDIO_COOKIE, token, { httpOnly: true, secure: secure(c.req.url), sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
  const db = c.get('db');
  await ensureSeeded(db, c.get('safety').ownerListenerId);
  return c.json({ token, me: publicListener(who), shows: await showsFor(db, who.id), isAdmin: await isAdmin(db, who.id), actingAs: null });
});

studio.use('*', async (c, next) => (c.req.path.endsWith('/v1/studio/session') && c.req.method === 'POST' ? next() : studioAuth(c, next)));

// M15 T028 (FR-021): every Studio write made while acting is recorded with BOTH ids (guard G-C2).
studio.use('*', async (c, next) => {
  await next();
  const admin = c.get('actingAdmin');
  const m = c.req.method;
  if (!admin || m === 'GET' || m === 'HEAD' || c.res.status >= 400) return;
  await insertAudit(c.get('db'), { adminId: admin.id, actingAs: c.get('listener')!.id, device: (c.req.header('user-agent') ?? '').slice(0, 200) || null },
    { area: 'accounts', action: `studio ${m}`, target: c.req.path }, null, { path: c.req.path, status: c.res.status });
});

studio.post('/session/sign-out', async (c) => {
  const db = c.get('db');
  await deleteSessionByHash(db, tokenHash(c.get('token')!, c.get('pepper')));
  // M15 T028: signing out ends any "act as" too.
  await stopActing(db, (c.get('actingAdmin') ?? c.get('listener')!).id);
  deleteCookie(c, ACT_AS_COOKIE, { path: '/', secure: secure(c.req.url) });
  deleteCookie(c, STUDIO_COOKIE, { path: '/', secure: secure(c.req.url) });
  return c.body(null, 204);
});

studio.get('/me', async (c) => {
  const me = c.get('listener')!;
  const admin = c.get('actingAdmin');
  const db = c.get('db');
  await ensureSeeded(db, c.get('safety').ownerListenerId);
  // M15 T004: `isAdmin` is display only — every admin route checks for itself (FR-001).
  return c.json({
    me: publicListener(me), shows: await showsFor(db, me.id),
    isAdmin: await isAdmin(db, (admin ?? me).id),
    actingAs: admin ? { id: me.id, displayName: me.display_name } : null,
  });
});
registerClaims(studio);
registerCreate(studio);
registerSecondFactor(studio); // M25 SB
registerTranscriptReportDone(studio);

studio.use('/shows/:show/*', async (c, next) => {
  const show = await roleFor(c.get('db'), c.get('listener')!.id, c.req.param('show'));
  if (!show) throw new ApiError('no_role', 'You do not manage this show.');
  c.set('show', show);
  await next();
});
registerOverview(studio);
registerData(studio);
registerComments(studio);
registerSubscribers(studio);
registerAnnouncements(studio);
registerSettings(studio);
registerTips(studio);
registerEpisodes(studio);
registerHosts(studio);
registerMedia(studio);
registerTranscriptReports(studio);
registerHostPicks(studio);
// M24 lane A2: feed sync status + Sync now (US10), hide an episode (US11).
registerFeed(studio);
