// The hourly sweep's deletes of old rows (M26: moved here from routes/internal.ts).
import type { Db } from '../db.ts';
import { dual } from '../backend.ts';

/** M23 US3 (FR-006): how long the hourly sweep keeps each kind of leftover row (re-exported by routes/internal.ts). */
export const CACHE_KEEP_DAYS = 7;
export const PUSH_SENT_KEEP_DAYS = 30;
export const REC_EVENTS_KEEP_DAYS = 90;

/** Run one `WITH d AS (DELETE … RETURNING 1) SELECT count(*)::int AS n FROM d` and return n. */
const n = async (db: Db, sql: string): Promise<number> => (await db.query<{ n: number }>(sql))[0]?.n ?? 0;

/** M18 FR-015: a day of app use is kept 400 days, then deleted (research R8). */
export async function sweepDailyActive(db: Db): Promise<number> {
  return n(db, "WITH d AS (DELETE FROM daily_active WHERE day < ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date - 400 RETURNING 1) SELECT count(*)::int AS n FROM d");
}

/** Search and feed caches past CACHE_KEEP_DAYS. */
async function sweepOldCachePg(db: Db): Promise<number> {
  return n(db, `WITH d AS (DELETE FROM cache WHERE (key LIKE 'apple:search:%' OR key LIKE 'feed:%') AND fetched_at < now() - interval '${CACHE_KEEP_DAYS} days' RETURNING 1) SELECT count(*)::int AS n FROM d`);
}

/** push_sent rows past PUSH_SENT_KEEP_DAYS. */
export async function sweepOldPushSent(db: Db): Promise<number> {
  return n(db, `WITH d AS (DELETE FROM push_sent WHERE sent_at < now() - interval '${PUSH_SENT_KEEP_DAYS} days' RETURNING 1) SELECT count(*)::int AS n FROM d`);
}

/** rec_events rows past REC_EVENTS_KEEP_DAYS. */
async function sweepOldRecEventsPg(db: Db): Promise<number> {
  return n(db, `WITH d AS (DELETE FROM rec_events WHERE at < now() - interval '${REC_EVENTS_KEEP_DAYS} days' RETURNING 1) SELECT count(*)::int AS n FROM d`);
}

// M26 lane LB: each function runs on Postgres, or on DynamoDB (`ddb/` bodies) when the Db carries a Store (db/backend.ts).
export const sweepOldCache = dual('lb/old-rows-sweep', 'sweepOldCache', sweepOldCachePg);
export const sweepOldRecEvents = dual('lb/old-rows-sweep', 'sweepOldRecEvents', sweepOldRecEventsPg);
