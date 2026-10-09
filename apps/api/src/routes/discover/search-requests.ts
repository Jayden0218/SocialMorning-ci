// "Can't find it? Tell us": a listener sends search words the catalogue did not answer.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import type { Db } from '../../db/db.ts';
import { insertSearchRequest, searchRequestRows } from '../../db/repos/discover/search-requests.ts';

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
  await insertSearchRequest(db, listenerId, q);
}

export type SearchRequestRow = { q: string; n: number; last: string };

/** The owner's list: the words, how many times they were asked for, newest first (last 90 days). */
export async function recentSearchRequests(db: Db, limit = 200): Promise<SearchRequestRow[]> {
  const rows = await searchRequestRows(db, limit);
  return rows.map((r) => ({ q: r.q, n: Number(r.n), last: new Date(r.last).toISOString() }));
}
