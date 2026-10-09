// The episode social poll's reads: the change stamp, the heat rows and the viewer's reaction buckets.
import type { Db } from '../../db.ts';

export type SocialStampRow = { comments_v: string | null; episode_v: string; heat_v: string | null };

/** Everything that can change the poll's answer, as text, for its ETag. */
export async function socialStampRows(db: Db, episodeId: string): Promise<SocialStampRow[]> {
  return db.query<{ comments_v: string | null; episode_v: string; heat_v: string | null }>(
    `SELECT
       (SELECT max(greatest(created_at, coalesce(deleted_at, created_at), coalesce(removed_at, created_at)))::text || '/' || count(host_hidden_at)::text
          -- M19 US5: a pin (which one, when) and the unfriendly marks change the answer too.
          || '/' || coalesce(max(pinned_at)::text || (array_agg(id::text ORDER BY pinned_at DESC NULLS LAST))[1], '-')
          -- M22 US10: and so does the bottom pin.
          || '/' || coalesce(max(pinned_bottom_at)::text || (array_agg(id::text ORDER BY pinned_bottom_at DESC NULLS LAST))[1], '-')
          || '/' || (SELECT count(*) FROM comment_unfriendly u JOIN comments x ON x.id = u.comment_id WHERE x.episode_id = $1)::text
        FROM comments WHERE episode_id = $1) AS comments_v,
       (SELECT updated_at::text FROM episodes WHERE id = $1) AS episode_v,
       (SELECT string_agg(bucket || ':' || distinct_listeners, ',' ORDER BY bucket) FROM episode_heat WHERE episode_id = $1) AS heat_v`,
    [episodeId],
  );
}

/** The stored heat rows of one episode. */
export async function episodeHeatRows(db: Db, episodeId: string): Promise<{ bucket: number; distinct_listeners: number }[]> {
  return db.query<{ bucket: number; distinct_listeners: number }>(
    'SELECT bucket, distinct_listeners FROM episode_heat WHERE episode_id = $1', [episodeId],
  );
}

/** The buckets this listener reacted in on one episode, in order. */
export async function myReactionBucketRows(db: Db, episodeId: string, listenerId: string): Promise<{ bucket: number }[]> {
  return db.query<{ bucket: number }>(
    'SELECT bucket FROM reactions WHERE episode_id = $1 AND listener_id = $2 ORDER BY bucket', [episodeId, listenerId],
  );
}
