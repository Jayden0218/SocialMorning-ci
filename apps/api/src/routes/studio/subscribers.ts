// Studio subscriber routes: stats, subscriber list, and muting listeners.
/**
 * Studio API (`/v1/studio/*`) — US4: Subscribers and mutes
 */
import { validTz } from '../../db/repos/studio/studio-numbers.ts';
import { listMutes, mute, subscriberList, subscriberStats, unmute } from '../../db/repos/studio/studio-subscribers.ts';
import type { Hono } from 'hono';
import { days } from './common.ts';
import type { StudioEnv } from '../../auth/studio-session.ts';

export function registerSubscribers(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/subscribers/stats', async (c) =>
    c.json(await subscriberStats(c.get('db'), c.get('show').feedUrl, days(c.req.query('days')), validTz(c.req.query('tz')))));

  studio.get('/shows/:show/subscribers', async (c) =>
    c.json(await subscriberList(c.get('db'), c.get('show').feedUrl, Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1))));

  studio.get('/shows/:show/mutes', async (c) => c.json(await listMutes(c.get('db'), c.get('show').feedUrl)));

  studio.put('/shows/:show/mutes/:listenerId', async (c) => {
    await mute(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'), c.get('listener')!.id);
    return c.body(null, 204);
  });

  studio.delete('/shows/:show/mutes/:listenerId', async (c) => {
    await unmute(c.get('db'), c.get('show').feedUrl, c.req.param('listenerId'));
    return c.body(null, 204);
  });
}
