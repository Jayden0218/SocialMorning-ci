// Studio routes for show announcements and polls.
/**
 * Studio API (`/v1/studio/*`) — US5: Announcements and polls
 */
import { z } from 'zod';
import { json } from '../../validate.ts';
import { edit as editAnnouncement, listAnnouncements, publish, remove as removeAnnouncement } from '../../db/repos/studio/announcements.ts';
import { closePoll, createPoll, listPolls } from '../../db/repos/studio/polls.ts';
import type { Hono } from 'hono';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerAnnouncements(studio: Hono<StudioEnv>): void {
  const announcementBody = z.object({ body: z.string().trim().min(1).max(500) });

  studio.get('/shows/:show/announcements', async (c) => c.json(await listAnnouncements(c.get('db'), c.get('show').feedUrl)));

  studio.post('/shows/:show/announcements', json(announcementBody), async (c) => {
    const show = c.get('show');
    const r = await publish(c.get('db'), c.get('catalog').pushFetch, show.feedUrl, show.title, c.get('listener')!.id, c.req.valid('json').body);
    return c.json(r, 201);
  });

  studio.put('/shows/:show/announcements/:id', json(announcementBody), async (c) =>
    c.json({ announcement: await editAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'), c.req.valid('json').body) }));

  studio.delete('/shows/:show/announcements/:id', async (c) => {
    await removeAnnouncement(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });

  const pollBody = z.object({
    question: z.string().trim().min(1).max(100),
    options: z.array(z.string().trim().min(1).max(40)).min(2).max(6),
    endsAt: z.string().datetime(),
    episodeId: z.string().min(1).max(64).optional(),
  });

  studio.get('/shows/:show/polls', async (c) => c.json({ items: await listPolls(c.get('db'), c.get('show').feedUrl) }));

  studio.post('/shows/:show/polls', json(pollBody), async (c) =>
    c.json({ poll: await createPoll(c.get('db'), c.get('show').feedUrl, c.get('listener')!.id, c.req.valid('json')) }, 201));

  studio.post('/shows/:show/polls/:id/close', async (c) => {
    await closePoll(c.get('db'), c.get('show').feedUrl, c.req.param('id'));
    return c.body(null, 204);
  });
}
