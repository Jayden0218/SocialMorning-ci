// A floor rate limit on every write to /v1: per signed-in session, and per network when signed out.
/**
 * M25 S6 (audit #9). Many writes had no limit at all (reactions, likes, playlists, shared lists,
 * search requests, avatar, Studio claims, gift claims, translation requests, appeals, …). One
 * middleware now counts every POST/PUT/PATCH/DELETE under /v1 before the route runs:
 *  - with a REAL session (a bearer token or Studio cookie that resolves to a live session — M32 B2: a made-up token
 *    used to get a fresh bucket each time and so skipped the network limit): 300 a minute for that session, keyed on a
 *    hash of the credential (never the credential itself);
 *  - with no session, or a token that resolves to none: 30 a minute per network address (`x-forwarded-for`; no address → no count,
 *    as in auth/rate.ts).
 * M32 C10: an in-memory bucket sits in front of the DynamoDB counter. Each instance counts its own requests per key
 * and minute; the DB counter is written only once an instance's count passes half the limit, so ordinary use costs no
 * DB write while the limit still holds across instances (each instance's second half is counted there) and is exact on one.
 * Routes with tighter limits of their own keep them (sign-in, codes, feedback, redeem, errors…).
 * /v1/internal (the job token) and /v1/errors (its own limits) are not counted here.
 */
import { createHash } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { listenerForToken, type AuthEnv } from './session.ts';
import { STUDIO_COOKIE, studioSessionLive } from './studio-session.ts';
import { clientAddress, limit } from './rate.ts';
import { ApiError } from '../errors.ts';

export const MINUTE_MS = 60_000;
export const WRITES_PER_SESSION_MINUTE = 300;
export const SIGNED_OUT_WRITES_PER_ADDRESS_MINUTE = 30;

/** M32 C10: how many times the middleware has written the DB counter (a test reads it). */
export const writeLimitDbHits = { count: 0 };

/** Per database handle (so tests with separate databases do not share counts): key -> this minute's count on this instance. */
const buckets = new WeakMap<object, Map<string, { window: number; count: number }>>();
export const MAX_BUCKETS = 10_000;

/** Counts one request in memory; returns the instance's count for the key this minute. Bounded: expired entries go first, then the oldest. */
function bump(owner: object, key: string, now: number): number {
  let m = buckets.get(owner);
  if (!m) buckets.set(owner, (m = new Map()));
  const window = Math.floor(now / MINUTE_MS);
  const e = m.get(key);
  if (e && e.window === window) return ++e.count;
  m.delete(key);
  if (m.size >= MAX_BUCKETS) {
    for (const [k, v] of m) if (v.window !== window) m.delete(k);
    while (m.size >= MAX_BUCKETS) m.delete(m.keys().next().value as string);
  }
  m.set(key, { window, count: 1 });
  return 1;
}

/** Limit `max` per minute for `key`: refused in memory above the limit; the DB counter is written only above half of it. */
async function bucketed(db: AuthEnv['Variables']['db'], key: string, max: number, message: string): Promise<void> {
  const n = bump(db, key, Date.now());
  if (n > max) throw new ApiError('locked', message, { retryAfterSeconds: Math.max(1, Math.ceil((MINUTE_MS - (Date.now() % MINUTE_MS)) / 1000)) });
  // The first request of a minute checks the DB too (another instance may already have filled the window), and a
  // refusal there is remembered for the rest of the minute; after that only the counts above half the limit go to the DB.
  if (n !== 1 && n <= max / 2) return;
  writeLimitDbHits.count++;
  try { await limit(db, key, MINUTE_MS, max, message); }
  catch (e) { const entry = buckets.get(db)?.get(key); if (entry) entry.count = max + 1; throw e; }
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Does this credential belong to a live session (phone, or Studio)? An unknown one is treated as no session. */
async function resolves(c: Context<AuthEnv>, credential: string, isBearer: boolean): Promise<boolean> {
  const db = c.get('db');
  if (isBearer && (await listenerForToken(db, credential, c.get('pepper'), c.get('pepperNext')))) return true;
  return studioSessionLive(db, c.get('pepper'), credential);
}

export const writeLimit: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const path = c.req.path;
  if (WRITE.has(c.req.method) && path.startsWith('/v1/') && !path.startsWith('/v1/internal/') && path !== '/v1/errors') {
    const db = c.get('db');
    const bearer = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    const credential = bearer ?? getCookie(c, STUDIO_COOKIE);
    const real = credential ? await resolves(c, credential, Boolean(bearer)) : false;
    if (credential && real) {
      const key = createHash('sha256').update(credential).digest('base64url').slice(0, 22);
      await bucketed(db, `w:s:${key}`, WRITES_PER_SESSION_MINUTE, 'Too many changes in a minute. Slow down and try again.');
    } else {
      const addr = clientAddress(c);
      if (addr) await bucketed(db, `w:ip:${addr}`, SIGNED_OUT_WRITES_PER_ADDRESS_MINUTE, 'Too many requests from this network. Try again in a minute.');
    }
  }
  await next();
};
