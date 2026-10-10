// Fixed-window rate limits kept in the rate_counters table (per address, or global).
/**
 * M23 US2/US8 (FR-003, FR-013). One row per (key, window): the first request of a window
 * inserts it, later ones add 1 in the same statement, so parallel requests are all counted.
 *
 * The device address is the first entry of `x-forwarded-for`, which Vercel sets (spec edge
 * cases). Without the header (tests, a local server) there is no address and the per-address
 * limit does not apply; global limits still do.
 */
import type { Context } from 'hono';
import type { Db } from '../db/db.ts';
import { ApiError } from '../errors.ts';

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

/** Email codes: 10 an hour per address, and a daily total kept below Gmail's sending quota. */
export const CODES_PER_ADDRESS_HOUR = 10;
export const DEFAULT_CODES_PER_DAY = 300;

export function codesPerDay(): number {
  const n = Number(process.env['CODE_DAILY_CAP']);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CODES_PER_DAY;
}

/** The caller's address from `x-forwarded-for` (first entry), or undefined when there is none. */
export function clientAddress(c: Context): string | undefined {
  const first = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return first ? first.slice(0, 64) : undefined;
}

/** Counts one request against `key` in the current window; true while the count is within `limit`. */
export async function hit(db: Db, key: string, windowMs: number, limit: number, now = Date.now()): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const start = Math.floor(now / windowMs) * windowMs;
  const [row] = await db.query<{ count: number }>(
    `INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_counters.count + 1
     RETURNING count`,
    [key, new Date(start)],
  );
  return { ok: (row?.count ?? 1) <= limit, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - now) / 1000)) };
}

/** Throws 429 `locked` with `message` when the window is full. */
export async function limit(db: Db, key: string, windowMs: number, max: number, message: string): Promise<void> {
  const r = await hit(db, key, windowMs, max);
  if (!r.ok) throw new ApiError('locked', message, { retryAfterSeconds: r.retryAfterSeconds });
}

/** FR-003: before an email code is sent — the address's hourly limit, then the server's daily cap. */
export async function limitCodeRequest(db: Db, c: Context): Promise<void> {
  const addr = clientAddress(c);
  if (addr) await limit(db, `code:ip:${addr}`, HOUR_MS, CODES_PER_ADDRESS_HOUR, 'Too many codes were asked for from this network. Try again in an hour.');
  await limit(db, 'code:global', DAY_MS, codesPerDay(), 'We cannot send more codes today. Try again tomorrow, or sign in with your password.');
}

/** Old windows are useless once they end; the sweep keeps two days. */
export async function sweepRateCounters(db: Db, now = Date.now()): Promise<number> {
  const rows = await db.query<{ key: string }>('DELETE FROM rate_counters WHERE window_start < $1 RETURNING key', [new Date(now - 2 * DAY_MS)]);
  return rows.length;
}
