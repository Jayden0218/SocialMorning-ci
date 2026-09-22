/**
 * "Listened and talked about" inputs (M5 research R4): per episode over a window,
 * AGGREGATES ONLY — listeners are counted, never listed (guard G6). `hidden = false`
 * on the listened rows is what keeps private listeners out (guard G2): M4 wrote the
 * flag from the switch at write time.
 */
import type { ActivityRow } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

export async function talkedAbout(db: Db, sinceDays = 7, feedUrl?: string): Promise<(ActivityRow & { episodeId: string })[]> {
  const rows = await db.query<{ episode_id: string; listeners: number; comments: number; clips: number; reactions: number; newest_at: string | null }>(
    `WITH ids AS (
       SELECT id AS episode_id FROM episodes e WHERE ($2::text IS NULL OR e.feed_url = $2)
     ),
     l AS (SELECT episode_id, count(DISTINCT actor_id)::int AS n, max(created_at) AS newest FROM activity
           WHERE kind = 'listened' AND created_at > now() - ($1 || ' days')::interval GROUP BY episode_id),
     c AS (SELECT episode_id, count(*)::int AS n, max(created_at) AS newest FROM comments
           WHERE parent_id IS NULL AND deleted_at IS NULL AND created_at > now() - ($1 || ' days')::interval GROUP BY episode_id),
     k AS (SELECT episode_id, count(*)::int AS n, max(created_at) AS newest FROM clips
           WHERE deleted_at IS NULL AND created_at > now() - ($1 || ' days')::interval GROUP BY episode_id),
     r AS (SELECT episode_id, count(*)::int AS n, max(created_at) AS newest FROM reactions
           WHERE created_at > now() - ($1 || ' days')::interval GROUP BY episode_id)
     SELECT ids.episode_id,
            COALESCE(l.n, 0) AS listeners, COALESCE(c.n, 0) AS comments, COALESCE(k.n, 0) AS clips, COALESCE(r.n, 0) AS reactions,
            GREATEST(l.newest, c.newest, k.newest, r.newest) AS newest_at
     FROM ids LEFT JOIN l USING (episode_id) LEFT JOIN c USING (episode_id) LEFT JOIN k USING (episode_id) LEFT JOIN r USING (episode_id)
     WHERE COALESCE(l.n, 0) + COALESCE(c.n, 0) + COALESCE(k.n, 0) + COALESCE(r.n, 0) > 0`,
    [String(sinceDays), feedUrl ?? null],
  );
  return rows.map((r) => ({
    key: r.episode_id, episodeId: r.episode_id,
    listeners: Number(r.listeners), comments: Number(r.comments), clips: Number(r.clips), reactions: Number(r.reactions),
    newestAt: r.newest_at ? new Date(r.newest_at).getTime() : 0,
  }));
}
