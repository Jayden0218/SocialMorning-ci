// Database queries for fixed-window rate limits (M26 F0-01: moved here from auth/rate.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

/** Adds 1 to `key` in the window starting at `windowStart`; returns the new count. */
export const bumpRateCounter = dual('ac/index', 'bumpRateCounter', async (db: Db, key: string, windowStart: Date): Promise<{ count: number }[]> => {
  return db.query<{ count: number }>(
    `INSERT INTO rate_counters (key, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_counters.count + 1
     RETURNING count`,
    [key, windowStart],
  );
});

/** Deletes windows that started before `before`. */
export const deleteRateCountersBefore = dual('ac/index', 'deleteRateCountersBefore', async (db: Db, before: Date): Promise<{ key: string }[]> => {
  return db.query<{ key: string }>('DELETE FROM rate_counters WHERE window_start < $1 RETURNING key', [before]);
});
