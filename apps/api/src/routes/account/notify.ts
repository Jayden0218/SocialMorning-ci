// Per-show notification routes: list shows and turn new-episode alerts on or off.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { listNotifyShowRows, setNotifyShow } from '../../db/repos/account/notify-shows.ts';

/**
 * M12 FR-093 — mounted at /v1/me/notify. Per-show "new episode" notifications: every live
 * subscription is listed, on unless the listener turned it off. The M10b sender
 * (`fanOutNewEpisode`) reads the same table and skips a show that is off.
 */
export const notify = new Hono<AuthEnv>();

notify.get('/shows', requireAuth, async (c) => {
  const rows = await listNotifyShowRows(c.get('db'), c.get('listener')!.id);
  return c.json({ shows: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? null, enabled: r.enabled ?? true })) });
});

notify.put('/shows/:feedUrl', requireAuth, json(z.object({ enabled: z.boolean() })), async (c) => {
  const feedUrl = c.req.param('feedUrl'); // Hono has already percent-decoded it once
  if (!/^https?:\/\//.test(feedUrl) || feedUrl.length > 2048) throw new ApiError('validation', 'feedUrl must be an http(s) URL.', { fields: ['feedUrl'] });
  await setNotifyShow(c.get('db'), c.get('listener')!.id, feedUrl, c.req.valid('json').enabled);
  return c.body(null, 204);
});
