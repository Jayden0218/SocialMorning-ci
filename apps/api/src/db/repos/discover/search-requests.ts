// Database queries for "Can't find it? Tell us" search requests (M26 F0: moved here from routes/discover/search-requests.ts).
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

/** Store the words once per listener (or signed-out caller) per day. */
async function insertSearchRequestPg(db: Db, listenerId: string | null, q: string): Promise<void> {
  await db.query(
    `INSERT INTO search_requests (listener_id, q)
     SELECT $1::uuid, $2::text
      WHERE NOT EXISTS (SELECT 1 FROM search_requests
                         WHERE listener_id IS NOT DISTINCT FROM $1::uuid AND lower(q) = lower($2::text) AND created_at > now() - interval '1 day')`,
    [listenerId, q]);
}

/** The words of the last 90 days, grouped case-blind, newest first. */
async function searchRequestRowsPg(db: Db, limit: number): Promise<{ q: string; n: number; last: Date | string }[]> {
  return db.query<{ q: string; n: number; last: Date | string }>(
    `SELECT min(q) AS q, count(*)::int AS n, max(created_at) AS last FROM search_requests
      WHERE created_at > now() - interval '90 days'
      GROUP BY lower(q) ORDER BY max(created_at) DESC LIMIT $1`, [limit]);
}

// M26 lane DV: each runs on Postgres, or on DynamoDB (ddb/search-requests.ts) when the Db carries a Store (db/backend.ts).
export const insertSearchRequest = dual('dv/search-requests', 'insertSearchRequest', insertSearchRequestPg);
export const searchRequestRows = dual('dv/search-requests', 'searchRequestRows', searchRequestRowsPg);
