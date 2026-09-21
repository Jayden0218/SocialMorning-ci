import { Hono } from 'hono';
import { z } from 'zod';
import { bucketOf } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { getEpisode, upsertEpisode } from '../db/repos/episodes.ts';
import { rebuildEpisodeHeat } from '../heat/rebuild.ts';

const reactionBody = z.object({
  offsetMs: z.number().int().min(0),
  durationMs: z.number().int().positive().optional(),
});

export const reactions = new Hono<AuthEnv>();

/**
 * PUT /v1/episodes/:id/reactions — a toggle (clarified 2026-09-21): present in this
 * listener's segment → removed; absent → added. The primary key (listener, episode,
 * bucket) is what makes "once per segment" (FR-018) a database fact, not app logic.
 */
reactions.put('/:id/reactions', requireAuth, json(reactionBody), async (c) => {
  const episodeId = c.req.param('id');
  const body = c.req.valid('json');
  const db = c.get('db');
  const listener = c.get('listener')!;

  let episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');

  const result = await db.transaction(async (tx) => {
    if (episode!.duration_ms === null && body.durationMs !== undefined) {
      episode = await upsertEpisode(tx, {
        id: episode!.id, feedUrl: episode!.feed_url, guid: episode!.guid, title: episode!.title,
        enclosureUrl: episode!.enclosure_url, durationMs: body.durationMs,
      });
    }
    if (episode!.duration_ms === null) {
      throw new ApiError('duration_unknown', "This episode's length isn't known yet, so a moment can't be placed.");
    }
    const bucket = bucketOf(body.offsetMs, episode!.duration_ms);
    const removed = await tx.query<{ bucket: number }>(
      'DELETE FROM reactions WHERE listener_id = $1 AND episode_id = $2 AND bucket = $3 RETURNING bucket',
      [listener.id, episodeId, bucket],
    );
    let reacted = false;
    if (removed.length === 0) {
      await tx.query(
        'INSERT INTO reactions (listener_id, episode_id, bucket, offset_ms) VALUES ($1, $2, $3, $4)',
        [listener.id, episodeId, bucket, body.offsetMs],
      );
      reacted = true;
    }
    await rebuildEpisodeHeat(tx, episodeId);
    return { reacted, bucket };
  });
  return c.json(result);
});
