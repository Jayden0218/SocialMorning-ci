// Reaction route: toggle a reaction at a moment in an episode.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { getEpisode } from '../../db/repos/library/episodes.ts';
import { toggleReactionInTx } from '../../db/repos/social/comment-writes.ts';

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

  const episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');

  const result = await toggleReactionInTx(db, episode, episodeId, listener.id, body);
  return c.json(result);
});
