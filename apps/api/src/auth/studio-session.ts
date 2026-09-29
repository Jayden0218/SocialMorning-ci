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
import { getCookie } from 'hono/cookie';
import { tokenHash, suspendedError, type AuthEnv, type Listener } from './session.ts';
import { ApiError } from '../errors.ts';
import type { Db } from '../db/db.ts';
import type { StudioShow } from '../db/repos/studio-roles.ts';

/** The Studio's routes see everything the API's do, plus the show the request is about. */
export type StudioEnv = { Variables: AuthEnv['Variables'] & { show: StudioShow } };

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
export async function studioListener(db: Db, pepper: string, token: string): Promise<Listener | 'expired' | undefined> {
  const hash = tokenHash(token, pepper);
  const [row] = await db.query<Row>(
    `SELECT l.id, l.email, l.display_name, l.created_at, l.suspended_at, s.last_seen_at
       FROM sessions s JOIN listeners l ON l.id = s.listener_id
      WHERE s.token_hash = $1 AND s.device_label = $2`,
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
  const who = token ? await studioListener(c.get('db'), c.get('pepper'), token) : undefined;
  if (who === 'expired') throw new ApiError('session_expired', 'You were away for a while. Sign in again.');
  if (!who) throw new ApiError('unauthenticated', 'Sign in to the Studio.');
  if (who.suspended_at) throw suspendedError(c.get('safety')?.appealsEmail);
  c.set('listener', who);
  c.set('token', token);
  await next();
};
