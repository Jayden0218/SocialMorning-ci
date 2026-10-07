// Studio routes for show announcements and polls.
/**
 * Studio API (`/v1/studio/*`) — US5: Announcements and polls
 */
import { z } from 'zod';
import { json } from '../../validate.ts';
import { ANNOUNCEMENT_IMAGES_MAX, edit as editAnnouncement, listAnnouncements, publish, remove as removeAnnouncement } from '../../db/repos/studio/announcements.ts';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../errors.ts';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../storage/episodes-blob.ts';
import { closePoll, createPoll, deletePoll, listPolls } from '../../db/repos/studio/polls.ts';
import type { Hono } from 'hono';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerAnnouncements(studio: Hono<StudioEnv>): void {
  // M19 US12: up to 9 pictures (https, from the upload route below) and an optional release time.
  const announcementBody = z.object({
    body: z.string().trim().min(1).max(500),
    images: z.array(z.string().url().startsWith('https://').max(2048)).max(ANNOUNCEMENT_IMAGES_MAX).optional(),
    releaseAt: z.string().datetime().optional(),
  });
  const extraOf = (b: z.infer<typeof announcementBody>) => ({ ...(b.images ? { images: b.images } : {}), ...(b.releaseAt ? { releaseAt: b.releaseAt } : {}) });

  studio.get('/shows/:show/announcements', async (c) => c.json(await listAnnouncements(c.get('db'), c.get('show').feedUrl)));

  studio.post('/shows/:show/announcements', json(announcementBody), async (c) => {
    const show = c.get('show');
    const b = c.req.valid('json');
    const r = await publish(c.get('db'), c.get('catalog').pushFetch, show.feedUrl, show.title, c.get('listener')!.id, b.body, extraOf(b));
    return c.json(r, 201);
  });

  studio.put('/shows/:show/announcements/:id', json(announcementBody), async (c) =>
    c.json({ announcement: await editAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.req.valid('json').body, extraOf(c.req.valid('json'))) }));

  /** M19 US12: a 1-hour token for ONE announcement picture (JPEG/PNG ≤ 5 MB) in the creator-media store. */
  studio.post('/shows/:show/announcements/uploads', json(z.object({ contentType: z.string(), size: z.number().int().positive() })), async (c) => {
    const storage = c.get('storage');
    if (!storage.ready) throw new ApiError('unavailable', 'Picture uploads are not connected yet.');
    const b = c.req.valid('json');
    if (!IMAGE_TYPES.includes(b.contentType)) throw new ApiError('validation', 'Upload a JPEG or PNG image.', { fields: ['contentType'] });
    if (b.size > MAX_IMAGE_BYTES) throw new ApiError('validation', 'The picture is over 5 MB.', { fields: ['size'] });
    const pathname = `announcements/${randomUUID()}.${b.contentType === 'image/png' ? 'png' : 'jpg'}`;
    return c.json({ pathname, token: await storage.uploadToken(pathname, { maxBytes: MAX_IMAGE_BYTES, types: IMAGE_TYPES }) });
  });

  studio.delete('/shows/:show/announcements/:id', async (c) => {
    await removeAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });

  const pollBody = z.object({
    question: z.string().trim().min(1).max(100),
    options: z.array(z.string().trim().min(1).max(40)).min(2).max(6),
    endsAt: z.string().datetime(),
    episodeId: z.string().min(1).max(64).optional(),
    /** M24 US14: listeners may choose more than one option. */
    multi: z.boolean().optional(),
  });

  studio.get('/shows/:show/polls', async (c) => c.json({ items: await listPolls(c.get('db'), c.get('show').feedUrl) }));

  studio.post('/shows/:show/polls', json(pollBody), async (c) =>
    c.json({ poll: await createPoll(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id, c.req.valid('json')) }, 201));

  studio.post('/shows/:show/polls/:id/close', async (c) => {
    await closePoll(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });

  /** M24 US14: delete a poll and its votes. */
  studio.delete('/shows/:show/polls/:id', async (c) => {
    await deletePoll(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });
}
