// Studio web session: cookie sign-in, 12-hour idle limit, and cross-site write check.
/**
 * M11 — the Studio's session (specs/011-m11-studio/research.md R1, R2).
 *
 * A Studio session is an ordinary session row labelled `studio-web`: the browser signs in
 * through `/v1/auth` with `deviceLabel: 'studio-web'` and trades the token for an HttpOnly
 * cookie. Only `studio-web` sessions are accepted here, so a phone's token (which never
 * expires on idle) cannot drive the Studio.
 *
 *  - idle > 12 h → 401 `session_expired`, and the row is deleted (guard G-S1);
 *  - a write without `X-Studio: 1` → 403 `csrf` (guard G-X2). A cross-site form cannot set a
 *    custom header, and a cross-site fetch that sets one needs a CORS preflight this API
 *    never answers.
 */
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { liveSessionSql, rekey, rotateSession, tokenHash, suspendedError, type AuthEnv, type Listener } from './session.ts';
import { ApiError } from '../errors.ts';
import type { Db } from '../db/db.ts';
import type { StudioShow } from '../db/repos/studio/studio-roles.ts';
import { actAsCookie, actingTarget } from './admin.ts';

/** The Studio's routes see everything the API's do, plus the show the request is about. */
export type StudioEnv = { Variables: AuthEnv['Variables'] & { show: StudioShow;
  /** M15 T028: set while an admin acts as `listener`; `token` is then still the admin's own. */
  actingAdmin?: Listener } };

export const STUDIO_LABEL = 'studio-web';
export const STUDIO_COOKIE = 'sm_studio';
export const STUDIO_IDLE_MS = 12 * 60 * 60 * 1000;

export function studioToken(c: Context): string | undefined {
  const cookie = getCookie(c, STUDIO_COOKIE);
  if (cookie) return cookie;
  const h = c.req.header('authorization');
  const [scheme, token] = h ? h.split(' ') : [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

type Row = Listener & { last_seen_at: Date | string };

/** The listener behind a live `studio-web` token, bumping `last_seen_at`; 'expired' past 12 h idle. */
export async function studioListener(db: Db, pepper: string, token: string, pepperNext?: string): Promise<Listener | 'expired' | undefined> {
  await rekey(db, token, pepper, pepperNext); // M25 SB: secret rotation
  const hash = tokenHash(token, pepper);
  // M25 SB: the same absolute lifetime and rotation grace as a phone session.
  const [row] = await db.query<Row>(
    `SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.last_seen_at
       FROM sessions s JOIN listeners l ON l.id = s.listener_id
      WHERE s.token_hash = $1 AND s.device_label = $2 AND s.acting_admin_id IS NULL
        AND ${liveSessionSql}`,
    [hash, STUDIO_LABEL],
  );
  if (!row) return undefined;
  if (Date.now() - new Date(row.last_seen_at).getTime() > STUDIO_IDLE_MS) {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    return 'expired';
  }
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [hash]);
  return row;
}

export const studioCsrf: MiddlewareHandler<StudioEnv> = async (c, next) => {
  const m = c.req.method;
  if (m !== 'GET' && m !== 'HEAD' && c.req.header('x-studio') !== '1') {
    throw new ApiError('csrf', 'This request did not come from the Studio.');
  }
  await next();
};

export const studioAuth: MiddlewareHandler<StudioEnv> = async (c, next) => {
  const token = studioToken(c);
  const who = token ? await studioListener(c.get('db'), c.get('pepper'), token, c.get('pepperNext')) : undefined;
  if (who === 'expired') throw new ApiError('session_expired', 'You were away for a while. Sign in again.');
  if (!who) throw new ApiError('unauthenticated', 'Sign in to the Studio.');
  if (who.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
  // M15 T028: the act-as cookie counts only beside the same admin's own live cookie session.
  const asToken = actAsCookie(c);
  const fromCookie = token === getCookie(c, STUDIO_COOKIE);
  const target = asToken && fromCookie ? await actingTarget(c.get('db'), c.get('pepper'), asToken, who.id) : undefined;
  if (target) c.set('actingAdmin', who);
  c.set('listener', target ?? who);
  c.set('token', token);
  await next();
  if (fromCookie && token) await rotateStudioCookie(c, token);
};

/**
 * M25 SB: the Studio's cookie is rotated like the phone's token — at most once a day, after a
 * successful answer, the old one still valid for the grace window. Only a cookie session: the
 * Bearer fallback (a tab whose cookie did not stick) keeps its token until it signs out.
 */
export async function rotateStudioCookie(c: Context, token: string): Promise<void> {
  if (c.res.status >= 400) return;
  const fresh = await rotateSession(c.get('db'), token, c.get('pepper')).catch(() => undefined);
  if (!fresh) return;
  setCookie(c, STUDIO_COOKIE, fresh, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
}
