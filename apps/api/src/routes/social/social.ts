// Episode social poll route: comments and heat curve in one cached answer.
import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { normaliseHeat } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { optionalAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { listComments } from '../../db/repos/social/comments.ts';
import { safetyStamp } from '../../db/repos/safety/blocks.ts';
import { hostsOfEpisode } from '../../db/repos/studio/creator.ts';
import { likesStamp } from '../../db/repos/social/comment-likes.ts';
import { muteStamp } from '../../db/repos/social/mutes.ts';
import { heldStamp } from '../../db/repos/studio/comment-policy.ts';
import { episodeHeatRows, myReactionBucketRows, socialStampRows } from '../../db/repos/social/episode-social.ts';

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

  const [stamp] = await socialStampRows(db, episodeId);
  // M6 (R1, G5): a removal and the viewer's newest block/report both change the answer, so both are in the stamp.
  const safety = viewer ? await safetyStamp(db, viewer.id) : '-';
  // M10b US8: a claim proven later adds the Host mark, so the claimant is in the stamp too.
  const host = (await hostsOfEpisode(db, episodeId)).join(',') || undefined;
  // M12 (FR-023): a like added or taken away changes the counts, so likes are in the stamp.
  const likes = await likesStamp(db, episodeId);
  // M21 US6: a mute or unmute changes the muter's answer (G-M21-6); `dir=asc` lists oldest first.
  const mutes = viewer ? await muteStamp(db, viewer.id) : '-';
  const dir = c.req.query('dir') === 'asc' ? 'asc' : 'desc';
  // M24 US8 (lane A2): the viewer's own held comments are in their answer, so in their stamp.
  const held = await heldStamp(db, episodeId, viewer?.id);
  const etag = '"' + createHash('sha256')
    .update(String(stamp?.comments_v)).update('|').update(String(stamp?.episode_v)).update('|')
    .update(String(stamp?.heat_v)).update('|').update(viewer?.id ?? '-').update('|').update(safety).update('|').update(host ?? '-').update('|').update(likes).update('|').update(mutes).update('|').update(dir).update('|').update(held)
    .digest('base64url').slice(0, 27) + '"';

  if (c.req.header('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  const comments = await listComments(db, episodeId, viewer?.id, { dir });

  let heat: { available: true; buckets: number[] } | { available: false } = { available: false };
  if (episode.duration_ms !== null) {
    const rows = await episodeHeatRows(db, episodeId);
    const counts = new Array<number>(100).fill(0);
    for (const r of rows) counts[Number(r.bucket)] = Number(r.distinct_listeners);
    heat = { available: true, buckets: normaliseHeat(counts) };
  }

  let myReactionBuckets: number[] | undefined;
  if (viewer) {
    const rows = await myReactionBucketRows(db, episodeId, viewer.id);
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
