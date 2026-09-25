import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { rebuildSimilarity, similarityAgeHours } from '../db/repos/similarity.ts';
import { fetchFeed, registerCard, toCard } from '../catalog/feed.ts';

/**
 * Mounted at /v1/internal (M8, research R4/R5). The scheduled workflow in the public CI
 * mirror is the only caller, and it holds **only** this token — never a database
 * credential. `DATABASE_URL` stays in Vercel's environment.
 *
 * Every call does a bounded amount of work and hands back a cursor, so nothing here goes
 * near Vercel Hobby's 60 s `maxDuration`.
 */
export const FEEDS_PER_CALL = 25;
export const SHOWS_PER_CALL = 200;
/** A similarity rebuild younger than this is skipped, so a missed hour costs nothing and
 *  a catch-up burst does no extra work (research R4). */
export const REBUILD_EVERY_HOURS = 20;

const body = z.object({
  step: z.enum(['feeds', 'similarity']),
  cursor: z.string().max(2048).optional(),
  force: z.boolean().optional(),
});

export function createInternalRoute(jobToken: string | undefined) {
  const internal = new Hono<AuthEnv>();

  internal.post('/rebuild', json(body), async (c) => {
    const started = Date.now();
    const given = (c.req.header('authorization') ?? '').replace(/^Bearer /, '');
    // No token configured is the same as a wrong token: an open rebuild endpoint is worse
    // than a broken one.
    if (jobToken === undefined || given.length === 0 || given !== jobToken) {
      throw new ApiError('unauthenticated', 'This endpoint needs the job token.');
    }
    const db = c.get('db');
    const { step, cursor, force } = c.req.valid('json');

    if (step === 'feeds') {
      const rows = await db.query<{ feed_url: string }>(
        `SELECT DISTINCT feed_url FROM subscriptions WHERE deleted_at IS NULL
           AND ($1::text IS NULL OR feed_url > $1::text)
         ORDER BY feed_url LIMIT ${FEEDS_PER_CALL + 1}`, [cursor ?? null]);
      const batch = rows.slice(0, FEEDS_PER_CALL);
      let registered = 0;
      const failed: string[] = [];
      for (const { feed_url } of batch) {
        try {
          const { feed } = await fetchFeed(db, c.get('catalog').fetch, feed_url);
          for (const e of feed.episodes.slice(0, 5)) { await registerCard(db, toCard(feed_url, feed.show, e)); registered++; }
        } catch (e) {
          // One publisher being down is not a failed rebuild (principle IV).
          failed.push(`${feed_url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (failed.length > 0) console.warn(`[rebuild feeds] ${failed.join(' | ')}`);
      const last = batch[batch.length - 1];
      const done = rows.length <= FEEDS_PER_CALL;
      return c.json({
        done, ...(done || last === undefined ? {} : { next: last.feed_url }),
        counts: { feeds: batch.length, registered, failed: failed.length }, ms: Date.now() - started,
      });
    }

    if (cursor === undefined && force !== true) {
      const age = await similarityAgeHours(db);
      if (age !== null && age < REBUILD_EVERY_HOURS) {
        return c.json({ done: true, counts: { skipped: 1, ageHours: Math.round(age) }, ms: Date.now() - started });
      }
    }
    const r = await rebuildSimilarity(db, cursor, SHOWS_PER_CALL);
    return c.json({
      done: r.done, ...(r.next === undefined ? {} : { next: r.next }),
      counts: { written: r.written, shows: r.shows }, ms: Date.now() - started,
    });
  });

  return internal;
}
