import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { normaliseHeat } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth } from '../auth/session.ts';
import { ApiError } from '../errors.ts';
import { getEpisode } from '../db/repos/episodes.ts';
import { listComments } from '../db/repos/comments.ts';
import { safetyStamp } from '../db/repos/blocks.ts';

/**
 * The poll (research R7, FR-015, FR-022, FR-032): comments + heat + serverTime in one
 * answer, no auth needed, strong ETag so an unchanged episode costs a 304 and one indexed
 * read. The ETag is a hash of everything that can change the body: the newest comment
 * change, the episode's updated_at (duration arrivals), the heat rows, and — when
 * authenticated — the viewer's id (because `mine` and `myReactionBuckets` differ per viewer).
 */
export const social = new Hono<AuthEnv>();

social.get('/:id/social', optionalAuth, async (c) => {
  const episodeId = c.req.param('id');
  const db = c.get('db');
  const viewer = c.get('listener');

  const episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'No such episode here yet.');

  const [stamp] = await db.query<{ comments_v: string | null; episode_v: string; heat_v: string | null }>(
    `SELECT
       (SELECT max(greatest(created_at, coalesce(deleted_at, created_at)))::text FROM comments WHERE episode_id = $1) AS comments_v, -- G5 BROKEN ON PURPOSE
       (SELECT updated_at::text FROM episodes WHERE id = $1) AS episode_v,
       (SELECT string_agg(bucket || ':' || distinct_listeners, ',' ORDER BY bucket) FROM episode_heat WHERE episode_id = $1) AS heat_v`,
    [episodeId],
  );
  // M6 (R1, G5): a removal and the viewer's newest block/report both change the answer, so both are in the stamp.
  const safety = viewer ? await safetyStamp(db, viewer.id) : '-';
  const etag = '"' + createHash('sha256')
    .update(String(stamp?.comments_v)).update('|').update(String(stamp?.episode_v)).update('|')
    .update(String(stamp?.heat_v)).update('|').update(viewer?.id ?? '-').update('|').update(safety)
    .digest('base64url').slice(0, 27) + '"';

  if (c.req.header('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  const comments = await listComments(db, episodeId, viewer?.id);

  let heat: { available: true; buckets: number[] } | { available: false } = { available: false };
  if (episode.duration_ms !== null) {
    const rows = await db.query<{ bucket: number; distinct_listeners: number }>(
      viewer ? 'SELECT h.bucket, count(DISTINCT r.listener_id)::int AS distinct_listeners FROM episode_heat h JOIN reactions r ON r.episode_id = h.episode_id AND r.bucket = h.bucket WHERE h.episode_id = $1 AND r.listener_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $2) GROUP BY h.bucket' : 'SELECT bucket, distinct_listeners FROM episode_heat WHERE episode_id = $1', viewer ? [episodeId, viewer.id] : [episodeId],
    ); // G8 BROKEN ON PURPOSE
    const counts = new Array<number>(100).fill(0);
    for (const r of rows) counts[Number(r.bucket)] = Number(r.distinct_listeners);
    heat = { available: true, buckets: normaliseHeat(counts) };
  }

  let myReactionBuckets: number[] | undefined;
  if (viewer) {
    const rows = await db.query<{ bucket: number }>(
      'SELECT bucket FROM reactions WHERE episode_id = $1 AND listener_id = $2 ORDER BY bucket', [episodeId, viewer.id],
    );
    myReactionBuckets = rows.map((r) => Number(r.bucket));
  }

  c.header('etag', etag);
  c.header('cache-control', 'no-cache');
  return c.json({
    serverTime: new Date().toISOString(),
    episode: { id: episode.id, durationMs: episode.duration_ms },
    comments,
    heat,
    ...(myReactionBuckets !== undefined ? { myReactionBuckets } : {}),
  });
});
