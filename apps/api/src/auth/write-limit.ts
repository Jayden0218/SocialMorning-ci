// A floor rate limit on every write to /v1: per signed-in session, and per network when signed out.
/**
 * M25 S6 (audit #9). Many writes had no limit at all (reactions, likes, playlists, shared lists,
 * search requests, avatar, Studio claims, gift claims, translation requests, appeals, …). One
 * middleware now counts every POST/PUT/PATCH/DELETE under /v1 before the route runs:
 *  - with a session (bearer token or the Studio cookie): 300 a minute for that session, keyed on a
 *    hash of the credential (never the credential itself);
 *  - with no session: 30 a minute per network address (`x-forwarded-for`; no address → no count,
 *    as in auth/rate.ts).
 * Routes with tighter limits of their own keep them (sign-in, codes, feedback, redeem, errors…).
 * /v1/internal (the job token) and /v1/errors (its own limits) are not counted here.
 */
import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthEnv } from './session.ts';
import { STUDIO_COOKIE } from './studio-session.ts';
import { clientAddress, limit } from './rate.ts';

export const MINUTE_MS = 60_000;
export const WRITES_PER_SESSION_MINUTE = 300;
export const SIGNED_OUT_WRITES_PER_ADDRESS_MINUTE = 30;

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const writeLimit: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const path = c.req.path;
  if (WRITE.has(c.req.method) && path.startsWith('/v1/') && !path.startsWith('/v1/internal/') && path !== '/v1/errors') {
    const db = c.get('db');
    const bearer = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    const credential = bearer ?? getCookie(c, STUDIO_COOKIE);
    if (credential) {
      const key = createHash('sha256').update(credential).digest('base64url').slice(0, 22);
      await limit(db, `w:s:${key}`, MINUTE_MS, WRITES_PER_SESSION_MINUTE, 'Too many changes in a minute. Slow down and try again.');
    } else {
      const addr = clientAddress(c);
      if (addr) await limit(db, `w:ip:${addr}`, MINUTE_MS, SIGNED_OUT_WRITES_PER_ADDRESS_MINUTE, 'Too many requests from this network. Try again in a minute.');
    }
  }
  await next();
};
