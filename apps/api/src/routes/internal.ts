import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { rebuildSimilarity, similarityAgeHours } from '../db/repos/similarity.ts';
import { fetchFeed, registerCard, toCard } from '../catalog/feed.ts';
import { fanOutNewEpisode, NEW_WINDOW_HOURS, sendPopular } from '../db/repos/push.ts';
import { sweepImages } from '../db/repos/feedback.ts';
import { sweepExpired } from '../db/repos/voice-posts.ts';
import { picksForDay } from '@socialmorning/social-core';

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
      let pushed = 0;
      const failed: string[] = [];
      const cat = c.get('catalog');
      for (const { feed_url } of batch) {
        try {
          const { feed } = await fetchFeed(db, cat.fetch, feed_url);
          const top = feed.episodes.slice(0, 5);
          // M10b US3: which of these the server has never seen — "new" is first-seen AND
          // published in the last 48 h, so a feed's back catalogue never notifies anyone.
          const known = new Set((await db.query<{ guid: string }>('SELECT guid FROM episodes WHERE feed_url = $1 AND guid = ANY($2::text[])', [feed_url, top.map((e) => e.guid)])).map((r) => r.guid));
          const fresh: { id: string; title: string; showTitle: string; at: number }[] = [];
          for (const e of top) {
            const row = await registerCard(db, toCard(feed_url, feed.show, e));
            registered++;
            const at = e.publishedAt ?? 0;
            if (!known.has(e.guid) && at > Date.now() - NEW_WINDOW_HOURS * 3_600_000) fresh.push({ id: row.id, title: row.title, showTitle: row.show_title ?? feed.show.title, at });
          }
          // One notification per show per cycle: the newest.
          const newest = fresh.sort((x, y) => y.at - x.at)[0];
          if (newest) {
            try { pushed += (await fanOutNewEpisode(db, cat.pushFetch, { ...newest, feedUrl: feed_url })).sent; }
            catch (e) { failed.push(`push ${feed_url}: ${e instanceof Error ? e.message : String(e)}`); }
          }
        } catch (e) {
          // One publisher being down is not a failed rebuild (principle IV).
          failed.push(`${feed_url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (failed.length > 0) console.warn(`[rebuild feeds] ${failed.join(' | ')}`);
      const last = batch[batch.length - 1];
      const done = rows.length <= FEEDS_PER_CALL;
      // M10b US3: the day's first pick, once per listener per day, on the first call of a cycle.
      let popular = 0;
      let voiceDeleted = 0;
      let activeDeleted = 0;
      if (cursor === undefined) {
        // M18 FR-015: a day of app use is kept 400 days, then deleted (research R8).
        try { activeDeleted = (await db.query<{ n: number }>("WITH d AS (DELETE FROM daily_active WHERE day < ((now() AT TIME ZONE 'UTC') + interval '8 hours')::date - 400 RETURNING 1) SELECT count(*)::int AS n FROM d"))[0]?.n ?? 0; }
        catch (e) { failed.push(`daily_active: ${e instanceof Error ? e.message : String(e)}`); }
        // M10b US6 (FR-020): feedback images older than 90 days go, once per cycle.
        try { await sweepImages(db); } catch (e) { failed.push(`sweep: ${e instanceof Error ? e.message : String(e)}`); }
        // M12 FR-104 (guard G-V1): voice posts past 48 h lose their blob AND their row.
        try {
          const v = await sweepExpired(db, c.get('voice'));
          voiceDeleted = v.deleted;
          if (v.failed > 0) failed.push(`voice: ${v.failed} blob(s) not deleted, kept for the next cycle`);
        } catch (e) { failed.push(`voice: ${e instanceof Error ? e.message : String(e)}`); }
        try {
          const day = picksForDay(cat.picks, cat.today());
          const p = day.picks[0];
          if (p) {
            const [ep] = await db.query<{ id: string; title: string }>(
              p.guid !== undefined ? 'SELECT id, title FROM episodes WHERE feed_url = $1 AND guid = $2' : 'SELECT id, title FROM episodes WHERE feed_url = $1 ORDER BY published_at DESC NULLS LAST LIMIT 1',
              p.guid !== undefined ? [p.feedUrl, p.guid] : [p.feedUrl]);
            if (ep) popular = (await sendPopular(db, cat.pushFetch, { id: ep.id, title: ep.title, ...(p.why ? { why: p.why } : {}) })).sent;
          }
        } catch (e) { failed.push(`popular: ${e instanceof Error ? e.message : String(e)}`); }
      }
      return c.json({
        done, ...(done || last === undefined ? {} : { next: last.feed_url }),
        counts: { feeds: batch.length, registered, failed: failed.length, pushed, popular, voiceDeleted, activeDeleted }, ms: Date.now() - started,
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
