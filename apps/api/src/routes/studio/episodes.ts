/**
 * Studio API (`/v1/studio/*`) — M13: a created show's details
 */
import { ApiError } from '../../errors.ts';
import { z } from 'zod';
import { json } from '../../validate.ts';
import { publish } from '../../db/repos/studio/announcements.ts';
import { listHostedEpisodes, promoteDue, publishEpisode, removeEpisode, storedBytes, updateEpisode, updateHostedShow } from '../../db/repos/studio/hosted.ts';
import { AUDIO_TYPES, IMAGE_TYPES, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '../../storage/episodes-blob.ts';
import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { showDetails, ownerOnly, days, hostedOf } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerEpisodes(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/details', async (c) => c.json({ show: await hostedOf(c.get('db'), c.get('show').feedUrl) }));

  studio.put('/shows/:show/details', ownerOnly, json(showDetails.partial().extend({ coverUrl: z.string().url().nullable().optional() })), async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    const b = c.req.valid('json');
    if (b.coverUrl) {
      const f = await c.get('storage').head(b.coverUrl);
      if (!f || !f.pathname.startsWith(`covers/${h.id}/`) || !IMAGE_TYPES.includes(f.contentType)) throw new ApiError('validation', 'Upload the cover first.', { fields: ['coverUrl'] });
      b.coverUrl = f.url;
    }
    return c.json({ show: await updateHostedShow(c.get('db'), h.id, b) });
  });

  const uploadBody = z.object({
    kind: z.enum(['audio', 'cover']),
    contentType: z.string().max(100),
    size: z.number().int().positive(),
  });

  /** A 1-hour token for ONE path under this show, the allowed types and the size limit (FR-005). */
  studio.post('/shows/:show/uploads', json(uploadBody), async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    const storage = c.get('storage');
    if (!storage.ready) throw new ApiError('unavailable', 'The audio store is not connected yet. The owner connects it once in Vercel (Storage → socialmorning-episodes).');
    const b = c.req.valid('json');
    const audio = b.kind === 'audio';
    const types = audio ? AUDIO_TYPES : IMAGE_TYPES;
    const max = audio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (!types.includes(b.contentType)) throw new ApiError('validation', audio ? 'Upload an MP3 or M4A file.' : 'Upload a JPEG or PNG image.', { fields: ['contentType'] });
    if (b.size > max) throw new ApiError('validation', `The file is over ${Math.round(max / 1024 / 1024)} MB.`, { fields: ['size'] });
    if (audio) {
      const used = await storedBytes(c.get('db'));
      const ceiling = c.get('hostedCeilingBytes');
      if (used + b.size > ceiling) throw new ApiError('conflict', `Storage is full: ${Math.round(used / 1024 / 1024)} MB of ${Math.round(ceiling / 1024 / 1024)} MB used.`, { reason: 'storage_full', usedBytes: used, ceilingBytes: ceiling });
    }
    const ext = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'image/jpeg': 'jpg', 'image/png': 'png' }[b.contentType] ?? 'bin';
    const pathname = `${audio ? 'episodes' : 'covers'}/${h.id}/${randomUUID()}.${ext}`;
    return c.json({ pathname, token: await storage.uploadToken(pathname, { maxBytes: max, types }) });
  });

  studio.get('/shows/:show/hosted-episodes', async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    await promoteDue(c.get('db'), h);
    return c.json({ items: await listHostedEpisodes(c.get('db'), h.id) });
  });

  const publishBody = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20000).default(''),
    audioUrl: z.string().url(),
    durationMs: z.number().int().positive().max(24 * 3600 * 1000).nullable().optional(),
    status: z.enum(['draft', 'published']).default('published'),
    publishAt: z.string().datetime().nullable().optional(),
    coverUrl: z.string().url().nullable().optional(),
  });

  /** M14 US4 (FR-05): a scheduled time is in the future and within 90 days. */
  function checkPublishAt(at: string | null | undefined): void {
    if (!at) return;
    const t = Date.parse(at);
    if (!(t > Date.now() && t <= Date.now() + 90 * 86_400_000)) throw new ApiError('validation', 'Schedule a time in the next 90 days.', { fields: ['publishAt'] });
  }

  /** An episode cover must be an image this show uploaded (FR-05). */
  async function checkEpisodeCover(storage: import('../../storage/episodes-blob.ts').EpisodeStorage, showId: string, url: string | null | undefined): Promise<string | null | undefined> {
    if (!url) return url;
    const f = await storage.head(url);
    if (!f || !f.pathname.startsWith(`covers/${showId}/`) || !IMAGE_TYPES.includes(f.contentType)) throw new ApiError('validation', 'Upload the episode cover first.', { fields: ['coverUrl'] });
    return f.url;
  }

  /** Publish: the file must really be in our store, under THIS show, audio, within limits (FR-006). */
  studio.post('/shows/:show/hosted-episodes', json(publishBody), async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    const b = c.req.valid('json');
    const storage = c.get('storage');
    const f = await storage.head(b.audioUrl);
    if (!f || !f.pathname.startsWith(`episodes/${h.id}/`)) throw new ApiError('validation', 'That audio was not uploaded to this show.', { fields: ['audioUrl'] });
    if (!AUDIO_TYPES.includes(f.contentType) || f.size > MAX_AUDIO_BYTES) {
      await storage.remove(f.url);
      throw new ApiError('validation', 'That file is not an MP3 or M4A under 200 MB.', { fields: ['audioUrl'] });
    }
    const used = await storedBytes(c.get('db'));
    if (used + f.size > c.get('hostedCeilingBytes')) {
      await storage.remove(f.url);
      throw new ApiError('conflict', 'Storage is full.', { reason: 'storage_full' });
    }
    checkPublishAt(b.publishAt);
    const coverUrl = await checkEpisodeCover(storage, h.id, b.coverUrl);
    const ep = await publishEpisode(c.get('db'), h, c.get('listener')!.id, {
      title: b.title, description: b.description, audioUrl: f.url, audioBytes: f.size, audioType: f.contentType, durationMs: b.durationMs ?? null,
      status: b.status, publishAt: b.publishAt ?? null, coverUrl: coverUrl ?? null,
    });
    return c.json({ episode: ep }, 201);
  });

  const editBody = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(20000).optional(),
    status: z.enum(['draft', 'published']).optional(),
    publishAt: z.string().datetime().nullable().optional(),
    coverUrl: z.string().url().nullable().optional(),
  }).strict();

  /** Edit a hosted episode: text, cover; publish a draft now or at a time; move back to draft. */
  studio.put('/shows/:show/hosted-episodes/:id', json(editBody), async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    const b = c.req.valid('json');
    checkPublishAt(b.publishAt);
    const patch = { ...b } as Parameters<typeof updateEpisode>[3];
    if ('coverUrl' in b) patch.coverUrl = (await checkEpisodeCover(c.get('storage'), h.id, b.coverUrl)) ?? null;
    return c.json({ episode: await updateEpisode(c.get('db'), h, c.req.param('id'), patch) });
  });

  /** Unpublish and delete the audio (FR-007, guard G-D1). Comments on it stay, like any episode that leaves a feed. */
  studio.delete('/shows/:show/hosted-episodes/:id', async (c) => {
    const h = await hostedOf(c.get('db'), c.get('show').feedUrl);
    const ep = await removeEpisode(c.get('db'), h.id, c.req.param('id'));
    if (!ep) throw new ApiError('not_found', 'No such episode.');
    await c.get('storage').remove(ep.audioUrl);
    return c.body(null, 204);
  });
}
