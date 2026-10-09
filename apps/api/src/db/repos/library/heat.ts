// The two statements of an episode's heat rebuild (see heat/rebuild.ts for the rule they keep).
import type { Db } from '../../db.ts';

/** Clears the episode's heat rows, but only when its duration is known. */
export async function clearEpisodeHeat(db: Db, episodeId: string): Promise<void> {
  await db.query(
    `DELETE FROM episode_heat WHERE episode_id = $1
       AND (SELECT duration_ms FROM episodes WHERE id = $1) IS NOT NULL`,
    [episodeId],
  );
}

/** Counts each listener once per bucket across reactions and timestamped comments (UNION, count DISTINCT). */
export async function insertEpisodeHeat(db: Db, episodeId: string): Promise<void> {
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
       WHERE c.episode_id = $1 AND c.offset_ms IS NOT NULL AND c.deleted_at IS NULL AND c.host_hidden_at IS NULL
         AND c.author_id IS NOT NULL AND e.duration_ms IS NOT NULL
     ) marks
     GROUP BY bucket`,
    [episodeId],
  );
}
