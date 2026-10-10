// Per-show notification routes: list shows and turn new-episode alerts on or off.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';

/**
 * M12 FR-093 — mounted at /v1/me/notify. Per-show "new episode" notifications: every live
 * subscription is listed, on unless the listener turned it off. The M10b sender
 * (`fanOutNewEpisode`) reads the same table and skips a show that is off.
 */
export const notify = new Hono<AuthEnv>();

notify.get('/shows', requireAuth, async (c) => {
  const rows = await c.get('db').query<{ feed_url: string; title: string | null; enabled: boolean | null }>(
    `SELECT s.feed_url,
            (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1) AS title,
            p.enabled
     FROM subscriptions s LEFT JOIN notify_show_prefs p ON p.listener_id = s.listener_id AND p.feed_url = s.feed_url
     WHERE s.listener_id = $1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC`,
    [c.get('listener')!.id],
  );
  return c.json({ shows: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? null, enabled: r.enabled ?? true })) });
});

notify.put('/shows/:feedUrl', requireAuth, json(z.object({ enabled: z.boolean() })), async (c) => {
  const feedUrl = c.req.param('feedUrl'); // Hono has already percent-decoded it once
  if (!/^https?:\/\//.test(feedUrl) || feedUrl.length > 2048) throw new ApiError('validation', 'feedUrl must be an http(s) URL.', { fields: ['feedUrl'] });
  await c.get('db').query(
    `INSERT INTO notify_show_prefs (listener_id, feed_url, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (listener_id, feed_url) DO UPDATE SET enabled = excluded.enabled`,
    [c.get('listener')!.id, feedUrl, c.req.valid('json').enabled],
  );
  return c.body(null, 204);
});
