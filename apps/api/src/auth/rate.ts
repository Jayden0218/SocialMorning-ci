// Fixed-window rate limits kept in the rate_counters table (per address, or global).
/**
 * M23 US2/US8 (FR-003, FR-013). One row per (key, window): the first request of a window
 * inserts it, later ones add 1 in the same statement, so parallel requests are all counted.
 *
 * The device address is `x-sm-trusted-ip` when the Lambda entry set it (AWS's `sourceIp`, or the Vercel edge
 * proxy's signed client address; M28 US2), else the first entry of `x-forwarded-for`, which Vercel sets on the
 * Vercel and Node entries (spec edge cases). Without either (tests, a local server) there is no address and the
 * per-address limit does not apply; global limits still do.
 */
import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import type { Db } from '../db/db.ts';
import { ApiError } from '../errors.ts';
import { bumpRateCounter, deleteRateCountersBefore } from '../db/repos/account/rate-limits.ts';
import { codeDailyCapRaw } from '../config.ts';
import { log } from '../log.ts';

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

/** Email codes: 10 an hour per address, and a daily total kept below Gmail's sending quota. */
export const CODES_PER_ADDRESS_HOUR = 10;
export const DEFAULT_CODES_PER_DAY = 300;
/** M32 B8: 10 codes a day per email address, so ~30 addresses cannot use up the global daily cap alone. */
export const CODES_PER_EMAIL_DAY = 10;
/** Stable prefix of the one-line alert logged when the server-wide daily cap refuses a code. */
export const GLOBAL_CAP_ALERT = 'ALERT sign-in-code global cap reached';

export function codesPerDay(): number {
  const n = Number(codeDailyCapRaw());
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CODES_PER_DAY;
}

/** The caller's address (`x-sm-trusted-ip`, else the first `x-forwarded-for` entry), or undefined when there is none. */
export function clientAddress(c: Context): string | undefined {
  const trusted = c.req.header('x-sm-trusted-ip')?.trim();
  if (trusted) return trusted.slice(0, 64);
  const first = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first.slice(0, 64) : undefined;
}

/** Counts one request against `key` in the current window; true while the count is within `limit`. */
export async function hit(db: Db, key: string, windowMs: number, limit: number, now = Date.now()): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const start = Math.floor(now / windowMs) * windowMs;
  const [row] = await bumpRateCounter(db, key, new Date(start));
  return { ok: (row?.count ?? 1) <= limit, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
}

/** Throws 429 `locked` with `message` when the window is full. */
export async function limit(db: Db, key: string, windowMs: number, max: number, message: string): Promise<void> {
  const r = await hit(db, key, windowMs, max);
  if (!r.ok) throw new ApiError('locked', message, { retryAfterSeconds: r.retryAfterSeconds });
}

/** The address the code goes to: given, else the `email` of the JSON body (Hono caches it, so the route can still read it). */
async function codeEmail(c: Context, email?: string): Promise<string | undefined> {
  if (email) return email.trim().toLowerCase();
  try {
    const body = (await c.req.json()) as { email?: unknown };
    return typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : undefined;
  } catch { return undefined; }
}

/** FR-003: before an email code is sent: the network's hourly limit, the address's daily limit (M32 B8), then the server's daily cap. */
export async function limitCodeRequest(db: Db, c: Context, email?: string): Promise<void> {
  const addr = clientAddress(c);
  if (addr) await limit(db, `code:ip:${addr}`, HOUR_MS, CODES_PER_ADDRESS_HOUR, 'Too many codes were asked for from this network. Try again in an hour.');
  const to = await codeEmail(c, email);
  if (to) {
    const key = createHash('sha256').update(to).digest('base64url').slice(0, 22);
    await limit(db, `code:email:${key}`, DAY_MS, CODES_PER_EMAIL_DAY, 'Too many codes were asked for this email today. Try again tomorrow, or sign in with your password.');
  }
  try {
    await limit(db, 'code:global', DAY_MS, codesPerDay(), 'We cannot send more codes today. Try again tomorrow, or sign in with your password.');
  } catch (e) {
    if (e instanceof ApiError) log.error('sign_in_code_global_cap', { alert: `${GLOBAL_CAP_ALERT} (${codesPerDay()} a day)` });
    throw e;
  }
}

/** Old windows are useless once they end; the sweep keeps two days. */
export async function sweepRateCounters(db: Db, now = Date.now()): Promise<number> {
  const rows = await deleteRateCountersBefore(db, new Date(now - 2 * DAY_MS));
  return rows.length;
}
