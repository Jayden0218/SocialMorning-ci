import { Hono } from 'hono';
import { z } from 'zod';
import { validateClipRange } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { optionalAuth, requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { getEpisode } from '../db/repos/episodes.ts';
import { createClip, deleteClip, getClip, listClipsForEpisode, toClipOut } from '../db/repos/clips.ts';

const clipBody = z.object({
  clientId: z.string().min(1).max(64),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  caption: z.string().max(200).default(''),
});

/** Mounted at /v1/episodes — POST /:id/clips, GET /:id/clips. */
export const episodeClips = new Hono<AuthEnv>();

episodeClips.post('/:id/clips', requireAuth, json(clipBody), async (c) => {
  const episodeId = c.req.param('id');
  const body = c.req.valid('json');
  const db = c.get('db');
  const listener = c.get('listener')!;
  const episode = await getEpisode(db, episodeId);
  if (!episode) throw new ApiError('not_found', 'Register the episode first (PUT /v1/episodes/:id).');
  // T033: a burst of clips in a minute is not a listener, it is a script (M3's comment floor, per minute).
  const recent = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM clips WHERE author_id = $1 AND created_at > now() - interval '1 minute'`, [listener.id]);
  if (Number(recent[0]?.n ?? 0) >= 60) throw new ApiError('locked', 'Too many clips in a minute.', { retryAfterSeconds: 60 });
  const check = validateClipRange({ startMs: body.startMs, endMs: body.endMs }, episode.duration_ms ?? undefined);
  if (!check.ok) throw new ApiError('validation', `That range can't be a clip (${check.reason}).`, { fields: ['startMs', 'endMs'], reason: check.reason });
  const { clip, created } = await createClip(db, { authorId: listener.id, clientId: body.clientId, episodeId, startMs: body.startMs, endMs: body.endMs, caption: body.caption });
  return c.json({ clip: toClipOut(clip) }, created ? 201 : 200);
});

episodeClips.get('/:id/clips', async (c) => {
  const before = c.req.query('before');
  const { clips, next } = await listClipsForEpisode(c.get('db'), c.req.param('id'), before || undefined);
  return c.json({ clips: clips.map(toClipOut), ...(next ? { next } : {}) });
});

/** Mounted at /v1/clips — GET /:id (public), DELETE /:id (author). */
export const clipById = new Hono<AuthEnv>();

clipById.get('/:id', optionalAuth, async (c) => {
  const found = await getClip(c.get('db'), c.req.param('id'));
  if (!found) throw new ApiError('not_found', 'No such clip.');
  const e = found.episode;
  return c.json({
    clip: toClipOut(found.clip),
    episode: { id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title, enclosureUrl: e.enclosure_url, imageUrl: e.image_url, durationMs: e.duration_ms },
  });
});

clipById.delete('/:id', requireAuth, async (c) => {
  const result = await deleteClip(c.get('db'), c.req.param('id'), c.get('listener')!.id);
  if (result === 'forbidden') throw new ApiError('forbidden', 'Only the clip\'s author can delete it.');
  if (result === 'gone') throw new ApiError('not_found', 'No such clip.');
  return c.body(null, 204);
});
