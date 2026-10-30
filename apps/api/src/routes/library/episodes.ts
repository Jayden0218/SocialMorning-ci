// Episode route: the app registers an episode's details with the server.
import { Hono } from 'hono';
import { json } from '../../validate.ts';
import { z } from 'zod';
import { fnv1a64 } from '@socialmorning/social-core';
import { requireAuth, type AuthEnv } from '../../auth/session.ts';
import { getEpisode, registerEpisodeTx, type EpisodeRow } from '../../db/repos/library/episodes.ts';
import type { Db } from '../../db/db.ts';
import { ApiError } from '../../errors.ts';
import { genreIdFor } from '../../catalog/genres.ts';
import { findEpisodeInFeed, registerCard } from '../../catalog/feed.ts';
import { HOUR_MS, limit } from '../../auth/rate.ts';

/** M25 S8: new episodes one account may bring to the server an hour (each one reads a feed). */
export const NEW_EPISODES_PER_ACCOUNT_HOUR = 120;

export const EPISODE_ID_SEPARATOR = '\u0001';

export const episodeBody = z.object({
  feedUrl: z.string().url().max(2048),
  guid: z.string().min(1).max(2048),
  title: z.string().trim().min(1).max(1000),
  showTitle: z.string().trim().max(500).optional(),
  enclosureUrl: z.string().url().max(2048),
  imageUrl: z.string().url().max(2048).optional(),
  durationMs: z.number().int().positive().optional(),
  // M8: the publisher's date and the show's categories, both of which the phone already
  // had. Optional, so an older build keeps working exactly as it did.
  publishedAt: z.string().datetime().optional(),
  categories: z.array(z.string().max(200)).max(10).optional(),
});

export function publicEpisode(e: { id: string; feed_url: string; guid: string; title: string; show_title: string | null; enclosure_url: string; image_url: string | null; duration_ms: number | null }) {
  return {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title,
    enclosureUrl: e.enclosure_url, imageUrl: e.image_url, durationMs: e.duration_ms,
  };
}

export const episodes = new Hono<AuthEnv>();

/**
 * Registers an episode and places stored moments once its length is first known (FR-021).
 * `fill` (M23 US1, FR-001): a listener's PUT only fills empty fields of a known episode;
 * `authoritative` is the old overwrite, kept for test setup that stands in for a feed refresh.
 */
export async function registerEpisode(db: Db, id: string, body: z.infer<typeof episodeBody>, mode: 'fill' | 'authoritative'): Promise<EpisodeRow> {
  const genre = body.categories === undefined ? undefined : genreIdFor(body.categories);
  const { categories, ...rest } = body;
  const input = { id, ...rest, ...(genre ? { genreId: genre.id } : {}) };
  return registerEpisodeTx(db, id, input, mode);
}

// M23 US1 (FR-001, G-M23-1): signed-out requests could rename any episode; now sign-in is required.
/*
 * M25 S8 (audit #11, guard G-M25-S8): a listener could still CREATE an episode on any real feed —
 * a new guid with any title, enclosure, image or date — and it showed on /e/:id, in comments, on
 * share cards and in the Studio. The phone sends this PUT before the first comment, reaction,
 * clip, position or status that names an episode, because those rows need the episode to exist.
 * Now only what the publisher's feed says can create one: for an id the server does not know, the
 * server reads the feed itself (SSRF-guarded fetch) and registers the episode from the FEED's
 * data. A guid the feed does not list is 404 and nothing is written. The phone's own fields only
 * fill what is still empty (the duration it measured), as before.
 */
episodes.put('/:id', requireAuth, json(episodeBody), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  if (id !== fnv1a64(body.feedUrl + EPISODE_ID_SEPARATOR + body.guid)) {
    throw new ApiError('validation', 'The episode id does not match its feedUrl and guid.');
  }
  const db = c.get('db');
  if (!(await getEpisode(db, id))) {
    await limit(db, `episode-new:l:${c.get('listener')!.id}`, HOUR_MS, NEW_EPISODES_PER_ACCOUNT_HOUR, 'Too many new episodes in an hour. Try again later.');
    const card = await findEpisodeInFeed(db, c.get('catalog').fetch, body.feedUrl, body.guid).catch(() => undefined);
    if (!card) throw new ApiError('not_found', 'This episode is not in its show\'s feed right now, so it cannot be added.');
    await registerCard(db, card);
    // Only the measured duration comes from the phone, and only while the feed gave none.
    const row = await registerEpisode(db, id, { feedUrl: card.feedUrl, guid: card.guid, title: card.title, enclosureUrl: card.enclosureUrl, ...(body.durationMs !== undefined ? { durationMs: body.durationMs } : {}) }, 'fill');
    return c.json({ episode: publicEpisode(row) });
  }
  const row = await registerEpisode(db, id, body, 'fill');
  return c.json({ episode: publicEpisode(row) });
});
