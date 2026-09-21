import { Hono } from 'hono';
import { json } from '../validate.ts';
import { z } from 'zod';
import { fnv1a64 } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { getEpisode, upsertEpisode } from '../db/repos/episodes.ts';
import { rebuildEpisodeHeat } from '../heat/rebuild.ts';
import { ApiError } from '../errors.ts';

export const EPISODE_ID_SEPARATOR = '\u0001';

export const episodeBody = z.object({
  feedUrl: z.string().url().max(2048),
  guid: z.string().min(1).max(2048),
  title: z.string().trim().min(1).max(1000),
  showTitle: z.string().trim().max(500).optional(),
  enclosureUrl: z.string().url().max(2048),
  imageUrl: z.string().url().max(2048).optional(),
  durationMs: z.number().int().positive().optional(),
});

export function publicEpisode(e: { id: string; feed_url: string; guid: string; title: string; show_title: string | null; enclosure_url: string; image_url: string | null; duration_ms: number | null }) {
  return {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title,
    enclosureUrl: e.enclosure_url, imageUrl: e.image_url, durationMs: e.duration_ms,
  };
}

export const episodes = new Hono<AuthEnv>();

episodes.put('/:id', json(episodeBody), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  if (id !== fnv1a64(body.feedUrl + EPISODE_ID_SEPARATOR + body.guid)) {
    throw new ApiError('validation', 'The episode id does not match its feedUrl and guid.');
  }
  const db = c.get('db');
  const row = await db.transaction(async (tx) => {
    const before = await getEpisode(tx, id);
    const after = await upsertEpisode(tx, { id, ...body });
    // FR-021: the moments were stored without buckets; the first known duration places them.
    if ((before?.duration_ms ?? null) === null && after.duration_ms !== null) await rebuildEpisodeHeat(tx, id);
    return after;
  });
  return c.json({ episode: publicEpisode(row) });
});
