/**
 * M8 — show-to-show similarity (research R2/R3; guards G-R1, G-R2, G-R3).
 *
 * Three rules this file exists to keep:
 *
 *  1. **Shows, never episodes.** An episode is born with no interactions; ItemCF cannot
 *     serve it. A show accumulates interactions for years.
 *  2. **A private listener contributes nothing.** The owner's clarification of
 *     2026-09-25 was "one switch, one meaning" — private listening removes a listener
 *     from every shared computation, aggregate included, not only from what other people
 *     can see (G-R1).
 *  3. **No listener identifier may reach `show_similarity`** (G-R3). The table holds
 *     feed URLs and a number.
 *
 * The rebuild writes into `show_similarity_next` and swaps at the end, so a run that dies
 * between chunks never leaves half a neighbourhood visible (principle IV).
 *
 * The Swing computation itself is redone on every chunk. At thousands of shows and dozens
 * of listeners that is cheap and it keeps the chunking to one thing — which rows to WRITE
 * — instead of two. If the catalogue grows by an order of magnitude, cache the computed
 * map in `cache` between chunks rather than making the chunking cleverer.
 */
import { LIKE_FINISHED, swingSimilarity, type Liker, type Neighbour } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

/** How stale a similarity table may be before the rebuild is presumed dead (research R4). */
export const SIMILARITY_STALE_HOURS = 168;

/**
 * Who likes what. `like` = subscribed, or ≥ LIKE_FINISHED episodes of the show finished.
 * Private listeners are excluded here and nowhere else, so the exclusion is auditable.
 */
export async function likers(db: Db): Promise<Liker[]> {
  const rows = await db.query<{ listener_id: string; feed_url: string }>(
    `SELECT listener_id, feed_url FROM (
       SELECT s.listener_id, s.feed_url
       FROM subscriptions s
       JOIN listeners l ON l.id = s.listener_id AND l.private_listening = false
       WHERE s.deleted_at IS NULL
       UNION
       SELECT p.listener_id, e.feed_url
       FROM positions p
       JOIN episodes e ON e.id = p.episode_id
       JOIN listeners l ON l.id = p.listener_id AND l.private_listening = false
       WHERE p.finished = true
       GROUP BY p.listener_id, e.feed_url
       HAVING count(*) >= ${LIKE_FINISHED}
     ) likes ORDER BY listener_id, feed_url`,
  );
  const byListener = new Map<string, string[]>();
  for (const r of rows) (byListener.get(r.listener_id) ?? byListener.set(r.listener_id, []).get(r.listener_id)!).push(r.feed_url);
  return [...byListener].map(([listenerId, shows]) => ({ listenerId, shows }));
}

export type RebuildResult = { done: boolean; next?: string; written: number; shows: number };

/**
 * One bounded chunk of the rebuild. `cursor` is the last `show_a` written.
 * When there is nothing left, the staging table is swapped in and emptied.
 */
export async function rebuildSimilarity(db: Db, cursor: string | undefined, limit = 200): Promise<RebuildResult> {
  const map = swingSimilarity(await likers(db));
  const shows = [...map.keys()].sort();
  const from = cursor === undefined ? 0 : shows.findIndex((s) => s > cursor);
  const slice = from < 0 ? [] : shows.slice(from, from + limit);

  if (cursor === undefined) await db.query('DELETE FROM show_similarity_next');

  let written = 0;
  await db.transaction(async (tx) => {
    for (const show of slice) {
      for (const n of map.get(show)!) {
        await tx.query(
          `INSERT INTO show_similarity_next (show_a, show_b, sim) VALUES ($1, $2, $3)
           ON CONFLICT (show_a, show_b) DO UPDATE SET sim = EXCLUDED.sim, computed_at = now()`,
          [show, n.show, n.sim],
        );
        written++;
      }
    }
  });

  const last = slice[slice.length - 1];
  const more = from >= 0 && from + limit < shows.length;
  if (!more) {
    // The swap. Everything the readers see changes in one transaction or not at all.
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM show_similarity');
      await tx.query('INSERT INTO show_similarity (show_a, show_b, sim, computed_at) SELECT show_a, show_b, sim, computed_at FROM show_similarity_next');
      await tx.query('DELETE FROM show_similarity_next');
    });
    return { done: true, written, shows: shows.length };
  }
  return { done: false, ...(last === undefined ? {} : { next: last }), written, shows: shows.length };
}

/** Neighbours of the given shows, as the reranker and the scorer want them. */
export async function neighboursOf(db: Db, shows: readonly string[]): Promise<Map<string, readonly Neighbour[]>> {
  if (shows.length === 0) return new Map();
  const rows = await db.query<{ show_a: string; show_b: string; sim: number }>(
    'SELECT show_a, show_b, sim FROM show_similarity WHERE show_a = ANY($1::text[]) ORDER BY show_a, sim DESC',
    [[...shows]],
  );
  const out = new Map<string, Neighbour[]>();
  for (const r of rows) (out.get(r.show_a) ?? out.set(r.show_a, []).get(r.show_a)!).push({ show: r.show_b, sim: Number(r.sim) });
  return out;
}

/** Hours since the table was last rebuilt, or null if it never has been (research R4). */
export async function similarityAgeHours(db: Db): Promise<number | null> {
  const [row] = await db.query<{ age: string | null }>(
    'SELECT EXTRACT(EPOCH FROM (now() - max(computed_at))) / 3600 AS age FROM show_similarity',
  );
  return row?.age === null || row?.age === undefined ? null : Number(row.age);
}
