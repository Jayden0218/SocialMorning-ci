// "Can't find it? Tell us": a listener sends search words the catalogue did not answer.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import type { Db } from '../../db/db.ts';

/**
 * M22 US17 item 3 (contracts/api.md "Small items"): POST /v1/search-requests { q ≤ 200 } → 204.
 * Signed in or not; the words go to the owner's list at /mod/search-requests. One listener (or
 * one signed-out caller) sending the same words twice in a day is stored once.
 */
export const searchRequests = new Hono<AuthEnv>();

searchRequests.post('/', optionalAuth, json(z.object({ q: z.string().trim().min(1).max(200) })), async (c) => {
  await addSearchRequest(c.get('db'), c.get('listener')?.id ?? null, c.req.valid('json').q);
  return c.body(null, 204);
});

export async function addSearchRequest(db: Db, listenerId: string | null, q: string): Promise<void> {
  await db.query(
    `INSERT INTO search_requests (listener_id, q)
     SELECT $1::uuid, $2::text
      WHERE NOT EXISTS (SELECT 1 FROM search_requests
                         WHERE listener_id IS NOT DISTINCT FROM $1::uuid AND lower(q) = lower($2::text) AND created_at > now() - interval '1 day')`,
    [listenerId, q]);
}

export type SearchRequestRow = { q: string; n: number; last: string };

/** The owner's list: the words, how many times they were asked for, newest first (last 90 days). */
export async function recentSearchRequests(db: Db, limit = 200): Promise<SearchRequestRow[]> {
  const rows = await db.query<{ q: string; n: number; last: Date | string }>(
    `SELECT min(q) AS q, count(*)::int AS n, max(created_at) AS last FROM search_requests
      WHERE created_at > now() - interval '90 days'
      GROUP BY lower(q) ORDER BY max(created_at) DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({ q: r.q, n: Number(r.n), last: new Date(r.last).toISOString() }));
}
