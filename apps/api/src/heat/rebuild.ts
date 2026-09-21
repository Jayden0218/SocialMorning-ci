import type { Db } from '../db/db.ts';

/**
 * Research R4 / data-model.md "Heat rebuild": one episode's 100 segments, rebuilt inside
 * the writing transaction. A listener counts ONCE per bucket across reactions and
 * timestamped comments — that is the `UNION` (not `UNION ALL`) and the `count(DISTINCT …)`.
 * Guard G7 is the test that fails if either is "simplified".
 *
 * Skipped while the episode's duration is unknown (FR-021): there is no bucket without a
 * length. When a duration arrives, the caller runs this once and the moments already
 * stored fall into their buckets.
 */
export async function rebuildEpisodeHeat(db: Db, episodeId: string): Promise<void> {
  await db.query(
    `DELETE FROM episode_heat WHERE episode_id = $1
       AND (SELECT duration_ms FROM episodes WHERE id = $1) IS NOT NULL`,
    [episodeId],
  );
  await db.query(
    `INSERT INTO episode_heat (episode_id, bucket, distinct_listeners)
     SELECT $1, bucket, count(DISTINCT listener_id)
     FROM (
       SELECT r.listener_id, r.bucket
       FROM reactions r WHERE r.episode_id = $1
       UNION
       SELECT c.author_id AS listener_id,
              least(99, floor(c.offset_ms * 100.0 / e.duration_ms))::smallint AS bucket
       FROM comments c JOIN episodes e ON e.id = c.episode_id
       WHERE c.episode_id = $1 AND c.offset_ms IS NOT NULL AND c.deleted_at IS NULL
         AND c.author_id IS NOT NULL AND e.duration_ms IS NOT NULL
     ) marks
     GROUP BY bucket`,
    [episodeId],
  );
}
